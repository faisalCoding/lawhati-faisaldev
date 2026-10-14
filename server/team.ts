// Team notifications. Each device says who it is (a random secret id, its push subscription, the
// name its teammates see, and the employee it is signed in as) and which cards it watches. When
// someone edits a watched card, or a card assigned to the phone's employee, the phone gets a push
// notification, sent by this server itself (see push.ts): never for their own edits, not while they
// have that board open, and with a burst of edits folded into one. Being assigned a card or a task
// is told right away, on its own.

import fs from 'node:fs';
import path from 'node:path';
import type { WebSocket } from 'ws';

import { formatShortDate } from '../src/lib/dates';
import { pluralCards, pluralTasks } from '../src/lib/text';
import { isCardDone } from '../src/shared/cards';
import type { Actor, Board, Card, Op } from '../src/shared/types';
import { verifyMember, type MemberInfo } from './members';
import { pushEnabled, sendPush } from './push';
import { readStored } from './storage';

/** Edits to watched cards within this window go out as one notification. */
const BATCH_MS = Number(process.env.TEAM_BATCH_MS ?? 60_000);
const BATCH_MAX = 20;
/** Assignments made together (several selected cards at once) go out as one notification. */
const ASSIGN_BATCH_MS = Number(process.env.ASSIGN_BATCH_MS ?? 2500);
const MAX_DEVICES = Number(process.env.MAX_DEVICES ?? 50_000);
const MAX_WATCHES_PER_BOARD = 500;

const DEVICE_PATTERN = /^[A-Za-z0-9-]{16,64}$/;
// Push subscriptions, as the browser handed them over.
const TOKEN_PATTERN = /^[A-Za-z0-9_:-]{32,4096}$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
// Who made a change: an employee's panel id, or a device's made-up id when nobody signed in.
const MEMBER_ID_PATTERN = /^[0-9]{1,20}$/;
const GUEST_ID_PATTERN = /^g:[A-Za-z0-9]{6,40}$/;

interface Device {
  push: string | null;
  name: string;
  /** Wants notifications about teammates' edits. */
  team: boolean;
  /** Watched card ids per board share code. */
  watches: Record<string, string[]>;
  /** The employee the phone is signed in as, checked with the company panel. */
  member?: MemberInfo | null;
}

interface TeamEvent {
  code: string;
  boardId: string;
  boardTitle: string;
  cardId: string;
  cardTitle: string;
  text: string;
  actor: string;
  /** The card was deleted, so it is no longer watched by the time the batch goes out. */
  removed: boolean;
  /** Employees the card or one of its tasks is assigned to: they hear about it without watching. */
  assignees: string[];
}

let devicesFile = '';
const devices = new Map<string, Device>();
const socketDevice = new WeakMap<WebSocket, string>();
const socketFocus = new WeakMap<WebSocket, string | null>();
const deviceSockets = new Map<string, Set<WebSocket>>();
const batches = new Map<string, { events: TeamEvent[]; timer: NodeJS.Timeout }>();

export function loadDevices(dataFile: string) {
  devicesFile = process.env.DEVICES_FILE ?? path.join(path.dirname(dataFile), 'devices.json');
  const data = readStored<Record<string, Device>>(devicesFile);
  if (!data) return;
  for (const [id, device] of Object.entries(data)) devices.set(id, device);
  console.log(`Loaded ${devices.size} device(s) for team notifications`);
}

