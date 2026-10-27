// Data model shared by the app and the sync server.

export type PowerUpKey = 'labels' | 'dueDates' | 'checklists' | 'covers' | 'wipLimits' | 'meetings';
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
  /**
   * When it is due, in YYYY-MM-DD form, like a card's.
   *
   * A card often stands for a week of work and the tasks inside it fall on different days; one
   * date on the card could only ever be the latest of them. Older items lack it.
   */
  due?: string | null;
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

/**
 * A subject this board's meetings keep returning to — «الرحلة», «سير الأسبوع الماضي».
 *
 * Six months of real minutes showed nineteen agenda items collapsing to six subjects and three
 * one-offs: an agenda is a standing list with the occasional addition, not free text retyped every
 * week. Keeping the subject lets a meeting start from it, and lets everything ever decided about
 * one subject be gathered across meetings — which is the thing a chat group cannot do.
 */
export interface AgendaSubject {
  id: string;
  title: string;
}

/** One item on a meeting's agenda, and what was said about it. */
export interface MeetingTopic {
  id: string;
  title: string;
  /** What was discussed. */
  notes: string;
  /** The standing subject this is an instance of, when it came from one. */
  subjectId?: string | null;
}

/**
 * What a meeting decided. Four shapes, because a meeting produces four kinds of thing and flattening
 * them into free text loses what can be acted on:
 *
 * - `task`: someone is to do something by a date. It can be turned into a card on the board, which
 *   is what puts it into the reminders, «assigned to me», and the lists people actually work from.
 * - `assignment`: someone holds something from now on — a committee, the printing, the trip's
 *   money. Not a task: it has no deadline and is never finished. A fifth of the real decisions
 *   read this way, and one meeting was five of them and no tasks at all.
 * - `note`: what was concluded, or a summary of the discussion. Nobody owes anything.
 * - `announcement`: a general direction, told to everyone rather than owed by anyone.
 * - `policy`: an addition, change or removal to the board's standing policies.
 */
export type OutcomeKind = 'task' | 'assignment' | 'note' | 'announcement' | 'policy';

export interface Outcome {
  id: string;
  kind: OutcomeKind;
  text: string;
  /** The topic it came out of. Null for a decision that belongs to the meeting as a whole. */
  topicId?: string | null;
  /** `task` and `assignment`: who holds it, with their name kept, as a card's assignee is. */
  assignee?: Assignee | null;
  /**
   * When it falls due, starts, or takes effect, in YYYY-MM-DD form.
   *
   * On any kind, not only a task: «the contest starts next Sunday» and «the trip moves to next
   * week» are dated decisions nobody owes, and forcing them into a task invented an owner.
   */
  due?: string | null;
  /** `task`: the card made from it, or the card holding it when it became a task inside one. */
  cardId?: string | null;
  /** `task`: set when it went into `cardId`'s checklist rather than becoming a card of its own. */
  itemId?: string | null;
  /** `policy`: the standing rule it added or amended, once it has. */
  policyId?: string | null;
  /**
   * Settled: done, or decided against, or simply dealt with.
   *
   * A task that became a card is settled by the card being done. One that did not — «عزام يراجع
   * مع البراء» needed no card — has only this. Without it there is no honest answer to the
   * question the next meeting opens with: what did we say we would do, and did we?
   */
  done?: boolean;
}

/**
 * A meeting held about this board: its agenda, who was there, and what came out of it.
 *
 * Attendance keeps each person's name beside their id, the way a card's assignees do. The roster
 * can change — someone leaves, someone renames themselves — and a record of who was in a room on a
 * day must not change with it.
 */
export interface Meeting {
  id: string;
  title: string;
  /** Local calendar date in YYYY-MM-DD form, like a card's due date. */
  date: string;
  /** Where it was held, or a link to join. */
  place?: string;
  /** Who was there, in the order they were added. */
  /** The column it is filed under. Unfiled reads as the first meetings column. */
  columnId?: string | null;
  /**
   * Whether it actually took place.
   *
   * Absent, it is read from the date — a meeting whose day has passed is taken to have happened,
   * which is true of every meeting already recorded. It is a flag and not only a date because a
   * date cannot say «postponed» or «cancelled»: an agenda is posted days before, and a meeting
   * that never happened would otherwise claim it did the moment its day went by.
   */
  held?: boolean;
  attendees: Assignee[];
  topics: MeetingTopic[];
  /** What the meeting decided, in the order it was written down. Older meetings lack it. */
  outcomes?: Outcome[];
  createdAt: number;
}

