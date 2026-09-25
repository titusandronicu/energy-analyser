// Europe/Warsaw date helpers shared by the dashboard cards.
const TIME_ZONE = "Europe/Warsaw";

// `dayKey` ("2026-09-23") compares calendar days; `label` ("23 września 2026, 12:00") is what the cards show.
export function warsawParts(date: Date) {
  const parts = new Intl.DateTimeFormat("pl-PL", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const monthNumber = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, month: "2-digit" }).format(date);
  return {
    dayKey: `${get("year")}-${monthNumber}-${get("day").padStart(2, "0")}`,
    label: `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")}`,
  };
}

export function formatWarsawDateTime(date: Date): string {
  return warsawParts(date).label;
}
