// Colour themes, shared by the server (app manifest colours) and the web app.
// A theme is a handful of base colours; everything else is worked out from them.

/** The colours someone can override on top of a theme in Settings. */
export const CUSTOM_KEYS = ['header', 'accent', 'primary', 'highlight', 'bg'];

export const THEMES = [
  {
    key: 'classic', name: 'Walnut', group: 'Everyday', dark: false, grain: 1, motif: 'burst',
    bg: '#f4ead8', paper: '#fbf5e9', field: '#ffffff', line: '#e1d3b8', ink: '#2b2118', inkSoft: '#6b5b4b',
    heading: '#4a2f1d', header: '#5b3a24', headerDeep: '#3a2416',
    accent: '#d9a441', primary: '#c8553d', highlight: '#2f6f73', art: '#7a8450',
  },
  {
    key: 'lounge', name: 'Teal Lounge', group: 'Everyday', dark: false, grain: 0, motif: 'burst',
    bg: '#f2efe4', paper: '#fbf9f2', field: '#ffffff', line: '#dbd6c3', ink: '#1f2a2b', inkSoft: '#5c6a6a',
    heading: '#1c474b', header: '#23595e', headerDeep: '#123438',
    accent: '#e2a93b', primary: '#d9603f', highlight: '#2f7d82', art: '#8a8f4f',
  },
  {
    key: 'palm', name: 'Palm Springs', group: 'Everyday', dark: false, grain: 0, motif: 'burst',
    bg: '#fdf3ec', paper: '#fffaf5', field: '#ffffff', line: '#f0d9cb', ink: '#2d2a32', inkSoft: '#6f6770',
    heading: '#17635e', header: '#1e8a84', headerDeep: '#146660',
    accent: '#ffd166', primary: '#e8615e', highlight: '#1e8a84', art: '#f08fa6',
  },
  {
    key: 'midnight', name: 'Midnight', group: 'Everyday', dark: true, grain: 0, motif: 'burst',
    bg: '#12161f', paper: '#1b2130', field: '#242c3f', line: '#2f3850', ink: '#eef0f6', inkSoft: '#a2abc0',
    heading: '#f0c96b', header: '#1c2540', headerDeep: '#0b0f1a',
    accent: '#f0c96b', primary: '#e0674a', highlight: '#3f8f94', art: '#51618c',
  },
  {
    key: 'halloween', name: 'Halloween', group: 'Holidays', dark: true, grain: 0, motif: 'burst',
    bg: '#15101c', paper: '#201829', field: '#2a2036', line: '#3a2d4a', ink: '#f3ecf9', inkSoft: '#b3a4c4',
    heading: '#ff9a3c', header: '#2f1a47', headerDeep: '#120a1d',
    accent: '#ff8a1f', primary: '#8e44d6', highlight: '#4f9a33', art: '#c2410c',
  },
  {
    key: 'harvest', name: 'Thanksgiving', group: 'Holidays', dark: false, grain: 1, motif: 'burst',
    bg: '#f6ecdc', paper: '#fcf6ea', field: '#ffffff', line: '#e4d3b5', ink: '#33231a', inkSoft: '#705c4c',
    heading: '#6e2a1e', header: '#7d3020', headerDeep: '#4d1a11',
    accent: '#e3a52e', primary: '#c75b1e', highlight: '#6b7a35', art: '#a8552a',
  },
  {
    key: 'christmas', name: 'Christmas', group: 'Holidays', dark: false, grain: 0, motif: 'snow',
    bg: '#f6f1e7', paper: '#fdfaf3', field: '#ffffff', line: '#e0d8c4', ink: '#1f2a22', inkSoft: '#5d6a60',
    heading: '#14472f', header: '#185c3d', headerDeep: '#0c3421',
    accent: '#dcb650', primary: '#b8312f', highlight: '#1f6b47', art: '#8c1f1d',
  },
  {
    key: 'blacktie', name: "New Year's", group: 'Holidays', dark: true, grain: 0, motif: 'burst',
    bg: '#111111', paper: '#1b1b1b', field: '#262626', line: '#353535', ink: '#f5f1e6', inkSoft: '#a9a393',
    heading: '#dcb95f', header: '#222222', headerDeep: '#050505',
    accent: '#dcb95f', primary: '#c9a227', highlight: '#7d6a2c', art: '#4a4a4a',
  },
];

const HEX = /^#[0-9a-f]{6}$/i;

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hex = (parts) =>
  '#' + parts.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/** Blend `amount` of colour b into colour a. */