export type BoardColumnKind = 'meetings' | 'policies';

/**
 * A column on the board that is not a task list: meetings, or standing policies.
 *
 * One concept rather than two parallel ones, because «a policies section» and «another meetings
 * column» are the same thing seen twice. It also lets the columns be ordered among themselves —
 * meetings, then policies, then more meetings — which two separate lists could not express.
 *
 * They are never in `board.lists`. Twenty-four files read that array — the widget, the filters,
 * the buttons, «assigned to me», the notifications, the progress ring, the backup, the reducer —
 * and every one of them would take a meeting for a task.
 */
export interface BoardColumn {
  id: string;
  title: string;
  kind: BoardColumnKind;
}

/** One thing that happened to a standing rule, kept with the rule itself. */
export interface PolicyEvent {
  at: number;
  /** Who did it, as the board's activity records it. Null when nobody was named. */
  by?: Actor | null;
  kind: 'added' | 'edited' | 'repealed' | 'restored';
  /** `edited`: the wording it replaced. `added`: the wording it began with. */
  text?: string;
  /** The meeting it came out of, when it came from one. */
  meetingId?: string | null;
}

/**
 * One standing rule this board works by.
 *
 * Nearly half of what real meetings here produce reads this way: a limit, a procedure, who decides
 * what. They are the lasting output, and the reason the minutes are worth keeping at all.
 *
 * Each rule carries its own history. The board's activity log was supposed to be that record and
 * cannot be: it keeps the last hundred entries and drops the rest, so a rule set in September and
 * amended in October would quietly lose the September line. A rule people are held to has to be
 * able to say when it started and what it used to say.
 *
 * And a repealed rule is kept, not deleted. «What did we decide about this, and when did it stop
 * applying» is a question about rules that no longer apply, and deleting the row destroys the only
 * thing that could answer it.
 */
