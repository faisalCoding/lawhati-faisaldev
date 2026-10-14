import type { BoardIconName } from '../components/ui/Icon';
import type { Board, Card, Label, List, PowerUps } from '../shared/types';
import { addDays, todayISO } from './dates';
import { uid } from './ids';
import { BOARD_COLORS, LABEL_COLORS } from './theme';

// Checklists are always on. The flag stays true for older app versions, which still hide them without it.
export const DEFAULT_POWER_UPS: PowerUps = {
  labels: false,
  dueDates: false,
  checklists: true,
  covers: false,
  wipLimits: false,
};

export interface BoardTemplate {
  id: string;
  name: string;
  icon: BoardIconName;
  hint: string;
  lists: string[];
  powerUps: Partial<PowerUps>;
}

export const TEMPLATES: BoardTemplate[] = [
  {
    id: 'basic',
    name: 'أساسية',
    icon: 'kanban',
    hint: 'للتنفيذ ← قيد العمل ← مكتمل',
    lists: ['للتنفيذ', 'قيد العمل', 'مكتمل'],
    powerUps: {},
  },
  {
    id: 'project',
    name: 'مشروع عمل',
    icon: 'briefcase',
    hint: 'مع التسميات والمواعيد وحدود العمل',
    lists: ['أفكار', 'للتنفيذ', 'قيد العمل', 'مراجعة', 'مكتمل'],
    powerUps: { labels: true, dueDates: true, wipLimits: true },
  },
  {
    id: 'travel',
    name: 'تخطيط سفر',
    icon: 'plane',
    hint: 'وجهات، حجوزات، وحقيبة جاهزة',
    lists: ['وجهات مقترحة', 'حجوزات', 'تجهيز الحقيبة', 'جاهز للسفر'],
    powerUps: { dueDates: true },
  },
  {
    id: 'shopping',
    name: 'قائمة تسوق',
    icon: 'cart',
    hint: 'مطلوب ← في السلة ← تم الشراء',
    lists: ['مطلوب', 'في السلة', 'تم الشراء'],
    powerUps: {},
  },
  {
    id: 'study',
    name: 'دراسة',
    icon: 'book',
    hint: 'مواد، مذاكرة، مراجعة',
    lists: ['مواد للمذاكرة', 'أذاكرها الآن', 'مراجعة', 'أتقنتها'],
    powerUps: { dueDates: true },
  },
];

export function defaultLabels(): Label[] {
  return [
    { id: 'l-red', name: 'عاجل', color: LABEL_COLORS.red },
    { id: 'l-orange', name: 'مهم', color: LABEL_COLORS.orange },
    { id: 'l-yellow', name: 'بانتظار رد', color: LABEL_COLORS.yellow },
    { id: 'l-green', name: 'سهل', color: LABEL_COLORS.green },
    { id: 'l-blue', name: 'متابعة', color: LABEL_COLORS.blue },
    { id: 'l-purple', name: 'فكرة', color: LABEL_COLORS.purple },
  ];
}

export function newList(title: string): List {
  return { id: uid(), title, cardIds: [], wipLimit: null };
}

export function newCard(title: string, extra: Partial<Card> = {}): Card {
  return {
    id: uid(),
    title,
    description: '',
    labelIds: [],
    due: null,
    checklist: [],
    cover: null,
    createdAt: Date.now(),
    ...extra,
  };
}

export function createBoardFromTemplate(opts: {
  title: string;
  color?: string;
  icon?: string;
  templateId?: string;
}): Board {
  const template = TEMPLATES.find((t) => t.id === opts.templateId) ?? TEMPLATES[0];
  const now = Date.now();
  return {
    id: uid(),
    title: opts.title.trim() || template.name,
    color: opts.color ?? BOARD_COLORS[0],
    icon: opts.icon ?? template.icon,
    lists: template.lists.map(newList),
    cards: {},
    labels: defaultLabels(),
    powerUps: { ...DEFAULT_POWER_UPS, ...template.powerUps },
    shareCode: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** The board shown on first launch: it teaches the app by example. */
export function createWelcomeBoard(): Board {
  const board = createBoardFromTemplate({ title: 'ابدأ من هنا', icon: 'sparkles', templateId: 'basic' });
  board.powerUps = { ...board.powerUps, labels: true, dueDates: true };

  const [todo, doing, done] = board.lists;
  const add = (list: List, card: Card) => {
    board.cards[card.id] = card;
    list.cardIds.push(card.id);
  };

  add(todo, newCard('اضغط مطولًا على أي بطاقة ثم اسحبها إلى قائمة أخرى', { labelIds: ['l-blue'] }));
  add(todo, newCard('اضغط على البطاقة لفتح تفاصيلها وتعديلها'));
  add(
    todo,
    newCard('فعّل الإضافات التي تحتاجها فقط من زر الإعدادات', {
      labelIds: ['l-purple'],
      checklist: [
        { id: uid(), text: 'التسميات', done: true },
        { id: uid(), text: 'تواريخ الاستحقاق', done: true },
        { id: uid(), text: 'حدود العمل (WIP)', done: false },
      ],
    }),
  );
  add(
    doing,
    newCard('شارك اللوحة برمز ليعمل عليها فريقك في الوقت نفسه', {
      labelIds: ['l-orange'],
      due: addDays(todayISO(), 1),
    }),
  );
  add(done, newCard('أنشأت أول لوحة كانبان', { labelIds: ['l-green'] }));
  return board;
}