export function mix(a, b, amount) {
  const [x, y] = [rgb(a), rgb(b)];
  return hex(x.map((v, i) => v + (y[i] - v) * amount));
}

const darken = (colour, amount) => mix(colour, '#000000', amount);
const lighten = (colour, amount) => mix(colour, '#ffffff', amount);

/** Perceived brightness, 0 (black) to 1 (white). */
export function luminance(colour) {
  const [r, g, b] = rgb(colour).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const textOn = (colour) => (luminance(colour) > 0.34 ? '#231a12' : '#fbf5e9');
const alpha = (colour, a) => `rgba(${rgb(colour).join(', ')}, ${a})`;

/** Keep only well-formed colour overrides. */
export function cleanCustom(custom) {
  const out = {};
  if (custom && typeof custom === 'object') {
    for (const key of CUSTOM_KEYS) {
      if (typeof custom[key] === 'string' && HEX.test(custom[key])) out[key] = custom[key].toLowerCase();
    }
  }
  return out;
}

export function parseCustom(text) {
  try {
    return cleanCustom(JSON.parse(text || '{}'));
  } catch {
    return {};
  }
}

/** A theme plus any overrides, with every derived colour filled in. */
export function resolveTheme(key, custom = {}) {
  const base = THEMES.find((t) => t.key === key) || THEMES[0];
  const t = { ...base };
  const c = cleanCustom(custom);

  if (c.bg) {
    // A new page colour decides whether the rest of the page is light-on-dark.
    t.bg = c.bg;
    t.dark = luminance(c.bg) < 0.2;
    t.ink = t.dark ? '#f3efe8' : '#2a221c';
    t.paper = t.dark ? lighten(c.bg, 0.06) : mix(c.bg, '#ffffff', 0.55);
    t.field = t.dark ? lighten(c.bg, 0.11) : '#ffffff';
    t.line = mix(c.bg, t.ink, 0.14);
    t.inkSoft = mix(t.ink, c.bg, 0.4);
  }
  if (c.header) {
    t.header = c.header;
    t.headerDeep = darken(c.header, 0.4);
  }
  if (c.accent) t.accent = c.accent;
  if (c.primary) t.primary = c.primary;
  if (c.highlight) t.highlight = c.highlight;
  if (c.bg || c.header || c.accent) {
    // Headings sit on the page, so they need to stand out from it.
    t.heading = t.dark ? t.accent : luminance(t.header) < 0.2 ? t.header : t.ink;
  }

  t.onHeader = textOn(t.header);
  t.onHeaderSoft = mix(t.onHeader, t.accent, 0.4);
  t.onAccent = textOn(t.accent);
  t.onPrimary = luminance(t.primary) > 0.34 ? '#231a12' : '#ffffff';
  t.onHighlight = luminance(t.highlight) > 0.34 ? '#231a12' : '#ffffff';
  t.onArt = textOn(t.art);
  t.primaryHover = darken(t.primary, 0.14);
  t.link = t.dark ? lighten(t.highlight, 0.45) : darken(t.highlight, 0.2);
  t.qty = t.dark ? lighten(t.primary, 0.3) : darken(t.primary, 0.16);
  t.hover = alpha(t.ink, 0.08);
  t.accentTint = alpha(t.accent, 0.18);
  t.highlightTint = alpha(t.highlight, t.dark ? 0.3 : 0.12);
  return t;
}

/** The CSS custom properties for a resolved theme. */
export function themeVariables(t) {
  return {
    '--bg': t.bg,
    '--paper': t.paper,
    '--field': t.field,
    '--line': t.line,
    '--ink': t.ink,
    '--ink-soft': t.inkSoft,
    '--heading': t.heading,
    '--header': t.header,
    '--header-deep': t.headerDeep,
    '--on-header': t.onHeader,
    '--on-header-soft': t.onHeaderSoft,
    '--accent': t.accent,
    '--on-accent': t.onAccent,
    '--accent-tint': t.accentTint,
    '--primary': t.primary,
    '--primary-hover': t.primaryHover,
    '--on-primary': t.onPrimary,
    '--highlight': t.highlight,
    '--on-highlight': t.onHighlight,
    '--highlight-tint': t.highlightTint,
    '--link': t.link,
    '--qty': t.qty,
    '--hover': t.hover,
    '--art': t.art,
    '--on-art': t.onArt,
    '--grain': String(t.grain),
  };
}
