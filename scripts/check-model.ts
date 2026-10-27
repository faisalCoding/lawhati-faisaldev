// Checks the shared reducer, which runs on every device and on the sync server alike. A board is
// only ever as consistent as these two agreeing, and the reducer has no other safety net: the
// project has no test runner, and this needs none — `npm run check:model`, plain assertions, no
// framework to keep working.

import { isOpen, openBefore } from '../src/lib/meetings';
import { subjectHistory } from '../src/lib/subjects';
import { stillApplies, undoOf } from '../src/shared/activity';
import { applyOp } from '../src/shared/reducer';
import type { AgendaSubject, Board, BoardColumn, Meeting, MeetingTopic, Outcome, Op, Policy } from '../src/shared/types';

const board = (): Board => ({
  id: 'b', title: 'لوحة', color: '#000', icon: 'grid',
  lists: [], cards: {}, labels: [],
  powerUps: { labels: true, dueDates: true, checklists: true, covers: true, wipLimits: false, meetings: false },
  shareCode: 'ABCDEF', createdAt: 1, updatedAt: 1,
});

let n = 0, bad = 0;
const ok = (label: string, cond: boolean) => { n++; if (!cond) { bad++; console.log('  ✗', label); } else console.log('  ✓', label); };

const seen = (id: string, name: string, at = 100): Op =>
  ({ type: 'member/seen', member: { id, name, at }, id: `op-${id}-${name}-${at}`, at, by: null }) as Op;

// يُضاف
const a = applyOp(board(), seen('7', 'فيصل'));
ok('يُضاف العضو إلى سجلّ فارغ', a.members?.length === 1 && a.members[0].name === 'فيصل');
ok('يُسجَّل في النشاط بوصفه انضمامًا', a.activity?.[0]?.what.type === 'member/seen' && (a.activity[0].what as { renamed: boolean }).renamed === false);

// التكرار لا يفعل شيئًا — وهذا جوهري: كل جهاز يُرسلها عند كل فتح
const b = applyOp(a, seen('7', 'فيصل', 999));
ok('إعادة إرسال نفس العضو لا تغيّر اللوحة إطلاقًا', b === a);
ok('ولا تضيف سطرًا إلى النشاط', (b.activity?.length ?? 0) === 1);

// تغيير الاسم يُحدِّث ويحفظ تاريخ أول لقاء
const c = applyOp(a, seen('7', 'فيصل بخش', 500));
ok('تغيير الاسم يُحدِّث السجلّ', c.members?.[0].name === 'فيصل بخش');
ok('ويحفظ متى رأته اللوحة أول مرة', c.members?.[0].at === 100);
ok('ويُسجَّل بوصفه تغييرَ اسم لا انضمامًا', (c.activity?.[1]?.what as { renamed: boolean })?.renamed === true);

// عضو آخر
const d = applyOp(c, seen('9', 'سارة', 600));
ok('يُضاف عضو ثانٍ بعد الأول', d.members?.map((m) => m.id).join(',') === '7,9');

// الترتيب لا يهمّ: الخادم والجهاز قد يطبّقان بترتيب مختلف
const e1 = applyOp(applyOp(board(), seen('9', 'سارة', 600)), seen('7', 'فيصل', 100));
ok('نفس الأعضاء مهما اختلف الترتيب', [...(e1.members ?? [])].map((m) => m.id).sort().join(',') === '7,9');

// ضيف
const g = applyOp(board(), seen('g:abc123', 'زائر'));
ok('الضيف يدخل السجلّ مثل صاحب الحساب', g.members?.[0].id === 'g:abc123');

// جهاز لا يستطيع الخادم تسميته: يكتب هوية فارغة، والمُخفِّض يُسقطها
const blankId = applyOp(board(), seen('', 'بلا هوية'));
ok('عضو بلا هوية يُسقَط', (blankId.members?.length ?? 0) === 0 && blankId.activity === undefined);
const blankName = applyOp(board(), seen('7', ''));
ok('عضو بلا اسم يُسقَط', (blankName.members?.length ?? 0) === 0);


// ── الاجتماعات ──────────────────────────────────────────────────────────────
let seq = 0;
const op = <T extends object>(x: T): Op => ({ ...x, id: `m${++seq}`, at: 1000 + seq, by: null }) as unknown as Op;
const meeting = (id: string, date: string, title = `اجتماع ${id}`, createdAt = 1): Meeting =>
  ({ id, title, date, attendees: [], topics: [], createdAt });
const topic = (id: string, title = `محور ${id}`): MeetingTopic => ({ id, title, notes: '' });

const m1 = applyOp(board(), op({ type: 'meeting/add', meeting: meeting('a', '2026-01-10') }));
ok('يُضاف الاجتماع', m1.meetings?.length === 1);
ok('ويُسجَّل في النشاط', m1.activity?.[0]?.what.type === 'meeting/add');

// الأحدث أولًا، بالتاريخ لا بترتيب الإدخال: المحاضر تُكتب متأخّرة
const m2 = applyOp(applyOp(m1, op({ type: 'meeting/add', meeting: meeting('b', '2026-03-01') })),
                   op({ type: 'meeting/add', meeting: meeting('c', '2026-02-01') }));
ok('الترتيب بالتاريخ تنازليًا لا بترتيب الإدخال', m2.meetings?.map((m) => m.id).join('') === 'bca');

