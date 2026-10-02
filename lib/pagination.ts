// Keyset pagination: a cursor is the last row's sort key plus its id. Stable
// under inserts and deletes, unlike page numbers. The sort key is passed as
// Postgres timestamp text (exact to the microsecond) to avoid timezone drift.

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 100;

export interface Cursor {
  sortKey: string; // e.g. "2026-08-08T13:38:44.000000"
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SORT_KEY = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.sortKey}|${cursor.id}`).toString("base64url");
}

// Returns null for missing or malformed cursors (treated as "first page")
export function decodeCursor(value: string | null): Cursor | null {
  if (!value) return null;
  const [sortKey, id] = Buffer.from(value, "base64url").toString().split("|");
  return sortKey && id && SORT_KEY.test(sortKey) && UUID.test(id) ? { sortKey, id } : null;
}

export function parseLimit(value: string | null, fallback = DEFAULT_PAGE_SIZE): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_PAGE_SIZE) : fallback;
}

// Drop the internal sort key before sending rows to the client
export function withoutSortKey<T extends { sortKey: string }>(row: T): Omit<T, "sortKey"> {
  const { sortKey, ...rest } = row;
  void sortKey;
  return rest;
}
