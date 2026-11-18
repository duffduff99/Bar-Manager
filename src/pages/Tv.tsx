import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { MenuRecipe } from '../api';
import { useApp, useMenu } from '../app';
import { DrinkImage, Starburst } from '../components/ui';

const BOARD_PAGE = 24; // most drink names on one menu-board slide (3 columns of 8)

type Slide =
  | { kind: 'logo'; id: string }
  | { kind: 'drink'; id: string; recipe: MenuRecipe }
  | { kind: 'board'; id: string; names: string[]; page: number; pages: number }
  | { kind: 'message'; id: string; text: string };

/** Largest size (in vw) at which the longest word of a name fits `width` vw. */
function fitSize(name: string, width: number, max: number): number {
  const longest = Math.max(1, ...name.split(/\s+/).map((word) => word.length));
  return Math.min(max, width / (longest * 0.9));
}

/**
 * Text that starts at `max` (in vw) and shrinks until it fits its box, so long
 * names and descriptions are never cut off. It re-checks when the window
 * changes size or the web fonts finish loading.
 */
function Fit({ max, min, className, children }: { max: number; min: number; className: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    let size = max;
    el.style.fontSize = `${size}vw`;
    const overflowing = () => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
    while (overflowing() && size > min) {
      size = Math.max(min, size * 0.94);
      el.style.fontSize = `${size}vw`;
    }
  }, [max, min, children, tick]);

  useEffect(() => {
    const again = () => setTick((t) => t + 1);
    window.addEventListener('resize', again);
    void document.fonts?.ready.then(again);
    return () => window.removeEventListener('resize', again);
  }, []);

  return (
    <div ref={box} className={`tv-fit ${className}`}>
      {children}
    </div>
  );
}

/** Fewer, wider columns when there are only a few drinks. */
function columnsFor(count: number): number {
  return count <= 6 ? 1 : count <= 14 ? 2 : 3;
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(timer);
  }, []);
  return <>{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</>;
}

function Brand({ width, max }: { width: number; max: number }) {
  const { config } = useApp();
  return (
    <div className="tv-brand">
      {config.logo ? (
        <img src={config.logo} alt={config.barName} />
      ) : (
        <div className="tv-name" style={{ fontSize: `${fitSize(config.barName, width, max)}vw` }}>
          {config.barName}
        </div>
      )}
      {config.tagline && <div className="tv-tagline">{config.tagline}</div>}
    </div>
  );
}