const dup = applyOp(m2, op({ type: 'meeting/add', meeting: meeting('a', '2026-09-09') }));
ok('إعادة إضافة نفس المعرّف لا تفعل شيئًا', dup === m2);

// الحضور
const att = applyOp(m2, op({ type: 'meeting/attend', meetingId: 'a', person: { id: '7', name: 'فيصل' }, on: true }));
ok('يُضاف الحاضر', att.meetings?.find((m) => m.id === 'a')?.attendees.length === 1);
ok('باسمه محفوظًا معه', att.meetings?.find((m) => m.id === 'a')?.attendees[0].name === 'فيصل');
const attAgain = applyOp(att, op({ type: 'meeting/attend', meetingId: 'a', person: { id: '7', name: 'فيصل' }, on: true }));
ok('إضافته مرة أخرى لا تكرّره', attAgain === att);
const gone = applyOp(att, op({ type: 'meeting/attend', meetingId: 'a', person: { id: '7', name: 'فيصل' }, on: false }));
ok('وتُزال الحضور', gone.meetings?.find((m) => m.id === 'a')?.attendees.length === 0);
const ghost = applyOp(m2, op({ type: 'meeting/attend', meetingId: 'لا-وجود', person: { id: '7', name: 'ف' }, on: true }));
ok('حضور في اجتماع غير موجود يُتجاهَل', ghost === m2);

// المحاور
const t1 = applyOp(m2, op({ type: 'topic/add', meetingId: 'a', topic: topic('t1') }));
const t2 = applyOp(t1, op({ type: 'topic/add', meetingId: 'a', topic: topic('t2') }));
const t3 = applyOp(t2, op({ type: 'topic/add', meetingId: 'a', topic: topic('t3') }));
const topicsOf = (b: Board) => b.meetings?.find((m) => m.id === 'a')?.topics.map((t) => t.id).join('') ?? '';
ok('المحاور بترتيب الإضافة', topicsOf(t3) === 't1t2t3');

const atIndex = applyOp(t3, op({ type: 'topic/add', meetingId: 'a', topic: topic('t0'), index: 0 }));
ok('ويمكن إدراج محور في موضعه (للتراجع)', topicsOf(atIndex) === 't0t1t2t3');

const moved = applyOp(t3, op({ type: 'topic/move', meetingId: 'a', topicId: 't3', toIndex: 0 }));
ok('نقل المحور', topicsOf(moved) === 't3t1t2');
const stay = applyOp(t3, op({ type: 'topic/move', meetingId: 'a', topicId: 't1', toIndex: 0 }));
ok('نقل إلى موضعه لا يغيّر شيئًا', stay === t3);
const far = applyOp(t3, op({ type: 'topic/move', meetingId: 'a', topicId: 't1', toIndex: 99 }));
ok('موضع خارج المدى يُقصَر على آخر المحاور', topicsOf(far) === 't2t3t1');

const noted = applyOp(t3, op({ type: 'topic/update', meetingId: 'a', topicId: 't2', patch: { notes: 'دار نقاش' } }));
ok('تدوين النقاش', noted.meetings?.find((m) => m.id === 'a')?.topics[1].notes === 'دار نقاش');
const sameNote = applyOp(noted, op({ type: 'topic/update', meetingId: 'a', topicId: 't2', patch: { notes: 'دار نقاش' } }));
ok('تدوين نفس النصّ لا يغيّر شيئًا', sameNote === noted);

const less = applyOp(t3, op({ type: 'topic/remove', meetingId: 'a', topicId: 't2' }));
ok('حذف محور', topicsOf(less) === 't1t3');

// حذف الاجتماع
const del = applyOp(t3, op({ type: 'meeting/remove', meetingId: 'a' }));
ok('حذف الاجتماع', del.meetings?.map((m) => m.id).join('') === 'bc');
ok('ويذكر النشاط عدد محاوره', (del.activity?.at(-1)?.what as { topics: number }).topics === 3);

// الترتيب بين جهازين: الخادم والجهاز قد يطبّقان بترتيب مختلف
const order1 = applyOp(applyOp(board(), op({ type: 'meeting/add', meeting: meeting('x', '2026-05-05') })),
                       op({ type: 'meeting/add', meeting: meeting('y', '2026-06-06') }));
const order2 = applyOp(applyOp(board(), op({ type: 'meeting/add', meeting: meeting('y', '2026-06-06') })),
                       op({ type: 'meeting/add', meeting: meeting('x', '2026-05-05') }));
ok('نفس الترتيب مهما اختلف ترتيب التطبيق', JSON.stringify(order1.meetings) === JSON.stringify(order2.meetings));


// ── التوصيات ────────────────────────────────────────────────────────────────
const outcome = (id: string, kind: Outcome['kind'] = 'note', text = `توصية ${id}`): Outcome => ({ id, kind, text });
const withMeeting = applyOp(board(), op({ type: 'meeting/add', meeting: meeting('a', '2026-01-10') }));
const outcomesOf = (b: Board) => b.meetings?.find((m) => m.id === 'a')?.outcomes ?? [];

