import {
  DAY_LABELS,
  DAYS,
  NTH_LABELS,
  defaultRecurrence,
  type Day,
  type Nth,
  type Recurrence,
  type RecurrenceKind,
} from "../recurrence/rules";

/** `null` = doesn't repeat; "custom" = an RRULE the presets can't show (kept as is). */
export type RecurrenceValue = Recurrence | null | "custom";

interface Props {
  value: RecurrenceValue;
  /** Due date used to seed sensible defaults, 'YYYY-MM-DD'. */
  anchorDate: string;
  onChange: (v: RecurrenceValue) => void;
}

const KIND_LABELS: Record<RecurrenceKind, string> = {
  daily: "Every N days",
  weekdays: "Weekdays",
  weekly: "Weekly on…",
  monthlyDate: "Monthly on date",
  monthlyNth: "Monthly on Nth weekday",
};

const UNIT: Partial<Record<RecurrenceKind, string>> = {
  daily: "day(s)",
  weekly: "week(s)",
  monthlyDate: "month(s)",
  monthlyNth: "month(s)",
};

export function RecurrencePicker({ value, anchorDate, onChange }: Props) {
  const kind = value === null ? "none" : value === "custom" ? "custom" : value.kind;

  return (
    <div className="recurrence">
      <select
        value={kind}
        aria-label="Repeat"
        onChange={(e) => {
          const k = e.target.value;
          if (k === "none") onChange(null);
          else if (k !== "custom") onChange(defaultRecurrence(k as RecurrenceKind, anchorDate));
        }}
      >
        <option value="none">Doesn't repeat</option>
        {value === "custom" && <option value="custom">Custom rule</option>}
        {(Object.keys(KIND_LABELS) as RecurrenceKind[]).map((k) => (
          <option key={k} value={k}>
            {KIND_LABELS[k]}
          </option>
        ))}
      </select>

      {value && value !== "custom" && value.kind !== "weekdays" && (
        <div className="editor-row recurrence-detail">
          <label className="inline">
            every
            <input
              type="number"
              min={1}
              max={99}
              value={value.interval}
              onChange={(e) => onChange({ ...value, interval: Math.max(1, Number(e.target.value) || 1) })}
            />
            {UNIT[value.kind]}
          </label>
          {value.kind === "monthlyDate" && (
            <label className="inline">
              on day
              <input
                type="number"
                min={1}
                max={31}
                value={value.day}
                onChange={(e) => onChange({ ...value, day: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })}
              />
            </label>
          )}
          {value.kind === "monthlyNth" && (
            <>
              <select
                value={value.nth}
                aria-label="Which week"
                onChange={(e) => onChange({ ...value, nth: Number(e.target.value) as Nth })}
              >
                {([1, 2, 3, 4, -1] as Nth[]).map((n) => (
                  <option key={n} value={n}>
                    {NTH_LABELS[n]}
                  </option>
                ))}
              </select>
              <select
                value={value.day}
                aria-label="Weekday"
                onChange={(e) => onChange({ ...value, day: e.target.value as Day })}
              >
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {DAY_LABELS[d]}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      )}

      {value && value !== "custom" && value.kind === "weekly" && (
        <div className="day-toggles" role="group" aria-label="Days of the week">
          {DAYS.map((d) => {
            const on = value.days.includes(d);
            return (
              <button
                key={d}
                type="button"
                className={on ? "day on" : "day"}
                aria-pressed={on}
                onClick={() => {
                  const days = on ? value.days.filter((x) => x !== d) : [...value.days, d];
                  if (days.length) onChange({ ...value, days });
                }}
              >
                {DAY_LABELS[d].slice(0, 2)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
