import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon } from '../components/ui/Buttons';
import { KeyboardScrollView } from '../components/ui/Keyboard';
import { BoardBadge } from '../components/ui/Icon';
import { ModalHeader, Section } from '../components/ui/Layout';
import { Input, Txt } from '../components/ui/Txt';
import { goBack } from '../lib/nav';
import { TEMPLATES } from '../lib/templates';
import { BOARD_COLORS, colors } from '../lib/theme';
import { createBoard } from '../store/actions';

export default function NewBoardScreen() {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [color, setColor] = useState(BOARD_COLORS[0]);
  const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];

  const create = () => {
    const id = createBoard({ title: title.trim() || template.name, color, templateId });
    goBack();
    router.push(`/board/${id}`);
  };

  return (
    <View style={styles.screen}>
      <ModalHeader title="لوحة جديدة" onClose={goBack} />
        <KeyboardScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        >
          <View style={[styles.preview, { backgroundColor: color }]}>
            <BoardBadge icon={template.icon} size={40} />
            <Txt style={styles.previewTitle} numberOfLines={1}>
              {title.trim() || template.name}
            </Txt>
          </View>

          <Section title="اسم اللوحة">
            <Input
              value={title}
              onChangeText={setTitle}
              placeholder={`مثال: ${template.name}`}
              returnKeyType="done"
              onSubmitEditing={create}
            />
          </Section>

          <Section title="ابدأ من قالب">
            {TEMPLATES.map((t) => {
              const selected = t.id === templateId;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setTemplateId(t.id)}
                  accessibilityRole="radio"
                  aria-selected={selected}
                  style={[styles.template, selected && styles.templateOn]}
                >
                  <BoardBadge
                    icon={t.icon}
                    size={42}
                    color={selected ? colors.primary : colors.textSubtle}
                    tint={selected ? '#E9F2FF' : colors.list}
                  />
                  <View style={styles.flex}>
                    <Txt style={styles.templateName}>{t.name}</Txt>
                    <Txt style={styles.templateHint}>{t.hint}</Txt>
                  </View>
                  <Icon
                    name={selected ? 'radio-on' : 'radio-off'}
                    size={22}
                    color={selected ? colors.primary : colors.textFaint}
                  />
                </Pressable>
              );
            })}
          </Section>

          <Section title="اللون">
            <View style={styles.colors}>
              {BOARD_COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  accessibilityRole="radio"
                  accessibilityLabel="لون اللوحة"
                  aria-selected={c === color}
                  style={[styles.color, { backgroundColor: c }, c === color && styles.colorOn]}
                >
                  {c === color ? <Icon name="check" size={18} color="#FFFFFF" /> : null}
                </Pressable>
              ))}
            </View>
          </Section>

          <Button title="إنشاء اللوحة" icon="plus" onPress={create} />
        </KeyboardScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  preview: {
    minHeight: 92,
    gap: 10,
    borderRadius: 16,
    padding: 14,
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  previewTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  template: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  templateOn: { borderColor: colors.primary, backgroundColor: '#F4F8FF' },
  templateName: { fontSize: 16, fontWeight: '600' },
  templateHint: { fontSize: 13, color: colors.textSubtle, marginTop: 2 },
  colors: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  color: { width: 48, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  colorOn: { borderWidth: 2, borderColor: colors.text },
});