const o1 = applyOp(withMeeting, op({ type: 'outcome/add', meetingId: 'a', outcome: outcome('o1') }));
ok('تُضاف التوصية', outcomesOf(o1).length === 1);
ok('وتُسجَّل بنوعها', (o1.activity?.at(-1)?.what as { kind: string }).kind === 'note');

const o1again = applyOp(o1, op({ type: 'outcome/add', meetingId: 'a', outcome: outcome('o1') }));
ok('نفس المعرّف لا يتكرّر', o1again === o1);

const o2 = applyOp(o1, op({ type: 'outcome/add', meetingId: 'a', outcome: outcome('o2', 'task', 'إعداد التقرير') }));
ok('توصية ثانية بنوع مختلف', outcomesOf(o2).map((o) => o.kind).join(',') === 'note,task');

// الإسناد والموعد — خاصّان بالمهمة
const assigned = applyOp(o2, op({
  type: 'outcome/update', meetingId: 'a', outcomeId: 'o2',
  patch: { assignee: { id: '7', name: 'فيصل' }, due: '2026-02-01' },
}));
ok('تُسنَد المهمة بموعد', outcomesOf(assigned)[1].assignee?.name === 'فيصل' && outcomesOf(assigned)[1].due === '2026-02-01');
const resend = applyOp(assigned, op({
  type: 'outcome/update', meetingId: 'a', outcomeId: 'o2',
  patch: { assignee: { id: '7', name: 'فيصل' }, due: '2026-02-01' },
}));
ok('إعادة نفس القيم لا تغيّر شيئًا', resend === assigned);

const unassigned = applyOp(assigned, op({ type: 'outcome/update', meetingId: 'a', outcomeId: 'o2', patch: { assignee: null } }));
ok('ويُلغى الإسناد', outcomesOf(unassigned)[1].assignee === null);

// التحويل إلى بطاقة
const carded = applyOp(assigned, op({ type: 'outcome/update', meetingId: 'a', outcomeId: 'o2', patch: { cardId: 'c9' } }));
ok('ربط التوصية ببطاقة', outcomesOf(carded)[1].cardId === 'c9');
ok('ويُسجَّل التحويل سطرًا خاصًّا', carded.activity?.at(-1)?.what.type === 'outcome/card');

// التحويل يسبق غيره في السطر حتى لو تغيّر معه شيء آخر
const both = applyOp(assigned, op({
  type: 'outcome/update', meetingId: 'a', outcomeId: 'o2', patch: { cardId: 'c9', text: 'نصّ آخر' },
}));
ok('التحويل أولى بالذكر من تعديل النصّ', both.activity?.at(-1)?.what.type === 'outcome/card');

const gone2 = applyOp(o2, op({ type: 'outcome/remove', meetingId: 'a', outcomeId: 'o1' }));
ok('حذف توصية', outcomesOf(gone2).map((o) => o.id).join('') === 'o2');

const ghostOutcome = applyOp(withMeeting, op({ type: 'outcome/update', meetingId: 'a', outcomeId: 'لا-وجود', patch: { text: 'x' } }));
ok('تعديل توصية غير موجودة يُتجاهَل', ghostOutcome === withMeeting);
const ghostMeeting = applyOp(withMeeting, op({ type: 'outcome/add', meetingId: 'لا-وجود', outcome: outcome('z') }));
ok('توصية في اجتماع غير موجود تُتجاهَل', ghostMeeting === withMeeting);

const atTop = applyOp(o2, op({ type: 'outcome/add', meetingId: 'a', outcome: outcome('o0'), index: 0 }));
ok('ويمكن إدراج توصية في موضعها (للتراجع)', outcomesOf(atTop).map((o) => o.id).join('') === 'o0o1o2');


// ── التراجع ────────────────────────────────────────────────────────────────
// كل تغيير على اللوحة قابل للتراجع. نُثبت ذلك بالرحلة كاملة: طبّق، ثم تراجع، ثم قارن.
/**
 * Compared the way the model itself defines equality: `same()` treats a missing field and null as
 * one, and the `*Field` readers give every optional field its default. Undo writes those defaults
 * explicitly where the original simply lacked them, which is the same board. Comparing raw JSON
 * would call that a difference and would be testing the test.
 *
 * One normaliser for every shape, because two of them drifted apart once and a real round-trip
 * failure hid behind the gap.
 */
/**
 * JSON with object keys in a fixed order. `{...o, done: false}` keeps `done` where the spread put
 * it, so a board that already had the field serialises in a different order from one that gained
 * it — the same board, called different by a plain stringify. Arrays keep their order, which is
 * the one ordering that carries meaning here.
 */
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as object).sort(([a], [c]) => (a < c ? -1 : a > c ? 1 : 0)))
      : v,
  );

const strip = (b: Board) =>
  stable({
    ...b,
    activity: undefined,
    updatedAt: 0,
    meetings: (b.meetings ?? []).map((m) => ({
      ...m,
      place: m.place ?? '',
      topics: m.topics.map((t) => ({ ...t, subjectId: t.subjectId ?? null })),
      outcomes: (m.outcomes ?? []).map((o) => ({
        ...o,
        topicId: o.topicId ?? null,
        assignee: o.assignee ?? null,
        due: o.due ?? null,
        cardId: o.cardId ?? null,
        policyId: o.policyId ?? null,
        done: o.done ?? false,
      })),
    })),
    policies: (b.policies ?? []).map((x) => ({
      ...x,
      columnId: x.columnId ?? null,
      meetingId: x.meetingId ?? null,
    })),
  });

