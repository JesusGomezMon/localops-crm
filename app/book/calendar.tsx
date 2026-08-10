"use client";

import { useMemo } from "react";

/**
 * Month calendar. Hand-rolled — no date library, no new dependencies.
 *
 * A day is tappable only when the server reported free slots for it. Fully-booked
 * days, closed days (Sundays), and past days are rendered flat and inert rather than
 * hidden, so the grid keeps its shape and the visitor can see *why* their week is
 * thin instead of guessing.
 */

const WEEKDAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Monday-first offset for a month's opening weekday. */
function leadingBlanks(firstOfMonth: Date): number {
  return (firstOfMonth.getDay() + 6) % 7;
}

type Props = {
  month: Date;
  onMonthChange: (next: Date) => void;
  selected: string | null;
  onSelect: (day: string) => void;
  /** dayKey → number of free slots. Absent means nothing available. */
  availability: Record<string, number>;
  loading: boolean;
};

export function Calendar({
  month,
  onMonthChange,
  selected,
  onSelect,
  availability,
  loading,
}: Props) {
  const { cells, monthLabel, canGoBack } = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const daysInMonth = new Date(
      month.getFullYear(),
      month.getMonth() + 1,
      0,
    ).getDate();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const list: Array<{ date: Date; key: string; free: number; past: boolean } | null> =
      Array.from({ length: leadingBlanks(first) }, () => null);

    for (let d = 1; d <= daysInMonth; d += 1) {
      const date = new Date(month.getFullYear(), month.getMonth(), d);
      list.push({
        date,
        key: dayKey(date),
        free: availability[dayKey(date)] ?? 0,
        past: date < today,
      });
    }

    const thisMonth = new Date();
    return {
      cells: list,
      monthLabel: `${MONTH_NAMES[month.getMonth()]} ${month.getFullYear()}`,
      canGoBack:
        month.getFullYear() > thisMonth.getFullYear() ||
        (month.getFullYear() === thisMonth.getFullYear() &&
          month.getMonth() > thisMonth.getMonth()),
    };
  }, [month, availability]);

  return (
    <div>
      <div className="mb-7 flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))
          }
          disabled={!canGoBack}
          aria-label="Mes anterior"
          className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:bg-surface hover:text-foreground disabled:pointer-events-none disabled:opacity-20"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <p className="eyebrow text-foreground capitalize">{monthLabel}</p>

        <button
          type="button"
          onClick={() =>
            onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))
          }
          aria-label="Mes siguiente"
          className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:bg-surface hover:text-foreground"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="mb-3 grid grid-cols-7">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={`${label}-${i}`}
            className="text-center text-[0.625rem] font-medium tracking-[0.15em] text-muted uppercase"
          >
            {label}
          </div>
        ))}
      </div>

      <div
        className={`grid grid-cols-7 gap-y-1 transition-opacity duration-200 ${
          loading ? "opacity-30" : "opacity-100"
        }`}
      >
        {cells.map((cell, index) => {
          if (!cell) {
            return <div key={`blank-${index}`} />;
          }

          const isSelected = selected === cell.key;
          const available = cell.free > 0 && !cell.past;

          return (
            <button
              key={cell.key}
              type="button"
              disabled={!available}
              onClick={() => onSelect(cell.key)}
              aria-label={`${cell.date.getDate()} de ${MONTH_NAMES[cell.date.getMonth()]}${
                available ? `, ${cell.free} horarios libres` : ", sin disponibilidad"
              }`}
              aria-pressed={isSelected}
              className={[
                "relative mx-auto flex h-11 w-11 items-center justify-center rounded-full text-[0.9375rem] tabular-nums transition",
                isSelected
                  ? "bg-gold font-semibold text-background"
                  : available
                    ? "text-foreground hover:bg-surface"
                    : "cursor-default text-muted/35",
              ].join(" ")}
            >
              {cell.date.getDate()}
              {available && !isSelected ? (
                <span className="absolute bottom-1.5 h-[3px] w-[3px] rounded-full bg-gold" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
