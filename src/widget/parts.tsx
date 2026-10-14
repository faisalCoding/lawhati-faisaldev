import { FlexWidget, SvgWidget, TextWidget, type ColorProp } from 'react-native-android-widget';

import type { DueTone } from '../lib/dates';
import { iconSvg } from './icons';
import { WIDGET_ACTIONS } from './model';

// Building blocks shared by the card and list widgets. Android widget layouts have no
// right-to-left mode, so rows are written in reverse order and text is right-aligned.

export interface Palette {
  surface: ColorProp;
  /** Background of cards and buttons inside the widget. */
  raised: ColorProp;
  title: ColorProp;
  subtle: ColorProp;
  faint: ColorProp;
}

export const LIGHT: Palette = {
  surface: '#FFFFFF',
  raised: '#F1F2F4',
  title: '#172B4D',
  subtle: '#44546F',
  faint: '#B3B9C4',
};

export const DARK: Palette = {
  surface: '#22272B',
  raised: '#2C333A',
  title: '#DEE4EA',
  subtle: '#9FADBC',
  faint: '#596773',
};

export const hex = (value: string) => value as `#${string}`;

const DUE_TONES = {
  done: { light: '#DCFFF1', dark: '#164B35', text: '#22A06B' },
  overdue: { light: '#FFECEB', dark: '#5D1F1A', text: '#C9372C' },
  soon: { light: '#FFF7D6', dark: '#533F04', text: '#B38600' },
  normal: null,
} as const;

const CHECKED =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="10" fill="#22A06B"/><path d="m7.5 12.5 3 3 6-7" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const unchecked = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="9.5" fill="none" stroke="${color}" stroke-width="2"/></svg>`;

export function DueBadge({
  due,
  palette,
  dark,
}: {
  due: { text: string; tone: DueTone };
  palette: Palette;
  dark: boolean;
}) {
  const tone = DUE_TONES[due.tone];
  const color = tone ? tone.text : palette.subtle;
  return (
    <FlexWidget
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        flexGap: 4,
        backgroundColor: tone ? (dark ? tone.dark : tone.light) : palette.raised,
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
      }}
    >
      <TextWidget text={due.text} style={{ fontSize: 11, color }} />
      <SvgWidget
        svg={iconSvg(due.tone === 'done' ? 'circle-check' : 'clock', color)}
        style={{ width: 12, height: 12 }}
      />
    </FlexWidget>
  );
}

/** One task of a card; tapping it marks it done or not done. */
export function TaskRow({
  boardId,
  cardId,
  task,
  palette,
  inset = 14,
}: {
  boardId: string;
  cardId: string;
  task: { id: string; text: string; done: boolean };
  palette: Palette;
  inset?: number;
}) {
  return (
    <FlexWidget
      clickAction={WIDGET_ACTIONS.toggleTask}
      clickActionData={{ boardId, cardId, itemId: task.id }}
      accessibilityLabel={task.done ? `${task.text}، منجزة` : task.text}
      style={{
        width: 'match_parent',
        flexDirection: 'row',
        alignItems: 'center',
        flexGap: 10,
        paddingHorizontal: inset,
        paddingVertical: 7,
      }}
    >
      <FlexWidget style={{ flex: 1 }}>
        <TextWidget
          text={task.text}
          maxLines={2}
          truncate="END"
          style={{
            width: 'match_parent',
            fontSize: 14,
            color: task.done ? palette.faint : palette.title,
            textAlign: 'right',
          }}
        />
      </FlexWidget>
      <SvgWidget svg={task.done ? CHECKED : unchecked(palette.faint)} style={{ width: 20, height: 20 }} />
    </FlexWidget>
  );
}

/** Shown when the widget has nothing to show yet, or what it showed was deleted. */
export function Message({ title, hint, palette }: { title: string; hint: string; palette: Palette }) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: palette.surface,
        borderRadius: 24,
        padding: 16,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flexGap: 6,
      }}
    >
      <SvgWidget svg={iconSvg('kanban', palette.title)} style={{ width: 26, height: 26 }} />
      <TextWidget text={title} style={{ fontSize: 15, fontWeight: 'bold', color: palette.title, textAlign: 'center' }} />
      <TextWidget text={hint} maxLines={3} style={{ fontSize: 12, color: palette.subtle, textAlign: 'center' }} />
    </FlexWidget>
  );
}

/** The colored bar at the top of a widget: a "change" button on the left, a title on the right. */
export function BoardBar({
  color,
  icon,
  title,
  caption,
  changeUri,
  changeLabel,
}: {
  color: string;
  icon: string;
  title: string;
  caption: string;
  changeUri: string;
  changeLabel: string;
}) {
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        backgroundColor: hex(color),
        paddingHorizontal: 10,
        paddingVertical: 7,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexGap: 8,
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 6 }}>
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: changeUri }}
          accessibilityLabel={changeLabel}
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: 'rgba(255, 255, 255, 0.22)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <SvgWidget svg={iconSvg('move', '#FFFFFF')} style={{ width: 15, height: 15 }} />
        </FlexWidget>
        <TextWidget
          text={caption}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.85)' }}
        />
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 6 }}>
        <TextWidget text={title} maxLines={1} truncate="END" style={{ fontSize: 13, fontWeight: 'bold', color: '#FFFFFF' }} />
        <SvgWidget svg={iconSvg(icon, '#FFFFFF')} style={{ width: 16, height: 16 }} />
      </FlexWidget>
    </FlexWidget>
  );
}
