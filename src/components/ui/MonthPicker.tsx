import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatLongDate, monthTitle, monthWeeks, parseISODate, todayISO } from '../../lib/dates';
import { colors } from '../../lib/theme';
import { IconButton } from './Buttons';
import { Txt } from './Txt';

/** The days of the week as calendars here head their columns, Sunday first. */
const DAY_LETTERS = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];

/**
 * A month to pick any day from — for a date the quick chips do not reach, three weeks out or a
 * day in the next term.
 *
 * Drawn by the app rather than borrowed from the platform: the same on a phone and in a browser,
 * right to left and in Arabic, with no native module added to the build for it. It opens on the
 * month of the date already set, or this month; today is ringed and the set day filled.
 */
export function MonthPicker({ value, onPick }: { value: string | null; onPick: (iso: string) => void }) {
  const today = todayISO();
  const [shown, setShown] = useState(() => {
    const start = parseISODate(value ?? today);
    return { year: start.getFullYear(), month: start.getMonth() };
  });
  const step = (by: number) =>
    setShown(({ year, month }) => {
      const next = new Date(year, month + by, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });

  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <IconButton name="chevron-right" label="الشهر السابق" size={18} onPress={() => step(-1)} />
        <Txt style={styles.title}>{monthTitle(shown.year, shown.month)}</Txt>
        <IconButton name="chevron-left" label="الشهر التالي" size={18} onPress={() => step(1)} />
      </View>
      <View style={styles.week}>
        {DAY_LETTERS.map((letter) => (
          <Txt key={letter} style={styles.letter}>
            {letter}
          </Txt>
        ))}
      </View>
      {monthWeeks(shown.year, shown.month).map((week, i) => (
        <View key={i} style={styles.week}>
          {week.map((iso, j) =>
            iso ? (
              <Pressable
                key={iso}
                onPress={() => onPick(iso)}
                accessibilityRole="button"
                accessibilityLabel={formatLongDate(iso)}
                aria-selected={iso === value}
                style={({ pressed }) => [
                  styles.day,
                  iso === today && styles.today,
                  iso === value && styles.picked,
                  pressed && styles.pressed,
                ]}
              >
                <Txt style={[styles.dayText, iso === value && styles.pickedText]}>{Number(iso.slice(8))}</Txt>
              </Pressable>
            ) : (
              <View key={`blank-${j}`} style={styles.day} />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.list, borderRadius: 12, padding: 8, gap: 2 },
  head: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14.5, fontWeight: '700' },
  // Row-reverse: the first day of the week, Sunday, sits at the right, where a week starts in Arabic.
  week: { flexDirection: 'row-reverse' },
  letter: { flex: 1, textAlign: 'center', fontSize: 12, color: colors.textFaint, paddingVertical: 4 },
  day: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, margin: 1 },
  today: { borderWidth: 1.5, borderColor: colors.primary },
  picked: { backgroundColor: colors.primary },
  pressed: { opacity: 0.6 },
  dayText: { fontSize: 14 },
  pickedText: { color: colors.surface, fontWeight: '700' },
});
