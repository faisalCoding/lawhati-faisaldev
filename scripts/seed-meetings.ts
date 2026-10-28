// Builds a board carrying the حلقات team's real meetings, read out of the WhatsApp group, as a
// backup file the app can import.
//
//   npm run seed:meetings
//
// Every meeting, topic and decision below is transcribed from the messages, not invented. What was
// a judgement call is marked, so it can be corrected rather than trusted.
//
// Attendance is deliberately left empty. A meeting's attendees are real accounts, and minting ids
// for names in a chat log would put people on the board's roster who can be assigned work that
// would never reach them. Attendance fills in as the real accounts open the board.

import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { makeBackup, readBackup } from '../src/lib/backup';
import type { Board, BoardColumn, Meeting, MeetingTopic, Outcome, Policy } from '../src/shared/types';

type Kind = Outcome['kind'];

/** A decision as it appears in the log, with the reading we gave it. */
interface Decided {
  text: string;
  kind: Kind;
  /** The title of the topic it belongs under, when the minutes put it under one. */
  under?: string;
  who?: string;
  due?: string;
  /** The policies section it is filed under, for a `policy`. */
  section?: string;
}

interface Session {
  title: string;
  date: string;
  topics: string[];
  decisions?: Decided[];
  note?: string;
}

// The subjects five of these agendas kept returning to. Nineteen items collapse to these.
const SUBJECTS = [
  'سير الحلقات الأسبوع الماضي',
  'نشاط الأسبوع',
  'البرنامج التربوي',
  'الحلقات والتسميع',
  'المسابقة القرآنية',
  'الرحلة',
];

const SECTIONS = ['الاجتماعات', 'الحلقات والتسميع', 'الرحلات', 'الحضور والغياب', 'المسابقة', 'المعلمون'];

