import type { Assignee, Card } from './types';

/** Whether a card is complete: its round checkbox is ticked. */
export function isCardDone(card: Card): boolean {
  return card.dueDone === true;
}

/**
 * Responsibility for everyone on the board, written into a list of people as if it were one.
 *
 * A member and not a separate flag, so every place that already shows people — avatars, names in a
 * summary, a notification's «أُسندت إلى …» — shows «الجميع» without being taught to, and so a
 * version from before it, which knows only people, still reads «الجميع» where a flag would leave
 * it reading nobody. No real member has this id: theirs come from the site and are numbers.
 */
export const EVERYONE: Assignee = { id: '*', name: 'الجميع' };

export const isEveryone = (person: Assignee | null | undefined): boolean => person?.id === EVERYONE.id;

/**
 * The people a task or a meeting's decision is assigned to.
 *
 * Versions before 1.2 held one person, in `assignee`; newer ones hold a list. Both fields stay on
 * the item and in step (see `withAssignees`), so this reads the list and falls back to the one
 * person for anything written before the list existed.
 */
export function itemAssignees(item: { assignees?: Assignee[] | null; assignee?: Assignee | null }): Assignee[] {
  return item.assignees ?? (item.assignee ? [item.assignee] : []);
}

/**
 * A change to who holds a task or a decision, with both fields saying the same thing.
 *
 * Whichever one the change names, the other follows: a newer version writes the list, and the one
 * person an older version reads is its first; an older version writes the one person, and the list
 * becomes just them. Done in the reducer, so every device and the server agree on it, and an
 * installed older app that reassigns a task cannot leave a stale list behind it.
 */
type HeldBy = { assignee?: Assignee | null; assignees?: Assignee[] };

export function withAssignees<T extends HeldBy>(patch: T): T & HeldBy {
  if (patch.assignees !== undefined && patch.assignee === undefined) {
    return { ...patch, assignee: patch.assignees[0] ?? null };
  }
  if (patch.assignee !== undefined && patch.assignees === undefined) {
    return { ...patch, assignees: patch.assignee ? [patch.assignee] : [] };
  }
  return patch;
}

/**
 * Adds or removes one person from a list of people.
 *
 * «الجميع» and named people exclude each other: choosing everyone replaces whoever was named, and
 * naming someone takes the task back from everyone. Both at once would say two different things.
 */
export function toggleAssignee(list: readonly Assignee[], person: Assignee, on: boolean): Assignee[] {
  const rest = list.filter((a) => a.id !== person.id);
  if (!on) return rest;
  return isEveryone(person) ? [EVERYONE] : [...rest.filter((a) => !isEveryone(a)), person];
}

/** The people as one line of text — «فيصل، عزام», «الجميع» — or null when there is nobody. */
export function ownerNames(people: readonly Assignee[]): string | null {
  return people.length > 0 ? people.map((a) => a.name).join('، ') : null;
}

/**
 * Whether a card, or one of its tasks, is assigned to someone. Something assigned to everyone is
 * assigned to each of them: it is theirs to do, and it belongs in «المسندة إليّ» for all of them.
 */
export function isAssignedTo(card: Card, personId: string): boolean {
  const holds = (people: Assignee[]) => people.some((a) => a.id === personId || isEveryone(a));
  return holds(card.assignees ?? []) || card.checklist.some((i) => holds(itemAssignees(i)));
}

/** Everyone something on the board is assigned to, in the order they first appear. */
export function assigneesOf(cards: Iterable<Card>): Assignee[] {
  const found = new Map<string, Assignee>();
  for (const card of cards) {
    for (const a of card.assignees ?? []) if (!found.has(a.id)) found.set(a.id, a);
    for (const item of card.checklist) {
      for (const a of itemAssignees(item)) if (!found.has(a.id)) found.set(a.id, a);
    }
  }
  return [...found.values()];
}
