import type { CustomColours } from '../shared/themes';

export type Units = 'oz' | 'ml';
export type Status = 'none' | 'in' | 'low' | 'out';
export type BottleStatus = 'in' | 'low' | 'out';

export interface Config {
  barName: string;
  tagline: string;
  units: Units;
  logo: string;
  tvInterval: number;
  tvMessage: string;
  tvBackground: string;
  tvLogoSlide: boolean;
  tvBoardSlide: boolean;
  tvAllDrinks: boolean;
  tvAnnouncement: string;
  theme: string;
  themeCustom: CustomColours;
  needsSetup: boolean;
}

export interface User {
  id: number;
  username: string;
}

export interface MenuIngredient {
  name: string;
  amount: number | null;
  unit: string;
  note: string;
  optional: boolean;
  available: boolean;
  have: string[];
}

export interface MenuRecipe {
  slug: string;
  title: string;
  description: string;
  image: string | null;
  glass: string;
  featured: boolean;
  baseSpirit: string | null;
  categories: string[];
  tags: string[];
  steps: string[];
  ingredients: MenuIngredient[];
}

export interface Menu {
  recipes: MenuRecipe[];
  categories: string[];
}

export interface BarGroup {
  kind: string;
  label: string;
  items: { name: string; bottles: string[] }[];
}

export interface Bottle {
  id: number;
  name: string;
  status: BottleStatus;
  notes: string;
}

export interface IngType {
  id: number;
  name: string;
  kind: string;
  parentId: number | null;
  status: Status;
  alwaysAvailable: boolean;
  effectiveStatus: Status;
  available: boolean;
  recipeCount: number;
  bottles: Bottle[];
}

export interface Kind {
  key: string;
  label: string;
}

export interface TypesResponse {
  types: IngType[];
  kinds: Kind[];
  units: string[];
}

export interface AdminIngredient {
  typeId: number;
  bottleId: number | null;
  amount: number | null;
  unit: string;
  note: string;
  optional: boolean;
}

export interface AdminRecipe {
  id: number;
  slug: string;
  title: string;
  description: string;
  image: string | null;
  glass: string;
  sourceUrl: string;
  featured: boolean;
  hidden: boolean;
  steps: string[];
  categories: string[];
  tags: string[];
  available: boolean;
  missing: string[];
  baseSpirit: string | null;
  ingredients: AdminIngredient[];
}

export interface DraftIngredient {
  raw: string;
  amount: number | null;
  unit: string;
  note: string;
  optional: boolean;
  typeId: number | null;
  suggestedName: string;
}

export interface Draft {
  title: string;
  description: string;
  image: string;
  steps: string[];
  tags: string[];
  sourceUrl: string;
  ingredients: DraftIngredient[];
}

export interface ShoppingItem {
  key: string;
  bottleId: number | null;
  typeId: number;
  name: string;
  typeName: string;
  kind: string;
  status: 'low' | 'out';
  covered: boolean;
  usedIn: number;
}

export interface Shopping {
  items: ShoppingItem[];
  oneAway: { typeId: number; name: string; recipes: string[] }[];
}

export interface Settings {
  bar_name: string;
  tagline: string;
  units: Units;
  logo: string;
  icon192: string;
  icon512: string;
  public_url: string;
  tv_interval: string;
  tv_message: string;
  tv_background: string;
  tv_logo_slide: string;
  tv_board_slide: string;
  tv_all_drinks: string;
  tv_announcement: string;
  theme: string;
  /** JSON text when read; send an object when saving. */
  theme_custom: string | CustomColours;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin' };
  if (body instanceof Blob) {
    init.body = body;
    init.headers = { 'Content-Type': body.type || 'application/octet-stream' };
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiError(0, 'Could not reach the bar server. Check your connection.');
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${response.status}).`;
    if (response.status === 401 && url.startsWith('/api/admin')) {
      window.dispatchEvent(new Event('bar:signed-out'));
    }
    throw new ApiError(response.status, message);
  }
  return data as T;
}

export const get = <T,>(url: string) => api<T>('GET', url);
