// Links of the history calendar (S-15): where previous/next and the day/month/quarter switch lead, and whether a
// period can be linked at all. A link is only ever made to a period parsePeriod accepts, so no link redirects.
import {
  adjacent,
  HISTORY_START,
  isOpenable,
  periodBounds,
  periodContaining,
  periodLabel,
  toSearch,
  type CalendarPeriod,
  type PeriodKind,
} from "@/lib/calendar/period";

export const HISTORY_PATH = "/dashboard/history";

// "/dashboard/history?month=2026-09", or null for a period wholly before HISTORY_START or after today.
export function periodHref(p: CalendarPeriod, today: string): string | null {
  return isOpenable(p, today) ? `${HISTORY_PATH}${toSearch(p)}` : null;
}

export interface NavLink {
  href: string;
  // The accessible name, naming the target period: "Poprzedni miesiąc: sierpień 2026".
  label: string;
}

export interface KindSwitch {
  kind: PeriodKind;
  word: string;
  href: string;
  current: boolean;
}

export interface PeriodNavView {
  label: string;
  prev: NavLink | null;
  next: NavLink | null;
  kinds: KindSwitch[];
}

const KIND_WORD: Record<PeriodKind, string> = { day: "Dzień", month: "Miesiąc", quarter: "Kwartał" };
const PREV_WORD: Record<PeriodKind, string> = {
  day: "Poprzedni dzień",
  month: "Poprzedni miesiąc",
  quarter: "Poprzedni kwartał",
};
const NEXT_WORD: Record<PeriodKind, string> = {
  day: "Następny dzień",
  month: "Następny miesiąc",
  quarter: "Następny kwartał",
};
const KINDS: readonly PeriodKind[] = ["day", "month", "quarter"];

// The day a switch between day, month and quarter keeps: the period's last day, but never after today or before
// HISTORY_START, so the switched-to period can always be opened.
function anchorDay(p: CalendarPeriod, today: string): string {
  const { last } = periodBounds(p);
  const day = last > today ? today : last;
  return day < HISTORY_START ? HISTORY_START : day;
}

function navLink(target: CalendarPeriod | null, word: string, today: string): NavLink | null {
  if (target === null) return null;
  const href = periodHref(target, today);
  return href === null ? null : { href, label: `${word}: ${periodLabel(target)}` };
}

export function periodNav(p: CalendarPeriod, today: string): PeriodNavView {
  const { prev, next } = adjacent(p, today);
  const anchor = anchorDay(p, today);
  return {
    label: periodLabel(p),
    prev: navLink(prev, PREV_WORD[p.kind], today),
    next: navLink(next, NEXT_WORD[p.kind], today),
    kinds: KINDS.map((kind) => {
      const target = kind === p.kind ? p : periodContaining(kind, anchor);
      return {
        kind,
        word: KIND_WORD[kind],
        href: `${HISTORY_PATH}${toSearch(target)}`,
        current: kind === p.kind,
      };
    }),
  };
}
