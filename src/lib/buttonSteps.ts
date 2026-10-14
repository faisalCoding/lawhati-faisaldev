import type { IconName } from '../components/ui/Buttons';
import type { Board, ButtonStep } from '../shared/types';
import { pluralTasks } from './text';

// How card-button steps read in the app.

export const STEP_KINDS: { type: ButtonStep['type']; label: string; icon: IconName }[] = [
  { type: 'replace', label: 'استبدال نص في العنوان', icon: 'replace' },
  { type: 'move', label: 'نقل إلى قائمة', icon: 'move' },
  { type: 'done', label: 'الإنجاز', icon: 'circle-check' },
  { type: 'due', label: 'موعد التسليم', icon: 'calendar' },
  { type: 'assign', label: 'الإسناد', icon: 'user-plus' },
  { type: 'label', label: 'تسمية', icon: 'tag' },
  { type: 'cover', label: 'لون الغلاف', icon: 'palette' },
  { type: 'tasks', label: 'إضافة مهام', icon: 'checklist' },
];

export function describeDays(days: number): string {
  if (days === 0) return 'اليوم';
  if (days === 1) return 'غدًا';
  if (days === 2) return 'بعد يومين';
  if (days === 7) return 'بعد أسبوع';
  if (days === 14) return 'بعد أسبوعين';
  return days <= 10 ? `بعد ${days} أيام` : `بعد ${days} يومًا`;
}

/** One step in words, e.g. «نقل إلى «مكتمل» (أعلى القائمة)». */
export function describeStep(step: ButtonStep, board: Board): string {
  switch (step.type) {
    case 'replace':
      return step.replace ? `استبدال «${step.find}» بـ«${step.replace}» في العنوان` : `حذف «${step.find}» من العنوان`;
    case 'move': {
      const list = board.lists.find((l) => l.id === step.listId);
      const where = step.position === 'top' ? 'أعلى القائمة' : 'أسفل القائمة';
      return list ? `نقل إلى «${list.title}» (${where})` : 'نقل إلى قائمة محذوفة';
    }
    case 'cover':
      return step.color ? 'تلوين الغلاف' : 'إزالة الغلاف';
    case 'done':
      return step.done ? 'تعليمها منجزة' : 'إعادة فتحها';
    case 'due':
      return step.days === null ? 'إزالة الموعد' : `موعدها ${describeDays(step.days)}`;
    case 'assign':
      if (step.to === 'me') return 'إسنادها لمن يضغط الزر';
      if (step.to === 'nobody') return 'إزالة المسؤولين';
      return `إسنادها إلى ${step.to.name}`;
    case 'label': {
      const label = board.labels.find((l) => l.id === step.labelId);
      const name = label ? `«${label.name || 'بلا اسم'}»` : 'محذوفة';
      return step.on ? `إضافة تسمية ${name}` : `إزالة تسمية ${name}`;
    }
    case 'tasks':
      return `إضافة ${pluralTasks(step.items.length, true)}: ${step.items.slice(0, 3).join('، ')}${step.items.length > 3 ? '…' : ''}`;
  }
}