/** Applies a change, undoes it, and checks the board is back where it started. */
const roundTrip = (start: Board, change: Op, label: string) => {
  const after = applyOp(start, change);
  let back = after;
  for (const step of undoOf(start, after, change)) {
    const undo = stillApplies(back, step);
    if (undo) back = applyOp(back, { ...undo, id: `u${++seq}`, at: 9000 + seq, by: null } as Op);
  }
  ok(`التراجع يُعيد الحال: ${label}`, strip(back) === strip(start));
};
const roundTripP = roundTrip;

const base = applyOp(board(), op({ type: 'meeting/add', meeting: meeting('a', '2026-01-10') }));
const withTopics = applyOp(applyOp(base, op({ type: 'topic/add', meetingId: 'a', topic: topic('t1') })),
                           op({ type: 'topic/add', meetingId: 'a', topic: topic('t2') }));
const withOutcome = applyOp(withTopics, op({ type: 'outcome/add', meetingId: 'a', outcome: outcome('o1', 'task', 'مهمة') }));

roundTrip(board(), op({ type: 'meeting/add', meeting: meeting('a', '2026-01-10') }), 'إضافة اجتماع');
roundTrip(base, op({ type: 'meeting/update', meetingId: 'a', patch: { title: 'عنوان آخر', place: 'القاعة' } }), 'تعديل اجتماع');
roundTrip(withOutcome, op({ type: 'meeting/remove', meetingId: 'a' }), 'حذف اجتماع بمحاوره وتوصياته');
roundTrip(base, op({ type: 'meeting/attend', meetingId: 'a', person: { id: '7', name: 'فيصل' }, on: true }), 'إضافة حاضر');
roundTrip(withTopics, op({ type: 'topic/add', meetingId: 'a', topic: topic('t3') }), 'إضافة محور');
roundTrip(withTopics, op({ type: 'topic/update', meetingId: 'a', topicId: 't1', patch: { notes: 'نقاش' } }), 'تدوين نقاش');
roundTrip(withTopics, op({ type: 'topic/move', meetingId: 'a', topicId: 't1', toIndex: 1 }), 'نقل محور');
roundTrip(withTopics, op({ type: 'topic/remove', meetingId: 'a', topicId: 't1' }), 'حذف محور من الوسط');
roundTrip(withOutcome, op({ type: 'outcome/add', meetingId: 'a', outcome: outcome('o2') }), 'إضافة توصية');
roundTrip(withOutcome, op({ type: 'outcome/update', meetingId: 'a', outcomeId: 'o1', patch: { due: '2026-03-03', assignee: { id: '7', name: 'ف' } } }), 'إسناد توصية بموعد');
roundTrip(withOutcome, op({ type: 'outcome/remove', meetingId: 'a', outcomeId: 'o1' }), 'حذف توصية');

// والمحور المحذوف يعود إلى موضعه لا إلى آخر القائمة
const threeTopics = applyOp(withTopics, op({ type: 'topic/add', meetingId: 'a', topic: topic('t3') }));
const removedMiddle = applyOp(threeTopics, op({ type: 'topic/remove', meetingId: 'a', topicId: 't2' }));
const stepsBack = undoOf(threeTopics, removedMiddle, op({ type: 'topic/remove', meetingId: 'a', topicId: 't2' }));
let restored = removedMiddle;
for (const st of stepsBack) {
  const u = stillApplies(restored, st);
  if (u) restored = applyOp(restored, { ...u, id: `r${++seq}`, at: 9500 + seq, by: null } as Op);
}
ok('المحور المحذوف يعود إلى موضعه نفسه', topicsOf(restored) === 't1t2t3');


// ── المحاور الثابتة والروابط ────────────────────────────────────────────────
const subject = (id: string, title = `موضوع ${id}`): AgendaSubject => ({ id, title });
const agendaOf = (b: Board) => (b.agenda ?? []).map((a) => a.id).join('');

const a1 = applyOp(board(), op({ type: 'agenda/add', subject: subject('s1', 'الرحلة') }));
const a2 = applyOp(a1, op({ type: 'agenda/add', subject: subject('s2', 'سير الأسبوع') }));
ok('تُضاف المحاور الثابتة بترتيبها', agendaOf(a2) === 's1s2');
ok('إعادة الإضافة لا تكرّر', applyOp(a2, op({ type: 'agenda/add', subject: subject('s1', 'الرحلة') })) === a2);
ok('ترتيب المحاور', agendaOf(applyOp(a2, op({ type: 'agenda/move', subjectId: 's2', toIndex: 0 }))) === 's2s1');
ok('تعديل العنوان', (applyOp(a2, op({ type: 'agenda/update', subjectId: 's1', patch: { title: 'الرحلات' } })).agenda ?? [])[0].title === 'الرحلات');
ok('نفس العنوان لا يغيّر شيئًا', applyOp(a2, op({ type: 'agenda/update', subjectId: 's1', patch: { title: 'الرحلة' } })) === a2);

