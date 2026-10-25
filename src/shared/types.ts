// Data model shared by the app and the sync server.

export type PowerUpKey = 'labels' | 'dueDates' | 'checklists' | 'covers' | 'wipLimits';
export type PowerUps = Record<PowerUpKey, boolean>;

export interface Label {
  id: string;
  name: string;
  color: string;
}

/**
 * A person a card or a task is assigned to: an employee from the company's panel. The name is kept
 * with the id so the avatar and name show on every device, signed in or not.
 */
export interface Assignee {
  id: string;
  name: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  /** Who does this task. Older items lack it. */
  assignee?: Assignee | null;
}

export interface Card {
  id: string;
  title: string;
  description: string;
  labelIds: string[];
  /** Local calendar date in YYYY-MM-DD form. */
  due: string | null;
  /**
   * The card is complete: its round checkbox is ticked, and there are no more reminders about it.
   * Named after the due date because older versions could only mark a due date done. They still read
   * and write it, so every version agrees on which cards are done. Read it through `isCardDone`.
   */
  dueDone?: boolean;
  /** Another board this card stands for (a sub-project), shown on the card with its progress. */
  link?: CardLink | null;
  /** The people responsible for the card, shown as avatars on it. Older cards lack it. */
  assignees?: Assignee[];
  checklist: ChecklistItem[];
  cover: string | null;
  createdAt: number;
}

export interface CardLink {
  boardId: string;
  /** The linked board's share code, so teammates who don't have it yet can join it. */
  code: string | null;
  /** Its name when last seen, for devices that don't have the board. */
  title: string;
}

export interface List {
  id: string;
  title: string;
  cardIds: string[];
  /** Kanban WIP limit: the most cards this list should hold at once. */
  wipLimit: number | null;
}

/**
 * Someone this board has seen: a person to assign work to, and later to record as having attended a
 * meeting. Kept on the board rather than fetched, because the site deliberately will not say who
 * else has an account — and because a board must be usable with no connection at all.
 *
 * The roster grows by itself: a device adds whoever it is signed in as the first time it opens the
 * board. Nobody maintains it by hand, and it is the same on every device because it syncs like any
 * other change.
 */
export interface BoardMember {
  /** The account's id on the site, or `g:…` for a device nobody signed in on. */
  id: string;
  name: string;
  /** When the board first saw them. */
  at: number;
}

export interface Board {
  id: string;
  title: string;
  color: string;
  /** Name of one of the app's SVG board icons. */
  icon: string;
  lists: List[];
  cards: Record<string, Card>;
  labels: Label[];
  powerUps: PowerUps;
  shareCode: string | null;
  createdAt: number;
  updatedAt: number;
  /** Buttons that run several changes on a card with one tap. Older boards lack it. */
  buttons?: CardButton[];
  /** What was done to the board lately, oldest first (see `activity.ts`). Older boards lack it. */
  activity?: ActivityEntry[];
  /** Everyone this board has seen, oldest first. Older boards lack it. */
  members?: BoardMember[];
}

/**
 * Who made a change. An employee signed in with their code has their panel id; anyone else has
 * `g:` and a random id their device made up, with the name they gave in the settings (maybe empty).
 */
export interface Actor {
  id: string;
  name: string;
}

/** One line of the board's activity: a change, or several made together (a selection, a button). */
export interface ActivityEntry {
  /** The change's op id, or the group's id for several. */
  id: string;
  at: number;
  by: Actor | null;
  /** The first change, with the names it had then. */
  what: ActivityWhat;
  /** The kinds of change in the entry, when there are several kinds. */
  kinds?: ActivityWhat['type'][];
  /** The cards it changed. */
  cards: string[];
  /** How many changes it holds, when more than one (three tasks added by one button). */
  n?: number;
  /** The card button that made it. */
  button?: string;
  /** How to put things back, in order. Null when that would take too much room. */
  undo: UndoStep[] | null;
  /** The entry this one undid (an undo), or the undo it undid again (a redo). */
  reverts?: string;
  /** The latest entry that undid this one. It no longer counts if that one was undone in turn. */
  revertedBy?: string;
}

export type ActivityWhat =
  | { type: 'card/add'; card: string; list: string }
  | { type: 'card/remove'; card: string }
  | { type: 'card/move'; card: string; from: string; to: string }
  | { type: 'card/title'; card: string; from: string }
  | { type: 'card/description'; card: string }
  | { type: 'card/done'; card: string; done: boolean }
  | { type: 'card/due'; card: string; due: string | null }
  | { type: 'card/cover'; card: string; on: boolean }
  | { type: 'card/assign'; card: string; added: string[]; removed: string[] }
  | { type: 'card/label'; card: string; label: string; color: string; on: boolean }
  | { type: 'card/link'; card: string; board: string | null }
  | { type: 'task/add'; card: string; task: string }
  | { type: 'task/done'; card: string; task: string; done: boolean }
  | { type: 'task/edit'; card: string; task: string; from: string }
  | { type: 'task/assign'; card: string; task: string; to: string | null }
  | { type: 'task/remove'; card: string; task: string }
  | { type: 'list/add'; list: string }
  | { type: 'list/title'; list: string; from: string }
  | { type: 'list/wip'; list: string; limit: number | null }
  | { type: 'list/move'; list: string }
  | { type: 'list/remove'; list: string; cards: number }
  | { type: 'board/title'; title: string }
  | { type: 'board/look' }
  | { type: 'board/buttons' }
  | { type: 'powerUp'; key: PowerUpKey; on: boolean }
  | { type: 'label/rename'; name: string; color: string }
  | { type: 'member/seen'; name: string; renamed: boolean };

