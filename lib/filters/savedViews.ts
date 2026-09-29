const SAVED_VIEWS_KEY = "synapse-transactions-saved-views";

/**
 * Current schema version for persisted saved views. Bump this whenever the
 * shape of `SavedViewFilters` changes so older stored payloads can be
 * migrated (or gracefully dropped) on load.
 */
export const SAVED_VIEWS_SCHEMA_VERSION = 1;

/**
 * Filter fields a saved view may reference. Keep this list in sync with the
 * filters supported by TransactionsTab. Fields that no longer exist are
 * dropped during migration rather than breaking the whole view.
 */
export const SAVED_VIEW_FILTER_FIELDS = [
  "status",
  "dateFrom",
  "dateTo",
  "search",
] as const;

export type SavedViewFilterField = (typeof SAVED_VIEW_FILTER_FIELDS)[number];

export type SavedViewFilters = Partial<Record<SavedViewFilterField, string>>;

export interface SavedView {
  id: string;
  name: string;
  filters: SavedViewFilters;
}

interface PersistedSavedViews {
  version: number;
  views: SavedView[];
}

function isKnownFilterField(field: string): field is SavedViewFilterField {
  return (SAVED_VIEW_FILTER_FIELDS as readonly string[]).includes(field);
}

/**
 * Drop any filter keys that are not part of the current schema. This is the
 * graceful-drop path for views that reference a filter field which no longer
 * exists.
 */
export function sanitizeFilters(input: unknown): SavedViewFilters {
  if (!input || typeof input !== "object") return {};
  const result: SavedViewFilters = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (isKnownFilterField(key) && typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}

function sanitizeView(input: unknown): SavedView | undefined {
  if (!input || typeof input !== "object") return undefined;
  const raw = input as Record<string, unknown>;
  if (typeof raw.id !== "string" || typeof raw.name !== "string") {
    return undefined;
  }
  return {
    id: raw.id,
    name: raw.name,
    filters: sanitizeFilters(raw.filters),
  };
}

/**
 * Migrate a persisted payload of any known (or unknown) version into the
 * current schema. Unknown/older versions are normalized field-by-field so
 * future filter fields don't break existing stored views.
 */
export function migrateSavedViews(payload: unknown): SavedView[] {
  if (!payload || typeof payload !== "object") return [];
  const raw = payload as Record<string, unknown>;
  const views = Array.isArray(raw.views) ? raw.views : [];
  return views
    .map(sanitizeView)
    .filter((view): view is SavedView => view !== undefined);
}

export function getSavedViews(): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(SAVED_VIEWS_KEY);
    if (!stored) return [];
    return migrateSavedViews(JSON.parse(stored));
  } catch {
    return [];
  }
}

export function storeSavedViews(views: SavedView[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedSavedViews = {
      version: SAVED_VIEWS_SCHEMA_VERSION,
      views: views.map((view) => ({
        id: view.id,
        name: view.name,
        filters: sanitizeFilters(view.filters),
      })),
    };
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(payload));
  } catch {}
}

export function createSavedViewId(): string {
  return `view-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