// اجتماع يمرّ بمحور ثابت
const withSubjectTopic = applyOp(
  applyOp(a2, op({ type: 'meeting/add', meeting: meeting('a', '2026-01-10') })),
  op({ type: 'topic/add', meetingId: 'a', topic: { id: 't1', title: 'الرحلة', notes: '', subjectId: 's1' } }),
);
const topicIn = (b: Board) => b.meetings?.find((m) => m.id === 'a')?.topics[0];
ok('المحور يحمل خيطه إلى الموضوع الثابت', topicIn(withSubjectTopic)?.subjectId === 's1');

// حذف الموضوع الثابت: المحضر يبقى، والخيط يُقطع
const cutSubject = applyOp(withSubjectTopic, op({ type: 'agenda/remove', subjectId: 's1' }));
ok('حذف الموضوع الثابت يُبقي محور الاجتماع', topicIn(cutSubject)?.title === 'الرحلة');
ok('ويقطع الخيط بدل أن يتركه معلّقًا', topicIn(cutSubject)?.subjectId === null);
ok('ويزيله من القائمة الثابتة', agendaOf(cutSubject) === 's2');

// توصية تحت محورها
const withOutcomeUnderTopic = applyOp(
  withSubjectTopic,
  op({ type: 'outcome/add', meetingId: 'a', outcome: { id: 'o1', kind: 'policy', text: 'ضابط', topicId: 't1' } }),
);
const outOf = (b: Board) => b.meetings?.find((m) => m.id === 'a')?.outcomes?.[0];
ok('التوصية تنتمي إلى محورها', outOf(withOutcomeUnderTopic)?.topicId === 't1');

// حذف المحور: التوصية لا تضيع معه
const cutTopic = applyOp(withOutcomeUnderTopic, op({ type: 'topic/remove', meetingId: 'a', topicId: 't1' }));
ok('حذف المحور لا يحذف ما خرج منه', (cutTopic.meetings?.find((m) => m.id === 'a')?.outcomes ?? []).length === 1);
ok('بل تصير التوصية عامة لا معلّقة', outOf(cutTopic)?.topicId === null);

// التاريخ على كل الأنواع لا على المهمة وحدها
const dated = applyOp(
  applyOp(withSubjectTopic, op({ type: 'outcome/add', meetingId: 'a', outcome: { id: 'o9', kind: 'announcement', text: 'تبدأ المسابقة' } })),
  op({ type: 'outcome/update', meetingId: 'a', outcomeId: 'o9', patch: { due: '2026-02-08' } }),
);
ok('يُقبل التاريخ على الإعلان لا على المهمة وحدها', outOf(dated)?.due === '2026-02-08');

// المسؤولية نوع قائم بذاته
const resp = applyOp(withSubjectTopic, op({
  type: 'outcome/add', meetingId: 'a',
  outcome: { id: 'r1', kind: 'assignment', text: 'مسؤول الطباعة', assignee: { id: '7', name: 'نصر' } },
}));
ok('المسؤولية تُحفظ بنوعها وصاحبها', outOf(resp)?.kind === 'assignment' && outOf(resp)?.assignee?.name === 'نصر');

// التراجع عن الجديد
roundTrip(a2, op({ type: 'agenda/add', subject: subject('s3') }), 'إضافة محور ثابت');
roundTrip(a2, op({ type: 'agenda/update', subjectId: 's1', patch: { title: 'الرحلات' } }), 'تعديل محور ثابت');
roundTrip(a2, op({ type: 'agenda/move', subjectId: 's1', toIndex: 1 }), 'نقل محور ثابت');
roundTrip(a2, op({ type: 'agenda/remove', subjectId: 's1' }), 'حذف محور ثابت');
roundTrip(withOutcomeUnderTopic, op({ type: 'outcome/update', meetingId: 'a', outcomeId: 'o1', patch: { topicId: null } }), 'نقل توصية إلى العام');


// ── السياسات ────────────────────────────────────────────────────────────────
const column = (id: string, title = `عمود ${id}`, kind: BoardColumn['kind'] = 'policies'): BoardColumn => ({ id, title, kind });
const policy = (id: string, text = `سياسة ${id}`, columnId: string | null = null): Policy =>
  ({ id, text, columnId, at: 1 });
const polsOf = (b: Board) => (b.policies ?? []).map((x) => x.id).join('');
const colsOf = (b: Board) => (b.columns ?? []).map((c) => c.id).join('');

const sec = applyOp(applyOp(board(), op({ type: 'column/add', column: column('c1', 'الرحلات') })),
                    op({ type: 'column/add', column: column('c2', 'الحضور والغياب') }));
ok('تُضاف أعمدة السياسات', colsOf(sec) === 'c1c2');
ok('بلا تكرار', applyOp(sec, op({ type: 'column/add', column: column('c1', 'الرحلات') })) === sec);
ok('وتُرتَّب', colsOf(applyOp(sec, op({ type: 'column/move', columnId: 'c2', toIndex: 0 }))) === 'c2c1');

const pol = applyOp(
  applyOp(sec, op({ type: 'policy/add', policy: policy('p1', 'يُمنع الالتحاق عند التأخر', 'c1') })),
  op({ type: 'policy/add', policy: policy('p2', 'حد التأخر بلا عذر', 'c2') }),
);
ok('تُضاف السياسات', polsOf(pol) === 'p1p2');
ok('ويُذكر عمودها في النشاط', (pol.activity?.at(-1)?.what as { column: string }).column === 'الحضور والغياب');

