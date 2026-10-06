// Mirrors the raw push interval in ingest.prune() (supabase/migrations/20261006120000_ingest_push_sections.sql).
export const RAW_PUSH_RETENTION_DAYS = 14;
// Mirrors the hourly interval in ingest.prune() (the same migration).
export const HOURLY_RETENTION_DAYS = 35;