const SESSIONS: Session[] = [
  {
    title: 'الاجتماع الأول',
    date: '2026-09-06',
    topics: [],
    note: 'لم تُنشر محاور هذا الاجتماع في المجموعة، وإنما توصياته.',
    decisions: [
      { text: 'تثبيت الأحد للاجتماعات الدورية', kind: 'policy', section: 'الاجتماعات' },
      { text: 'أسبوع فيه نشاط وأسبوع لا', kind: 'policy', section: 'الاجتماعات' },
      { text: 'أسبوع النشاط يكون الاجتماع فيه عن بُعد', kind: 'policy', section: 'الاجتماعات' },
      { text: 'الاجتماع بعد العشاء', kind: 'policy', section: 'الاجتماعات' },
      { text: 'اللجنة التربوية: أسامة', kind: 'assignment' },
      { text: 'اللجنة الحركية: نصر', kind: 'assignment' },
      { text: 'اللجنة الثقافية: فيصل', kind: 'assignment' },
      { text: 'الإدارة العامة: خالد وياسر', kind: 'assignment' },
      { text: 'تغيير نصر من أولى متوسط إلى ثالث متوسط', kind: 'assignment' },
    ],
  },
  {
    title: 'الاجتماع الثاني',
    date: '2026-09-13',
    topics: ['سير الحلقات الأسبوع الماضي', 'نشاط الأسبوع', 'البرنامج التربوي', 'الحلقات والتسميع'],
    decisions: [
      {
        text: 'تخفيف المتطلبات الإدارية القرآنية على ثالث متوسط، للتركيز على الجانب الأخوي الاحتوائي والتفاعلي',
        kind: 'announcement',
        under: 'الحلقات والتسميع',
      },
      {
        text: 'عدم الاصطدام مع طلاب ثالث متوسط بشكل مباشر في موضوع الكلام',
        kind: 'announcement',
        under: 'الحلقات والتسميع',
      },
      {
        text: 'توحيد إرجاع الطالب عند تسميع الحفظ: بمعادلة خطأ، والتنبيهين بخطأ في الصفحة',
        kind: 'policy',
        under: 'الحلقات والتسميع',
        section: 'الحلقات والتسميع',
      },
      { text: 'رحلة استراحة يوم الجمعة، أو ملعب الجمعة', kind: 'announcement', under: 'نشاط الأسبوع' },
    ],
  },
  {
    title: 'الاجتماع الثالث',
    date: '2026-09-20',
    topics: ['سير الحلقات الأسبوع الماضي', 'المسابقة القرآنية', 'البرنامج التربوي', 'الرحلة'],
    note: 'محاوره في المجموعة: «خطة برامج الفصل الأول» و«إيجابيات وسلبيات رحلة الجمعة»، وقد رُبطا بالمحورين الثابتين «البرنامج التربوي» و«الرحلة».',
    decisions: [
      { text: 'متابعة أولياء الأمور: التواصل مع حسين للبدء في فرز وتصفية قائمة مجموعة أولياء الأمور', kind: 'task' },
      { text: 'مراجعة براء معوضة: تنسيق المراجعة مع يزيد أو مهند', kind: 'task' },
      {
        text: 'إدارة الفقرات: يتولى مسؤول كل فقرة توزيع المهام وتنسيق أدوار بقية المعلمين',
        kind: 'policy',
        section: 'المعلمون',
      },
      {
        text: 'المشاركة العامة: يلتزم جميع المعلمين بالتواجد والفاعلية المستمرة في كافة البرامج',
        kind: 'policy',
        section: 'المعلمون',
      },
      {
        text: 'المرجعية والقرارات: اتخاذ القرارات وإدارتها يعود لمسؤول الرحلة وحده',
        kind: 'policy',
        under: 'الرحلة',
        section: 'الرحلات',
      },
      {
        text: 'الانضباط والمواعيد: يُمنع الالتحاق بالرحلة نهائيًا عند تأخر الطالب عن موعد الانطلاق',
        kind: 'policy',
        under: 'الرحلة',
        section: 'الرحلات',
      },
      { text: 'المالية: توحيد إدارة «القطة» وتحديد مسؤول واحد عنها', kind: 'policy', under: 'الرحلة', section: 'الرحلات' },
      {
        text: 'الإشراف على الطلاب: تقسيمهم على المعلمين لضمان الضبط والسيطرة أثناء الرحلة',
        kind: 'policy',
        under: 'الرحلة',
        section: 'الرحلات',
      },
      {
        text: 'تجهيز بنود المسابقة العامة للطلاب وآلية للجوائز تجعلها أكثر حماسية (أسبوعية أو كل أسبوعين)',
        kind: 'task',
        under: 'المسابقة القرآنية',
        who: 'فيصل ونصر',
      },
      {
        text: 'إعداد البرنامج التربوي للفصل الحالي، وتجهيز جدول للبرامج بما يتناسب مع خدمة الهدف',
        kind: 'task',
        under: 'البرنامج التربوي',
        who: 'خالد',
      },
      { text: 'إدارة الرحلة القادمة في إجازة الأسبوع بعد القادم', kind: 'task', under: 'الرحلة', who: 'ياسر منان' },
    ],
  },
  {
    title: 'الاجتماع الرابع',
    date: '2026-09-27',
    topics: [
      'سير الحلقات الأسبوع الماضي',
      'نشاط الأسبوع',
      'البرنامج التربوي',
      'المسابقة القرآنية',
      'حد التأخر والغياب بلا عذر، والإجراء بعد تجاوز الحد',
      'حد التعثر القرآني',
    ],
    note: 'المحوران الأخيران طُرحا في رسالتين منفصلتين قبل الاجتماع.',
    decisions: [
      { text: 'تنبيه الطلاب على الجلوس وضبط شكل الحلقة بعد الصلاة مباشرة', kind: 'announcement' },
      {
        text: 'كل معلم يرى ما هو الأنسب لطلابه في ضبطهم بعد الصلاة',
        kind: 'policy',
        section: 'الحلقات والتسميع',
      },
      { text: 'عزام يراجع مع البراء', kind: 'task', who: 'عزام' },
      { text: 'تحديد الطلاب المعذورين عن دفع الرسوم بسبب حالتهم المادية', kind: 'task' },
      { text: 'تبدأ المسابقة من الأحد القادم', kind: 'announcement', under: 'المسابقة القرآنية', due: '2026-10-04' },
      { text: 'مسؤول الطباعة: نصر — عربون ملك البطاطس', kind: 'assignment' },
    ],
  },
  {
    title: 'اجتماع ٤ أكتوبر',
    date: '2026-10-04',
    topics: ['الرحلة', 'الحلقات والتسميع', 'تفعيل الموقع'],
    note: 'نُشرت محاوره ولم تُنشر توصياته. محوره «الخطط القرآنية» رُبط بـ«الحلقات والتسميع».',
  },
  {
    title: 'الاجتماع الخامس',
    date: '2026-10-11',
    topics: [],
    note: 'نُشرت توصياته ولم تُنشر محاوره.',
    decisions: [
      { text: 'جلب مساعدين للمعلم من الجامعيين أو الثانوية', kind: 'task' },
      { text: 'تأجيل الرحلة القادمة إلى الأسبوع القادم (الأسبوع السابع)', kind: 'announcement' },
      { text: 'الخطة التربوية «من أنا» — الحياة جدية', kind: 'note' },
      {
        text: 'بعد العشاء خمس دقائق أذكار أو كلمة، ثم ينصرف الطلاب صفًّا صفًّا: معلم يصرف الصفوف في الأمام، وبقية المعلمين في الخلف يُخرجونهم، ومعلم للطلاب الذين يصلّون السنة',
        kind: 'policy',
        section: 'الحلقات والتسميع',
      },
    ],
  },
  {
    title: 'الاجتماع السادس',
    date: '2026-10-18',
    topics: ['البرنامج التربوي', 'تقسيم المراحل', 'آلية الحضور والغياب', 'الرحلة'],
    decisions: [
      {
        text: 'يمكن تعويض تأخّرات الأسبوع الحالي نفسه فقط',
        kind: 'policy',
        under: 'آلية الحضور والغياب',
        section: 'الحضور والغياب',
      },
      { text: 'نقاط لأول ثلاثة بالتدريج، والباقي خمس نقاط إذا سمّعوا', kind: 'policy', section: 'المسابقة' },
      { text: 'نقاط التكرار', kind: 'policy', section: 'المسابقة' },
      { text: 'نقاط تكاليف التجويد', kind: 'policy', section: 'المسابقة' },
      {
        text: 'فصل التكريم: من كل مرحلة ثلاثة مراكز في المسابقة نهاية الأسبوع',
        kind: 'policy',
        under: 'تقسيم المراحل',
        section: 'المسابقة',
      },
      {
        text: 'الجوائز ثلاثة مستويات: بمجموع اليوم، وبمجموع يومين، وبمجموع أسبوع كامل',
        kind: 'policy',
        section: 'المسابقة',
      },
      { text: 'حساب وتحديد جوائز نهاية المسابقة', kind: 'task', who: 'نصر وفيصل' },
      { text: 'المسابقة لمدة شهرين', kind: 'announcement' },
    ],
  },
];

