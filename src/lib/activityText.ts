import { revertDepth } from '../shared/activity';
import type { ActivityEntry, ActivityWhat, BoardColumnKind, OutcomeKind, PowerUpKey } from '../shared/types';
import { formatShortDate, toISODate } from './dates';
import { pluralCards, pluralTasks, pluralTopics } from './text';

// The board's activity in words. Each line names the change as a verbal noun («إنجاز البطاقة…»)
// after the person's name, so it reads the same whoever made it.

/** What each kind of outcome is called, in the activity and on screen. */
export const OUTCOME_NAMES: Record<OutcomeKind, string> = {
  task: 'مهمة',
  assignment: 'مسؤولية',
  note: 'ملاحظة',
  announcement: 'إعلان',
  policy: 'سياسة',
};

/** What a column of each kind is called. */
export const COLUMN_KINDS: Record<BoardColumnKind, string> = {
  meetings: 'اجتماعات',
  policies: 'سياسات',
};

const POWER_UP_NAMES: Record<PowerUpKey, string> = {
  labels: 'التسميات',
  dueDates: 'تواريخ الاستحقاق',
  checklists: 'قوائم التحقق',
  covers: 'أغلفة البطاقات',
  wipLimits: 'حدود العمل',
  meetings: 'الاجتماعات والسياسات',
};

const short = (text: string) => {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > 40 ? `${t.slice(0, 38).trimEnd()}…` : t;
};
const q = (text: string) => `«${short(text)}»`;
const names = (people: string[]) => people.join(' و');

