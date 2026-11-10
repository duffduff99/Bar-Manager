export interface ThemeBase {
  key: string;
  name: string;
  group: string;
  dark: boolean;
  grain: number;
  motif: 'burst' | 'snow';
  bg: string;
  paper: string;
  field: string;
  line: string;
  ink: string;
  inkSoft: string;
  heading: string;
  header: string;
  headerDeep: string;
  accent: string;
  primary: string;
  highlight: string;
  art: string;
}

export interface ResolvedTheme extends ThemeBase {
  onHeader: string;
  onHeaderSoft: string;
  onAccent: string;
  onPrimary: string;
  onHighlight: string;
  onArt: string;
  primaryHover: string;
  link: string;
  qty: string;
  hover: string;
  accentTint: string;
  highlightTint: string;
}

export type CustomColours = Partial<Record<'header' | 'accent' | 'primary' | 'highlight' | 'bg', string>>;

export const CUSTOM_KEYS: (keyof CustomColours)[];
export const THEMES: ThemeBase[];
export function mix(a: string, b: string, amount: number): string;
export function luminance(colour: string): number;
export function cleanCustom(custom: unknown): CustomColours;
export function parseCustom(text: string): CustomColours;
export function resolveTheme(key: string, custom?: CustomColours): ResolvedTheme;
export function themeVariables(theme: ResolvedTheme): Record<string, string>;
