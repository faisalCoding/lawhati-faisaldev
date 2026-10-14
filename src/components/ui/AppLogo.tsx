import Svg, { Rect } from 'react-native-svg';

// The app's mark, drawn with the same geometry as assets/brand/logo-mark.svg (1024 grid):
// Kanban columns of cards that flow right-to-left, with one card lifted mid-drag.
const W = 176;
const H = 120;
const R = 34;
const G = 42;
const V = 30;
const COUNTS = [2, 1, 3]; // left ("done"), middle, right ("to do")
const DRAG = { col: 0, row: 2, dx: 96, dy: -6, rot: -11 };

const colX = (i: number) => 512 - (3 * W + 2 * G) / 2 + i * (W + G);
const TOP = 512 - (3 * H + 2 * V) / 2;
const CARDS = COUNTS.flatMap((n, col) => Array.from({ length: n }, (_, row) => ({ x: colX(col), y: TOP + row * (H + V) })));
const LIFTED = { x: colX(DRAG.col) + DRAG.dx, y: TOP + DRAG.row * (H + V) + DRAG.dy };

export function AppLogo({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityLabel="شعار لوحتي">
      <Rect width={1024} height={1024} rx={230} fill="#000000" />
      {CARDS.map((c) => (
        <Rect key={`${c.x}-${c.y}`} x={c.x} y={c.y} width={W} height={H} rx={R} fill="#FFFFFF" />
      ))}
      <Rect
        x={LIFTED.x}
        y={LIFTED.y}
        width={W}
        height={H}
        rx={R}
        fill="#FFFFFF"
        transform={`rotate(${DRAG.rot} ${LIFTED.x + W / 2} ${LIFTED.y + H / 2})`}
      />
    </Svg>
  );
}
