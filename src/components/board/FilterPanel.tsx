import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { countChoices, EMPTY_FILTER, type BoardFilter, type DueChoice } from '../../lib/filter';
import { pluralCards } from '../../lib/text';
import { colors } from '../../lib/theme';
import { asAssignee, useMe } from '../../members/session';
import type { Assignee, Board } from '../../shared/types';
import { Avatar } from '../ui/Avatar';
import { Button, Icon, IconButton, type IconName } from '../ui/Buttons';
import { Input, Txt } from '../ui/Txt';

/** People shown before «عرض الجميع». */
const PEOPLE_SHOWN = 5;

const DUE_CHOICES: { key: DueChoice; label: string; icon: IconName; tint: string; bg: string }[] = [
  { key: 'none', label: 'بلا موعد', icon: 'calendar', tint: colors.textSubtle, bg: colors.neutralBtn },
  { key: 'overdue', label: 'متأخرة', icon: 'clock', tint: '#FFFFFF', bg: colors.danger },
  { key: 'day', label: 'موعدها خلال يوم', icon: 'clock', tint: colors.warning, bg: colors.warningBg },
  { key: 'week', label: 'موعدها خلال أسبوع', icon: 'clock', tint: colors.textSubtle, bg: colors.neutralBtn },
  { key: 'month', label: 'موعدها خلال شهر', icon: 'clock', tint: colors.textSubtle, bg: colors.neutralBtn },
];

const toggle = (ids: string[], id: string) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

/**
 * The board's filters, as in Trello: each choice applies at once, and a card shows when it matches
 * a choice in every section that has one.
 */