/** One change, done to `n` cards (or `n` tasks of one card). */
export function describeWhat(what: ActivityWhat, n = 1, tasks = 1): string {
  // After a verbal noun the dual is genitive: «نقل بطاقتين».
  const many = n > 1 ? pluralCards(n, true) : '';
  switch (what.type) {
    case 'card/add':
      return `إضافة ${many || `البطاقة ${q(what.card)}`} إلى ${q(what.list)}`;
    case 'card/remove':
      return `حذف ${many || `البطاقة ${q(what.card)}`}`;
    case 'card/move':
      if (what.from === what.to) return `ترتيب ${many || `البطاقة ${q(what.card)}`} في ${q(what.to)}`;
      if (many || !what.from) return `نقل ${many || `البطاقة ${q(what.card)}`} إلى ${q(what.to)}`;
      return `نقل البطاقة ${q(what.card)} من ${q(what.from)} إلى ${q(what.to)}`;
    case 'card/title':
      return many ? `تعديل عناوين ${many}` : `تغيير عنوان ${q(what.from)} إلى ${q(what.card)}`;
    case 'card/description':
      return `تعديل وصف ${many || `البطاقة ${q(what.card)}`}`;
    case 'card/done':
      return `${what.done ? 'إنجاز' : 'إعادة فتح'} ${many || `البطاقة ${q(what.card)}`}`;
    case 'card/due':
      return what.due
        ? `تحديد موعد ${many || `البطاقة ${q(what.card)}`}: ${formatShortDate(what.due)}`
        : `إزالة موعد ${many || `البطاقة ${q(what.card)}`}`;
    case 'card/cover':
      return `${what.on ? 'تلوين غلاف' : 'إزالة غلاف'} ${many || `البطاقة ${q(what.card)}`}`;
    case 'card/assign': {
      const cards = many || `البطاقة ${q(what.card)}`;
      if (what.added.length) {
        const instead = !many && what.removed.length ? ` بدلًا من ${names(what.removed)}` : '';
        return `إسناد ${cards} إلى ${names(what.added)}${instead}`;
      }
      return many ? `إزالة مسؤولين من ${many}` : `إزالة ${names(what.removed)} من ${cards}`;
    }
    case 'card/label': {
      const label = what.label ? `تسمية ${q(what.label)}` : 'تسمية ملوّنة';
      const cards = many || `البطاقة ${q(what.card)}`;
      return what.on ? `إضافة ${label} إلى ${cards}` : `إزالة ${label} من ${cards}`;
    }
    case 'card/link':
      return what.board
        ? `ربط البطاقة ${q(what.card)} بلوحة ${q(what.board)}`
        : `إلغاء ربط البطاقة ${q(what.card)} بلوحة`;
    case 'task/add':
      if (many) return `إضافة مهام إلى ${many}`;
      if (tasks > 1) return `إضافة ${pluralTasks(tasks, true)} إلى ${q(what.card)}`;
      return `إضافة مهمة ${q(what.task)} إلى ${q(what.card)}`;
    case 'task/done':
      return `${what.done ? 'إنجاز' : 'إلغاء إنجاز'} مهمة ${q(what.task)} في ${q(what.card)}`;
    case 'task/edit':
      return `تعديل مهمة ${q(what.from)} إلى ${q(what.task)} في ${q(what.card)}`;
    case 'task/due':
      return what.due
        ? `تحديد موعد مهمة ${q(what.task)} في ${formatShortDate(what.due)}`
        : `إزالة موعد مهمة ${q(what.task)}`;
    case 'task/assign':
      return what.to
        ? `إسناد مهمة ${q(what.task)} في ${q(what.card)} إلى ${what.to}`
        : `إلغاء إسناد مهمة ${q(what.task)} في ${q(what.card)}`;
    case 'task/remove':
      return `حذف مهمة ${q(what.task)} من ${q(what.card)}`;
    case 'list/add':
      return `إضافة القائمة ${q(what.list)}`;
    case 'list/title':
      return `إعادة تسمية القائمة ${q(what.from)} إلى ${q(what.list)}`;
    case 'list/color':
      return `تغيير لون القائمة ${q(what.list)}`;
    case 'list/wip':
      return what.limit ? `حد العمل في ${q(what.list)}: ${what.limit}` : `إلغاء حد العمل في ${q(what.list)}`;
    case 'list/move':
      return `نقل القائمة ${q(what.list)}`;
    case 'list/remove':
      return what.cards
        ? `حذف القائمة ${q(what.list)} ومعها ${pluralCards(what.cards)}`
        : `حذف القائمة ${q(what.list)}`;
    case 'board/title':
      return `إعادة تسمية اللوحة إلى ${q(what.title)}`;
    case 'board/look':
      return 'تغيير لون اللوحة أو أيقونتها';
    case 'board/buttons':
      return 'تعديل أزرار البطاقات';
    case 'powerUp':
      return `${what.on ? 'تفعيل' : 'إيقاف'} إضافة ${q(POWER_UP_NAMES[what.key] ?? what.key)}`;
    case 'label/rename':
      return what.name ? `تغيير اسم تسمية إلى ${q(what.name)}` : 'إزالة اسم تسمية';
    case 'meeting/add':
      return `إضافة اجتماع ${q(what.meeting)}`;
    case 'meeting/title':
      return `تغيير عنوان اجتماع ${q(what.from)} إلى ${q(what.meeting)}`;
    case 'meeting/when':
      return `تغيير موعد اجتماع ${q(what.meeting)} إلى ${formatShortDate(what.date)}`;
    case 'meeting/held':
      return `${what.held ? 'تأكيد انعقاد' : 'إلغاء انعقاد'} اجتماع ${q(what.meeting)}`;
    case 'meeting/where':
      return `تغيير مكان اجتماع ${q(what.meeting)}`;
    case 'meeting/remove':
      return `حذف اجتماع ${q(what.meeting)}${what.topics ? ` و${pluralTopics(what.topics, true)}` : ''}`;
    case 'meeting/attend':
      return `${what.on ? 'إضافة' : 'إزالة'} ${what.who} ${what.on ? 'إلى' : 'من'} حضور ${q(what.meeting)}`;
    case 'topic/add':
      return `إضافة محور ${q(what.topic)} إلى ${q(what.meeting)}`;
    case 'topic/title':
      return `تغيير محور ${q(what.from)} إلى ${q(what.topic)} في ${q(what.meeting)}`;
    case 'topic/notes':
      return `تدوين نقاش محور ${q(what.topic)} في ${q(what.meeting)}`;
    case 'topic/move':
      return `ترتيب محور ${q(what.topic)} في ${q(what.meeting)}`;
    case 'topic/remove':
      return `حذف محور ${q(what.topic)} من ${q(what.meeting)}`;
    case 'outcome/add':
      return `إضافة ${OUTCOME_NAMES[what.kind]} ${q(what.text)} إلى ${q(what.meeting)}`;
    case 'outcome/kind':
      return `جعل ${q(what.text)} ${OUTCOME_NAMES[what.kind]} في ${q(what.meeting)}`;
    case 'outcome/text':
      return `تعديل توصية ${q(what.text)} في ${q(what.meeting)}`;
    case 'outcome/assign':
      return what.to
        ? `إسناد ${q(what.text)} إلى ${what.to} في ${q(what.meeting)}`
        : `إلغاء إسناد ${q(what.text)} في ${q(what.meeting)}`;
    case 'outcome/due':
      return what.due
        ? `تحديد موعد ${q(what.text)} في ${formatShortDate(what.due)}`
        : `إزالة موعد ${q(what.text)}`;
    case 'outcome/card':
      return what.inside ? `وضع ${q(what.text)} مهمةً في ${q(what.inside)}` : `تحويل ${q(what.text)} إلى بطاقة على اللوحة`;
    case 'outcome/remove':
      return `حذف توصية ${q(what.text)} من ${q(what.meeting)}`;
    case 'outcome/done':
      return `${what.done ? 'إنجاز' : 'إعادة فتح'} توصية ${q(what.text)}`;
    case 'outcome/topic':
      return what.topic ? `نقل ${q(what.text)} إلى محور ${q(what.topic)}` : `جعل ${q(what.text)} توصية عامة`;
    case 'agenda/add':
      return `إضافة محور ثابت ${q(what.subject)}`;
    case 'agenda/title':
      return `تغيير المحور الثابت ${q(what.from)} إلى ${q(what.subject)}`;
    case 'agenda/move':
      return `ترتيب المحور الثابت ${q(what.subject)}`;
    case 'agenda/remove':
      return `حذف المحور الثابت ${q(what.subject)}`;
    case 'column/add':
      return `إضافة عمود ${COLUMN_KINDS[what.kind]} ${q(what.column)}`;
    case 'column/title':
      return `تغيير عمود ${q(what.from)} إلى ${q(what.column)}`;
    case 'column/color':
      return `تغيير لون العمود ${q(what.column)}`;
    case 'column/move':
      return `ترتيب عمود ${q(what.column)}`;
    case 'column/remove':
      if (what.movedTo) return `حذف عمود ${q(what.column)}، ونقل محتواه إلى ${q(what.movedTo)}`;
      return what.cards ? `حذف عمود ${q(what.column)} وما فيه (${what.cards})` : `حذف عمود ${q(what.column)}`;
    case 'meeting/file':
      return what.column ? `نقل اجتماع ${q(what.meeting)} إلى ${q(what.column)}` : `إخراج اجتماع ${q(what.meeting)} من عموده`;
    case 'policyTopic/add':
      return `إضافة موضوع سياسات ${q(what.topic)}`;
    case 'policyTopic/title':
      return `تغيير موضوع ${q(what.from)} إلى ${q(what.topic)}`;
    case 'policyTopic/move':
      return `ترتيب موضوع ${q(what.topic)}`;
    case 'policyTopic/remove':
      if (what.movedTo) return `حذف موضوع ${q(what.topic)}، ونقل بنوده إلى ${q(what.movedTo)}`;
      return what.clauses ? `حذف موضوع ${q(what.topic)} وبنوده (${what.clauses})` : `حذف موضوع ${q(what.topic)}`;
    case 'subtopic/add':
      return `إضافة موضوع فرعي ${q(what.subtopic)} تحت ${q(what.topic)}`;
    case 'subtopic/title':
      return `تغيير الموضوع الفرعي ${q(what.from)} إلى ${q(what.subtopic)}`;
    case 'subtopic/move':
      return `ترتيب الموضوع الفرعي ${q(what.subtopic)}`;
    case 'subtopic/remove':
      return what.clauses
        ? `حذف الموضوع الفرعي ${q(what.subtopic)}، وبقاء ${what.clauses} من بنوده بلا موضوع فرعي`
        : `حذف الموضوع الفرعي ${q(what.subtopic)}`;
    case 'policy/effective':
      return what.from ? `تحديد سريان بند ${q(what.policy)} من ${formatShortDate(what.from)}` : `إزالة تاريخ سريان ${q(what.policy)}`;
    case 'policy/add':
      return what.column ? `إضافة بند ${q(what.policy)} إلى ${q(what.column)}` : `إضافة بند ${q(what.policy)}`;
    case 'policy/text':
      return `تعديل بند ${q(what.from)} إلى ${q(what.policy)}`;
    case 'policy/file':
      if (what.subtopic) return `نقل بند ${q(what.policy)} إلى ${q(what.subtopic)}`;
      return what.topic ? `نقل بند ${q(what.policy)} إلى ${q(what.topic)}` : `إخراج بند ${q(what.policy)} من موضعه`;
    case 'policy/move':
      return `ترتيب بند ${q(what.policy)}`;
    case 'policy/repeal':
      return `إلغاء العمل ببند ${q(what.policy)}`;
    case 'policy/restore':
      return `إعادة العمل ببند ${q(what.policy)}`;
    case 'policy/remove':
      return `حذف بند ${q(what.policy)}`;
    case 'outcome/policy':
      if (what.repealed) return `إلغاء سياسة بـ ${q(what.text)} من ${q(what.meeting)}`;
      return what.added
        ? `إقرار ${q(what.text)} سياسةً من ${q(what.meeting)}`
        : `تعديل سياسة بـ ${q(what.text)} من ${q(what.meeting)}`;
    case 'member/seen':
      // The line reads after the person's name, and here they are the person: «فيصل: انضمام إلى
      // اللوحة», not «… انضمام فيصل».
      return what.renamed ? `تغيير الاسم إلى ${q(what.name)}` : 'انضمام إلى اللوحة';
  }
}

