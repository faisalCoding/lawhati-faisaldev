import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { WidgetConfigurationScreenProps } from 'react-native-android-widget';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '../components/ui/Buttons';
import { Txt } from '../components/ui/Txt';
import { colors } from '../lib/theme';
import type { Board } from '../shared/types';
import { CardPicker } from './CardPicker';
import { renderCardWidget } from './CardWidget';
import { ListPicker } from './ListPicker';
import { renderListWidget } from './ListWidgetView';
import {
  buildCardWidgetModel,
  buildListWidgetModel,
  LIST_WIDGET,
  loadBoards,
  loadListWidgetTargets,
  loadWidgetTargets,
  setListWidgetTarget,
  setWidgetTarget,
  type ListWidgetTarget,
  type WidgetTarget,
} from './model';

/**
 * Shown by Android when a widget is added (or reconfigured): pick the card, or the list, it shows.
 * It runs in its own activity, outside the app's navigation.
 */
export function WidgetConfigurationScreen(props: WidgetConfigurationScreenProps) {
  return (
    <SafeAreaProvider>
      <Picker {...props} />
    </SafeAreaProvider>
  );
}

function Picker({ widgetInfo, renderWidget, setResult }: WidgetConfigurationScreenProps) {
  const insets = useSafeAreaInsets();
  const isList = widgetInfo.widgetName === LIST_WIDGET;
  const [boards, setBoards] = useState<Record<string, Board> | null>(null);
  const [currentCard, setCurrentCard] = useState<WidgetTarget | undefined>();
  const [currentList, setCurrentList] = useState<ListWidgetTarget | undefined>();

  useEffect(() => {
    Promise.all([loadBoards(), loadWidgetTargets(), loadListWidgetTargets()]).then(([byId, cards, lists]) => {
      setBoards(byId);
      setCurrentCard(cards[widgetInfo.widgetId]);
      setCurrentList(lists[widgetInfo.widgetId]);
    });
  }, [widgetInfo.widgetId]);

  const chooseCard = async (target: WidgetTarget) => {
    if (!boards) return;
    await setWidgetTarget(widgetInfo.widgetId, target);
    renderWidget(renderCardWidget(buildCardWidgetModel(boards, target), widgetInfo.height, widgetInfo.widgetId));
    setResult('ok');
  };

  const chooseList = async (target: { boardId: string; listId: string }) => {
    if (!boards) return;
    const next: ListWidgetTarget = { ...target, expandedCardId: null };
    await setListWidgetTarget(widgetInfo.widgetId, next);
    renderWidget(renderListWidget(buildListWidgetModel(boards, next), widgetInfo.widgetId));
    setResult('ok');
  };

  const sorted = boards ? Object.values(boards).sort((a, b) => b.updatedAt - a.updatedAt) : [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Txt style={styles.title}>{isList ? 'اختر قائمة للودجت' : 'اختر بطاقة للودجت'}</Txt>
          <Txt style={styles.subtitle}>
            {isList
              ? 'تظهر بطاقات القائمة على الشاشة الرئيسية، واضغط أي بطاقة لعرض مهامها.'
              : 'تظهر مهام البطاقة على الشاشة الرئيسية، ويفتحها الضغط عليها.'}
          </Txt>
        </View>
        <IconButton name="close" label="إلغاء" size={24} onPress={() => setResult('cancel')} />
      </View>
      {boards === null ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : isList ? (
        <ListPicker boards={sorted} selected={currentList} onChoose={chooseList} bottomInset={insets.bottom} />
      ) : (
        <CardPicker boards={sorted} selected={currentCard} onChoose={chooseCard} bottomInset={insets.bottom} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 19, fontWeight: '700' },
  subtitle: { fontSize: 13, color: colors.textSubtle, marginTop: 2 },
  loading: { marginTop: 40 },
});
