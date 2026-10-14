import type { ComponentType } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';

import { colors } from '../../lib/theme';
import { ICONS, type IconName, type IconTag } from './iconData';

export type { IconName };

// Each icon node is just a tag name plus string attributes, so the shapes share one prop type.
const ELEMENTS = { path: Path, circle: Circle, ellipse: Ellipse, line: Line, polygon: Polygon, polyline: Polyline, rect: Rect } as unknown as Record<
  IconTag,
  ComponentType<Readonly<Record<string, string>>>
>;

/** Every icon in the app is an SVG drawn from `iconData.ts` — no icon fonts, no emoji. */
export function Icon({
  name,
  size = 20,
  color = colors.text,
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const nodes = ICONS[name] ?? ICONS.kanban;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {nodes.map(([tag, attrs], i) => {
        const Element = ELEMENTS[tag];
        return <Element key={`${tag}-${i}`} {...attrs} />;
      })}
    </Svg>
  );
}

export const BOARD_ICONS = [
  'kanban',
  'briefcase',
  'plane',
  'cart',
  'book',
  'home',
  'target',
  'idea',
  'rocket',
  'palette',
  'heart',
  'star',
  'sparkles',
] as const satisfies readonly IconName[];

export type BoardIconName = (typeof BOARD_ICONS)[number];

export function isBoardIcon(value: string): value is BoardIconName {
  return (BOARD_ICONS as readonly string[]).includes(value);
}

/** A board's icon on a soft rounded tile, used on colored backgrounds. */
export function BoardBadge({ icon, size = 36, color = '#FFFFFF', tint = 'rgba(255,255,255,0.22)' }: {
  icon: string;
  size?: number;
  color?: string;
  tint?: string;
}) {
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: tint }]}>
      <Icon name={isBoardIcon(icon) ? icon : 'kanban'} size={Math.round(size * 0.56)} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
});
