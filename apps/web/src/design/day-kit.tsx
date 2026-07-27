// The KSU day-kit for the web — the React half of the design system.
//
// These mirror the installed app's `src/components/day/day-kit.tsx` API so a
// rider crossing from the phone to rideksu.com meets the same visual and
// interaction language. Paint lives in `day-kit.css`; nothing here carries an
// inline colour.
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { nextActiveIndex, type SelectKey } from './select-keyboard';
import type { ButtonVariant, StampTone } from './tokens';

/* -------------------------------------------------------------- primitives */

/**
 * The one chip language for the whole product.
 * moss = confirmed/ready · brass = context · rust = action-needed · neutral = fact.
 */
export function StampChip({ label, tone = 'neutral', className }: { label: string; tone?: StampTone; className?: string }) {
  return <span className={joinClass('ksu-chip', tone !== 'neutral' && `ksu-chip-${tone}`, className)}>{label}</span>;
}

/** Section header: uppercase brass label + hairline + bolt-head tick. */
export function RibbonRule({ label, className }: { label: string; className?: string }) {
  return (
    <div className={joinClass('ksu-ribbon', className)}>
      <span className="ksu-ribbon-label">{label}</span>
      <span className="ksu-ribbon-line" aria-hidden="true" />
      <span className="ksu-ribbon-bolt" aria-hidden="true" />
    </div>
  );
}

/** The only sanctioned dark surface on a day-mode screen. */
export function Plaque({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={joinClass('ksu-plaque', className)}>
      <div className="ksu-plaque-inner">{children}</div>
    </div>
  );
}

/**
 * The premium mark: a small brass diamond, inline with the label of a premium
 * capability. Deliberately NOT a StampChip — chips are loud and already carry
 * status. Placement rules from the app, and they are what keep it subtle:
 *
 *   1. Mark the ENTRY POINT to a premium capability, never the controls
 *      inside it. The trip planner entry gets one; the fields within get none.
 *   2. One per row, maximum.
 *   3. A lock is not a diamond. The lock marks what you don't have yet.
 *   4. On a map, one mark on a layer or control cluster — never per marker.
 *   5. Never on a destructive or committing action (Save, Publish, Delete).
 *      The diamond is provenance, not decoration.
 *
 * Drawn as a rotated square rather than a '◆' codepoint: a bare glyph is
 * invisible to a screen reader and tofus on a font that lacks it. The explicit
 * label is the only thing that announces "premium" to assistive tech.
 */
export function PremiumMark({ className }: { className?: string }) {
  return <span aria-label="Premium feature" className={joinClass('ksu-premium-mark', className)} role="img" />;
}

/** Eyebrow + Bebas display title, with optional supporting copy. */
export function ScreenTitle({ eyebrow, title, children, className }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={joinClass('ksu-screen-title', className)}>
      {eyebrow ? <p className="ksu-screen-title-eyebrow">{eyebrow}</p> : null}
      <h1 className="ksu-screen-title-text">{title}</h1>
      {children ? <p className="ksu-screen-title-sub">{children}</p> : null}
    </div>
  );
}

/* ----------------------------------------------------------------- buttons */