export interface Policy {
  id: string;
  text: string;
  /** The column it is filed under. Unfiled reads as the first policies column. */
  columnId?: string | null;
  /** The meeting it came out of, when it came from one rather than being written down directly. */
  meetingId?: string | null;
  at: number;
  /** When it stopped applying. A repealed rule leaves the board but keeps its record. */
  repealedAt?: number | null;
  /** Everything that has happened to it, oldest first. Older boards lack it. */
  history?: PolicyEvent[];
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
  /** Meetings held about this board, newest first. Older boards lack it. */
  meetings?: Meeting[];
  /** The subjects its meetings keep returning to, in the order they are gone through. */
  agenda?: AgendaSubject[];
  /** The standing rules it works by, in the order they are read. Older boards lack it. */
  policies?: Policy[];
  /** Its meeting and policy columns, in the order they are shown, after the task lists. */
  columns?: BoardColumn[];
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
  | { type: 'task/due'; card: string; task: string; due: string | null }
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
  | { type: 'member/seen'; name: string; renamed: boolean }
  | { type: 'meeting/add'; meeting: string }
  | { type: 'meeting/title'; meeting: string; from: string }
  | { type: 'meeting/when'; meeting: string; date: string }
  | { type: 'meeting/where'; meeting: string }
  | { type: 'meeting/held'; meeting: string; held: boolean }
  | { type: 'meeting/remove'; meeting: string; topics: number }
  | { type: 'meeting/attend'; meeting: string; who: string; on: boolean }
  | { type: 'topic/add'; meeting: string; topic: string }
  | { type: 'topic/title'; meeting: string; topic: string; from: string }
  | { type: 'topic/notes'; meeting: string; topic: string }
  | { type: 'topic/move'; meeting: string; topic: string }
  | { type: 'topic/remove'; meeting: string; topic: string }
  | { type: 'outcome/add'; meeting: string; kind: OutcomeKind; text: string }
  | { type: 'outcome/text'; meeting: string; text: string }
  | { type: 'outcome/kind'; meeting: string; text: string; kind: OutcomeKind }
  | { type: 'outcome/assign'; meeting: string; text: string; to: string | null }
  | { type: 'outcome/due'; meeting: string; text: string; due: string | null }
  | { type: 'outcome/card'; meeting: string; text: string; inside: string | null }
  | { type: 'outcome/remove'; meeting: string; text: string }
  | { type: 'outcome/topic'; meeting: string; text: string; topic: string | null }
  | { type: 'agenda/add'; subject: string }
  | { type: 'agenda/title'; subject: string; from: string }
  | { type: 'agenda/move'; subject: string }
  | { type: 'agenda/remove'; subject: string }
  | { type: 'column/add'; column: string; kind: BoardColumnKind }
  | { type: 'column/title'; column: string; from: string }
  | { type: 'column/move'; column: string }
  | { type: 'column/remove'; column: string; cards: number; movedTo: string | null }
  | { type: 'meeting/file'; meeting: string; column: string | null }
  | { type: 'policy/add'; policy: string; column: string | null }
  | { type: 'policy/text'; policy: string; from: string }
  | { type: 'policy/file'; policy: string; column: string | null }
  | { type: 'policy/move'; policy: string }
  | { type: 'policy/repeal'; policy: string }
  | { type: 'policy/restore'; policy: string }
  | { type: 'policy/remove'; policy: string }
  | { type: 'outcome/policy'; meeting: string; text: string; added: boolean }
  | { type: 'outcome/done'; meeting: string; text: string; done: boolean };

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
      patch: Partial<Pick<ChecklistItem, 'text' | 'done' | 'assignee' | 'due'>>;
    }
  | { type: 'check/remove'; cardId: string; itemId: string }
  | { type: 'meeting/add'; meeting: Meeting }
  | {
      type: 'meeting/update';
      meetingId: string;
      patch: Partial<Pick<Meeting, 'title' | 'date' | 'place' | 'columnId' | 'held'>>;
    }
  | { type: 'meeting/remove'; meetingId: string }
  /** Puts someone in the room, or takes them out. `person` carries the name to keep. */
  | { type: 'meeting/attend'; meetingId: string; person: Assignee; on: boolean }
  /** Added at the end of the agenda, or at `index` (undoing a deletion puts a topic back in place). */
  | { type: 'topic/add'; meetingId: string; topic: MeetingTopic; index?: number }
  | { type: 'topic/update'; meetingId: string; topicId: string; patch: Partial<Pick<MeetingTopic, 'title' | 'notes'>> }
  | { type: 'topic/move'; meetingId: string; topicId: string; toIndex: number }
  | { type: 'topic/remove'; meetingId: string; topicId: string }
  /** Added at the end, or at `index` (undoing a deletion puts one back in its place). */
  | { type: 'outcome/add'; meetingId: string; outcome: Outcome; index?: number }
  | {
      type: 'outcome/update';
      meetingId: string;
      outcomeId: string;
      patch: Partial<
        Pick<
          Outcome,
          'kind' | 'text' | 'topicId' | 'assignee' | 'due' | 'cardId' | 'itemId' | 'policyId' | 'done'
        >
      >;
    }
  | { type: 'outcome/remove'; meetingId: string; outcomeId: string }
  | { type: 'agenda/add'; subject: AgendaSubject; index?: number }
  | { type: 'agenda/update'; subjectId: string; patch: Partial<Pick<AgendaSubject, 'title'>> }
  | { type: 'agenda/move'; subjectId: string; toIndex: number }
  | { type: 'agenda/remove'; subjectId: string }
  | { type: 'column/add'; column: BoardColumn; index?: number }
  | { type: 'column/update'; columnId: string; patch: Partial<Pick<BoardColumn, 'title'>> }
  | { type: 'column/move'; columnId: string; toIndex: number }
  /**
   * `moveTo` names the column its cards go to. Without it they are destroyed with it, which the
   * app asks about separately — minutes are the most valuable thing on this board.
   */
  | { type: 'column/remove'; columnId: string; moveTo?: string | null }
  | { type: 'policy/add'; policy: Policy; index?: number }
  | { type: 'policy/update'; policyId: string; patch: Partial<Pick<Policy, 'text' | 'columnId' | 'meetingId'>> }
  | { type: 'policy/move'; policyId: string; toIndex: number }
  /**
   * Repeals it: it leaves the board and keeps its record.
   *
   * `since` is when it stopped applying, and defaults to now. Undoing a restore passes the date
   * it stopped the first time — otherwise the rule would claim it lapsed on the day of the undo.
   */
  | { type: 'policy/repeal'; policyId: string; since?: number }
  | { type: 'policy/restore'; policyId: string }
  /** Erases it and its record. Only for something written by mistake. */
  | { type: 'policy/remove'; policyId: string };

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
