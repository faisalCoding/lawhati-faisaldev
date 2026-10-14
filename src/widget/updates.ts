import type { Board } from '../shared/types';
import { store } from '../store/store';
import {
  buildCardWidgetModel,
  buildListWidgetModel,
  CARD_WIDGET,
  LIST_WIDGET,
  loadBoards,
  loadListWidgetTargets,
  loadWidgetTargets,
  widgetsAvailable,
  type CardWidgetModel,
  type ListWidgetModel,
} from './model';

function widgetLibraries() {
  /* eslint-disable @typescript-eslint/no-require-imports */
  return {
    lib: require('react-native-android-widget') as typeof import('react-native-android-widget'),
    card: require('./CardWidget') as typeof import('./CardWidget'),
    list: require('./ListWidgetView') as typeof import('./ListWidgetView'),
  };
  /* eslint-enable @typescript-eslint/no-require-imports */
}

interface Models {
  cards: Record<string, CardWidgetModel>;
  lists: Record<string, ListWidgetModel>;
}

async function buildModels(boards: Record<string, Board>): Promise<Models> {
  const [cardTargets, listTargets] = await Promise.all([loadWidgetTargets(), loadListWidgetTargets()]);
  return {
    cards: Object.fromEntries(Object.entries(cardTargets).map(([id, t]) => [id, buildCardWidgetModel(boards, t)])),
    lists: Object.fromEntries(Object.entries(listTargets).map(([id, t]) => [id, buildListWidgetModel(boards, t)])),
  };
}

async function draw(models: Models) {
  const { lib, card, list } = widgetLibraries();
  if (Object.keys(models.cards).length) {
    await lib.requestWidgetUpdate({
      widgetName: CARD_WIDGET,
      renderWidget: (info) =>
        card.renderCardWidget(models.cards[info.widgetId] ?? { status: 'unconfigured' }, info.height, info.widgetId),
    });
  }
  if (Object.keys(models.lists).length) {
    await lib.requestWidgetUpdate({
      widgetName: LIST_WIDGET,
      renderWidget: (info) => list.renderListWidget(models.lists[info.widgetId] ?? { status: 'unconfigured' }, info.widgetId),
    });
  }
}

/** Redraws every widget on the home screen from the latest data. */
export async function redrawWidgets() {
  if (!widgetsAvailable) return;
  await draw(await buildModels(await loadBoards()));
}

/**
 * Keeps widgets on the home screen in step with the app: whenever something a widget shows
 * changes (locally or from a teammate), it is redrawn. Returns a function that stops watching.
 */
export function startWidgetUpdates(): () => void {
  if (!widgetsAvailable) return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastShown = '';

  const refresh = async () => {
    if (!store.get().ready) return;
    const boards = Object.fromEntries(Object.entries(store.get().boards).map(([id, e]) => [id, e.board]));
    const models = await buildModels(boards);
    // Skip redraws when nothing a widget shows has changed (most edits touch other cards).
    const shown = JSON.stringify(models);
    if (shown === lastShown) return;
    lastShown = shown;
    await draw(models);
  };

  const unsubscribe = store.subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => refresh().catch(() => {}), 800);
  });
  refresh().catch(() => {});
  return () => {
    unsubscribe();
    if (timer) clearTimeout(timer);
  };
}
