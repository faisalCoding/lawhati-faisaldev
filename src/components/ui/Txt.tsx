import { forwardRef } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from 'react-native';

import { colors } from '../../lib/theme';

// The app keeps the native layout left-to-right on every platform (Expo Go disables RTL
// anyway) and lays out Arabic itself: text is right-aligned and rows use `row-reverse`.
// That keeps the drag-and-drop geometry identical on iOS, Android and the web.

/**
 * The app ships its own Arabic font instead of relying on the phone's. Samsung phones let people
 * pick a system-wide font whose sizes differ from what layout measured, which cut text short.
 * The family names match the fonts' PostScript names, so embedded and runtime-loaded copies agree.
 */
export const FONTS = {
  regular: 'IBMPlexSansArabic-Regular',
  medium: 'IBMPlexSansArabic-Medium',
  semibold: 'IBMPlexSansArabic-SemiBold',
  bold: 'IBMPlexSansArabic-Bold',
} as const;

export const FONT_FILES = {
  [FONTS.regular]: require('../../../assets/fonts/IBMPlexSansArabic-Regular.ttf'),
  [FONTS.medium]: require('../../../assets/fonts/IBMPlexSansArabic-Medium.ttf'),
  [FONTS.semibold]: require('../../../assets/fonts/IBMPlexSansArabic-SemiBold.ttf'),
  [FONTS.bold]: require('../../../assets/fonts/IBMPlexSansArabic-Bold.ttf'),
};

/** Honors larger system font sizes, but not so much that layouts break apart. */
const MAX_FONT_SCALE = 1.3;

function familyFor(weight: TextStyle['fontWeight']): string {
  switch (String(weight ?? '400')) {
    case '500':
      return FONTS.medium;
    case '600':
      return FONTS.semibold;
    case '700':
    case '800':
    case '900':
    case 'bold':
      return FONTS.bold;
    default:
      return FONTS.regular;
  }
}

/**
 * Turns `fontWeight` into the matching font file. With a custom font, Android would otherwise
 * thicken the regular file artificially, which also skews text measurement.
 */
function withFont(style: StyleProp<TextStyle>): TextStyle {
  const flat = StyleSheet.flatten(style) ?? {};
  if (flat.fontFamily) return flat;
  const { fontWeight, ...rest } = flat;
  return { ...rest, fontFamily: familyFor(fontWeight) };
}

const TEXT_BASE: TextStyle = { color: colors.text, fontSize: 15, textAlign: 'right', writingDirection: 'rtl' };

export function Txt({ style, ...props }: TextProps) {
  return (
    <Text
      // "simple" line breaking measures text the same way Android draws it, so lines are not cut short.
      textBreakStrategy="simple"
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      {...props}
      style={withFont([TEXT_BASE, style])}
    />
  );
}

const INPUT_BASE: TextStyle = {
  color: colors.text,
  fontSize: 16,
  textAlign: 'right',
  writingDirection: 'rtl',
  backgroundColor: colors.input,
  borderWidth: 1.5,
  borderColor: colors.border,
  borderRadius: 10,
  paddingHorizontal: 12,
  paddingVertical: 10,
};

export const Input = forwardRef<TextInput, TextInputProps>(function Input({ style, ...props }, ref) {
  // The web's TextInput only knows the older `blurOnSubmit`: without it, a field meant to stay
  // focused after Enter (to type several cards in a row) loses focus on every Enter.
  const webSubmit =
    Platform.OS === 'web' && props.submitBehavior ? { blurOnSubmit: props.submitBehavior === 'blurAndSubmit' } : null;
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.textFaint}
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      {...webSubmit}
      {...props}
      style={withFont([INPUT_BASE, style])}
    />
  );
});
