/** Joins the halves of a line of detail, leaving out whatever is not set. */
export function joined(...parts: (string | null | undefined | false)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' · ');
}

const ORDINALS = ['أولًا', 'ثانيًا', 'ثالثًا', 'رابعًا', 'خامسًا', 'سادسًا', 'سابعًا', 'ثامنًا', 'تاسعًا', 'عاشرًا'];

/**
 * «أولًا», «ثانيًا» … the way minutes head their sections. Past the tenth they simply count, which
 * is what a long document does rather than spell «الحادي والعشرون» over a heading.
 */
export function ordinal(n: number): string {
  return ORDINALS[n - 1] ?? `${n}.`;
}

/** Converts Arabic-Indic (٠-٩) and Persian (۰-۹) digits so numbers typed on an Arabic keyboard parse. */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * «بطاقتان», or «بطاقتين» with `genitive`: after a preposition or a noun it belongs to
 * (إلى بطاقتين، عنوان بطاقتين). The other counts read the same either way.
 */
export function pluralCards(n: number, genitive = false): string {
  if (n === 0) return 'لا بطاقات';
  if (n === 1) return 'بطاقة واحدة';
  if (n === 2) return genitive ? 'بطاقتين' : 'بطاقتان';
  if (n <= 10) return `${n} بطاقات`;
  return `${n} بطاقة`;
}

/** Like `pluralCards`, for tasks. */
export function pluralTasks(n: number, genitive = false): string {
  if (n === 0) return 'لا مهام';
  if (n === 1) return 'مهمة واحدة';
  if (n === 2) return genitive ? 'مهمتين' : 'مهمتان';
  if (n <= 10) return `${n} مهام`;
  return `${n} مهمة`;
}

/** Like `pluralCards`, for a meeting's agenda topics. */
export function pluralTopics(n: number, genitive = false): string {
  if (n === 0) return 'بلا محاور';
  if (n === 1) return 'محور واحد';
  if (n === 2) return genitive ? 'محورين' : 'محوران';
  if (n <= 10) return `${n} محاور`;
  return `${n} محورًا`;
}

/** Like `pluralCards`, for the board's standing policies. */
export function pluralPolicies(n: number, genitive = false): string {
  if (n === 0) return 'بلا سياسات';
  if (n === 1) return 'سياسة واحدة';
  if (n === 2) return genitive ? 'سياستين' : 'سياستان';
  if (n <= 10) return `${n} سياسات`;
  return `${n} سياسة`;
}

/** Like `pluralCards`, for a policy subject's sub-headings. */
export function pluralSubtopics(n: number, genitive = false): string {
  if (n === 0) return 'بلا مواضيع فرعية';
  if (n === 1) return 'موضوع فرعي واحد';
  if (n === 2) return genitive ? 'موضوعين فرعيين' : 'موضوعان فرعيان';
  if (n <= 10) return `${n} مواضيع فرعية`;
  return `${n} موضوعًا فرعيًّا`;
}

export function pluralLists(n: number): string {
  if (n === 0) return 'لا قوائم';
  if (n === 1) return 'قائمة واحدة';
  if (n === 2) return 'قائمتان';
  if (n <= 10) return `${n} قوائم`;
  return `${n} قائمة`;
}

/** Like `pluralCards`, for boards. */
export function pluralBoards(n: number, genitive = false): string {
  if (n === 0) return 'لا لوحات';
  if (n === 1) return 'لوحة واحدة';
  if (n === 2) return genitive ? 'لوحتين' : 'لوحتان';
  if (n <= 10) return `${n} لوحات`;
  return `${n} لوحة`;
}