/** The card an entry is about, by its title then. */
function cardTitle(what: ActivityWhat): string | null {
  return 'card' in what && typeof what.card === 'string' ? what.card : null;
}

/** A change (not an undo) in words: one change, several of one kind, or a button's. */
export function describeChange(entry: ActivityEntry): string {
  const n = entry.cards.length;
  const title = cardTitle(entry.what);
  if (entry.button) {
    return `زر ${q(entry.button)} على ${n > 1 ? pluralCards(n, true) : title ? `البطاقة ${q(title)}` : 'بطاقة'}`;
  }
  if (entry.kinds && entry.kinds.length > 1) {
    if (n > 1) return `تعديلات على ${pluralCards(n, true)}`;
    return title ? `تعديلات على البطاقة ${q(title)}` : 'تعديلات على اللوحة';
  }
  return describeWhat(entry.what, n, entry.n ?? 1);
}

/** Any entry in words: undos and redos name the change they are about. */
export function describeEntry(log: readonly ActivityEntry[], entry: ActivityEntry): string {
  const { depth, origin } = revertDepth(log, entry);
  if (depth === 0) return describeChange(entry);
  const what = origin && !origin.reverts ? describeChange(origin) : 'تغيير أقدم';
  return depth % 2 === 1 ? `التراجع عن: ${what}` : `إعادة: ${what}`;
}

