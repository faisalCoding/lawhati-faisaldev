import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TextInputProps } from 'react-native';

import { Input } from './Txt';

/**
 * A text field bound to board data. It edits locally and commits once, on blur or when
 * the screen closes, so typing does not send an operation per keystroke. While it is not
 * focused it follows remote changes made by teammates.
 */
export function EditableText({
  value,
  onCommit,
  required,
  ...props
}: Omit<TextInputProps, 'value' | 'onChangeText'> & {
  value: string;
  onCommit: (text: string) => void;
  /** Empty input reverts to the previous value instead of being saved. */
  required?: boolean;
}) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  const latest = useRef({ text, value, onCommit, required });
  useLayoutEffect(() => {
    latest.current = { text, value, onCommit, required };
  });

  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);

  useEffect(
    () => () => {
      const l = latest.current;
      const next = l.text.trim();
      if (next !== l.value.trim() && (next || !l.required)) l.onCommit(next);
    },
    [],
  );

  const commit = () => {
    const next = text.trim();
    if (!next && required) {
      setText(value);
      return;
    }
    if (next !== value.trim()) onCommit(next);
  };

  return (
    <Input
      {...props}
      value={text}
      onChangeText={setText}
      onFocus={(e) => {
        focused.current = true;
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        focused.current = false;
        commit();
        props.onBlur?.(e);
      }}
    />
  );
}
