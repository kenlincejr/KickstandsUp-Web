// The app's planner control language, ported to the web as reusable pieces:
//
//   Toolbar        — flat paper header bar: left exit (ink) / centred Bebas
//                    uppercase title / right forward action (brass).
//   ControlPalette — the floating cream rail of circular icon buttons with
//                    uppercase micro-labels, a moss check badge on anything
//                    already placed, and a hairline-separated footer row of
//                    outlined circular secondary actions in rust.
//   SummaryBar     — the collapsible bottom strip ("Itinerary · 5 points ·
//                    54 mi · 1h 1m ⌄").
//
// Glyphs are the same drawings as the app's `route-add-controls.tsx`: an
// octagon means STOP to anyone who has ever driven, a road running to the
// horizon means the route carries on through, and a checkered flag needs no
// explanation. State is carried by SOLID colour, never transparency — a
// control floating over a map must never read as see-through.
import type { ReactNode } from 'react';
import { joinClass } from './day-kit';

/* ----------------------------------------------------------------- toolbar */

export function Toolbar({ lead, title, trail, meta }: {
  /** Left slot — the exit. Painted ink, never rust: leaving is not the forward action. */
  lead?: ReactNode;
  title: string;
  /** Right slot — the forward action. Painted brass. */
  trail?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="ksu-toolbar">
      <div className="ksu-toolbar-slot lead">{lead}</div>
      <h1 className="ksu-toolbar-title">{title}</h1>
      <div className="ksu-toolbar-slot trail">{trail}</div>
      {meta ? <p className="ksu-toolbar-meta">{meta}</p> : null}
    </header>
  );
}

export function ToolbarAction({ side, onClick, disabled, children, href }: {
  side: 'lead' | 'trail';
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  href?: string;
}) {
  if (href) return <a className={`ksu-toolbar-action ${side}`} href={href}>{children}</a>;
  return <button className={`ksu-toolbar-action ${side}`} disabled={disabled} onClick={onClick} type="button">{children}</button>;
}

/* -------------------------------------------------------- control palette */

export type PaletteTone = 'ink' | 'rust' | 'moss';

export type PaletteItem = {
  id: string;
  /** Uppercase micro-label under the disc. Keep it to one short word or two. */
  caption: string;
  glyph: ReactNode;
  tone: PaletteTone;
  /** Armed / currently the active mode. */
  active?: boolean;
  /** Already placed — wears the moss check badge. */
  done?: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
};

export type PaletteQuietItem = {
  id: string;
  caption: string;
  glyph: ReactNode;
  disabled?: boolean;
  label: string;
  onPress: () => void;
};

