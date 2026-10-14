// Due dates are stored as local calendar dates (YYYY-MM-DD), so there is no time zone drift.

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/** Whole days from today until the given date (negative when it has passed). */
export function daysFromToday(iso: string): number {
  const ms = parseISODate(iso).getTime() - parseISODate(todayISO()).getTime();
  return Math.round(ms / 86_400_000);
}

export function formatShortDate(iso: string): string {
  const date = parseISODate(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return `${date.getDate()} ${MONTHS[date.getMonth()]}${sameYear ? '' : ` ${date.getFullYear()}`}`;
}

export function formatLongDate(iso: string): string {
  const date = parseISODate(iso);
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "in 3 days" / "2 days late", with Arabic number agreement. */
export function describeDistance(iso: string): string {
  const days = daysFromToday(iso);
  const n = Math.abs(days);
  const amount = n === 1 ? 'يومًا واحدًا' : n === 2 ? 'يومين' : n <= 10 ? `${n} أيام` : `${n} يومًا`;
  if (days < 0) return `متأخرة ${amount}`;
  if (days === 0) return 'موعدها اليوم';
  if (days === 1) return 'موعدها غدًا';
  return `بعد ${amount}`;
}

/** The given day at `hour`:00, local time. */
export function atHour(iso: string, hour: number): Date {
  const date = parseISODate(iso);
  date.setHours(hour, 0, 0, 0);
  return date;
}

export type DueTone = 'done' | 'overdue' | 'soon' | 'normal';

export function describeDue(iso: string, done = false): { text: string; tone: DueTone } {
  const days = daysFromToday(iso);
  if (done) return { text: days === 0 ? 'اليوم' : days === 1 ? 'غدًا' : formatShortDate(iso), tone: 'done' };
  if (days < 0) return { text: `متأخرة · ${formatShortDate(iso)}`, tone: 'overdue' };
  if (days === 0) return { text: 'اليوم', tone: 'soon' };
  if (days === 1) return { text: 'غدًا', tone: 'soon' };
  return { text: formatShortDate(iso), tone: 'normal' };
}
