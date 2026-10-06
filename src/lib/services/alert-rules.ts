// Alert rules: the owner's rules for the Telegram alerts. This phase holds only the limits, which the database checks
// enforce too (supabase/migrations/20261007090000_alert_rules.sql); tests/integration/alert-rules.test.ts fails when
// the two drift.

export const ALERT_KINDS = ["live_stale", "bill_above"] as const;

// live_stale: whole minutes of snapshot age. 15 is the app's own stale line (LIVE_STALE_AFTER_MS).
export const ALERT_STALE_MIN_MINUTES = 15;
export const ALERT_STALE_MAX_MINUTES = 1440;

// bill_above: the projected gross bill in PLN.
export const ALERT_BILL_MIN_PLN = 1;
export const ALERT_BILL_MAX_PLN = 7000;

export const ALERT_LABEL_MAX_LENGTH = 60;

// Hours between reminders while an alarm lasts.
export const ALERT_RENOTIFY_MIN_HOURS = 1;
export const ALERT_RENOTIFY_MAX_HOURS = 72;
export const ALERT_RENOTIFY_DEFAULT_HOURS = 6;
