import { addDays, todayISO } from '../lib/dates';
import { uid } from '../lib/ids';
import { pluralCards } from '../lib/text';
import { offerUndo } from '../lib/undo';
import type { Member } from '../members/api';
import { getMemberSession } from '../members/session';
import { isCardDone } from '../shared/cards';
import type { Assignee, CardButton } from '../shared/types';
import { batch, dispatch } from './actions';
import { canRevert, toggleEntry } from './activity';
import { changeCards, moveCards } from './cardOps';
import { store } from './store';

// Card buttons: named lists of steps, kept with the board so the whole team has them.

export interface ButtonRun {
  /** Cards the button changed. */
  changed: number;
  /** Steps it could not take, in words (a list or label deleted since, or «me» without signing in). */
  skipped: string[];
}

/** Runs a button's steps, in order, on each card. `me`: whoever pressed it (for «assign to me»). */
export function runButton(boardId: string, ids: string[], button: CardButton, me: Member | null): ButtonRun {
  const changed = new Set<string>();
  const skipped: string[] = [];
  for (const step of button.steps) {
    const board = store.get().boards[boardId]?.board;
    if (!board) break;
    switch (step.type) {
      case 'replace':
        if (!step.find) break;
        changeCards(
          boardId,
          ids,
          (card) => {
            const title = card.title.split(step.find).join(step.replace).trim();
            return title && title !== card.title ? [{ type: 'card/update', cardId: card.id, patch: { title } }] : [];
          },
          changed,
        );
        break;
      case 'move':
        if (!board.lists.some((l) => l.id === step.listId)) skipped.push('النقل: القائمة لم تعد موجودة');
        else moveCards(boardId, ids, step.listId, step.position, changed);
        break;
      case 'cover':
        changeCards(
          boardId,
          ids,
          (card) =>
            card.cover === step.color ? [] : [{ type: 'card/update', cardId: card.id, patch: { cover: step.color } }],
          changed,
        );
        break;
      case 'done':
        changeCards(
          boardId,
          ids,
          (card) =>
            isCardDone(card) === step.done
              ? []
              : [{ type: 'card/update', cardId: card.id, patch: { dueDone: step.done } }],
          changed,
        );
        break;
      case 'due': {
        const due = step.days === null ? null : addDays(todayISO(), step.days);
        changeCards(
          boardId,
          ids,
          (card) => (card.due === due ? [] : [{ type: 'card/update', cardId: card.id, patch: { due } }]),
          changed,
        );
        break;
      }
      case 'assign': {
        if (step.to === 'me' && !me) {
          skipped.push('«أسندها إليّ»: ادخل برمز الموظف أولًا');
          break;
        }
        const person: Assignee | null =
          step.to === 'nobody' ? null : step.to === 'me' ? { id: me!.id, name: me!.name } : step.to;
        changeCards(
          boardId,
          ids,
          (card) => {
            const current = card.assignees ?? [];
            if (!person) {
              return current.length ? [{ type: 'card/update', cardId: card.id, patch: { assignees: [] } }] : [];
            }
            if (current.some((a) => a.id === person.id)) return [];
            return [{ type: 'card/update', cardId: card.id, patch: { assignees: [...current, person] } }];
          },
          changed,
        );
        break;
      }
      case 'label':
        if (!board.labels.some((l) => l.id === step.labelId)) {
          skipped.push('التسمية: لم تعد موجودة');
          break;
        }
        changeCards(
          boardId,
          ids,
          (card) =>
            card.labelIds.includes(step.labelId) === step.on
              ? []
              : [{ type: 'card/setLabel', cardId: card.id, labelId: step.labelId, on: step.on }],
          changed,
        );
        break;
      case 'tasks':
        changeCards(
          boardId,
          ids,
          (card) =>
            step.items.map((text) => ({
              type: 'check/add' as const,
              cardId: card.id,
              item: { id: uid(), text, done: false },
            })),
          changed,
        );
        break;
    }
  }
  return { changed: changed.size, skipped };
}

/**
 * Presses a button on some cards: runs it as the signed-in employee, as one entry in the board's
 * activity, then says what changed, with «تراجع».
 */
export function pressButton(boardId: string, ids: string[], button: CardButton) {
  if (!store.get().boards[boardId]) return;
  const { group, result } = batch(() => runButton(boardId, ids, button, getMemberSession().me), {
    button: button.name,
  });
  const { changed, skipped } = result;
  const what = changed > 0 ? (ids.length > 1 ? `تغيّرت ${pluralCards(changed)}` : 'تم') : 'لم يتغير شيء';
  const note = skipped.length ? ` (تُخطّي: ${skipped.join('، ')})` : '';
  offerUndo(
    `«${button.name}»: ${what}${note}`,
    canRevert(boardId, group) ? () => toggleEntry(boardId, group) : undefined,
  );
}

function setButtons(boardId: string, update: (buttons: CardButton[]) => CardButton[]) {
  const board = store.get().boards[boardId]?.board;
  if (!board) return;
  dispatch(boardId, { type: 'board/update', patch: { buttons: update(board.buttons ?? []) } });
}

/** Adds a button, or replaces the one with the same id. */
export function saveButton(boardId: string, button: CardButton) {
  setButtons(boardId, (buttons) =>
    buttons.some((b) => b.id === button.id)
      ? buttons.map((b) => (b.id === button.id ? button : b))
      : [...buttons, button],
  );
}

export function deleteButton(boardId: string, buttonId: string) {
  setButtons(boardId, (buttons) => buttons.filter((b) => b.id !== buttonId));
}

export const newButton = (): CardButton => ({ id: uid(), name: '', steps: [] });
