import type { Assignee, Card } from './types';

/** Whether a card is complete: its round checkbox is ticked. */
export function isCardDone(card: Card): boolean {
  return card.dueDone === true;
}

/** Whether a card, or one of its tasks, is assigned to someone. */
export function isAssignedTo(card: Card, personId: string): boolean {
  return (
    (card.assignees ?? []).some((a) => a.id === personId) || card.checklist.some((i) => i.assignee?.id === personId)
  );
}

/** Everyone something on the board is assigned to, in the order they first appear. */
export function assigneesOf(cards: Iterable<Card>): Assignee[] {
  const found = new Map<string, Assignee>();
  for (const card of cards) {
    for (const a of card.assignees ?? []) if (!found.has(a.id)) found.set(a.id, a);
    for (const item of card.checklist)
      if (item.assignee && !found.has(item.assignee.id)) found.set(item.assignee.id, item.assignee);
  }
  return [...found.values()];
}
