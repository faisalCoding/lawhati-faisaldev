import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StepForm } from '../../../components/board/StepForm';
import { Button, IconButton } from '../../../components/ui/Buttons';
import { ChoiceRow } from '../../../components/ui/ChoiceRow';
import { KeyboardScrollView } from '../../../components/ui/Keyboard';
import { ModalHeader, Section } from '../../../components/ui/Layout';
import { ConfirmForm, Sheet } from '../../../components/ui/Sheet';
import { Input, Txt } from '../../../components/ui/Txt';
import { describeStep, STEP_KINDS } from '../../../lib/buttonSteps';
import { goBack } from '../../../lib/nav';
import { colors } from '../../../lib/theme';
import type { ButtonStep } from '../../../shared/types';
import { deleteButton, newButton, saveButton } from '../../../store/buttons';
import { useBoard } from '../../../store/store';

/**
 * Makes or edits a card button: a name, and the steps it runs in order on the card it is pressed on.
 * Opened with `?buttonId=` to edit one.
 */
export default function ButtonEditorScreen() {
  const { id, buttonId } = useLocalSearchParams<{ id: string; buttonId?: string }>();
  const insets = useSafeAreaInsets();
  const board = useBoard(id);
  const existing = buttonId ? board?.buttons?.find((b) => b.id === buttonId) : undefined;
  const [draft] = useState(() => existing ?? newButton());
  const [name, setName] = useState(draft.name);
  const [steps, setSteps] = useState<ButtonStep[]>(draft.steps);
  // Adding a step (index null) or changing one; `kind` null while choosing what the step does.
  const [editing, setEditing] = useState<{ index: number | null; kind: ButtonStep['type'] | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!board) {
    return (
      <View style={styles.screen}>
        <ModalHeader title="زر البطاقة" onClose={goBack} />
      </View>
    );
  }

  const move = (index: number, by: number) => {
    const next = [...steps];
    const [step] = next.splice(index, 1);
    next.splice(index + by, 0, step);
    setSteps(next);
  };
  const saveStep = (step: ButtonStep) => {
    setSteps((current) =>
      editing?.index == null ? [...current, step] : current.map((s, i) => (i === editing.index ? step : s)),
    );
    setEditing(null);
  };
  const canSave = name.trim().length > 0 && steps.length > 0;
  const editingStep = editing?.index != null ? steps[editing.index] : undefined;
  const kindLabel = STEP_KINDS.find((k) => k.type === editing?.kind)?.label;

  return (
    <View style={styles.screen}>
      <ModalHeader title={existing ? 'تعديل الزر' : 'زر جديد'} onClose={goBack} />
      <KeyboardScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <Txt style={styles.lead}>
          الزر ينفّذ خطواته بالترتيب على البطاقة التي تضغطه فيها، ويظهر في شاشة كل بطاقة وعلى وجهها في اللوحة. ويمكن
          تشغيله على عدة بطاقات محددة معًا.
        </Txt>
        <Input
          value={name}
          onChangeText={setName}
          placeholder="اسم الزر، مثل: أنجزها وانقلها إلى مكتمل"
          maxLength={40}
        />

        <Section title="الخطوات" icon="zap">
          {steps.map((step, index) => (
            <View key={index} style={styles.step}>
              <Txt style={styles.stepNumber}>{index + 1}</Txt>
              <Txt style={styles.stepText} onPress={() => setEditing({ index, kind: step.type })}>
                {describeStep(step, board)}
              </Txt>
              <IconButton
                name="arrow-up"
                label="قبلها"
                size={18}
                disabled={index === 0}
                onPress={() => move(index, -1)}
              />
              <IconButton
                name="arrow-down"
                label="بعدها"
                size={18}
                disabled={index === steps.length - 1}
                onPress={() => move(index, 1)}
              />
              <IconButton
                name="close"
                label="حذف الخطوة"
                size={18}
                color={colors.textFaint}
                onPress={() => setSteps(steps.filter((_, i) => i !== index))}
              />
            </View>
          ))}
          {steps.length === 0 ? <Txt style={styles.empty}>لا خطوات بعد.</Txt> : null}
          <Button
            title="إضافة خطوة"
            icon="plus"
            variant="secondary"
            onPress={() => setEditing({ index: null, kind: null })}
          />
        </Section>

        <Button
          title="حفظ الزر"
          icon="check"
          disabled={!canSave}
          onPress={() => {
            saveButton(board.id, { id: draft.id, name: name.trim(), steps });
            goBack();
          }}
        />
        {existing ? (
          confirmDelete ? (
            <ConfirmForm
              message={`سيُحذف الزر «${existing.name}» من اللوحة عند كل الفريق. لا تتأثر البطاقات.`}
              confirmLabel="حذف الزر"
              onConfirm={() => {
                deleteButton(board.id, existing.id);
                goBack();
              }}
              onCancel={() => setConfirmDelete(false)}
            />
          ) : (
            <Button title="حذف الزر" icon="trash" variant="danger" onPress={() => setConfirmDelete(true)} />
          )
        ) : null}
      </KeyboardScrollView>

      <Sheet
        visible={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.kind ? kindLabel : 'ماذا تفعل الخطوة؟'}
      >
        {editing && !editing.kind
          ? STEP_KINDS.map((k) => (
              <ChoiceRow
                key={k.type}
                icon={k.icon}
                label={k.label}
                onPress={() => setEditing({ ...editing, kind: k.type })}
              />
            ))
          : null}
        {editing?.kind ? (
          <StepForm
            board={board}
            kind={editing.kind}
            initial={editingStep?.type === editing.kind ? editingStep : undefined}
            onSave={saveStep}
          />
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, gap: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  lead: { fontSize: 14, color: colors.textSubtle },
  step: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.list,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    overflow: 'hidden',
  },
  stepText: { flex: 1, fontSize: 15 },
  empty: { fontSize: 14, color: colors.textSubtle },
});
