import { ScrollView, StyleSheet, View } from 'react-native';

import { describeStep } from '../../lib/buttonSteps';
import { colors } from '../../lib/theme';
import type { Board, CardButton } from '../../shared/types';
import { Button } from '../ui/Buttons';
import { ChoiceRow } from '../ui/ChoiceRow';
import { useSheetListHeight } from '../ui/Sheet';
import { Txt } from '../ui/Txt';

/** The board's card buttons, to press one. With none yet, a way to make the first. */
export function ButtonsList({
  board,
  onPress,
  onCreate,
}: {
  board: Board;
  onPress: (button: CardButton) => void;
  onCreate: () => void;
}) {
  const buttons = board.buttons ?? [];
  const listHeight = useSheetListHeight();
  if (buttons.length === 0) {
    return (
      <View style={styles.empty}>
        <Txt style={styles.note}>
          الزر ينفّذ عدة خطوات بضغطة واحدة، مثل: استبدال نص في العنوان، والنقل إلى قائمة، وتلوين الغلاف.
        </Txt>
        <Button title="زر جديد" icon="plus" onPress={onCreate} />
      </View>
    );
  }
  return (
    <ScrollView style={[styles.list, { maxHeight: listHeight }]} keyboardShouldPersistTaps="handled">
      {buttons.map((button) => (
        <ChoiceRow
          key={button.id}
          icon="zap"
          label={button.name}
          hint={button.steps.map((s) => describeStep(s, board)).join('، ')}
          onPress={() => onPress(button)}
        />
      ))}
      <ChoiceRow icon="plus" label="زر جديد" onPress={onCreate} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { maxHeight: 420 },
  empty: { gap: 12, paddingVertical: 8 },
  note: { fontSize: 14, color: colors.textSubtle, textAlign: 'center' },
});