function SlideView({ slide }: { slide: Slide }) {
  if (slide.kind === 'logo') {
    return (
      <div className="tv-slide tv-logo-slide">
        <Starburst className="tv-logo-star" />
        <Brand width={52} max={9} />
      </div>
    );
  }
  if (slide.kind === 'message') {
    return (
      <div className="tv-slide tv-message-slide">
        <Starburst className="tv-logo-star" />
        <Fit max={6.5} min={2.2} className="tv-message-fit">
          <h2>{slide.text}</h2>
        </Fit>
      </div>
    );
  }
  if (slide.kind === 'board') {
    return (
      <div className="tv-slide tv-board-slide">
        <div className="tv-kicker">On the menu tonight</div>
        <Fit max={2.4} min={1.1} className="tv-board-fit">
          <ul className={`tv-board tv-board-${columnsFor(slide.names.length)}`}>
            {slide.names.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </Fit>
        {slide.pages > 1 && (
          <div className="tv-board-page">
            {slide.page} of {slide.pages}
          </div>
        )}
      </div>
    );
  }
  const { recipe } = slide;
  return (
    <div className="tv-slide tv-drink-slide">
      <div className="tv-photo">
        <DrinkImage image={recipe.image} title={recipe.title} glass={recipe.glass} />
      </div>
      <div className="tv-copy">
        <div className="tv-kicker">{recipe.featured ? 'Featured tonight' : 'On the menu'}</div>
        <Fit max={fitSize(recipe.title, 30, 5.6)} min={2.4} className="tv-title-fit">
          <h2>{recipe.title}</h2>
        </Fit>
        {recipe.description && (
          <Fit max={2.1} min={1.2} className="tv-description-fit">
            <p className="tv-description">{recipe.description}</p>
          </Fit>
        )}
      </div>
    </div>
  );
}

/** Full-screen display for the bar TV. Open /tv on the TV or cast it. */
export function TvPage() {
  const { config, reloadConfig } = useApp();
  const { menu } = useMenu();
  const [index, setIndex] = useState(0);

  const slides = useMemo<Slide[]>(() => {
    const all = menu?.recipes ?? [];
    const pinned = all.filter((r) => r.featured);
    // Featured drinks, unless there are none or every drink was asked for.
    const drinks = config.tvAllDrinks || pinned.length === 0 ? [...pinned, ...all.filter((r) => !r.featured)] : pinned;

    const out: Slide[] = [];
    if (config.tvLogoSlide) out.push({ kind: 'logo', id: 'logo' });
    if (config.tvAnnouncement.trim()) out.push({ kind: 'message', id: 'message', text: config.tvAnnouncement.trim() });
    drinks.forEach((recipe) => out.push({ kind: 'drink', id: `drink-${recipe.slug}`, recipe }));
    if (config.tvBoardSlide && all.length) {
      const names = all.map((r) => r.title);
      const pages = Math.ceil(names.length / BOARD_PAGE);
      // Spread the names evenly, so 26 drinks become 13 + 13 rather than 24 + 2.
      const perPage = Math.ceil(names.length / pages);
      for (let page = 0; page < pages; page++) {
        out.push({
          kind: 'board',
          id: `board-${page}`,
          names: names.slice(page * perPage, (page + 1) * perPage),
          page: page + 1,
          pages,
        });
      }
    }
    return out;
  }, [menu, config.tvAllDrinks, config.tvLogoSlide, config.tvBoardSlide, config.tvAnnouncement]);

  useEffect(() => {
    document.body.classList.add('tv-body');
    // Pick up a new theme or TV setting without anyone touching the TV.
    const refresh = setInterval(() => void reloadConfig(), 60_000);
    return () => {
      document.body.classList.remove('tv-body');
      clearInterval(refresh);
    };
  }, [reloadConfig]);

  useEffect(() => {
    if (slides.length < 2) return;
    const timer = setInterval(() => setIndex((i) => i + 1), config.tvInterval * 1000);
    return () => clearInterval(timer);
  }, [slides.length, config.tvInterval]);

  const current = slides.length ? slides[index % slides.length] : null;
  const count = menu?.recipes.length ?? 0;
  const wide = current?.kind === 'logo' || current?.kind === 'message';

  return (
    <div
      className={['tv', config.tvBackground ? 'tv-has-image' : '', wide ? 'tv-wide' : ''].join(' ').trim()}
      style={config.tvBackground ? { backgroundImage: `url("${config.tvBackground}")` } : undefined}
    >
      <Starburst className="tv-star tv-star-a" />
      <Starburst className="tv-star tv-star-b" />
      <Starburst className="tv-star tv-star-c" />

      <aside className="tv-side">
        <Brand width={23} max={4.6} />
        <div className="tv-qr">
          <img src="/api/qr.svg" alt="QR code for the menu" />
          <div className="tv-qr-text">
            <strong>{config.tvMessage}</strong>
            {count > 0 && (
              <span>
                {count} {count === 1 ? 'drink' : 'drinks'} available tonight
              </span>
            )}
          </div>
        </div>
        <div className="tv-clock">
          <Clock />
        </div>
      </aside>

      <main className="tv-stage">
        {current ? (
          // The key restarts the fade and slow zoom for each new slide.
          <SlideView key={`${current.id}-${index}`} slide={current} />
        ) : (
          <div className="tv-slide tv-message-slide">
            <Starburst className="tv-logo-star" />
            <h2>Welcome</h2>
            <p className="tv-description">{menu ? 'The bar is being stocked.' : 'Loading the menu…'}</p>
          </div>
        )}
        {slides.length > 1 && slides.length <= 14 && (
          <div className="tv-dots" aria-hidden="true">
            {slides.map((s, i) => (
              <span key={s.id} className={i === index % slides.length ? 'on' : ''} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