// ── Building ────────────────────────────────────────────────────────────────

const at = (date: string) => new Date(`${date}T20:00:00Z`).getTime();
const slug = (prefix: string, n: number) => `seed-${prefix}${n}`;

const agenda = SUBJECTS.map((title, i) => ({ id: slug('s', i + 1), title }));
// One meetings column, then a column per policies heading.
// One meetings column and one policies column; each heading becomes a subject inside it.
const columns: BoardColumn[] = [
  { id: slug('k', 1), title: 'الاجتماعات', kind: 'meetings' },
  { id: slug('k', 2), title: 'السياسات', kind: 'policies' },
];
const policyTopics = SECTIONS.map((title, i) => ({
  id: slug('c', i + 1),
  title,
  columnId: slug('k', 2),
  subtopics: [],
}));
const subjectId = (title: string) => agenda.find((a) => a.title === title)?.id ?? null;
const topicId = (title: string) => policyTopics.find((t) => t.title === title)?.id ?? null;

const meetings: Meeting[] = [];
const policies: Policy[] = [];
let policyCount = 0;

SESSIONS.forEach((session, si) => {
  const meetingId = slug('m', si + 1);

  const topics: MeetingTopic[] = session.topics.map((title, ti) => ({
    id: `${meetingId}-t${ti + 1}`,
    title,
    notes: ti === 0 && session.note ? session.note : '',
    subjectId: subjectId(title),
  }));

  const outcomes: Outcome[] = (session.decisions ?? []).map((d, oi) => {
    const id = `${meetingId}-o${oi + 1}`;
    const topic = d.under ? topics.find((t) => t.title === d.under) : undefined;
    const outcome: Outcome = {
      id,
      kind: d.kind,
      text: d.text,
      topicId: topic?.id ?? null,
      assignee: d.who ? { id: `seed-who-${d.who}`, name: d.who } : null,
      due: d.due ?? null,
      cardId: null,
      policyId: null,
    };

    // A standing rule goes into the policies as well, carrying the meeting that set it — which is
    // what the app does when «أقرّها في السياسات» is pressed.
    if (d.kind === 'policy') {
      const policyId = slug('p', ++policyCount);
      outcome.policyId = policyId;
      policies.push({
        id: policyId,
        text: d.text,
        topicId: d.section ? topicId(d.section) : null,
        subtopicId: null,
        effectiveFrom: session.date,
        meetingId,
        at: at(session.date),
      });
    }
    return outcome;
  });

  // A meeting with no agenda posted still had its decisions, and they belong to it as a whole.
  if (topics.length === 0 && session.note) {
    topics.push({ id: `${meetingId}-t1`, title: 'ما دار في الاجتماع', notes: session.note, subjectId: null });
  }

  meetings.push({
    id: meetingId,
    title: session.title,
    date: session.date,
    columnId: slug('k', 1),
    attendees: [],
    topics,
    outcomes,
    createdAt: at(session.date),
  });
});

