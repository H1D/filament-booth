/**
 * controls.tsx: the few controls every panel is made of.
 *
 * Native inputs throughout, so the keyboard, the screen reader and the
 * browser's own behaviour come with them. A Slider is a range input plus a
 * number field that accepts typed values, with the unit beside it. Double
 * click or Delete puts a slider back to its default.
 *
 * A control's name for assistive technology is its visible label, prefixed by
 * the scope it sits in (a light's name), so five lights do not all announce
 * "Elevation".
 */
import { createContext, use, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "./icons";
import { clamp, formatValue, parseTyped, type Mapping } from "./mappings";

// ---- scope ---------------------------------------------------------------------

const ScopeContext = createContext<string | null>(null);

/** Prefixes the accessible name of every control inside it. */
export function Scope({ name, children }: { name: string; children: ReactNode }) {
  return <ScopeContext value={name}>{children}</ScopeContext>;
}

function useName(label: string): string {
  const scope = use(ScopeContext);
  return scope === null ? label : `${scope}: ${label}`;
}

// ---- slider -------------------------------------------------------------------

export interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  mapping: Mapping;
  unit?: string;
  /** Shown before the number, as in "f/". */
  prefix?: string;
  /** The value a double click restores. Without it the slider has no reset. */
  defaultValue?: number;
  hint?: string;
  disabled?: boolean;
  /** A CSS background for the track, replacing the filled bar. */
  track?: string;
}

export function Slider({ label, value, onChange, mapping, unit, prefix, defaultValue, hint, disabled, track }: SliderProps) {
  const id = useId();
  const name = useName(label);
  const [draft, setDraft] = useState<string | null>(null);
  const { range, limits } = mapping;
  const changed = defaultValue !== undefined && Math.abs(value - defaultValue) > 1e-9;
  const restoreHint = defaultValue === undefined ? "" : " Double-click or press Delete to reset.";
  const pos = mapping.toRange(value);
  const percent = ((pos - range.min) / (range.max - range.min)) * 100;
  const text = formatValue(value, mapping.digits);
  const spoken = `${prefix ?? ""}${text}${unit === undefined ? "" : ` ${unit}`}`;

  const commit = () => {
    if (draft === null) return;
    const parsed = parseTyped(draft);
    setDraft(null);
    if (!Number.isFinite(parsed) || draft.trim() === "") return;
    const next = clamp(mapping.int ? Math.round(parsed) : parsed, limits.min, limits.max);
    if (next !== value) onChange(next);
  };

  const onNumberKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      commit();
    } else if (e.key === "Escape") {
      setDraft(null);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      setDraft(null);
      const next = mapping.nudge(value, e.key === "ArrowUp" ? 1 : -1, e.shiftKey);
      if (next !== value) onChange(next);
    }
  };

  const restore = () => {
    if (defaultValue !== undefined && !disabled) onChange(defaultValue);
  };

  return (
    <div className="slider" data-changed={changed || undefined} title={hint === undefined ? undefined : hint + restoreHint}>
      <label className="slider-label" htmlFor={id}>{label}</label>
      <input
        id={id} type="range" className="range" aria-label={name} aria-valuetext={spoken} disabled={disabled}
        min={range.min} max={range.max} step={range.step} value={pos}
        ref={(el) => {
          el?.style.setProperty("--pos", `${percent}%`);
          if (track !== undefined) el?.style.setProperty("--track", track);
        }}
        data-track={track === undefined ? undefined : "custom"}
        onChange={(e) => { onChange(mapping.fromRange(Number(e.target.value))); }}
        onDoubleClick={restore}
        onKeyDown={(e) => { if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); restore(); } }}
      />
      <span className="num">
        {prefix === undefined ? null : <span className="num-affix" aria-hidden="true">{prefix}</span>}
        <input
          type="text" inputMode="decimal" autoComplete="off" spellCheck={false} disabled={disabled}
          aria-label={`${name} value${unit === undefined ? "" : `, ${unit}`}`}
          value={draft ?? text}
          onFocus={(e) => { e.currentTarget.select(); }}
          onChange={(e) => { setDraft(e.target.value); }}
          onBlur={commit} onKeyDown={onNumberKey}
        />
        {unit === undefined ? null : <span className="num-affix" aria-hidden="true">{unit}</span>}
      </span>
    </div>
  );
}