/** Who made a change, for the line: their name, or a stand-in when they gave none. */
export function actorName(entry: ActivityEntry): string {
  return entry.by?.name.trim() || (entry.by?.id.startsWith('g:') ? 'جهاز بلا اسم' : 'أحد الأعضاء');
}

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

function minutesAgo(n: number): string {
  if (n === 1) return 'قبل دقيقة';
  if (n === 2) return 'قبل دقيقتين';
  return n <= 10 ? `قبل ${n} دقائق` : `قبل ${n} دقيقة`;
}

function hoursAgo(n: number): string {
  if (n === 1) return 'قبل ساعة';
  if (n === 2) return 'قبل ساعتين';
  return n <= 10 ? `قبل ${n} ساعات` : `قبل ${n} ساعة`;
}

/** When, briefly: «الآن», «قبل 5 دقائق», «قبل ساعتين», then the time of day. */
export function describeWhen(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return 'الآن';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutesAgo(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 6) return hoursAgo(hours);
  return clock(new Date(at));
}

/** The day heading an entry goes under: «اليوم», «أمس», or the date. */
export function describeDay(at: number, now = Date.now()): string {
  const day = toISODate(new Date(at));
  const today = new Date(now);
  if (day === toISODate(today)) return 'اليوم';
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (day === toISODate(yesterday)) return 'أمس';
  return formatShortDate(day);
}
