import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, TurboModuleRegistry } from 'react-native';

import { describeDue, type DueTone } from '../lib/dates';
import { isCardDone } from '../shared/cards';
import type { Board } from '../shared/types';
import { store } from '../store/store';

/** Shows one card and its tasks. */
export const CARD_WIDGET = 'CardWidget';
/** Shows a whole list; each card folds out to its tasks when tapped. */
export const LIST_WIDGET = 'BoardListWidget';

/** Click actions on the widget's buttons, handled in the background by the task handler. */
export const WIDGET_ACTIONS = {
  up: 'CARD_UP',
  down: 'CARD_DOWN',
  toggleTask: 'TASK_TOGGLE',
  expandCard: 'CARD_EXPAND',
  none: 'NOOP',
} as const;

/** Deep links the widget opens. `from=widget` makes those screens return to the home screen when done. */
export const widgetLinks = {
  card: (boardId: string, cardId: string) => `lawhati://board/${boardId}/card/${cardId}`,
  addTask: (boardId: string, cardId: string) =>
    `lawhati://quick-add?boardId=${encodeURIComponent(boardId)}&cardId=${encodeURIComponent(cardId)}&from=widget`,
  changeCard: (widgetId: number) => `lawhati://widget-card?widgetId=${widgetId}&from=widget`,
  changeList: (widgetId: number) => `lawhati://widget-list?widgetId=${widgetId}&from=widget`,
  board: (boardId: string) => `lawhati://board/${boardId}`,
};

/**
 * Home screen widgets exist only in Android builds that include the native module; in Expo Go,
 * iOS and the web everything widget-related is skipped.
 */
export const widgetsAvailable = Platform.OS === 'android' && TurboModuleRegistry.get('AndroidWidget') != null;

export interface WidgetTarget {
  boardId: string;
  cardId: string;
}

const TARGETS_KEY = 'kanban-app/widgets/v1';

/** Which card each widget on the home screen shows, keyed by the launcher's widget id. */
export async function loadWidgetTargets(): Promise<Record<string, WidgetTarget>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(TARGETS_KEY)) ?? '{}');
  } catch {
    return {};
  }
}

export async function setWidgetTarget(widgetId: number, target: WidgetTarget | null) {
  const targets = await loadWidgetTargets();
  if (target) targets[widgetId] = target;
  else delete targets[widgetId];
  await AsyncStorage.setItem(TARGETS_KEY, JSON.stringify(targets));
}

export interface ListWidgetTarget {
  boardId: string;
  listId: string;
  /** The card currently folded out in this widget, if any. */
  expandedCardId?: string | null;
}

const LIST_TARGETS_KEY = 'kanban-app/list-widgets/v1';

/** Which list each list widget shows, keyed by the launcher's widget id. */
export async function loadListWidgetTargets(): Promise<Record<string, ListWidgetTarget>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(LIST_TARGETS_KEY)) ?? '{}');
  } catch {
    return {};
  }
}

export async function setListWidgetTarget(widgetId: number, target: ListWidgetTarget | null) {
  const targets = await loadListWidgetTargets();
  if (target) targets[widgetId] = target;
  else delete targets[widgetId];
  await AsyncStorage.setItem(LIST_TARGETS_KEY, JSON.stringify(targets));
}

/** The boards as the app knows them: live state when the app is running, otherwise the saved copy. */
export async function loadBoards(): Promise<Record<string, Board>> {
  const s = store.get();
  const entries = s.ready ? s.boards : ((await store.load())?.boards ?? {});
  return Object.fromEntries(Object.entries(entries).map(([id, e]) => [id, e.board]));
}

export type CardWidgetModel =
  | {
      status: 'ok';
      uri: string;
      boardId: string;
      cardId: string;
      /** Position of the card in its list (0 = top) and the list's size, for the up/down buttons. */
      index: number;
      count: number;
      boardTitle: string;
      boardColor: string;
      boardIcon: string;
      listTitle: string;
      cardTitle: string;
      labels: { name: string; color: string }[];
      due: { text: string; tone: DueTone } | null;
      /** The card's tasks (its checklist), shown whether or not the checklist Power-Up is on. */
      tasks: { id: string; text: string; done: boolean }[];
    }
  | { status: 'missing' | 'unconfigured' };

export function buildCardWidgetModel(boards: Record<string, Board>, target: WidgetTarget | undefined): CardWidgetModel {
  if (!target) return { status: 'unconfigured' };
  const board = boards[target.boardId];
  const card = board?.cards[target.cardId];
  if (!board || !card) return { status: 'missing' };
  const list = board.lists.find((l) => l.cardIds.includes(card.id));
  const pu = board.powerUps;
  return {
    status: 'ok',
    uri: widgetLinks.card(board.id, card.id),
    boardId: board.id,
    cardId: card.id,
    index: list ? list.cardIds.indexOf(card.id) : 0,
    count: list?.cardIds.length ?? 1,
    boardTitle: board.title,
    boardColor: board.color,
    boardIcon: board.icon,
    listTitle: list?.title ?? '',
    cardTitle: card.title,
    labels: pu.labels
      ? board.labels.filter((l) => card.labelIds.includes(l.id)).map((l) => ({ name: l.name, color: l.color }))
      : [],
    due: pu.dueDates && card.due ? describeDue(card.due, isCardDone(card)) : null,
    tasks: card.checklist.map((i) => ({ id: i.id, text: i.text, done: i.done })),
  };
}

export interface ListWidgetCard {
  id: string;
  title: string;
  uri: string;
  due: { text: string; tone: DueTone } | null;
  tasks: { id: string; text: string; done: boolean }[];
}

export type ListWidgetModel =
  | {
      status: 'ok';
      boardId: string;
      listId: string;
      uri: string;
      boardTitle: string;
      boardColor: string;
      boardIcon: string;
      listTitle: string;
      cards: ListWidgetCard[];
      expandedCardId: string | null;
    }
  | { status: 'missing' | 'unconfigured' };

export function buildListWidgetModel(
  boards: Record<string, Board>,
  target: ListWidgetTarget | undefined,
): ListWidgetModel {
  if (!target) return { status: 'unconfigured' };
  const board = boards[target.boardId];
  const list = board?.lists.find((l) => l.id === target.listId);
  if (!board || !list) return { status: 'missing' };
  const cards = list.cardIds
    .map((id) => board.cards[id])
    .filter(Boolean)
    .map((card) => ({
      id: card.id,
      title: card.title,
      uri: widgetLinks.card(board.id, card.id),
      due: board.powerUps.dueDates && card.due ? describeDue(card.due, isCardDone(card)) : null,
      tasks: card.checklist.map((i) => ({ id: i.id, text: i.text, done: i.done })),
    }));
  const expanded = target.expandedCardId ?? null;
  return {
    status: 'ok',
    boardId: board.id,
    listId: list.id,
    uri: widgetLinks.board(board.id),
    boardTitle: board.title,
    boardColor: board.color,
    boardIcon: board.icon,
    listTitle: list.title,
    cards,
    expandedCardId: expanded && cards.some((c) => c.id === expanded) ? expanded : null,
  };
}
