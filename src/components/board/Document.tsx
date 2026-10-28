import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '../../lib/theme';
import { Icon } from '../ui/Buttons';
import { Txt } from '../ui/Txt';

/**
 * The pieces a meeting's minutes and a policy document are set in.
 *
 * Both of them are records, not workspaces: they are read far more often than they are changed,
 * and they are read the way a page is read. So the page shows text — a heading, a clause, the
 * line of detail under it — and everything that edits them waits behind a tap on the thing it
 * edits. Nothing here draws a control the page does not need to be read.
 */
export function DocPage({ children }: { children: ReactNode }) {
  return <View style={styles.page}>{children}</View>;
}

/** The small line over a title that says what kind of document this is. */
export function DocKicker({ children }: { children: ReactNode }) {
  return <Txt style={styles.kicker}>{children}</Txt>;
}

export function DocTitle({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  return (
    <DocTap onPress={onPress} label={typeof children === 'string' ? children : undefined}>
      <Txt style={styles.title}>{children}</Txt>
    </DocTap>
  );
}

/** The lines under a title: when, where, who. Plain sentences, not fields. */
export function DocMeta({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  return (
    <DocTap onPress={onPress}>
      <Txt style={styles.meta}>{children}</Txt>
    </DocTap>
  );
}

export function DocRule() {
  return <View style={styles.rule} />;
}

/** A numbered section heading: «أولًا: ضوابط الرحلات». */
export function DocHeading({
  marker,
  title,
  note,
  onPress,
}: {
  marker?: string;
  title: string;
  /** A quiet half-sentence after the heading, such as how many clauses sit under it. */
  note?: string;
  onPress?: () => void;
}) {
  return (
    <DocTap onPress={onPress} label={title}>
      <View style={styles.heading}>
        <Txt style={styles.headingText}>
          {marker ? <Txt style={styles.headingMarker}>{marker}: </Txt> : null}
          {title}
        </Txt>
        {note ? <Txt style={styles.headingNote}>{note}</Txt> : null}
      </View>
    </DocTap>
  );
}

/**
 * One numbered clause of the document, with the line of detail that belongs to it.
 *
 * `struck` is for a rule that has been repealed: a document does not lose what it used to say,
 * it shows that it no longer says it.
 */
export function DocClause({
  marker,
  text,
  meta,
  struck,
  onPress,
}: {
  marker: string;
  text: string;
  meta?: string;
  struck?: boolean;
  onPress?: () => void;
}) {
  return (
    <DocTap onPress={onPress} label={text}>
      <View style={styles.clause}>
        <Txt style={styles.marker}>{marker}</Txt>
        <View style={styles.clauseBody}>
          <Txt style={[styles.clauseText, struck && styles.struck]}>{text}</Txt>
          {meta ? <Txt style={styles.clauseMeta}>{meta}</Txt> : null}
        </View>
      </View>
    </DocTap>
  );
}

/** A paragraph in the document's own voice, for what is missing rather than what is written. */
export function DocNote({ children }: { children: ReactNode }) {
  return <Txt style={styles.note}>{children}</Txt>;
}

/**
 * The one line on the page that is not the document: adding to it.
 *
 * It is set as quietly as the text it sits under, because a document that is read should not look
 * like a form, and someone who means to write will find the one line that invites it.
 */
export function DocAdd({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.add, pressed && styles.pressed]}
    >
      <Icon name="plus" size={13} color={colors.textFaint} />
      <Txt style={styles.addText}>{label}</Txt>
    </Pressable>
  );
}

/** Wraps a block so a tap on it opens what edits it, and shows nothing when nothing does. */
function DocTap({ children, onPress, label }: { children: ReactNode; onPress?: () => void; label?: string }) {
  if (!onPress) return <>{children}</>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="اضغط للتفاصيل"
      onPress={onPress}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 22,
    paddingVertical: 26,
    gap: 2,
  },
  kicker: { fontSize: 11, fontWeight: '700', color: colors.textFaint, letterSpacing: 1, marginBottom: 6 },
  title: { fontSize: 21, fontWeight: '700', lineHeight: 36 },
  meta: { fontSize: 13, color: colors.textSubtle, lineHeight: 26 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 16 },
  heading: { marginTop: 18, marginBottom: 6 },
  headingText: { fontSize: 15.5, fontWeight: '700', lineHeight: 30 },
  headingMarker: { color: colors.textFaint },
  headingNote: { fontSize: 11.5, color: colors.textFaint, lineHeight: 20 },
  clause: { flexDirection: 'row-reverse', gap: 8, paddingVertical: 5 },
  // Wide enough for «10/12» so every clause's text starts on the same line down the page.
  marker: { width: 34, fontSize: 12.5, color: colors.textFaint, lineHeight: 28, textAlign: 'left' },
  clauseBody: { flex: 1 },
  clauseText: { fontSize: 14.5, lineHeight: 28 },
  struck: { textDecorationLine: 'line-through', color: colors.textFaint },
  clauseMeta: { fontSize: 11.5, color: colors.textFaint, lineHeight: 22 },
  note: { fontSize: 13.5, color: colors.textFaint, lineHeight: 26, paddingVertical: 4 },
  add: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingVertical: 10 },
  addText: { fontSize: 13, color: colors.textFaint },
  pressed: { opacity: 0.55 },
});
