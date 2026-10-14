// Real-time sync server for shared boards.
// Locally: `npm run server`, then phones on the same Wi-Fi connect to ws://<this computer's IP>:8787.
// In production it runs behind Apache at wss://<domain>/lawhati-sync/ (see deploy/README.md).
//
// The server keeps the authoritative copy of each shared board. Clients send operations, the
// server applies them in arrival order (with the same reducer as the app) and broadcasts them to
// everyone on the board, so all devices converge on the same state.

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';

import { applyOp } from '../src/shared/reducer';
import type { Board, ClientMessage, ServerMessage } from '../src/shared/types';
import { loadPushCredentials, publicKey } from './push';
import { readStored } from './storage';
import * as team from './team';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';
const DATA_FILE = process.env.DATA_FILE ?? path.join(__dirname, 'data.json');
// Behind a reverse proxy every client appears as 127.0.0.1, so read X-Forwarded-For instead.
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

const SEEN_LIMIT = 500;
const MAX_ROOMS = Number(process.env.MAX_ROOMS ?? 5000);
const MAX_CONNECTIONS_PER_IP = 20;
// Token bucket per connection; the burst covers replaying edits made while offline.
const MESSAGES_PER_SECOND = 50;
const MESSAGE_BURST = 500;
// Failed joins per IP in 10 minutes, so share codes cannot be guessed by brute force.
const MAX_FAILED_JOINS = 30;
const CODE_PATTERN = /^[A-Z0-9]{6}$/;

interface Room {
  board: Board;
  version: number;
  /** Ids of recently applied operations, so a retried operation is not applied twice. */
  seen: string[];
  clients: Set<WebSocket>;
}

type StoredRooms = Record<string, { board: Board; version: number; seen: string[] }>;

const rooms = new Map<string, Room>();
const connectionsByIp = new Map<string, number>();
const failedJoins = new Map<string, number[]>();

/**
 * Reads the shared boards. A missing file is a first start. A file that is there but cannot be read
 * stops the server: starting empty would overwrite every shared board with the next save.
 */
function load() {
  const data = readStored<StoredRooms>(DATA_FILE);
  if (!data) return;
  for (const [code, room] of Object.entries(data)) rooms.set(code, { ...room, clients: new Set() });
  console.log(`Loaded ${rooms.size} shared board(s) from ${DATA_FILE}`);
}

function serialize(): string {
  const data: StoredRooms = {};
  for (const [code, room] of rooms) data[code] = { board: room.board, version: room.version, seen: room.seen };
  return JSON.stringify(data);
}

// Write to a temporary file and rename it, so a crash mid-write never corrupts the data.
function saveNow() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, serialize());
  fs.renameSync(tmp, DATA_FILE);
}