export function FilterPanel({
  board,
  filter,
  people,
  shown,
  total,
  onChange,
}: {
  board: Board;
  filter: BoardFilter;
  /** Everyone something on the board is assigned to. */
  people: Assignee[];
  /** How many cards show now, out of `total`. */
  shown: number;
  total: number;
  onChange: (next: BoardFilter) => void;
}) {
  const me = useMe();
  const { height } = useWindowDimensions();
  const [allPeople, setAllPeople] = useState(false);
  const others = people.filter((p) => p.id !== me?.id);
  const visiblePeople = allPeople || others.length <= PEOPLE_SHOWN ? others : others.slice(0, PEOPLE_SHOWN - 1);
  const set = (patch: Partial<BoardFilter>) => onChange({ ...filter, ...patch });
  const { members, status, due, labels } = filter;

  return (
    <View>
      <ScrollView
        style={{ maxHeight: Math.min(560, Math.round(height * 0.6)) }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <Heading>الكلمة المفتاحية</Heading>
        <View style={styles.search}>
          <Input
            value={filter.keyword}
            onChangeText={(keyword) => set({ keyword })}
            placeholder="ابحث بكلمة…"
            returnKeyType="search"
            style={styles.searchInput}
            accessibilityLabel="الكلمة المفتاحية"
          />
          {filter.keyword ? <IconButton name="close" label="مسح الكلمة" onPress={() => set({ keyword: '' })} /> : null}
        </View>
        <Txt style={styles.hint}>في العناوين والأوصاف والأشخاص والتسميات والمهام.</Txt>

        <Heading>الأعضاء</Heading>
        <Choice
          on={members.none}
          onPress={() => set({ members: { ...members, none: !members.none } })}
          leading={<Badge icon="user" />}
          label="بلا مسؤول"
        />
        {me ? (
          <Choice
            on={members.me}
            onPress={() => set({ members: { ...members, me: !members.me } })}
            leading={<Avatar person={asAssignee(me)} size={28} />}
            label="المسندة إليّ"
          />
        ) : null}
        {visiblePeople.map((person) => (
          <Choice
            key={person.id}
            on={members.ids.includes(person.id)}
            onPress={() => set({ members: { ...members, ids: toggle(members.ids, person.id) } })}
            leading={<Avatar person={person} size={28} />}
            label={person.name}
          />
        ))}
        {visiblePeople.length < others.length ? (
          <Pressable
            onPress={() => setAllPeople(true)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.more, pressed && styles.pressed]}
          >
            <Txt style={styles.moreText}>{`عرض الجميع (${others.length})`}</Txt>
            <Icon name="chevron-down" size={16} color={colors.primary} />
          </Pressable>
        ) : null}

        <Heading>حالة البطاقة</Heading>
        <Choice
          on={status.done}
          onPress={() => set({ status: { ...status, done: !status.done } })}
          leading={<Badge icon="circle-check" tint={colors.success} bg={colors.successBg} />}
          label="منجزة"
        />
        <Choice
          on={status.open}
          onPress={() => set({ status: { ...status, open: !status.open } })}
          leading={<Badge icon="radio-off" />}
          label="غير منجزة"
        />

        {board.powerUps.dueDates ? (
          <>
            <Heading>موعد التسليم</Heading>
            {DUE_CHOICES.map((c) => (
              <Choice
                key={c.key}
                on={due[c.key]}
                onPress={() => set({ due: { ...due, [c.key]: !due[c.key] } })}
                leading={<Badge icon={c.icon} tint={c.tint} bg={c.bg} />}
                label={c.label}
              />
            ))}
          </>
        ) : null}

        {board.powerUps.labels ? (
          <>
            <Heading>التسميات</Heading>
            <Choice
              on={labels.none}
              onPress={() => set({ labels: { ...labels, none: !labels.none } })}
              leading={<Badge icon="tag" />}
              label="بلا تسميات"
            />
            {board.labels.map((label) => (
              <Choice
                key={label.id}
                on={labels.ids.includes(label.id)}
                onPress={() => set({ labels: { ...labels, ids: toggle(labels.ids, label.id) } })}
                accessibilityLabel={label.name || 'تسمية بلا اسم'}
              >
                <View style={[styles.labelBar, { backgroundColor: label.color }]}>
                  <Txt style={styles.labelText} numberOfLines={1}>
                    {label.name}
                  </Txt>
                </View>
              </Choice>
            ))}
          </>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Txt style={styles.count} numberOfLines={1}>
          {shown === total
            ? `كل البطاقات: ${total}`
            : shown
              ? `تطابق ${pluralCards(shown)} من ${total}`
              : 'لا بطاقات تطابق'}
        </Txt>
        <Button
          title="مسح الفلاتر"
          variant="secondary"
          compact
          disabled={countChoices(filter) === 0}
          onPress={() => onChange(EMPTY_FILTER)}
        />
      </View>
    </View>
  );
}

function Heading({ children }: { children: string }) {
  return <Txt style={styles.heading}>{children}</Txt>;
}

/** A round icon before a choice, like Trello's. */
function Badge({
  icon,
  tint = colors.textSubtle,
  bg = colors.neutralBtn,
}: {
  icon: IconName;
  tint?: string;
  bg?: string;
}) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Icon name={icon} size={16} color={tint} />
    </View>
  );
}

/** A choice with a square checkbox at its start. */
function Choice({
  on,
  onPress,
  leading,
  label,
  accessibilityLabel,
  children,
}: {
  on: boolean;
  onPress: () => void;
  leading?: ReactNode;
  label?: string;
  accessibilityLabel?: string;
  children?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      aria-checked={on}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
    >
      <View style={[styles.box, on && styles.boxOn]}>
        {on ? <Icon name="check" size={14} color="#FFFFFF" strokeWidth={3} /> : null}
      </View>
      {leading}
      {label ? (
        <Txt style={styles.choiceText} numberOfLines={1}>
          {label}
        </Txt>
      ) : null}
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 8 },
  heading: { fontSize: 13, fontWeight: '700', color: colors.textSubtle, marginTop: 14, marginBottom: 4 },
  search: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  searchInput: { flex: 1 },
  hint: { fontSize: 12, color: colors.textFaint, marginTop: 4 },
  choice: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  pressed: { backgroundColor: colors.neutralBtn },
  box: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.textFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  badge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  choiceText: { flex: 1, fontSize: 15 },
  labelBar: { flex: 1, height: 30, borderRadius: 4, justifyContent: 'center', paddingHorizontal: 10 },
  labelText: { fontSize: 13, fontWeight: '700', color: '#172B4D' },
  more: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  moreText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  footer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  count: { flex: 1, fontSize: 14, color: colors.textSubtle },
});
