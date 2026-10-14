import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalHeader } from '../components/ui/Layout';
import { leaveScreen } from '../lib/nav';
import { colors } from '../lib/theme';
import { useAppState } from '../store/store';
import { CardPicker } from '../widget/CardPicker';
import { loadWidgetTargets, setWidgetTarget, type WidgetTarget } from '../widget/model';
import { redrawWidgets } from '../widget/updates';

/** Opened by the widget's "change card" button: pick the card this widget shows. */
export default function WidgetCardScreen() {
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
  const [current, setCurrent] = useState<WidgetTarget | undefined>();

  useEffect(() => {
    loadWidgetTargets().then((targets) => setCurrent(targets[widgetId]));
  }, [widgetId]);

  const choose = async (target: WidgetTarget) => {
    setCurrent(target);
    if (Number.isFinite(widgetId)) {
      await setWidgetTarget(widgetId, target);
      await redrawWidgets();
    }
    leaveScreen(fromWidget);
  };

  return (
    <View style={styles.screen}>
      <ModalHeader title="اختر بطاقة للودجت" onClose={() => leaveScreen(fromWidget)} />
      {ready ? (
        <CardPicker boards={boards} selected={current} onChoose={choose} bottomInset={insets.bottom} />
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
