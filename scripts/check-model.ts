// Checks the shared reducer, which runs on every device and on the sync server alike. A board is
// only ever as consistent as these two agreeing, and the reducer has no other safety net: the
// project has no test runner, and this needs none — `npm run check:model`, plain assertions, no
// framework to keep working.

import { stillApplies, undoOf } from '../src/shared/activity';
import { applyOp } from '../src/shared/reducer';
import type { AgendaSubject, Board, Meeting, MeetingTopic, Outcome, Op, Policy, PolicySection } from '../src/shared/types';

const board = (): Board => ({
  id: 'b', title: 'لوحة', color: '#000', icon: 'grid',
  lists: [], cards: {}, labels: [],
  powerUps: { labels: true, dueDates: true, checklists: true, covers: true, wipLimits: false },
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
const roundTrip = (start: Board, change: Op, label: string) => {
  const after = applyOp(start, change);
  const steps = undoOf(start, after, change);
  let back = after;
  for (const step of steps) {
    const undo = stillApplies(back, step);
    if (undo) back = applyOp(back, { ...undo, id: `u${++seq}`, at: 9000 + seq, by: null } as Op);
  }
  // Compared the way the model itself defines equality: `same()` treats a missing field and null
  // as one and the same, and `meetingField`/`outcomeField` give every optional field its default.
  // Undo writes those defaults explicitly where the original simply lacked them, which is the same
  // board. Comparing raw JSON would call that a difference and would be testing the test.
  const strip = (b: Board) =>
    JSON.stringify({
      ...b,
      activity: undefined,
      updatedAt: 0,
      meetings: (b.meetings ?? []).map((m) => ({
        ...m,
        place: m.place ?? '',
        outcomes: (m.outcomes ?? []).map((o) => ({
          ...o,
          assignee: o.assignee ?? null,
          due: o.due ?? null,
          cardId: o.cardId ?? null,
        })),
      })),
    });
  ok(`التراجع يُعيد الحال: ${label}`, strip(back) === strip(start));
};

/** Like `roundTrip`, normalising the policy fields the model gives defaults to. */
const roundTripP = (start: Board, change: Op, label: string) => {
  const after = applyOp(start, change);
  let back = after;
  for (const step of undoOf(start, after, change)) {
    const undo = stillApplies(back, step);
    if (undo) back = applyOp(back, { ...undo, id: `up${++seq}`, at: 9700 + seq, by: null } as Op);
  }
  const strip = (b: Board) =>
    JSON.stringify({
      ...b,
      activity: undefined,
      updatedAt: 0,
      policies: (b.policies ?? []).map((x) => ({ ...x, sectionId: x.sectionId ?? null, meetingId: x.meetingId ?? null })),
    });
  ok(`التراجع يُعيد الحال: ${label}`, strip(back) === strip(start));
};

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
const section = (id: string, title = `قسم ${id}`): PolicySection => ({ id, title });
const policy = (id: string, text = `سياسة ${id}`, sectionId: string | null = null): Policy =>
  ({ id, text, sectionId, at: 1 });
const polsOf = (b: Board) => (b.policies ?? []).map((x) => x.id).join('');
const secsOf = (b: Board) => (b.policySections ?? []).map((x) => x.id).join('');

const sec = applyOp(applyOp(board(), op({ type: 'section/add', section: section('c1', 'الرحلات') })),
                    op({ type: 'section/add', section: section('c2', 'الحضور والغياب') }));
ok('تُضاف أقسام السياسات', secsOf(sec) === 'c1c2');
ok('بلا تكرار', applyOp(sec, op({ type: 'section/add', section: section('c1') })) === sec);
ok('وتُرتَّب', secsOf(applyOp(sec, op({ type: 'section/move', sectionId: 'c2', toIndex: 0 }))) === 'c2c1');

const pol = applyOp(
  applyOp(sec, op({ type: 'policy/add', policy: policy('p1', 'يُمنع الالتحاق عند التأخر', 'c1') })),
  op({ type: 'policy/add', policy: policy('p2', 'حد التأخر بلا عذر', 'c2') }),
);
ok('تُضاف السياسات', polsOf(pol) === 'p1p2');
ok('ويُذكر قسمها في النشاط', (pol.activity?.at(-1)?.what as { section: string }).section === 'الحضور والغياب');

const amended = applyOp(pol, op({ type: 'policy/update', policyId: 'p2', patch: { text: 'يمكن تعويض تأخّرات الأسبوع نفسه' } }));
ok('تُعدَّل السياسة', (amended.policies ?? [])[1].text === 'يمكن تعويض تأخّرات الأسبوع نفسه');
ok('ويُحفظ نصّها السابق في السجلّ', (amended.activity?.at(-1)?.what as { from: string }).from === 'حد التأخر بلا عذر');
ok('نفس النصّ لا يغيّر شيئًا', applyOp(amended, op({ type: 'policy/update', policyId: 'p2', patch: { text: 'يمكن تعويض تأخّرات الأسبوع نفسه' } })) === amended);

// حذف القسم لا يحذف سياساته
const cutSec = applyOp(pol, op({ type: 'section/remove', sectionId: 'c1' }));
ok('حذف القسم يُبقي سياساته', polsOf(cutSec) === 'p1p2');
ok('وتصير بلا قسم لا معلّقة', (cutSec.policies ?? [])[0].sectionId === null);
ok('ويُذكر عددها في السجلّ', (cutSec.activity?.at(-1)?.what as { policies: number }).policies === 1);

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
  op({ type: 'policy/add', policy: { id: 'p9', text: 'حد التعثّر القرآني', sectionId: 'c1', meetingId: 'a', at: 2 } }),
);
ok('السياسة تحفظ الاجتماع الذي أقرّها', (newPolicy.policies ?? []).find((x) => x.id === 'p9')?.meetingId === 'a');
ok('ويُسجَّل إقرارًا لا تعديلًا', (newPolicy.activity?.find((e) => e.what.type === 'outcome/policy')?.what as { added: boolean }).added === true);

const amendExisting = applyOp(
  applyOp(withPolicyOutcome, op({ type: 'outcome/update', meetingId: 'a', outcomeId: 'po1', patch: { policyId: 'p2' } })),
  op({ type: 'policy/update', policyId: 'p2', patch: { text: 'حد التعثّر القرآني', meetingId: 'a' } }),
);
ok('وتعديل سياسة قائمة يُسجَّل تعديلًا', (amendExisting.activity?.find((e) => e.what.type === 'outcome/policy')?.what as { added: boolean }).added === false);

// التراجع
roundTripP(sec, op({ type: 'section/add', section: section('c3') }), 'إضافة قسم');
roundTripP(sec, op({ type: 'section/update', sectionId: 'c1', patch: { title: 'الرحلات والمخيمات' } }), 'تعديل اسم قسم');
roundTripP(sec, op({ type: 'section/move', sectionId: 'c1', toIndex: 1 }), 'ترتيب قسم');
roundTripP(pol, op({ type: 'section/remove', sectionId: 'c1' }), 'حذف قسم بسياساته');
roundTripP(pol, op({ type: 'policy/add', policy: policy('p3') }), 'إضافة سياسة');
roundTripP(pol, op({ type: 'policy/update', policyId: 'p1', patch: { text: 'نصّ آخر', sectionId: 'c2' } }), 'تعديل سياسة ونقلها');
roundTripP(pol, op({ type: 'policy/move', policyId: 'p1', toIndex: 1 }), 'ترتيب سياسة');
roundTripP(pol, op({ type: 'policy/remove', policyId: 'p1' }), 'حذف سياسة');

console.log(bad ? `\n  ${bad} من ${n} فشلت` : `\n  ${n}/${n} نجحت`);
process.exit(bad ? 1 : 0);