let saveTimer: NodeJS.Timeout | null = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      saveNow();
    } catch (e) {
      console.warn('Could not save data file:', e);
    }
  }, 500);
}

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room: Room, msg: ServerMessage) {
  const data = JSON.stringify(msg);
  for (const client of room.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}

function broadcastPresence(code: string, room: Room) {
  broadcast(room, { t: 'presence', code, count: room.clients.size });
}

function join(ws: WebSocket, code: string, room: Room, memberships: Set<string>) {
  room.clients.add(ws);
  memberships.add(code);
  send(ws, { t: 'snapshot', code, board: room.board, version: room.version, seen: room.seen });
  broadcastPresence(code, room);
}

function leave(ws: WebSocket, code: string, memberships: Set<string>) {
  const room = rooms.get(code);
  memberships.delete(code);
  if (room?.clients.delete(ws)) broadcastPresence(code, room);
}

function clientIp(req: http.IncomingMessage): string {
  if (TRUST_PROXY) {
    const header = req.headers['x-forwarded-for'];
    const first = (Array.isArray(header) ? header[0] : header)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function recentFailedJoins(ip: string): number[] {
  const now = Date.now();
  const recent = (failedJoins.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  if (recent.length) failedJoins.set(ip, recent);
  else failedJoins.delete(ip);
  return recent;
}

const isBoard = (b: unknown): b is Board =>
  !!b && typeof b === 'object' && typeof (b as Board).id === 'string' && Array.isArray((b as Board).lists);

load();
team.loadDevices(DATA_FILE);
loadPushCredentials();

// A plain HTTP server so the service can answer health checks; WebSockets upgrade from it.
const server = http.createServer((req, res) => {
  // The public half of the VAPID key, which a browser needs before it will
  // subscribe. Public by definition — it is sent to every push service anyway.
  if (req.url === '/vapid') {
    const key = publicKey();
    res.writeHead(key ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(key ? { key } : { error: 'push is not configured on this server' }));
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(426, { 'content-type': 'text/plain' });
  res.end('Upgrade Required');
});
const wss = new WebSocketServer({ server, maxPayload: 2 * 1024 * 1024 });
const alive = new WeakMap<WebSocket, boolean>();

wss.on('connection', (ws, req) => {
  const ip = clientIp(req);
  const connections = (connectionsByIp.get(ip) ?? 0) + 1;
  if (connections > MAX_CONNECTIONS_PER_IP) {
    ws.close(1008, 'too many connections');
    return;
  }
  connectionsByIp.set(ip, connections);

  const memberships = new Set<string>();
  let tokens = MESSAGE_BURST;
  let lastRefill = Date.now();
  alive.set(ws, true);
  ws.on('pong', () => alive.set(ws, true));
  console.log(`+ client ${ip} (${wss.clients.size} connected)`);

  ws.on('message', (raw) => {
    const now = Date.now();
    tokens = Math.min(MESSAGE_BURST, tokens + ((now - lastRefill) / 1000) * MESSAGES_PER_SECOND);
    lastRefill = now;
    if (tokens < 1) {
      ws.close(1008, 'rate limit');
      return;
    }
    tokens -= 1;

    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    // About this phone rather than one board: who it is, and which board it has on screen.
    if (msg?.t === 'hello') return team.hello(ws, msg);
    if (msg?.t === 'focus') {
      return team.focus(ws, typeof msg.code === 'string' && memberships.has(msg.code) ? msg.code : null);
    }

    const code = typeof msg?.code === 'string' ? msg.code : '';
    if (!CODE_PATTERN.test(code)) return send(ws, { t: 'error', code, reason: 'bad_request' });

    switch (msg.t) {
      case 'publish': {
        if (!isBoard(msg.board)) return send(ws, { t: 'error', code, reason: 'bad_request' });
        const existing = rooms.get(code);
        if (existing) {
          // Re-publishing the same board (e.g. after the server lost its data) just joins it.
          if (existing.board.id !== msg.board.id) return send(ws, { t: 'error', code, reason: 'code_taken' });
          return join(ws, code, existing, memberships);
        }
        if (rooms.size >= MAX_ROOMS) return send(ws, { t: 'error', code, reason: 'bad_request' });
        const room: Room = { board: msg.board, version: 0, seen: [], clients: new Set() };
        rooms.set(code, room);
        scheduleSave();
        console.log(`  new shared board ${code}`);
        return join(ws, code, room, memberships);
      }

      case 'join': {
        const failures = recentFailedJoins(ip);
        const room = failures.length < MAX_FAILED_JOINS ? rooms.get(code) : undefined;
        if (!room) {
          failures.push(now);
          failedJoins.set(ip, failures);
          return send(ws, { t: 'error', code, reason: 'not_found' });
        }
        return join(ws, code, room, memberships);
      }

      case 'leave':
        return leave(ws, code, memberships);

      case 'watch':
        // Only for boards this phone has joined, so nobody learns about cards they cannot see.
        if (memberships.has(code)) team.watch(ws, code, msg.cardIds);
        return;

      case 'op': {
        const room = rooms.get(code);
        // Only devices that joined a board may change it.
        if (!room || !memberships.has(code)) return send(ws, { t: 'error', code, reason: 'not_found' });
        const op = msg.op;
        if (!op || typeof op.id !== 'string' || typeof op.type !== 'string') return;
        if (room.seen.includes(op.id)) return send(ws, { t: 'ack', code, opId: op.id });
        // Signed with who made it, as the server knows the phone, for the board's activity.
        team.stamp(ws, op);
        const before = room.board;
        try {
          room.board = applyOp(room.board, op);
        } catch (e) {
          console.warn(`  rejected ${op.type} on ${code}:`, e);
          return send(ws, { t: 'ack', code, opId: op.id });
        }
        room.version += 1;
        room.seen.push(op.id);
        if (room.seen.length > SEEN_LIMIT) room.seen.splice(0, room.seen.length - SEEN_LIMIT);
        broadcast(room, { t: 'op', code, op, version: room.version });
        scheduleSave();
        team.onOp(code, op, before, room.board, ws);
        return;
      }
    }
  });

  ws.on('close', () => {
    for (const code of [...memberships]) leave(ws, code, memberships);
    team.forget(ws);
    const remaining = (connectionsByIp.get(ip) ?? 1) - 1;
    if (remaining > 0) connectionsByIp.set(ip, remaining);
    else connectionsByIp.delete(ip);
    console.log(`- client ${ip} (${wss.clients.size} connected)`);
  });
});

// Drop connections that stopped answering (phone locked, Wi-Fi lost) so presence stays accurate.
// The pings also keep idle connections open through proxies.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.get(ws)) {
      ws.terminate();
      continue;
    }
    alive.set(ws, false);
    ws.ping();
  }
  for (const ip of failedJoins.keys()) recentFailedJoins(ip);
}, 15_000);
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, HOST, () => {
  console.log(`Kanban sync server listening on ${HOST}:${PORT}`);
  if (HOST === '0.0.0.0') {
    const addresses = Object.values(os.networkInterfaces())
      .flat()
      .filter((a): a is os.NetworkInterfaceInfo => !!a && a.family === 'IPv4' && !a.internal)
      .map((a) => `ws://${a.address}:${PORT}`);
    for (const url of [`ws://localhost:${PORT}`, ...addresses]) console.log(`  ${url}`);
  }
});

// Save pending changes before exiting (Ctrl+C locally, systemd stop in production).
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveNow();
    }
    team.flushPendingSave();
    process.exit(0);
  });
}