type ButtonProps = {
  variant?: ButtonVariant;
  block?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>;

/** primary = rust (the one forward action) · secondary = card+line · text = brass · danger = rust outline. */
export function Button({ variant = 'secondary', block, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button className={joinClass('ksu-btn', `ksu-btn-${variant}`, block && 'ksu-btn-block', className)} type={type} {...rest}>
      {children}
    </button>
  );
}

export function buttonClass(variant: ButtonVariant = 'secondary', block = false): string {
  return joinClass('ksu-btn', `ksu-btn-${variant}`, block && 'ksu-btn-block');
}

/* -------------------------------------------------------------- notice strip */

export function Notice({ tone = 'info', children, role }: { tone?: 'info' | 'success' | 'error'; children: ReactNode; role?: 'alert' | 'status' }) {
  return <div className={`ksu-notice ksu-notice-${tone}`} role={role ?? (tone === 'error' ? 'alert' : 'status')}>{children}</div>;
}

/* ------------------------------------------------------------------- forms */

export function Field({ label, hint, error, htmlFor, children, className }: { label?: string; hint?: ReactNode; error?: ReactNode; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={joinClass('ksu-field', className)}>
      {label ? <label className="ksu-field-label" htmlFor={htmlFor}>{label}</label> : null}
      {children}
      {hint ? <small className="ksu-field-hint">{hint}</small> : null}
      {error ? <small className="ksu-field-error">{error}</small> : null}
    </div>
  );
}

type TextInputProps = { label?: string; hint?: ReactNode; suffix?: string; className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>;

export function TextInput({ label, hint, suffix, className, id, ...rest }: TextInputProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const input = <input className="ksu-input" id={inputId} {...rest} />;
  return (
    <Field className={className} hint={hint} htmlFor={inputId} label={label}>
      {suffix ? <div className="ksu-input-suffix">{input}<span>{suffix}</span></div> : input}
    </Field>
  );
}

type TextAreaProps = { label?: string; hint?: ReactNode; className?: string } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>;

export function TextArea({ label, hint, className, id, ...rest }: TextAreaProps) {
  const generated = useId();
  const areaId = id ?? generated;
  return (
    <Field className={className} hint={hint} htmlFor={areaId} label={label}>
      <textarea className="ksu-textarea" id={areaId} {...rest} />
    </Field>
  );
}

export type SelectOption = { value: string; label: string; disabled?: boolean };

/**
 * The ONE dropdown. Native `<select>` chrome is browser-default and does not
 * belong on a day-mode surface (and the app's standing rule is that option
 * rows become a proper dropdown select, never a row of pills). Implemented as
 * a listbox so the paint is ours while the keyboard contract stays the
 * platform one: ↑/↓/Home/End move, Enter/Space commit, Escape closes.
 */
export function Select({ label, hint, options, value, onChange, placeholder = 'Choose', disabled, className, id }: {
  label?: string;
  hint?: ReactNode;
  options: readonly SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const generated = useId();
  const buttonId = id ?? generated;
  const listId = `${buttonId}-list`;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  useEffect(() => {
    if (!open) return;
    const onDocumentDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocumentDown);
    return () => document.removeEventListener('mousedown', onDocumentDown);
  }, [open]);

  const openMenu = () => {
    if (disabled) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const commit = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const key = event.key as SelectKey;
    if (key === 'Escape') { setOpen(false); return; }
    if (!open) {
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === ' ') { event.preventDefault(); openMenu(); }
      return;
    }
    if (key === 'Enter' || key === ' ') { event.preventDefault(); commit(activeIndex); return; }
    const next = nextActiveIndex(activeIndex, options.length, key);
    if (next !== null) { event.preventDefault(); setActiveIndex(next); }
  };

  return (
    <Field className={className} hint={hint} label={label}>
      <div className="ksu-select" ref={rootRef}>
        <button
          aria-controls={open ? listId : undefined}
          aria-expanded={open}
          aria-haspopup="listbox"
          className={joinClass('ksu-select-button', !selected && 'placeholder')}
          disabled={disabled}
          id={buttonId}
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={onKeyDown}
          type="button"
        >
          <span>{selected ? selected.label : placeholder}</span>
          <span aria-hidden="true" className="ksu-select-caret">{open ? '▲' : '▼'}</span>
        </button>
        {open ? (
          <ul aria-labelledby={buttonId} className="ksu-select-menu" id={listId} role="listbox" tabIndex={-1}>
            {options.map((option, index) => (
              <li
                aria-disabled={option.disabled || undefined}
                aria-selected={option.value === value}
                className={joinClass('ksu-select-option', index === activeIndex && 'active')}
                key={option.value}
                onClick={() => commit(index)}
                onMouseEnter={() => setActiveIndex(index)}
                role="option"
              >
                {option.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Field>
  );
}

/** The checkbox replacement: a labelled switch, moss when on (= confirmed). */
export function Toggle({ label, hint, checked, onChange, disabled, className }: {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={joinClass('ksu-toggle', className)}>
      <span className="ksu-toggle-copy">
        <b>{label}</b>
        {hint ? <small>{hint}</small> : null}
      </span>
      <input
        checked={checked}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span aria-hidden="true" className="ksu-toggle-switch" />
    </label>
  );
}

/* ------------------------------------------------------------------ helper */

export function joinClass(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
