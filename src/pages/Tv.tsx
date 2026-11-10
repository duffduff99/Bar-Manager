import { useEffect, useMemo, useState } from 'react';
import type { MenuRecipe } from '../api';
import { useApp, useMenu } from '../app';
import { DrinkImage, Starburst } from '../components/ui';
import { showAmount } from '../units';

/** Largest size (in vw) at which the longest word of the name fits the side panel. */
function nameSize(name: string): number {
  const longest = Math.max(1, ...name.split(/\s+/).map((word) => word.length));
  return Math.min(4.6, 23 / (longest * 0.9));
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(timer);
  }, []);
  return <>{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</>;
}

function Slide({ recipe, featured }: { recipe: MenuRecipe; featured: boolean }) {
  const { units } = useApp();
  return (
    <div className="tv-slide">
      <div className="tv-photo">
        <DrinkImage image={recipe.image} title={recipe.title} glass={recipe.glass} />
      </div>
      <div className="tv-copy">
        <div className="tv-kicker">{featured ? 'Featured tonight' : 'On the menu'}</div>
        <h2>{recipe.title}</h2>
        {recipe.description && <p className="tv-description">{recipe.description}</p>}
        <ul className="tv-ingredients">
          {recipe.ingredients
            .filter((i) => !i.optional)
            .slice(0, 6)
            .map((i, index) => {
              const shown = showAmount(i.amount, i.unit, units);
              return (
                <li key={index}>
                  <span>
                    {shown.qty} {shown.unit}
                  </span>
                  {i.name}
                </li>
              );
            })}
        </ul>
      </div>
    </div>
  );
}

/** Full-screen display for the bar TV. Open /tv on the TV or cast it. */
export function TvPage() {
  const { config, reloadConfig } = useApp();
  const { menu } = useMenu();
  const [index, setIndex] = useState(0);

  // Featured drinks if there are any; otherwise cycle through the whole menu.
  const { slides, featured } = useMemo(() => {
    const all = menu?.recipes ?? [];
    const pinned = all.filter((r) => r.featured);
    return pinned.length ? { slides: pinned, featured: true } : { slides: all, featured: false };
  }, [menu]);

  useEffect(() => {
    document.body.classList.add('tv-body');
    const refresh = setInterval(() => void reloadConfig(), 5 * 60_000);
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

  return (
    <div className="tv">
      <Starburst className="tv-star tv-star-a" />
      <Starburst className="tv-star tv-star-b" />
      <Starburst className="tv-star tv-star-c" />

      <aside className="tv-side">
        <div className="tv-brand">
          {config.logo ? (
            <img src={config.logo} alt={config.barName} />
          ) : (
            <div className="tv-name" style={{ fontSize: `${nameSize(config.barName)}vw` }}>
              {config.barName}
            </div>
          )}
          {config.tagline && <div className="tv-tagline">{config.tagline}</div>}
        </div>
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
          // The key restarts the fade and slow zoom for each new drink.
          <Slide key={`${current.slug}-${index}`} recipe={current} featured={featured} />
        ) : (
          <div className="tv-idle">
            <Starburst />
            <h2>Welcome</h2>
            <p>{menu ? 'The bar is being stocked.' : 'Loading the menu…'}</p>
          </div>
        )}
        {slides.length > 1 && slides.length <= 12 && (
          <div className="tv-dots" aria-hidden="true">
            {slides.map((s, i) => (
              <span key={s.slug} className={i === index % slides.length ? 'on' : ''} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
