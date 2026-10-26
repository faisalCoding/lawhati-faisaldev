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