const amended = applyOp(pol, op({ type: 'policy/update', policyId: 'p2', patch: { text: 'يمكن تعويض تأخّرات الأسبوع نفسه' } }));
ok('تُعدَّل السياسة', (amended.policies ?? [])[1].text === 'يمكن تعويض تأخّرات الأسبوع نفسه');
ok('ويُحفظ نصّها السابق في السجلّ', (amended.activity?.at(-1)?.what as { from: string }).from === 'حد التأخر بلا عذر');
ok('نفس النصّ لا يغيّر شيئًا', applyOp(amended, op({ type: 'policy/update', policyId: 'p2', patch: { text: 'يمكن تعويض تأخّرات الأسبوع نفسه' } })) === amended);

// حذف القسم لا يحذف سياساته
const cutSec = applyOp(pol, op({ type: 'column/remove', columnId: 'c1', moveTo: 'c2' }));
ok('حذف العمود مع النقل يُبقي سياساته', polsOf(cutSec) === 'p1p2');
ok('وتنتقل إلى العمود الآخر', (cutSec.policies ?? [])[0].columnId === 'c2');
ok('ويُذكر عددها وإلى أين ذهبت', (cutSec.activity?.at(-1)?.what as { cards: number; movedTo: string }).cards === 1);

// من الاجتماع إلى السياسات
const mt = applyOp(pol, op({ type: 'meeting/add', meeting: meeting('a', '2026-01-10') }));
const withPolicyOutcome = applyOp(mt, op({
  type: 'outcome/add', meetingId: 'a',
  outcome: { id: 'po1', kind: 'policy', text: 'حد التعثّر القرآني' },
}));
// الربط أولًا ثم كتابة السياسة — وهو ترتيب `policyFromOutcome` نفسه، وعليه يقوم تمييز
// «إقرار» من «تعديل»: بعد الكتابة تصير كل سياسة موجودة فلا يُفرَّق بين الحالتين.
const newPolicy = applyOp(
  applyOp(withPolicyOutcome, op({ type: 'outcome/update', meetingId: 'a', outcomeId: 'po1', patch: { policyId: 'p9' } })),
  op({ type: 'policy/add', policy: { id: 'p9', text: 'حد التعثّر القرآني', columnId: 'c1', meetingId: 'a', at: 2 } }),
);
ok('السياسة تحفظ الاجتماع الذي أقرّها', (newPolicy.policies ?? []).find((x) => x.id === 'p9')?.meetingId === 'a');
ok('ويُسجَّل إقرارًا لا تعديلًا', (newPolicy.activity?.find((e) => e.what.type === 'outcome/policy')?.what as { added: boolean }).added === true);

const amendExisting = applyOp(
  applyOp(withPolicyOutcome, op({ type: 'outcome/update', meetingId: 'a', outcomeId: 'po1', patch: { policyId: 'p2' } })),
  op({ type: 'policy/update', policyId: 'p2', patch: { text: 'حد التعثّر القرآني', meetingId: 'a' } }),
);
ok('وتعديل سياسة قائمة يُسجَّل تعديلًا', (amendExisting.activity?.find((e) => e.what.type === 'outcome/policy')?.what as { added: boolean }).added === false);

// التراجع
roundTripP(sec, op({ type: 'column/add', column: column('c3') }), 'إضافة عمود');
roundTripP(sec, op({ type: 'column/update', columnId: 'c1', patch: { title: 'الرحلات والمخيمات' } }), 'تعديل اسم عمود');
roundTripP(sec, op({ type: 'column/move', columnId: 'c1', toIndex: 1 }), 'ترتيب عمود');
roundTripP(pol, op({ type: 'column/remove', columnId: 'c1', moveTo: 'c2' }), 'حذف عمود مع نقل محتواه');
roundTripP(pol, op({ type: 'column/remove', columnId: 'c1' }), 'حذف عمود وما فيه');
roundTripP(pol, op({ type: 'policy/add', policy: policy('p3') }), 'إضافة سياسة');
roundTripP(pol, op({ type: 'policy/update', policyId: 'p1', patch: { text: 'نصّ آخر', columnId: 'c2' } }), 'تعديل سياسة ونقلها');
roundTripP(pol, op({ type: 'policy/move', policyId: 'p1', toIndex: 1 }), 'ترتيب سياسة');
roundTripP(pol, op({ type: 'policy/remove', policyId: 'p1' }), 'حذف سياسة');


// ── ما بقي مفتوحًا ──────────────────────────────────────────────────────────
const open = (o: Partial<Outcome>): Outcome => ({ id: 'x', kind: 'task', text: 'ت', ...o }) as Outcome;
const plain = board();

ok('المهمة بلا بطاقة مفتوحة', isOpen(open({ kind: 'task' }), plain));
ok('والمُنجَزة يدويًّا مغلقة', !isOpen(open({ kind: 'task', done: true }), plain));
ok('والمسؤولية لا تُتابَع — لا تنتهي أصلًا', !isOpen(open({ kind: 'assignment' }), plain));
ok('ولا الملاحظة', !isOpen(open({ kind: 'note' }), plain));
ok('ولا الإعلان', !isOpen(open({ kind: 'announcement' }), plain));
ok('والسياسة مفتوحة حتى تُكتب فعلًا', isOpen(open({ kind: 'policy' }), plain));
ok('فإذا كُتبت أُغلقت', !isOpen(open({ kind: 'policy', policyId: 'p1' }), plain));

