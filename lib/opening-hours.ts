/**
 * Opening hours, per branch.
 *
 * These used to be a module-level constant (Mon–Sat, 09:00–17:00). That was wrong for
 * any business that does not keep those exact hours — it silently refused bookings on
 * days a branch was open, and offered none in the evening. Hours now travel with the
 * branch row.
 *
 * Wire format is JSON on the Branch: `{ "<dayOfWeek 0-6>": [openMinutes, closeMinutes] }`
 * where 0 = Sunday, matching `Date.prototype.getDay()`, and minutes count from local
 * midnight. A day that is absent means closed.
 */

export type DayRange = [openMinutes: number, closeMinutes: number];
export type OpeningHours = Record<number, DayRange>;

/** Slot granularity offered to visitors. */
export const SLOT_MINUTES = 30;

/**
 * Parse the stored JSON, tolerating anything malformed.
 *
 * Fails CLOSED: unparseable or nonsensical hours yield no open days, so a
 * misconfigured branch offers zero slots rather than accepting bookings that nobody
 * will be there to honour.
 */
export function parseOpeningHours(raw: string | null | undefined): OpeningHours {
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  const hours: OpeningHours = {};

  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const day = Number(key);
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    if (!Array.isArray(value) || value.length !== 2) continue;

    const [open, close] = value;
    if (typeof open !== "number" || typeof close !== "number") continue;
    if (!Number.isFinite(open) || !Number.isFinite(close)) continue;
    // A close at or before open would produce an inverted, unbookable window.
    if (open < 0 || close > 24 * 60 || close <= open) continue;

    hours[day] = [open, close];
  }

  return hours;
}

export function serializeOpeningHours(hours: OpeningHours): string {
  return JSON.stringify(hours);
}

/** Convenience builder: `{ mon: ["09:00","22:00"], … }` → wire format. */
export function buildOpeningHours(
  spec: Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, [string, string]>>,
): string {
  const hours: OpeningHours = {};
  for (const [day, range] of Object.entries(spec)) {
    if (!range) continue;
    hours[Number(day)] = [toMinutes(range[0]), toMinutes(range[1])];
  }
  return serializeOpeningHours(hours);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function isOpenOn(hours: OpeningHours, date: Date): boolean {
  return hours[date.getDay()] !== undefined;
}

/** The open window for a given date, or null when closed that day. */
export function windowFor(hours: OpeningHours, date: Date): DayRange | null {
  return hours[date.getDay()] ?? null;
}

/**
 * True when a booking of `durationMin` starting at `startsAt` fits entirely inside
 * that day's open window and lands on the slot grid.
 */
export function fitsWithinHours(
  hours: OpeningHours,
  startsAt: Date,
  durationMin: number,
): boolean {
  const window = windowFor(hours, startsAt);
  if (!window) return false;

  const [open, close] = window;
  const start = startsAt.getHours() * 60 + startsAt.getMinutes();
  const end = start + durationMin;

  return start >= open && end <= close && start % SLOT_MINUTES === 0;
}

/** Human-readable summary, grouping consecutive days that share a window. */
export function describeOpeningHours(hours: OpeningHours): string[] {
  const names = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const order = [1, 2, 3, 4, 5, 6, 0];
  const lines: string[] = [];

  let runStart: number | null = null;
  let runRange: string | null = null;

  const flush = (endDay: number | null) => {
    if (runStart === null || runRange === null || endDay === null) return;
    const label =
      runStart === endDay
        ? names[runStart]
        : `${names[runStart]}–${names[endDay]}`;
    lines.push(`${label} ${runRange}`);
  };

  let previous: number | null = null;

  for (const day of order) {
    const window = hours[day];
    const range = window ? `${fmt(window[0])}–${fmt(window[1])}` : null;

    if (range !== runRange) {
      flush(previous);
      runStart = range ? day : null;
      runRange = range;
    }
    previous = range ? day : previous;
  }
  flush(previous);

  return lines;
}

function fmt(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
