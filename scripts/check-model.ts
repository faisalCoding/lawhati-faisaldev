// Checks the shared reducer, which runs on every device and on the sync server alike. A board is
// only ever as consistent as these two agreeing, and the reducer has no other safety net: the
// project has no test runner, and this needs none — `npm run check:model`, plain assertions, no
// framework to keep working.

import { applyOp } from '../src/shared/reducer';
import type { Board, Meeting, MeetingTopic, Op } from '../src/shared/types';

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

console.log(bad ? `\n  ${bad} من ${n} فشلت` : `\n  ${n}/${n} نجحت`);
process.exit(bad ? 1 : 0);