// مهمة لها بطاقة: الحكم للبطاقة
const withCards: Board = {
  ...plain,
  cards: {
    c1: { id: 'c1', title: 'جارية', description: '', labelIds: [], due: null, checklist: [], cover: null, createdAt: 1 },
    c2: { id: 'c2', title: 'منجزة', description: '', labelIds: [], due: null, dueDone: true, checklist: [], cover: null, createdAt: 1 },
  },
};
ok('مهمة ببطاقة غير منجزة تبقى مفتوحة', isOpen(open({ kind: 'task', cardId: 'c1' }), withCards));
ok('ومهمة ببطاقة منجزة تُغلق', !isOpen(open({ kind: 'task', cardId: 'c2' }), withCards));
ok('ومهمة ببطاقة محذوفة تبقى مفتوحة', isOpen(open({ kind: 'task', cardId: 'لا-وجود' }), withCards));

// الترتيب: الأقدم يظهر أيضًا، لا الاجتماع السابق وحده
let timeline = board();
for (const [id, date] of [['m1', '2026-01-01'], ['m2', '2026-01-08'], ['m3', '2026-01-15']] as const) {
  timeline = applyOp(timeline, op({ type: 'meeting/add', meeting: meeting(id, date) }));
  timeline = applyOp(timeline, op({ type: 'outcome/add', meetingId: id, outcome: open({ id: `o-${id}`, kind: 'task', text: `مهمة ${id}` }) }));
}
const before3 = openBefore(timeline, 'm3');
ok('يظهر كل ما سبق لا الاجتماع السابق وحده', before3.map((g) => g.meeting.id).join(',') === 'm2,m1');
ok('والأحدث أولًا', before3[0].meeting.id === 'm2');
ok('ولا شيء قبل الأقدم', openBefore(timeline, 'm1').length === 0);

const settled = applyOp(timeline, op({ type: 'outcome/update', meetingId: 'm2', outcomeId: 'o-m2', patch: { done: true } }));
ok('إنجاز توصية يُخرج اجتماعها من المتابعة', openBefore(settled, 'm3').map((g) => g.meeting.id).join(',') === 'm1');
ok('ويُسجَّل إنجازًا', settled.activity?.at(-1)?.what.type === 'outcome/done');

roundTripP(timeline, op({ type: 'outcome/update', meetingId: 'm2', outcomeId: 'o-m2', patch: { done: true } }), 'إنجاز توصية');


// ── تاريخ الموضوع عبر الاجتماعات ───────────────────────────────────────────
let hist = applyOp(board(), op({ type: 'agenda/add', subject: subject('S', 'الرحلة') }));
hist = applyOp(hist, op({ type: 'agenda/add', subject: subject('T', 'المسابقة') }));

// ثلاثة اجتماعات: الأول والثالث فيهما «الرحلة»، والثاني فيه «المسابقة» وحدها
for (const [id, date] of [['h1', '2026-02-01'], ['h2', '2026-02-08'], ['h3', '2026-02-15']] as const) {
  hist = applyOp(hist, op({ type: 'meeting/add', meeting: meeting(id, date, `اجتماع ${id}`) }));
}
hist = applyOp(hist, op({ type: 'topic/add', meetingId: 'h1', topic: { id: 'k1', title: 'الرحلة', notes: 'نقاش أول', subjectId: 'S' } }));
hist = applyOp(hist, op({ type: 'topic/add', meetingId: 'h2', topic: { id: 'k2', title: 'المسابقة', notes: '', subjectId: 'T' } }));
hist = applyOp(hist, op({ type: 'topic/add', meetingId: 'h3', topic: { id: 'k3', title: 'الرحلة', notes: 'نقاش ثانٍ', subjectId: 'S' } }));

hist = applyOp(hist, op({ type: 'outcome/add', meetingId: 'h1', outcome: { id: 'q1', kind: 'policy', text: 'يُمنع الالتحاق عند التأخر', topicId: 'k1' } }));
hist = applyOp(hist, op({ type: 'outcome/add', meetingId: 'h1', outcome: { id: 'q2', kind: 'task', text: 'تجهيز الباص', topicId: 'k1' } }));
// توصية عامة في نفس الاجتماع: ليست للموضوع
hist = applyOp(hist, op({ type: 'outcome/add', meetingId: 'h1', outcome: { id: 'q3', kind: 'note', text: 'ملاحظة عامة' } }));
hist = applyOp(hist, op({ type: 'outcome/add', meetingId: 'h3', outcome: { id: 'q4', kind: 'task', text: 'حجز الملعب', topicId: 'k3', done: true } }));
// وتوصية لموضوع آخر
hist = applyOp(hist, op({ type: 'outcome/add', meetingId: 'h2', outcome: { id: 'q5', kind: 'task', text: 'جوائز', topicId: 'k2' } }));

// سياسة خرجت من «الرحلة»، وأخرى كُتبت مباشرة
hist = applyOp(hist, op({ type: 'outcome/update', meetingId: 'h1', outcomeId: 'q1', patch: { policyId: 'P1' } }));
hist = applyOp(hist, op({ type: 'policy/add', policy: { id: 'P1', text: 'يُمنع الالتحاق عند التأخر', meetingId: 'h1', at: 5 } }));
hist = applyOp(hist, op({ type: 'policy/add', policy: { id: 'P2', text: 'قاعدة لا علاقة لها', at: 6 } }));