// ---- switch, select, segmented ---------------------------------------------------

export function Switch({ label, checked, onChange, hint, disabled, bare }: {
  label: string; checked: boolean; onChange: (on: boolean) => void; hint?: string; disabled?: boolean;
  /** Hides the visible label. The name stays for assistive technology. */
  bare?: boolean;
}) {
  const name = useName(label);
  return (
    <label className="switch" title={hint} data-bare={bare || undefined}>
      <input type="checkbox" role="switch" aria-label={name} checked={checked} disabled={disabled}
        onChange={(e) => { onChange(e.target.checked); }} />
      <span className="switch-track" aria-hidden="true" />
      {bare ? null : <span className="switch-label">{label}</span>}
    </label>
  );
}

export interface Option<T extends string> { readonly value: T; readonly label: string }

export function Select<T extends string>({ label, value, options, onChange, hint, disabled }: {
  label: string; value: T | ""; options: readonly Option<T>[]; onChange: (value: T) => void; hint?: string; disabled?: boolean;
}) {
  const id = useId();
  const name = useName(label);
  return (
    <div className="row" title={hint}>
      <label className="row-label" htmlFor={id}>{label}</label>
      <select id={id} aria-label={name} value={value} disabled={disabled}
        onChange={(e) => {
          const picked = options.find((o) => o.value === e.target.value);
          if (picked !== undefined) onChange(picked.value);
        }}>
        {value === "" ? <option value="" disabled>Custom</option> : null}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

/** Radio buttons drawn as a row of chips. The arrow keys move between them, as the browser gives for free. */
export function Segmented<T extends string>({ label, value, options, onChange, marked, hint, hideLabel }: {
  label: string; value: T | null; options: readonly Option<T>[]; onChange: (value: T) => void;
  /** The option to flag as edited. */
  marked?: T | null; hint?: string; hideLabel?: boolean;
}) {
  const group = useId();
  const name = useName(label);
  return (
    <fieldset className="segmented" title={hint} aria-label={name}>
      <legend className={hideLabel ? "sr-only" : "row-label"}>{label}</legend>
      <div className="chips">
        {options.map((o) => (
          <label key={o.value} className="chip" data-marked={marked === o.value || undefined}>
            <input type="radio" name={group} value={o.value} checked={value === o.value} onChange={() => { onChange(o.value); }} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ---- colour ---------------------------------------------------------------------

const HEX = /^#?[0-9a-fA-F]{6}$/;

/** A colour picker with its hex beside it, editable for a value copied from elsewhere. */
export function ColorField({ label, value, onChange, hint }: {
  label: string; value: string; onChange: (hex: string) => void; hint?: string;
}) {
  const id = useId();
  const name = useName(label);
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const trimmed = draft.trim();
    if (HEX.test(trimmed)) {
      const hex = (trimmed.startsWith("#") ? trimmed : `#${trimmed}`).toLowerCase();
      if (hex !== value) onChange(hex);
    }
  };
  return (
    <div className="row" title={hint}>
      <label className="row-label" htmlFor={id}>{label}</label>
      <span className="color">
        <input id={id} type="color" aria-label={name} value={value} onChange={(e) => { onChange(e.target.value); }} />
        <input type="text" className="hex" spellCheck={false} autoComplete="off" aria-label={`${name} hex`}
          value={draft ?? value}
          onFocus={(e) => { e.currentTarget.select(); }}
          onChange={(e) => { setDraft(e.target.value); }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); else if (e.key === "Escape") setDraft(null); }} />
      </span>
    </div>
  );
}

// ---- layout ---------------------------------------------------------------------

/** A group of related controls under a small heading. */
export function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="group" role="group" aria-label={title}>
      {title === undefined ? null : <h3 className="subhead">{title}</h3>}
      {children}
    </div>
  );
}

/** Controls that are rarely touched, folded by default. */
export function Fold({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="fold" open={open}>
      <summary><Icon name="chevron" />{title}</summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

export function Note({ children, tone }: { children: ReactNode; tone?: "warn" }) {
  return <p className="note" data-tone={tone}>{children}</p>;
}