export function saveDevicesNow() {
  if (!devicesFile) return;
  fs.mkdirSync(path.dirname(devicesFile), { recursive: true });
  const tmp = `${devicesFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(devices)));
  fs.renameSync(tmp, devicesFile);
}

let saveTimer: NodeJS.Timeout | null = null;
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      saveDevicesNow();
    } catch (e) {
      console.warn('Could not save devices file:', e);
    }
  }, 1000);
}

export function flushPendingSave() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  saveDevicesNow();
}

/** A phone introduces itself, or updates its token, name or preference. */
export function hello(
  ws: WebSocket,
  msg: { device?: unknown; push?: unknown; name?: unknown; team?: unknown; member?: unknown },
) {
  const id = typeof msg.device === 'string' && DEVICE_PATTERN.test(msg.device) ? msg.device : null;
  if (!id) return;
  let device = devices.get(id);
  if (!device) {
    if (devices.size >= MAX_DEVICES) return;
    device = { push: null, name: '', team: true, watches: {} };
    devices.set(id, device);
  }
  device.push = typeof msg.push === 'string' && TOKEN_PATTERN.test(msg.push) ? msg.push : null;
  // Control characters out, and short enough for a notification.
  device.name =
    typeof msg.name === 'string'
      ? msg.name
          .replace(/[\u0000-\u001f\u007f]/g, '')
          .trim()
          .slice(0, 40)
      : '';
  device.team = msg.team !== false;
  // The employee the phone is signed in as. When the panel cannot be reached, what was known stays.
  const code = typeof msg.member === 'string' ? msg.member : null;
  if (!code) {
    device.member = null;
  } else {
    const target = device;
    verifyMember(code).then((member) => {
      if (member === 'unreachable') return;
      const changed = JSON.stringify(target.member ?? null) !== JSON.stringify(member);
      target.member = member;
      if (changed) saveSoon();
    });
  }
  // Another phone that used to have this token no longer does (the token moved with a reinstall).
  if (device.push) {
    for (const [otherId, other] of devices) {
      if (otherId !== id && other.push === device.push) other.push = null;
    }
  }

  const previous = socketDevice.get(ws);
  if (previous && previous !== id) deviceSockets.get(previous)?.delete(ws);
  socketDevice.set(ws, id);
  if (!deviceSockets.has(id)) deviceSockets.set(id, new Set());
  deviceSockets.get(id)!.add(ws);
  saveSoon();
}

/** Text from a phone, without control characters and at most `max` long. */
function clean(text: unknown, max: number): string {
  return typeof text === 'string'
    ? text
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, max)
    : '';
}

/**
 * Signs an operation with who made it, for the board's activity, and drops activity fields that are
 * not well formed. The employee the phone is known to be signed in as wins over what the app says; a
 * phone known not to be signed in cannot say it is an employee.
 */
export function stamp(ws: WebSocket, op: Op) {
  const deviceId = socketDevice.get(ws);
  const device = deviceId ? devices.get(deviceId) : undefined;
  const claimed = op.by && typeof op.by === 'object' ? op.by : null;
  const claimedId = typeof claimed?.id === 'string' ? claimed.id : '';
  const claimedName = clean(claimed?.name, 60);
  let by: Actor | null;
  if (device?.member) by = { id: device.member.id, name: device.member.name };
  else if (GUEST_ID_PATTERN.test(claimedId)) by = { id: claimedId, name: device?.name || claimedName };
  // Not checked with the panel yet (the phone just connected): taken at its word.
  else if (MEMBER_ID_PATTERN.test(claimedId) && device?.member === undefined) by = { id: claimedId, name: claimedName };
  else {
    // Known not to be signed in: only the name it gave for notifications.
    const name = device ? device.name : claimedName;
    by = name ? { id: '', name } : null;
  }
  op.by = by;
  if (op.group !== undefined && !(typeof op.group === 'string' && ID_PATTERN.test(op.group))) delete op.group;
  if (op.reverts !== undefined && !(typeof op.reverts === 'string' && ID_PATTERN.test(op.reverts))) delete op.reverts;
  if (op.button !== undefined) {
    const button = clean(op.button, 60);
    if (button) op.button = button;
    else delete op.button;
  }
}

/** The board the phone has on screen (null when none, or the app is in the background). */
export function focus(ws: WebSocket, code: string | null) {
  socketFocus.set(ws, code);
}

/** Replaces the phone's watched cards on one board. */
export function watch(ws: WebSocket, code: string, cardIds: unknown) {
  const id = socketDevice.get(ws);
  const device = id ? devices.get(id) : undefined;
  if (!device || !Array.isArray(cardIds)) return;
  const ids = [...new Set(cardIds.filter((c): c is string => typeof c === 'string' && ID_PATTERN.test(c)))];
  if (ids.length > 0) device.watches[code] = ids.slice(0, MAX_WATCHES_PER_BOARD);
  else delete device.watches[code];
  saveSoon();
}

export function forget(ws: WebSocket) {
  const id = socketDevice.get(ws);
  if (id) deviceSockets.get(id)?.delete(ws);
}

function isLookingAt(deviceId: string, code: string): boolean {
  for (const ws of deviceSockets.get(deviceId) ?? []) {
    if (socketFocus.get(ws) === code) return true;
  }
  return false;
}

function findCard(board: Board, cardId: string): Card | undefined {
  return board.cards[cardId];
}

/** What an operation did to a card, in words, or null when it is not worth a notification. */
export function describe(op: Op, before: Board, after: Board): { cardId: string; text: string } | null {
  switch (op.type) {
    case 'card/move': {
      const from = before.lists.find((l) => l.cardIds.includes(op.cardId));
      const to = after.lists.find((l) => l.id === op.toListId);
      // Reordering inside a list is not news.
      if (!to || from?.id === to.id) return null;
      return { cardId: op.cardId, text: `نُقلت إلى «${to.title}»` };
    }
    case 'card/update': {
      const was = findCard(before, op.cardId);
      const now = findCard(after, op.cardId);
      if (!was || !now) return null;
      const p = op.patch;
      if (p.due !== undefined && p.due !== was.due) {
        return { cardId: op.cardId, text: p.due ? `موعدها الآن ${formatShortDate(p.due)}` : 'أُزيل موعدها' };
      }
      if (p.dueDone !== undefined && p.dueDone !== isCardDone(was)) {
        return { cardId: op.cardId, text: p.dueDone ? 'أُنجزت' : 'أُعيد فتحها' };
      }
      if (p.assignees !== undefined) {
        const had = new Set((was.assignees ?? []).map((a) => a.id));
        const has = new Set((now.assignees ?? []).map((a) => a.id));
        const added = (now.assignees ?? []).filter((a) => !had.has(a.id));
        const dropped = (was.assignees ?? []).filter((a) => !has.has(a.id));
        if (added.length) return { cardId: op.cardId, text: `أُسندت إلى ${names(added)}` };
        if (dropped.length) return { cardId: op.cardId, text: `لم تعد مسندة إلى ${names(dropped)}` };
      }
      // Refreshing a link's stored name or code is not news; linking another board is.
      if (p.link !== undefined && (p.link?.boardId ?? null) !== (was.link?.boardId ?? null)) {
        return { cardId: op.cardId, text: p.link ? `رُبطت بلوحة «${p.link.title}»` : 'أُلغي ربطها بلوحة' };
      }
      if (p.title !== undefined && p.title !== was.title) return { cardId: op.cardId, text: 'تغيّر عنوانها' };
      if (p.description !== undefined && p.description !== was.description) {
        return { cardId: op.cardId, text: 'عُدّل وصفها' };
      }
      return null;
    }
    case 'card/remove':
      return before.cards[op.cardId] ? { cardId: op.cardId, text: 'حُذفت' } : null;
    case 'check/add':
      return { cardId: op.cardId, text: `مهمة جديدة: ${op.item.text}` };
    case 'check/update': {
      const item = findCard(after, op.cardId)?.checklist.find((i) => i.id === op.itemId);
      const was = findCard(before, op.cardId)?.checklist.find((i) => i.id === op.itemId);
      if (!item) return null;
      if (op.patch.done === true && !was?.done) return { cardId: op.cardId, text: `أُنجزت مهمة: ${item.text}` };
      if (op.patch.assignee !== undefined && item.assignee && item.assignee.id !== was?.assignee?.id) {
        return { cardId: op.cardId, text: `أُسندت مهمة «${short(item.text)}» إلى ${item.assignee.name}` };
      }
      return null;
    }
    default:
      return null;
  }
}

/** People named in a notification: "سارة", "سارة وفيصل", "سارة وأحمد وفيصل". */
function names(people: { name: string }[]): string {
  return people.map((p) => p.name).join(' و');
}

/** The employees a card, or one of its tasks, is assigned to. */
function assigneeIds(card: Card | undefined): string[] {
  if (!card) return [];
  const ids = (card.assignees ?? []).map((a) => a.id);
  for (const item of card.checklist) if (item.assignee) ids.push(item.assignee.id);
  return [...new Set(ids)];
}

/** Who an operation newly assigned something to, and what to tell them. */
export function newlyAssigned(
  op: Op,
  before: Board,
  after: Board,
): { memberId: string; cardId: string; task: boolean; text: string }[] {
  switch (op.type) {
    case 'card/update': {
      if (op.patch.assignees === undefined) return [];
      const had = new Set((findCard(before, op.cardId)?.assignees ?? []).map((a) => a.id));
      return (findCard(after, op.cardId)?.assignees ?? [])
        .filter((a) => !had.has(a.id))
        .map((a) => ({ memberId: a.id, cardId: op.cardId, task: false, text: 'أُسندت إليك' }));
    }
    case 'check/add': {
      const item = findCard(after, op.cardId)?.checklist.find((i) => i.id === op.item.id);
      const existed = findCard(before, op.cardId)?.checklist.some((i) => i.id === op.item.id);
      if (!item?.assignee || existed) return [];
      return [
        { memberId: item.assignee.id, cardId: op.cardId, task: true, text: `أُسندت إليك مهمة: ${short(item.text)}` },
      ];
    }
    case 'check/update': {
      if (op.patch.assignee === undefined) return [];
      const was = findCard(before, op.cardId)?.checklist.find((i) => i.id === op.itemId);
      const item = findCard(after, op.cardId)?.checklist.find((i) => i.id === op.itemId);
      if (!item?.assignee || item.assignee.id === was?.assignee?.id) return [];
      return [
        { memberId: item.assignee.id, cardId: op.cardId, task: true, text: `أُسندت إليك مهمة: ${short(item.text)}` },
      ];
    }
    default:
      return [];
  }
}

/** After an edit: tells the people just assigned, and queues a notification for everyone else involved. */
export function onOp(code: string, op: Op, before: Board, after: Board, sender: WebSocket) {
  const actorId = socketDevice.get(sender);
  const actor = actorId ? devices.get(actorId) : undefined;
  const actorName = actor?.member?.name || actor?.name || '';
  const actorMember = actor?.member?.id ?? null;
  const removed = Object.keys(before.cards).filter((id) => !after.cards[id]);

  // Without VAPID keys there is nobody to notify; watches are still kept for when there are.
  const assigned = pushEnabled() ? newlyAssigned(op, before, after) : [];
  for (const a of assigned) {
    // Assigning yourself is not news to you.
    if (a.memberId !== actorMember) tellAssigned(code, after, a, actorName, actorId);
  }
  const toldNow = new Set(assigned.map((a) => a.memberId));

  const change = pushEnabled() ? describe(op, before, after) : null;
  if (change) {
    const card = after.cards[change.cardId] ?? before.cards[change.cardId];
    // Before and after: someone a card or a task was just taken from hears who has it now.
    const assignees = [
      ...new Set([...assigneeIds(before.cards[change.cardId]), ...assigneeIds(after.cards[change.cardId])]),
    ];
    const event: TeamEvent = {
      code,
      boardId: after.id,
      boardTitle: after.title,
      cardId: change.cardId,
      cardTitle: card?.title ?? '',
      text: change.text,
      actor: actorName,
      removed: !after.cards[change.cardId],
      assignees,
    };
    for (const [id, device] of devices) {
      if (id === actorId || !device.team || !device.push) continue;
      const member = device.member?.id;
      // Your own edits from another of your devices, and people just told they were assigned.
      if (member && (member === actorMember || toldNow.has(member))) continue;
      const involved = device.watches[code]?.includes(change.cardId) || (member && assignees.includes(member));
      if (!involved || isLookingAt(id, code)) continue;
      queue(id, event);
    }
  }

  // Deleted cards (one, or a whole list's) are no longer watched.
  if (removed.length > 0) {
    let changed = false;
    for (const device of devices.values()) {
      const watched = device.watches[code];
      if (!watched?.some((c) => removed.includes(c))) continue;
      device.watches[code] = watched.filter((c) => !removed.includes(c));
      changed = true;
    }
    if (changed) saveSoon();
  }
}

function queue(deviceId: string, event: TeamEvent) {
  let batch = batches.get(deviceId);
  if (!batch) {
    batch = { events: [], timer: setTimeout(() => flush(deviceId), BATCH_MS) };
    batches.set(deviceId, batch);
  }
  batch.events.push(event);
  if (batch.events.length >= BATCH_MAX) flush(deviceId);
}

function edits(n: number): string {
  if (n === 2) return 'تعديلان';
  if (n <= 10) return `${n} تعديلات`;
  return `${n} تعديلًا`;
}

const short = (title: string) => (title.length > 40 ? `${title.slice(0, 38).trimEnd()}…` : title);
const unique = <T>(items: T[]) => [...new Set(items)];

/** One notification for a batch of edits. */
export function compose(events: TeamEvent[]): { title: string; body: string; url: string } {
  const last = events[events.length - 1];
  const cards = unique(events.map((e) => `${e.code}:${e.cardId}`));
  const actors = unique(events.map((e) => e.actor).filter(Boolean));
  const by = actors.length === 1 ? ` — ${actors[0]}` : '';

  if (cards.length === 1) {
    const what = events.length === 1 ? last.text : `${edits(events.length)}، آخرها: ${last.text}`;
    return {
      title: last.cardTitle,
      body: `${what}${by} · ${last.boardTitle}`,
      url: `/board/${last.boardId}/card/${last.cardId}`,
    };
  }

  const boards = unique(events.map((e) => e.boardId));
  // Each card under its latest title.
  const latest = [...events].reverse();
  const titles = unique(cards.map((key) => latest.find((e) => `${e.code}:${e.cardId}` === key)!.cardTitle));
  const named = titles.slice(0, 2).map((t) => `«${short(t)}»`);
  const rest = cards.length - named.length;
  // After «على» the dual takes its genitive form.
  const count = pluralCards(cards.length, true);
  const more = rest > 0 ? ` و${rest} أخرى` : '';
  return {
    title: boards.length === 1 ? last.boardTitle : 'نشاط الفريق',
    body: `تعديلات على ${count} تتابعها: ${named.join('، ')}${more}${by}`,
    url: boards.length === 1 ? `/board/${last.boardId}` : '/',
  };
}

function flush(deviceId: string) {
  const batch = batches.get(deviceId);
  batches.delete(deviceId);
  if (!batch) return;
  clearTimeout(batch.timer);
  const device = devices.get(deviceId);
  // Watching may have stopped, or the board been opened, since the edits were queued.
  const member = device?.member?.id;
  const events = batch.events.filter(
    (e) =>
      device?.team &&
      (e.removed || device.watches[e.code]?.includes(e.cardId) || (member && e.assignees.includes(member))) &&
      !isLookingAt(deviceId, e.code),
  );
  if (!device || events.length === 0) return;
  const { title, body, url } = compose(events);
  deliver(device, { title, body, data: { kind: 'team', url }, channelId: 'team' });
}

/** Tells an employee, on each of their phones, that a card or a task was just assigned to them. */
interface Assigned {
  code: string;
  boardId: string;
  boardTitle: string;
  cardId: string;
  cardTitle: string;
  /** A task, not the card itself. */
  task: boolean;
  text: string;
  actor: string;
}

const assignBatches = new Map<string, { items: Assigned[]; timer: NodeJS.Timeout }>();

function tellAssigned(
  code: string,
  board: Board,
  assigned: { memberId: string; cardId: string; task: boolean; text: string },
  actorName: string,
  actorId: string | undefined,
) {
  const card = board.cards[assigned.cardId];
  if (!card) return;
  const item: Assigned = {
    code,
    boardId: board.id,
    boardTitle: board.title,
    cardId: card.id,
    cardTitle: card.title,
    task: assigned.task,
    text: assigned.text,
    actor: actorName,
  };
  for (const [id, device] of devices) {
    if (id === actorId || device.member?.id !== assigned.memberId || !device.team) continue;
    if (isLookingAt(id, code)) continue;
    let batch = assignBatches.get(id);
    if (!batch) {
      batch = { items: [], timer: setTimeout(() => flushAssigned(id), ASSIGN_BATCH_MS) };
      assignBatches.set(id, batch);
    }
    batch.items.push(item);
  }
}

/** One notification for what was assigned to someone in a short while: one card, or several. */
export function composeAssigned(items: Assigned[]): { title: string; body: string; data: Record<string, string> } {
  const last = items[items.length - 1];
  const actors = unique(items.map((i) => i.actor).filter(Boolean));
  const by = actors.length === 1 ? ` — ${actors[0]}` : '';
  if (items.length === 1) {
    return {
      title: last.cardTitle,
      body: `${last.text}${by} · ${last.boardTitle}`,
      // The code lets a phone that has not joined the board yet join it from the notification.
      data: { kind: 'team', url: `/board/${last.boardId}/card/${last.cardId}`, code: last.code },
    };
  }
  const boards = unique(items.map((i) => i.boardId));
  const cards = items.filter((i) => !i.task).length;
  const tasks = items.length - cards;
  const what = [cards ? pluralCards(cards) : '', tasks ? pluralTasks(tasks) : ''].filter(Boolean).join(' و');
  const titles = unique(items.map((i) => i.cardTitle));
  const named = titles.slice(0, 2).map((t) => `«${short(t)}»`);
  const more = titles.length > named.length ? ` و${titles.length - named.length} أخرى` : '';
  return {
    title: boards.length === 1 ? last.boardTitle : 'لوحتي',
    body: `أُسندت إليك ${what}: ${named.join('، ')}${more}${by}`,
    data:
      boards.length === 1
        ? { kind: 'team', url: `/board/${last.boardId}`, code: last.code }
        : { kind: 'team', url: '/assigned' },
  };
}

function flushAssigned(deviceId: string) {
  const batch = assignBatches.get(deviceId);
  assignBatches.delete(deviceId);
  const device = devices.get(deviceId);
  if (!batch || !device) return;
  const { title, body, data } = composeAssigned(batch.items);
  deliver(device, { title, body, data, channelId: 'team' });
}

function deliver(device: Device, message: Parameters<typeof sendPush>[1]) {
  const token = device.push;
  if (!token) return;
  sendPush(token, message)
    .then((result) => {
      // The app was uninstalled, or the phone has a new token: stop sending to this one.
      if (result === 'gone' && device.push === token) {
        device.push = null;
        saveSoon();
      }
    })
    .catch((e) => console.warn('Push failed:', e instanceof Error ? e.message : e));
}
