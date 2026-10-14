import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalHeader } from '../components/ui/Layout';
import { leaveScreen } from '../lib/nav';
import { colors } from '../lib/theme';
import { useAppState } from '../store/store';
import { ListPicker } from '../widget/ListPicker';
import { loadListWidgetTargets, setListWidgetTarget, type ListWidgetTarget } from '../widget/model';
import { redrawWidgets } from '../widget/updates';

/** Opened by the list widget's "change list" button: pick the list this widget shows. */
export default function WidgetListScreen() {
  const params = useLocalSearchParams<{ widgetId?: string; from?: string }>();
  const widgetId = Number(params.widgetId);
  const fromWidget = params.from === 'widget';
  const insets = useSafeAreaInsets();
  const ready = useAppState((s) => s.ready);
  const entries = useAppState((s) => s.boards);
  const boards = useMemo(
    () => Object.values(entries).map((e) => e.board).sort((a, b) => b.updatedAt - a.updatedAt),
    [entries],
  );
  const [current, setCurrent] = useState<ListWidgetTarget | undefined>();

  useEffect(() => {
    loadListWidgetTargets().then((targets) => setCurrent(targets[widgetId]));
  }, [widgetId]);

  const choose = async (target: { boardId: string; listId: string }) => {
    if (Number.isFinite(widgetId)) {
      await setListWidgetTarget(widgetId, { ...target, expandedCardId: null });
      await redrawWidgets();
    }
    leaveScreen(fromWidget);
  };

  return (
    <View style={styles.screen}>
      <ModalHeader title="اختر قائمة للودجت" onClose={() => leaveScreen(fromWidget)} />
      {ready ? (
        <ListPicker boards={boards} selected={current} onChoose={choose} bottomInset={insets.bottom} />
      ) : (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  loading: { marginTop: 40 },
});