const h = subjectHistory(hist, 'S')!;
ok('يُجمَع الموضوع من كل اجتماعاته', h.visits.map((v) => v.meeting.id).join(',') === 'h3,h1');
ok('والأحدث أولًا', h.visits[0].meeting.id === 'h3');
ok('ويحمل نقاش كل مرة', h.visits[1].topic.notes === 'نقاش أول');
ok('ويأخذ توصيات محوره وحدها', h.visits[1].outcomes.map((o) => o.id).join(',') === 'q1,q2');
ok('ولا يدّعي التوصيات العامة', !h.visits[1].outcomes.some((o) => o.id === 'q3'));
ok('ولا توصيات موضوع آخر', !h.visits.some((v) => v.outcomes.some((o) => o.id === 'q5')));
ok('ويجمع ما خرج منه من سياسات', h.policies.map((p) => p.id).join(',') === 'P1');
ok('دون سياسة كُتبت مباشرة', !h.policies.some((p) => p.id === 'P2'));
ok('ويَعُدّ الزيارات والقرارات', h.counts.visits === 2 && h.counts.decisions === 3);
ok('ويَعُدّ ما بقي مفتوحًا منها', h.counts.open === 1);
ok('وموضوع لم يُناقَش يُجمَع فارغًا', subjectHistory(hist, 'T')!.visits.length === 1);
ok('وموضوع غير موجود يُعيد عدمًا', subjectHistory(hist, 'لا-وجود') === null);

// حذف الموضوع الثابت يقطع الخيط، فلا يُجمَع بعده
const cut = applyOp(hist, op({ type: 'agenda/remove', subjectId: 'S' }));
ok('وبعد حذف الموضوع لا يبقى ما يُجمَع', subjectHistory(cut, 'S') === null);


// ── الأعمدة: ما اتفقنا عليه بالضبط ─────────────────────────────────────────
let cols = applyOp(board(), op({ type: 'column/add', column: column('k1', 'الاجتماعات', 'meetings') }));
cols = applyOp(cols, op({ type: 'column/add', column: column('k2', 'الأرشيف', 'meetings') }));
cols = applyOp(cols, op({ type: 'column/add', column: column('k3', 'الرحلات', 'policies') }));
ok('تتعايش أعمدة الاجتماعات والسياسات في ترتيب واحد', colsOf(cols) === 'k1k2k3');

for (const [id, date] of [['n1', '2026-03-01'], ['n2', '2026-03-15'], ['n3', '2026-03-08']] as const) {
  cols = applyOp(cols, op({ type: 'meeting/add', meeting: { ...meeting(id, date), columnId: 'k1' } }));
}
const inCol = (b: Board, k: string) => (b.meetings ?? []).filter((m) => m.columnId === k).map((m) => m.id).join('');
ok('الاجتماعات في عمودها مرتّبة بالتاريخ لا بالإدخال', inCol(cols, 'k1') === 'n2n3n1');

// النقل بين الأعمدة تصنيف، والتاريخ يبقى هو الترتيب
const refiled = applyOp(cols, op({ type: 'meeting/update', meetingId: 'n3', patch: { columnId: 'k2' } }));
ok('نقل اجتماع إلى عمود آخر', inCol(refiled, 'k1') === 'n2n1' && inCol(refiled, 'k2') === 'n3');
ok('ويُسجَّل نقلًا باسم العمود', (refiled.activity?.at(-1)?.what as { column: string }).column === 'الأرشيف');

// حذف عمود اجتماعات: الخياران
const kept = applyOp(cols, op({ type: 'column/remove', columnId: 'k1', moveTo: 'k2' }));
ok('الحذف مع النقل يُبقي الاجتماعات كلها', (kept.meetings ?? []).length === 3 && inCol(kept, 'k2') === 'n2n3n1');
const destroyed = applyOp(cols, op({ type: 'column/remove', columnId: 'k1' }));
ok('والحذف بلا نقل يأخذها معه', (destroyed.meetings ?? []).length === 0);
ok('ويقول النشاط كم أُتلف', (destroyed.activity?.at(-1)?.what as { cards: number; movedTo: null }).cards === 3);

// لا يُنقل إلى عمود من نوع آخر
const wrongKind = applyOp(cols, op({ type: 'column/remove', columnId: 'k1', moveTo: 'k3' }));
ok('ولا يُنقل اجتماع إلى عمود سياسات', (wrongKind.meetings ?? []).length === 0);

roundTripP(cols, op({ type: 'column/remove', columnId: 'k1', moveTo: 'k2' }), 'حذف عمود اجتماعات مع النقل');
roundTripP(cols, op({ type: 'column/remove', columnId: 'k1' }), 'حذف عمود اجتماعات وما فيه');
roundTripP(cols, op({ type: 'meeting/update', meetingId: 'n1', patch: { columnId: 'k2' } }), 'نقل اجتماع بين عمودين');

console.log(bad ? `\n  ${bad} من ${n} فشلت` : `\n  ${n}/${n} نجحت`);
process.exit(bad ? 1 : 0);
