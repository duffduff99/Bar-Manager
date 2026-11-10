import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { resolveTheme, themeVariables, type CustomColours } from '../shared/themes';
import { get, type Config, type Menu, type Units, type User } from './api';

declare global {
  interface Window {
    __BAR__?: Config;
  }
}

const FALLBACK: Config = {
  barName: 'Home Bar',
  tagline: '',
  units: 'oz',
  logo: '',
  tvInterval: 15,
  tvMessage: 'Scan for the full menu',
  tvBackground: '',
  tvLogoSlide: true,
  tvBoardSlide: true,
  tvAllDrinks: false,
  tvAnnouncement: '',
  theme: 'classic',
  themeCustom: {},
  needsSetup: false,
};

/** Paint the page in a theme by setting the CSS variables the stylesheet reads. */
export function applyTheme(key: string, custom: CustomColours): 'burst' | 'snow' {
  const theme = resolveTheme(key, custom);
  const root = document.documentElement;
  for (const [name, value] of Object.entries(themeVariables(theme))) root.style.setProperty(name, value);
  root.style.colorScheme = theme.dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.header);
  return theme.motif;
}

// Before the first paint, so the page never flashes the default colours.
if (window.__BAR__) applyTheme(window.__BAR__.theme, window.__BAR__.themeCustom);

interface Toast {
  id: number;
  text: string;
  bad: boolean;
}

interface AppState {
  config: Config;
  reloadConfig: () => Promise<void>;
  user: User | null;
  authReady: boolean;
  setUser: (user: User | null) => void;
  units: Units;
  setUnits: (units: Units) => void;
  /** Which decorative mark the current theme uses. */
  motif: 'burst' | 'snow';
  /** Try colours on screen without saving them. Pass nothing to go back to the saved theme. */
  previewTheme: (key?: string, custom?: CustomColours) => void;
  toast: (text: string, bad?: boolean) => void;
  /** Report a failed request to the person using the app. */
  fail: (error: unknown) => void;
}

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}

function storedUnits(): Units | null {
  try {
    const value = localStorage.getItem('bar.units');
    return value === 'oz' || value === 'ml' ? value : null;
  } catch {
    return null;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<Config>(window.__BAR__ ?? FALLBACK);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [unitChoice, setUnitChoice] = useState<Units | null>(storedUnits);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [preview, setPreview] = useState<{ key: string; custom: CustomColours } | null>(null);
  const [motif, setMotif] = useState<'burst' | 'snow'>('burst');

  const themeKey = preview?.key ?? config.theme;
  const themeCustom = preview?.custom ?? config.themeCustom;
  useLayoutEffect(() => {
    setMotif(applyTheme(themeKey, themeCustom));
  }, [themeKey, themeCustom]);

  const previewTheme = useCallback((key?: string, custom?: CustomColours) => {
    setPreview(key === undefined ? null : { key, custom: custom ?? {} });
  }, []);
  const nextId = useRef(1);

  const reloadConfig = useCallback(async () => {
    try {
      setConfig(await get<Config>('/api/public/config'));
    } catch {
      /* keep what we have */
    }
  }, []);

  useEffect(() => {
    if (!window.__BAR__) void reloadConfig();
    get<{ user: User | null }>('/api/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => undefined)
      .finally(() => setAuthReady(true));
    const signedOut = () => setUser(null);
    window.addEventListener('bar:signed-out', signedOut);
    return () => window.removeEventListener('bar:signed-out', signedOut);
  }, [reloadConfig]);

  useEffect(() => {
    document.title = config.barName;
  }, [config.barName]);

  const toast = useCallback((text: string, bad = false) => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-2), { id, text, bad }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), bad ? 6000 : 3000);
  }, []);

  const fail = useCallback(
    (error: unknown) => toast(error instanceof Error ? error.message : 'Something went wrong.', true),
    [toast],
  );

  const setUnits = useCallback((units: Units) => {
    setUnitChoice(units);
    try {
      localStorage.setItem('bar.units', units);
    } catch {
      /* private mode */
    }
  }, []);

  const value = useMemo<AppState>(
    () => ({
      config,
      reloadConfig,
      user,
      authReady,
      setUser,
      units: unitChoice ?? config.units,
      setUnits,
      motif,
      previewTheme,
      toast,
      fail,
    }),
    [config, reloadConfig, user, authReady, unitChoice, setUnits, motif, previewTheme, toast, fail],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={t.bad ? 'toast toast-bad' : 'toast'}>
            {t.text}
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

// ---------- live menu, shared by the guest pages ----------

interface MenuState {
  menu: Menu | null;
  error: string;
  reload: () => void;
}

const MenuContext = createContext<MenuState | null>(null);

export function useMenu(): MenuState {
  const value = useContext(MenuContext);
  if (!value) throw new Error('useMenu must be used inside MenuProvider');
  return value;
}

/** Keeps the menu fresh: reloads every minute and whenever the page comes back into view. */
export function MenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    get<Menu>('/api/public/menu')
      .then((data) => {
        setMenu(data);
        setError('');
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    reload();
    const timer = setInterval(reload, 60_000);
    const visible = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [reload]);

  const value = useMemo(() => ({ menu, error, reload }), [menu, error, reload]);
  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}
