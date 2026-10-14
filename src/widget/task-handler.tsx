import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import type { OpInput } from '../shared/types';
import { dispatch, initStore, waitForServer } from '../store/actions';
import { store } from '../store/store';
import { renderCardWidget } from './CardWidget';
import { renderListWidget } from './ListWidgetView';
import {
  buildCardWidgetModel,
  buildListWidgetModel,
  CARD_WIDGET,
  LIST_WIDGET,
  loadBoards,
  loadListWidgetTargets,
  loadWidgetTargets,
  setListWidgetTarget,
  setWidgetTarget,
  WIDGET_ACTIONS,
} from './model';
import { redrawWidgets } from './updates';

interface ActionData {
  boardId?: string;
  cardId?: string;
  itemId?: string;
}

/** Turns a widget button press into a board change, using the current state (not the one drawn). */
function opForAction(action: string, { boardId, cardId, itemId }: ActionData): OpInput | null {
  const board = boardId ? store.get().boards[boardId]?.board : undefined;
  const card = cardId ? board?.cards[cardId] : undefined;
  if (!board || !card) return null;

  if (action === WIDGET_ACTIONS.toggleTask) {
    const item = card.checklist.find((i) => i.id === itemId);
    return item ? { type: 'check/update', cardId: card.id, itemId: item.id, patch: { done: !item.done } } : null;
  }

  const list = board.lists.find((l) => l.cardIds.includes(card.id));
  if (!list) return null;
  const index = list.cardIds.indexOf(card.id);
  const toIndex = action === WIDGET_ACTIONS.up ? index - 1 : index + 1;
  if (toIndex < 0 || toIndex >= list.cardIds.length) return null;
  return { type: 'card/move', cardId: card.id, toListId: list.id, toIndex };
}

/**
 * Applies a widget button press even when the app is closed. The change is saved at once; for a
 * shared board the handler waits briefly for the server to confirm it, and anything unconfirmed
 * is sent the next time the app connects.
 */
async function runAction(action: string, data: ActionData) {
  await initStore();
  const op = opForAction(action, data);
  if (!op || !data.boardId) return;
  dispatch(data.boardId, op);
  await store.flush();
  await waitForServer(data.boardId, 4000);
  await store.flush();
}

/** Folds the tapped card out in a list widget, or folds it back if it was already open. */
async function toggleExpanded(widgetId: number, cardId: string | undefined) {
  const target = (await loadListWidgetTargets())[widgetId];
  if (!target || !cardId) return;
  await setListWidgetTarget(widgetId, {
    ...target,
    expandedCardId: target.expandedCardId === cardId ? null : cardId,
  });
}

const BOARD_ACTIONS: string[] = [WIDGET_ACTIONS.up, WIDGET_ACTIONS.down, WIDGET_ACTIONS.toggleTask];

/** Runs in the background when Android adds, resizes, refreshes or removes a widget, or a button is pressed. */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const { widgetInfo, widgetAction, renderWidget } = props;
  const { widgetName, widgetId } = widgetInfo;
  if (widgetName !== CARD_WIDGET && widgetName !== LIST_WIDGET) return;

  const draw = async () => {
    const boards = await loadBoards();
    if (widgetName === CARD_WIDGET) {
      const target = (await loadWidgetTargets())[widgetId];
      renderWidget(renderCardWidget(buildCardWidgetModel(boards, target), widgetInfo.height, widgetId));
    } else {
      const target = (await loadListWidgetTargets())[widgetId];
      renderWidget(renderListWidget(buildListWidgetModel(boards, target), widgetId));
    }
  };

  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      await draw();
      break;
    case 'WIDGET_DELETED':
      if (widgetName === CARD_WIDGET) await setWidgetTarget(widgetId, null);
      else await setListWidgetTarget(widgetId, null);
      break;
    case 'WIDGET_CLICK': {
      const data = (props.clickActionData ?? {}) as ActionData;
      if (props.clickAction === WIDGET_ACTIONS.expandCard) {
        // Only changes what this widget shows; nothing to save to the board.
        await toggleExpanded(widgetId, data.cardId);
        await draw();
      } else if (props.clickAction && BOARD_ACTIONS.includes(props.clickAction)) {
        await runAction(props.clickAction, data);
        await draw();
        // Other widgets may show the same card, or cards from the same list whose order changed.
        await redrawWidgets();
      }
      break;
    }
  }
}
