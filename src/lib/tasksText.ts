import { isDoneList } from '../notifications/plan';
import { isCardDone, itemAssignees, ownerNames } from '../shared/cards';
import type { Board } from '../shared/types';
import { formatLongDate, todayISO } from './dates';

/**
 * The board's open work as one piece of text to paste where the team talks: every card still to do,
 * list by list, with who holds it and when it is due — and under each card the tasks inside it, the
 * same way.
 *
 * Finished work is left out — a ticked card, a ticked task, anything in the board's «مكتمل» list
 * (the reminders' own rule, `isDoneList`) — because the list is for what is still owed. A missing
 * owner or date is written out as «بلا مسؤول» or «بلا موعد» rather than left blank: in a list of who
 * does what by when, the gap is the line someone has to pick up. Plain text, like the meeting
 * summary, because it lands in a chat.
 */
export function boardTasksText(board: Board, today: string = todayISO()): string {
  const when = (due: string | null | undefined) =>
    due ? `${formatLongDate(due)}${due < today ? ' (متأخرة)' : ''}` : 'بلا موعد';

  const sections: string[] = [];
  for (const list of board.lists) {
    if (isDoneList(board, list)) continue;
    const lines: string[] = [];
    for (const id of list.cardIds) {
      const card = board.cards[id];
      if (!card || isCardDone(card)) continue;
      const owners = ownerNames(card.assignees ?? []) ?? 'بلا مسؤول';
      lines.push(`- ${card.title} — ${owners} — ${when(card.due)}`);
      for (const item of card.checklist) {
        if (item.done) continue;
        lines.push(`   · ${item.text} — ${ownerNames(itemAssignees(item)) ?? 'بلا مسؤول'} — ${when(item.due)}`);
      }
    }
    if (lines.length > 0) sections.push([list.title, ...lines].join('\n'));
  }

  const head = `مهام «${board.title}» — ${formatLongDate(today)}`;
  return sections.length > 0 ? [head, ...sections].join('\n\n') : `${head}\n\nلا مهام مفتوحة.`;
}