export function ControlPalette({ items, quiet, label = 'Route building controls', className }: {
  items: readonly PaletteItem[];
  quiet?: readonly PaletteQuietItem[];
  label?: string;
  className?: string;
}) {
  return (
    <div className={joinClass('ksu-palette-anchor', className)}>
      <div aria-label={label} className="ksu-palette" role="group">
        {items.map((item) => (
          <button
            aria-label={item.label}
            aria-pressed={Boolean(item.active)}
            className="ksu-palette-item"
            disabled={item.disabled}
            key={item.id}
            onClick={item.onPress}
            type="button"
          >
            <span className="ksu-disc-halo">
              <span className={`ksu-disc ksu-disc-${item.tone}`}>
                {item.glyph}
                {item.done ? <span className="ksu-disc-tick"><CheckGlyph size={12} /></span> : null}
              </span>
            </span>
            <span className="ksu-disc-caption">{item.caption}</span>
          </button>
        ))}
        {quiet && quiet.length ? (
          <>
            <span aria-hidden="true" className="ksu-palette-divider" />
            <div className="ksu-palette-foot">
              {quiet.map((item) => (
                <button
                  aria-label={item.label}
                  className="ksu-palette-item"
                  disabled={item.disabled}
                  key={item.id}
                  onClick={item.onPress}
                  type="button"
                >
                  <span className="ksu-disc-halo"><span className="ksu-disc">{item.glyph}</span></span>
                  <span className="ksu-disc-caption">{item.caption}</span>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- summary bar */

export function SummaryBar({ summary, open, onToggle, children, controlsId = 'ksu-summary-body' }: {
  summary: ReactNode;
  open: boolean;
  onToggle: () => void;
  children?: ReactNode;
  controlsId?: string;
}) {
  return (
    <section className="ksu-summary">
      <button aria-controls={controlsId} aria-expanded={open} className="ksu-summary-bar" onClick={onToggle} type="button">
        <span>{summary}</span>
        <span aria-hidden="true" className="ksu-summary-caret">▼</span>
      </button>
      {open ? <div className="ksu-summary-body" id={controlsId}>{children}</div> : null}
    </section>
  );
}

/* ------------------------------------------------------------------ glyphs */

const strokeProps = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function Glyph({ size, children }: { size: number; children: ReactNode }) {
  return <svg aria-hidden="true" focusable="false" height={size} viewBox="0 0 32 32" width={size}>{children}</svg>;
}

/** A road-sign octagon. A pin means "a location", which is every point here. */
export function StopGlyph({ size = 26 }: { size?: number }) {
  return <Glyph size={size}><polygon {...strokeProps} points="28.01,20.98 20.98,28.01 11.02,28.01 3.99,20.98 3.99,11.02 11.02,3.99 20.98,3.99 28.01,11.02" strokeWidth={2.4} /></Glyph>;
}

/** Two road edges narrowing to the horizon with a dashed centreline. */
export function RoadGlyph({ size = 26 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path {...strokeProps} d="M6.5 29.5 C 8.5 21, 13.5 18, 13.5 3" strokeWidth={2.2} />
      <path {...strokeProps} d="M21.5 29.5 C 21 21, 19 18, 19 3" strokeWidth={2.2} />
      <path {...strokeProps} d="M14.2 28 L 16.4 4" strokeDasharray="3.4 3.6" strokeWidth={1.8} />
    </Glyph>
  );
}

/** A start pennant: the flag that drops when the ride leaves. */
export function StartGlyph({ size = 26 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path {...strokeProps} d="M10 28 V4.5" strokeWidth={2.4} />
      <polygon fill="currentColor" points="10,6 25,10.5 10,15" />
    </Glyph>
  );
}

/** The finish flag is checkered — no rider needs that explained. */
export function FinishGlyph({ size = 26 }: { size?: number }) {
  const cell = 3.75;
  const squares: Array<{ x: number; y: number }> = [];
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      if ((row + column) % 2 === 0) squares.push({ x: 10 + column * cell, y: 5.5 + row * cell });
    }
  }
  return (
    <Glyph size={size}>
      <path {...strokeProps} d="M10 28 V4.5" strokeWidth={2.4} />
      <rect {...strokeProps} height={cell * 3} strokeWidth={1.4} width={cell * 4} x={10} y={5.5} />
      {squares.map((square) => <rect fill="currentColor" height={cell} key={`${square.x}-${square.y}`} width={cell} x={square.x} y={square.y} />)}
    </Glyph>
  );
}

export function UndoGlyph({ size = 20 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path {...strokeProps} d="M12 7 L 6 13 L 12 19" strokeWidth={2.4} />
      <path {...strokeProps} d="M6 13 H 19 C 23.5 13, 26 16, 26 19.5 C 26 23, 23.5 25.5, 19 25.5 H 14" strokeWidth={2.4} />
    </Glyph>
  );
}

export function ClearGlyph({ size = 20 }: { size?: number }) {
  return <Glyph size={size}><path {...strokeProps} d="M9 9 L 23 23 M23 9 L 9 23" strokeWidth={2.6} /></Glyph>;
}

export function PlusGlyph({ size = 22 }: { size?: number }) {
  return <Glyph size={size}><path {...strokeProps} d="M16 7 V25 M7 16 H25" strokeWidth={2.6} /></Glyph>;
}

export function CheckGlyph({ size = 20 }: { size?: number }) {
  return <Glyph size={size}><path {...strokeProps} d="M7 17 L 13.5 23.5 L 25 9" strokeWidth={5} /></Glyph>;
}

export function DayGlyph({ size = 26 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <rect {...strokeProps} height={20} rx={3} strokeWidth={2.2} width={22} x={5} y={7} />
      <path {...strokeProps} d="M5 13 H27 M11 4 V9 M21 4 V9" strokeWidth={2.2} />
    </Glyph>
  );
}
