import { useEffect, useState } from 'react';

/** The current time, moving on every `everyMs` while the screen is open (for «قبل 5 دقائق»). */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
