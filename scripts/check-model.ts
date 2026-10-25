// Checks the shared reducer, which runs on every device and on the sync server alike. A board is
// only ever as consistent as these two agreeing, and the reducer has no other safety net: the
// project has no test runner, and this needs none — `npm run check:model`, plain assertions, no
// framework to keep working.

import { applyOp } from '../src/shared/reducer';
import type { Board, Op } from '../src/shared/types';

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

console.log(bad ? `\n  ${bad} من ${n} فشلت` : `\n  ${n}/${n} نجحت`);
process.exit(bad ? 1 : 0);
