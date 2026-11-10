import type { Units } from './api';

// Bar convention: 1 oz = 30 ml, which keeps converted recipes on round numbers.
const ML: Record<string, number> = { oz: 30, ml: 1, cl: 10, tsp: 5, tbsp: 15, cup: 240, shot: 45 };
// Rough volumes, used only for batch totals.
const ML_APPROX: Record<string, number> = { ...ML, barspoon: 5, dash: 1, splash: 7 };

const PLURAL: Record<string, string> = {
  dash: 'dashes',
  drop: 'drops',
  barspoon: 'barspoons',
  part: 'parts',
  splash: 'splashes',
  pinch: 'pinches',
  leaf: 'leaves',
  sprig: 'sprigs',
  slice: 'slices',
  wedge: 'wedges',
  cup: 'cups',
  shot: 'shots',
};

export const UNIT_LABELS: Record<string, string> = {
  '': '—',
  top: 'top with',
};

const EIGHTHS = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'];

/** 1.5 -> "1½", 0.333 -> "⅓", 2 -> "2" */
export function fraction(value: number): string {
  if (!Number.isFinite(value)) return '';
  const whole = Math.floor(value + 1e-9);
  const rest = value - whole;
  const join = (glyph: string) => (whole ? `${whole}${glyph}` : glyph);
  if (Math.abs(rest - 1 / 3) < 0.02) return join('⅓');
  if (Math.abs(rest - 2 / 3) < 0.02) return join('⅔');
  const eighths = Math.round(rest * 8);
  if (eighths === 8) return String(whole + 1);
  if (eighths === 0) return whole ? String(whole) : value > 0 ? '⅛' : '0';
  return join(EIGHTHS[eighths]);
}

const trim = (value: number, digits: number) => String(Number(value.toFixed(digits)));

function metric(ml: number): { qty: string; unit: string } {
  if (ml >= 1000) return { qty: trim(ml / 1000, 2), unit: 'L' };
  const step = ml < 60 ? 2.5 : 5;
  const rounded = Math.max(step, Math.round(ml / step) * step);
  return { qty: trim(ml < 2 ? ml : rounded, 1), unit: 'ml' };
}

export interface Shown {
  qty: string;
  unit: string;
  /** e.g. "1½ cups" next to a large number of ounces */
  aside: string;
}

export function showAmount(
  amount: number | null,
  unit: string,
  units: Units,
  multiply = 1,
): Shown {
  if (amount === null) return { qty: '', unit: unit === 'top' ? 'top with' : unit, aside: '' };
  const value = amount * multiply;

  if (unit in ML) {
    const ml = value * ML[unit];
    if (units === 'ml') return { ...metric(ml), aside: '' };
    // In ounce mode, kitchen measures stay as written; metric ones are converted.
    if (unit === 'oz' || unit === 'ml' || unit === 'cl') {
      const oz = ml / 30;
      const aside = oz >= 8 ? `${fraction(oz / 8)} ${oz / 8 > 1 ? 'cups' : 'cup'}` : '';
      return { qty: fraction(oz), unit: 'oz', aside };
    }
  }
  const label = value > 1 && PLURAL[unit] ? PLURAL[unit] : unit;
  return { qty: fraction(value), unit: label, aside: '' };
}

/** Total liquid in one serving, in ml. Garnishes and "top with" are left out. */
export function totalMl(ingredients: { amount: number | null; unit: string }[]): number {
  return ingredients.reduce(
    (sum, i) => sum + (i.amount !== null && i.unit in ML_APPROX ? i.amount * ML_APPROX[i.unit] : 0),
    0,
  );
}

export function showVolume(ml: number, units: Units): string {
  if (units === 'ml') {
    const m = metric(ml);
    return `${m.qty} ${m.unit}`;
  }
  const oz = ml / 30;
  return oz >= 16 ? `${fraction(oz)} oz (${fraction(oz / 8)} cups)` : `${fraction(oz)} oz`;
}

const GLYPHS: Record<string, number> = {
  '½': 0.5,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 0.25,
  '¾': 0.75,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
};

/** Read what someone typed into an amount box: "1 1/2", "3/4", "1.5", "1½". */
export function parseAmount(text: string): number | null | undefined {
  let t = text.trim();
  if (!t) return null;
  let extra = 0;
  const glyph = t.slice(-1);
  if (glyph in GLYPHS) {
    extra = GLYPHS[glyph];
    t = t.slice(0, -1).trim();
    if (!t) return extra;
  }
  let m = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (m && Number(m[3])) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = /^(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (m && Number(m[2])) return Number(m[1]) / Number(m[2]);
  if (/^(\d+\.?\d*|\.\d+)$/.test(t)) return Number(t) + extra;
  return undefined; // not a number
}

/** The reverse, for filling an amount box: 0.75 -> "3/4", 1.5 -> "1 1/2". */
export function amountToText(amount: number | null): string {
  if (amount === null) return '';
  const whole = Math.floor(amount + 1e-9);
  const rest = amount - whole;
  if (rest < 0.005) return String(whole);
  for (const [n, d] of [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 8], [3, 8], [5, 8], [7, 8]]) {
    if (Math.abs(rest - n / d) < 0.005) return `${whole ? `${whole} ` : ''}${n}/${d}`;
  }
  return trim(amount, 3);
}