/**
 * One operation that undoes part of a change. `expect` holds the values the change left: undoing
 * skips a field someone has changed again since, so a later edit is never lost.
 */
export interface UndoStep {
  op: OpInput;
  expect?: Record<string, unknown>;
}

/** A named button that runs its steps, in order, on the card it is pressed on. */
export interface CardButton {
  id: string;
  name: string;
  steps: ButtonStep[];
}

export type ButtonStep =
  /** Replaces every occurrence of a text in the card's title. */
  | { type: 'replace'; find: string; replace: string }
  | { type: 'move'; listId: string; position: 'top' | 'bottom' }
  | { type: 'cover'; color: string | null }
  | { type: 'done'; done: boolean }
  /** Days from the day the button is pressed (0 = that day), or null to remove the due date. */
  | { type: 'due'; days: number | null }
  /** `me`: whoever presses the button. `nobody`: removes everyone. A person: adds them. */
  | { type: 'assign'; to: 'me' | 'nobody' | Assignee }
  | { type: 'label'; labelId: string; on: boolean }
  /** Adds tasks to the card's checklist. */
  | { type: 'tasks'; items: string[] };

/**
 * Every change to a board is an operation. Operations reference entities by id
 * and are idempotent, so replaying one twice (e.g. after a reconnect) is harmless.
 */
export type OpInput =
  | { type: 'board/update'; patch: Partial<Pick<Board, 'title' | 'color' | 'icon' | 'buttons'>> }
  | { type: 'powerUp/set'; key: PowerUpKey; enabled: boolean }
  | { type: 'label/rename'; labelId: string; name: string }
  /** Puts someone on the board's roster, or updates the name they go by. Idempotent. */
  | { type: 'member/seen'; member: BoardMember }
  | { type: 'list/add'; list: List }
  | { type: 'list/update'; listId: string; patch: Partial<Pick<List, 'title' | 'wipLimit'>> }
  | { type: 'list/move'; listId: string; toIndex: number }
  | { type: 'list/remove'; listId: string }
  | { type: 'card/add'; listId: string; card: Card }
  | {
      type: 'card/update';
      cardId: string;
      patch: Partial<Pick<Card, 'title' | 'description' | 'due' | 'dueDone' | 'cover' | 'link' | 'assignees'>>;
    }
  | { type: 'card/move'; cardId: string; toListId: string; toIndex: number }
  | { type: 'card/remove'; cardId: string }
  | { type: 'card/setLabel'; cardId: string; labelId: string; on: boolean }
  /** Added at the end of the checklist, or at `index` (undoing a deletion puts a task back in its place). */
  | { type: 'check/add'; cardId: string; item: ChecklistItem; index?: number }
  | {
      type: 'check/update';
      cardId: string;
      itemId: string;
      patch: Partial<Pick<ChecklistItem, 'text' | 'done' | 'assignee'>>;
    }
  | { type: 'check/remove'; cardId: string; itemId: string };

/** How an operation is recorded in the board's activity. */
export interface OpMeta {
  /** Who made it. The sync server replaces it with the employee it knows the phone belongs to. */
  by?: Actor | null;
  /** Operations with the same group are one entry in the activity. */
  group?: string;
  /** The entry this group undoes. */
  reverts?: string;
  /** The card button the group comes from. */
  button?: string;
}

export type Op = OpInput & { id: string; at: number } & OpMeta;

// Sync protocol (WebSocket, JSON messages).
export type ClientMessage =
  | { t: 'publish'; code: string; board: Board }
  | { t: 'join'; code: string }
  | { t: 'leave'; code: string }
  | { t: 'op'; code: string; op: Op }
  // Team notifications. `device` is a random secret identifying this phone; `push` its Expo push
  // token (null until push is set up); `name` shows in teammates' notifications.
  | {
      t: 'hello';
      device: string;
      push: string | null;
      name: string;
      team: boolean;
      /** The employee's sign-in code, so the server can tell who this phone belongs to. */
      member?: string | null;
    }
  /** The cards this device watches on a board (the whole list, replacing the previous one). */
  | { t: 'watch'; code: string; cardIds: string[] }
  /** The board open on screen, if any: no notifications about it while it is. */
  | { t: 'focus'; code: string | null };

export type ServerErrorReason = 'not_found' | 'code_taken' | 'bad_request';

export type ServerMessage =
  | { t: 'snapshot'; code: string; board: Board; version: number; seen: string[] }
  | { t: 'op'; code: string; op: Op; version: number }
  | { t: 'ack'; code: string; opId: string }
  | { t: 'presence'; code: string; count: number }
  | { t: 'error'; code: string; reason: ServerErrorReason };
