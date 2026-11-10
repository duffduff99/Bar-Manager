import { useEffect, type ReactNode } from 'react';
import type { Status } from '../api';
import { useApp } from '../app';

/** The atomic-age star used as the app's decorative mark. */
export function Starburst({ className = '' }: { className?: string }) {
  const { motif } = useApp();
  if (motif === 'snow') {
    // Six arms, each with two pairs of side branches.
    const arm = 'M50 50 V6 M50 18 L41 9 M50 18 L59 9 M50 31 L40 21 M50 31 L60 21';
    return (
      <svg className={`starburst ${className}`} viewBox="0 0 100 100" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round">
          {[0, 60, 120, 180, 240, 300].map((angle) => (
            <path key={angle} d={arm} transform={`rotate(${angle} 50 50)`} />
          ))}
        </g>
      </svg>
    );
  }
  const rays = [];
  for (let i = 0; i < 8; i++) {
    const long = i % 2 === 0;
    rays.push(
      <path
        key={i}
        d={long ? 'M50 2 L53.5 50 L50 98 L46.5 50 Z' : 'M50 18 L52.5 50 L50 82 L47.5 50 Z'}
        transform={`rotate(${i * 22.5} 50 50)`}
      />,
    );
  }
  return (
    <svg className={`starburst ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      <g fill="currentColor">{rays}</g>
      <circle cx="50" cy="50" r="5" fill="currentColor" />
    </svg>
  );
}

// Background, line and accent for the stand-in artwork, all taken from the theme.
const PALETTES = [
  ['var(--highlight)', 'var(--on-highlight)', 'var(--accent)'],
  ['var(--primary)', 'var(--on-primary)', 'var(--accent)'],
  ['var(--accent)', 'var(--on-accent)', 'var(--primary)'],
  ['var(--art)', 'var(--on-art)', 'var(--accent)'],
  ['var(--header-deep)', 'var(--on-header)', 'var(--accent)'],
  ['var(--header)', 'var(--on-header)', 'var(--primary)'],
];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/** Stand-in artwork for drinks without a photo: a glass on a coloured field. */
export function DrinkArt({ title, glass }: { title: string; glass: string }) {
  const h = hash(title);
  const [bg, line, accent] = PALETTES[h % PALETTES.length];
  const g = glass.toLowerCase();
  const shape = /coupe|martini|nick|flute|wine/.test(g)
    ? 'coupe'
    : /highball|collins|tall|mug|hurricane|pint/.test(g)
      ? 'tall'
      : 'rocks';
  const flip = h % 2 === 0;

  return (
    <svg className="drink-art" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="400" height="300" style={{ fill: bg }} />
      <ellipse cx={flip ? 95 : 305} cy="215" rx="150" ry="62" style={{ fill: accent }} opacity="0.2" transform={`rotate(${flip ? -24 : 24} ${flip ? 95 : 305} 215)`} />
      <g transform={`translate(${flip ? 268 : 52} 36) scale(0.8)`} style={{ color: accent }}>
        <g fill="currentColor">
          {[0, 45, 90, 135].map((a) => (
            <path key={a} d="M50 2 L53 50 L50 98 L47 50 Z" transform={`rotate(${a} 50 50)`} />
          ))}
        </g>
      </g>
      <g fill="none" style={{ stroke: line }} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
        {shape === 'coupe' && (
          <>
            <path d="M138 96 H262 A62 56 0 0 1 138 96 Z" style={{ fill: line }} fillOpacity="0.16" />
            <path d="M200 152 V228 M168 230 H232" />
            <circle cx="232" cy="92" r="9" style={{ fill: accent, stroke: 'none' }} />
          </>
        )}
        {shape === 'tall' && (
          <>
            <path d="M166 70 H234 L228 228 H172 Z" style={{ fill: line }} fillOpacity="0.16" />
            <path d="M170 112 H230" strokeWidth="3" opacity="0.7" />
            <path d="M214 46 L204 150" strokeWidth="4" style={{ stroke: accent }} />
          </>
        )}
        {shape === 'rocks' && (
          <>
            <path d="M150 116 H250 L242 226 H158 Z" style={{ fill: line }} fillOpacity="0.16" />
            <rect x="176" y="150" width="42" height="42" rx="5" strokeWidth="3" opacity="0.8" transform="rotate(-10 197 171)" />
            <path d="M154 146 H246" strokeWidth="3" opacity="0.7" />
          </>
        )}
      </g>
    </svg>
  );
}

export function DrinkImage({ image, title, glass }: { image: string | null; title: string; glass: string }) {
  return image ? (
    <img className="drink-photo" src={image} alt="" loading="lazy" />
  ) : (
    <DrinkArt title={title} glass={glass} />
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', key);
    document.body.classList.add('modal-open');
    return () => {
      document.removeEventListener('keydown', key);
      document.body.classList.remove('modal-open');
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide ? 'modal modal-wide' : 'modal'} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

const STATUS_LABELS: [Exclude<Status, 'none'>, string][] = [
  ['in', 'In'],
  ['low', 'Low'],
  ['out', 'Out'],
];

/** The three-way stock switch used for stocktaking. */
export function StatusToggle({
  value,
  onChange,
  label,
}: {
  value: Status;
  onChange: (status: Exclude<Status, 'none'>) => void;
  label: string;
}) {
  return (
    <div className="status-toggle" role="group" aria-label={`Stock for ${label}`}>
      {STATUS_LABELS.map(([status, text]) => (
        <button
          key={status}
          type="button"
          className={value === status ? `is-${status} active` : `is-${status}`}
          aria-pressed={value === status}
          onClick={() => value !== status && onChange(status)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function Loading() {
  return (
    <div className="loading" role="status">
      <Starburst className="spin" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Starburst />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