// Newest first, as the reducer keeps them.
meetings.sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));

const board: Board = {
  id: 'seed-board-halaqat',
  title: 'اجتماعات الحلقات',
  color: '#0C66E4',
  icon: 'book',
  lists: [
    { id: 'seed-l1', title: 'للتنفيذ', cardIds: [], wipLimit: null },
    { id: 'seed-l2', title: 'قيد العمل', cardIds: [], wipLimit: null },
    { id: 'seed-l3', title: 'مكتمل', cardIds: [], wipLimit: null },
  ],
  cards: {},
  labels: [],
  powerUps: { labels: true, dueDates: true, checklists: true, covers: true, wipLimits: false, meetings: true },
  shareCode: null,
  createdAt: at('2026-09-06'),
  updatedAt: at('2026-10-18'),
  agenda,
  meetings,
  policies,
  policyTopics,
  columns,
};

const text = JSON.stringify(makeBackup([{ code: null, board }]), null, 2);

// Read back through the app's own importer before writing. A file this command produces that the
// app would reject is worse than no file: the failure would surface on someone's phone.
const { boards, damaged } = readBackup(text);
const restored = boards[0]?.board;
if (damaged > 0 || !restored) throw new Error('الملف لا يعبر مدقّق الاستيراد');
if ((restored.meetings ?? []).length !== meetings.length) throw new Error('الاجتماعات لا تنجو من الاستيراد');
if ((restored.policies ?? []).length !== policies.length) throw new Error('السياسات لا تنجو من الاستيراد');

const linked = (restored.meetings ?? []).flatMap((m) => m.outcomes ?? []).filter((o) => o.kind === 'policy');
const known = new Set((restored.policies ?? []).map((p) => p.id));
if (!linked.every((o) => o.policyId && known.has(o.policyId))) throw new Error('رابط سياسة معلّق');

const out = path.resolve(process.cwd(), process.argv[2] ?? 'lawhati-meetings-seed.json');
writeFileSync(out, text, 'utf8');

const decisions = meetings.reduce((n, m) => n + (m.outcomes?.length ?? 0), 0);
const byKind = meetings
  .flatMap((m) => m.outcomes ?? [])
  .reduce<Record<string, number>>((acc, o) => ({ ...acc, [o.kind]: (acc[o.kind] ?? 0) + 1 }), {});

console.log(`✓ ${out}`);
console.log(`  ${meetings.length} اجتماعات · ${agenda.length} محاور ثابتة · ${decisions} قرارًا · ${policies.length} سياسة · ${columns.length} أعمدة`);
console.log(`  الأنواع: ${Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
