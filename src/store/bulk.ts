import { isCardDone } from '../shared/cards';
import type { Assignee } from '../shared/types';
import { changeCards } from './cardOps';

// What the selection bar does to the selected cards. Each returns how many cards it changed.

export { moveCards } from './cardOps';

export function deleteCards(boardId: string, ids: Iterable<string>): number {
  return changeCards(boardId, ids, (card) => [{ type: 'card/remove', cardId: card.id }]);
}

export function setCardsDone(boardId: string, ids: Iterable<string>, done: boolean): number {
  return changeCards(boardId, ids, (card) =>
    isCardDone(card) === done ? [] : [{ type: 'card/update', cardId: card.id, patch: { dueDone: done } }],
  );
}

export function setCardsDue(boardId: string, ids: Iterable<string>, due: string | null): number {
  return changeCards(boardId, ids, (card) =>
    card.due === due ? [] : [{ type: 'card/update', cardId: card.id, patch: { due } }],
  );
}

export function setCardsCover(boardId: string, ids: Iterable<string>, cover: string | null): number {
  return changeCards(boardId, ids, (card) =>
    card.cover === cover ? [] : [{ type: 'card/update', cardId: card.id, patch: { cover } }],
  );
}

export function setCardsLabel(boardId: string, ids: Iterable<string>, labelId: string, on: boolean): number {
  return changeCards(boardId, ids, (card) =>
    card.labelIds.includes(labelId) === on ? [] : [{ type: 'card/setLabel', cardId: card.id, labelId, on }],
  );
}

/** Adds a person to the cards (`on`), or takes them off. */
export function setCardsAssignee(boardId: string, ids: Iterable<string>, person: Assignee, on: boolean): number {
  return changeCards(boardId, ids, (card) => {
    const current = card.assignees ?? [];
    const has = current.some((a) => a.id === person.id);
    if (has === on) return [];
    const assignees = on ? [...current, person] : current.filter((a) => a.id !== person.id);
    return [{ type: 'card/update', cardId: card.id, patch: { assignees } }];
  });
}

export function clearCardsAssignees(boardId: string, ids: Iterable<string>): number {
  return changeCards(boardId, ids, (card) =>
    (card.assignees ?? []).length === 0 ? [] : [{ type: 'card/update', cardId: card.id, patch: { assignees: [] } }],
  );
}

/** Replaces every occurrence of `find` in the cards' titles. A title left empty keeps its old text. */
export function replaceInTitles(boardId: string, ids: Iterable<string>, find: string, replace: string): number {
  if (!find) return 0;
  return changeCards(boardId, ids, (card) => {
    const title = card.title.split(find).join(replace).trim();
    return title && title !== card.title ? [{ type: 'card/update', cardId: card.id, patch: { title } }] : [];
  });
}

/** How many of the cards' titles contain `find`, to preview a replacement. */
export function countTitlesWith(titles: string[], find: string): number {
  return find ? titles.filter((t) => t.includes(find)).length : 0;
}
