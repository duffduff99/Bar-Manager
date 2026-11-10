import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { get, type BarGroup, type MenuRecipe } from '../api';
import { useApp, useMenu } from '../app';
import { Picker } from '../components/Picker';
import { DrinkImage, EmptyState, Loading, Starburst } from '../components/ui';
import { showAmount, showVolume, totalMl } from '../units';

export function GuestLayout({ children }: { children: ReactNode }) {
  const { config, user } = useApp();
  return (
    <div className="guest">
      <header className="masthead">
        <Starburst className="masthead-star star-a" />
        <Starburst className="masthead-star star-b" />
        <Link to="/" className="masthead-brand">
          {config.logo ? (
            <img className="masthead-logo" src={config.logo} alt={config.barName} />
          ) : (
            <span className="masthead-name">{config.barName}</span>
          )}
          {config.tagline && <span className="masthead-tagline">{config.tagline}</span>}
        </Link>
        <nav className="masthead-nav" aria-label="Menu sections">
          <NavLink to="/" end>
            Drinks
          </NavLink>
          <NavLink to="/bar">Behind the bar</NavLink>
        </nav>
      </header>
      <main className="guest-main">{children}</main>
      <footer className="guest-foot">
        <Starburst />
        <span>{config.barName}</span>
        {user ? <Link to="/admin">Manage the bar</Link> : <Link to="/login">Sign in</Link>}
      </footer>
    </div>
  );
}

function DrinkCard({ recipe }: { recipe: MenuRecipe }) {
  return (
    <Link to={`/drink/${recipe.slug}`} className={recipe.featured ? 'card card-featured' : 'card'}>
      <div className="card-media">
        <DrinkImage image={recipe.image} title={recipe.title} glass={recipe.glass} />
        {recipe.featured && <span className="ribbon">Featured</span>}
      </div>
      <div className="card-body">
        <h3>{recipe.title}</h3>
        {recipe.description && <p>{recipe.description}</p>}
        <div className="card-meta">
          {[recipe.baseSpirit, ...recipe.categories.slice(0, 1)].filter(Boolean).join(' · ')}
        </div>
      </div>
    </Link>
  );
}

export function MenuPage() {
  const { menu, error } = useMenu();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [spirit, setSpirit] = useState('');
  const [picking, setPicking] = useState(false);

  const spirits = useMemo(() => {
    const set = new Set<string>();
    menu?.recipes.forEach((r) => r.baseSpirit && set.add(r.baseSpirit));
    return [...set].sort();
  }, [menu]);

  if (!menu) {
    return <GuestLayout>{error ? <EmptyState title="Can’t load the menu">{error}</EmptyState> : <Loading />}</GuestLayout>;
  }

  const query = search.trim().toLowerCase();
  const matches = menu.recipes.filter((r) => {
    if (category && !r.categories.includes(category)) return false;
    if (spirit && r.baseSpirit !== spirit) return false;
    if (!query) return true;
    return [r.title, r.description, ...r.tags, ...r.categories, ...r.ingredients.map((i) => i.name)]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });
  const filtering = !!(query || category || spirit);
  const featured = filtering ? [] : matches.filter((r) => r.featured);
  const rest = filtering ? matches : matches.filter((r) => !r.featured);

  return (
    <GuestLayout>
      {menu.recipes.length === 0 ? (
        <EmptyState title="The bar is being stocked">
          No drinks are on the menu yet. Check back in a bit.
        </EmptyState>
      ) : (
        <>
          <div className="menu-tools">
            <input
              type="search"
              className="search"
              placeholder="Search drinks or ingredients"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search drinks"
            />
            <button type="button" className="btn btn-primary pick-btn" onClick={() => setPicking(true)}>
              <Starburst /> Pick a drink for me
            </button>
          </div>

          {menu.categories.length > 0 && (
            <div className="chips" role="group" aria-label="Filter by category">
              <button type="button" className={category ? 'chip' : 'chip active'} onClick={() => setCategory('')}>
                All drinks
              </button>
              {menu.categories.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={category === c ? 'chip active' : 'chip'}
                  onClick={() => setCategory(category === c ? '' : c)}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          {spirits.length > 1 && (
            <div className="chips chips-small" role="group" aria-label="Filter by spirit">
              {spirits.map((s) => (
                <button
                  type="button"
                  key={s}
                  className={spirit === s ? 'chip active' : 'chip'}
                  onClick={() => setSpirit(spirit === s ? '' : s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {featured.length > 0 && (
            <section>
              <h2 className="section-title">
                <span>Featured</span>
              </h2>
              <div className="grid grid-featured">
                {featured.map((r) => (
                  <DrinkCard key={r.slug} recipe={r} />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="section-title">
              <span>{filtering ? `${matches.length} ${matches.length === 1 ? 'drink' : 'drinks'}` : 'On the menu'}</span>
            </h2>
            {rest.length ? (
              <div className="grid">
                {rest.map((r) => (
                  <DrinkCard key={r.slug} recipe={r} />
                ))}
              </div>
            ) : (
              filtering && (
                <EmptyState title="Nothing matches">
                  Try a different search, or clear the filters.
                </EmptyState>
              )
            )}
          </section>
        </>
      )}
      {picking && <Picker recipes={menu.recipes} onClose={() => setPicking(false)} />}
    </GuestLayout>
  );
}

const QUICK = [1, 2, 4, 6, 8];

export function DrinkPage() {
  const { slug } = useParams();
  const { menu, error } = useMenu();
  const { units, setUnits } = useApp();
  const [count, setCount] = useState(1);
  const [dilute, setDilute] = useState(false);

  useEffect(() => {
    setCount(1);
    setDilute(false);
    window.scrollTo(0, 0);
  }, [slug]);

  if (!menu) {
    return <GuestLayout>{error ? <EmptyState title="Can’t load the menu">{error}</EmptyState> : <Loading />}</GuestLayout>;
  }
  const recipe = menu.recipes.find((r) => r.slug === slug);
  if (!recipe) {
    return (
      <GuestLayout>
        <EmptyState title="Not on the menu right now">
          We may be out of something this drink needs. <Link to="/">See what’s available</Link>.
        </EmptyState>
      </GuestLayout>
    );
  }

  // Optional things we are out of will not be going in the pitcher.
  const perDrink = totalMl(recipe.ingredients.filter((i) => i.available));
  const water = dilute ? perDrink * count * 0.2 : 0;
  const waterShown = showAmount(water, 'ml', units);

  return (
    <GuestLayout>
      <article className="drink">
        <Link to="/" className="back-link">
          ← All drinks
        </Link>
        <div className="drink-hero">
          <div className="drink-hero-media">
            <DrinkImage image={recipe.image} title={recipe.title} glass={recipe.glass} />
          </div>
          <div className="drink-hero-text">
            {recipe.featured && <span className="ribbon ribbon-inline">Featured</span>}
            <h1>{recipe.title}</h1>
            {recipe.description && <p className="drink-description">{recipe.description}</p>}
            <div className="tag-row">
              {recipe.categories.map((c) => (
                <span key={c} className="tag tag-category">
                  {c}
                </span>
              ))}
              {recipe.tags.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </div>
            {recipe.glass && (
              <p className="drink-glass">
                <strong>Glass</strong> {recipe.glass}
              </p>
            )}
          </div>
        </div>

        <div className="drink-columns">
          <section className="panel">
            <div className="panel-head">
              <h2>Ingredients</h2>
              <div className="unit-switch" role="group" aria-label="Measurement units">
                {(['oz', 'ml'] as const).map((u) => (
                  <button
                    type="button"
                    key={u}
                    className={units === u ? 'active' : ''}
                    aria-pressed={units === u}
                    onClick={() => setUnits(u)}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            <div className="servings">
              <span className="servings-label">Making</span>
              <div className="stepper">
                <button type="button" onClick={() => setCount(Math.max(1, count - 1))} aria-label="One fewer">
                  −
                </button>
                <output aria-live="polite">{count}</output>
                <button type="button" onClick={() => setCount(Math.min(99, count + 1))} aria-label="One more">
                  +
                </button>
              </div>
              <div className="servings-quick">
                {QUICK.map((n) => (
                  <button
                    type="button"
                    key={n}
                    className={count === n ? 'chip active' : 'chip'}
                    onClick={() => setCount(n)}
                  >
                    ×{n}
                  </button>
                ))}
              </div>
            </div>

            <ul className="ingredients">
              {recipe.ingredients.map((i, index) => {
                const shown = showAmount(i.amount, i.unit, units, count);
                return (
                  <li key={index} className={i.available ? '' : 'is-missing'}>
                    <span className="ing-qty">
                      {shown.qty} {shown.unit}
                    </span>
                    <span className="ing-name">
                      {i.name}
                      {shown.aside && <small> ({shown.aside})</small>}
                      {i.optional && <small className="ing-flag">{i.available ? 'optional' : 'optional · we’re out'}</small>}
                      {i.note && <small className="ing-note">{i.note}</small>}
                      {i.have.length > 0 && <small className="ing-have">We have: {i.have.join(', ')}</small>}
                    </span>
                  </li>
                );
              })}
              {dilute && water > 0 && (
                <li className="is-water">
                  <span className="ing-qty">
                    {waterShown.qty} {waterShown.unit}
                  </span>
                  <span className="ing-name">
                    Water
                    <small className="ing-note">stands in for the ice melt from stirring or shaking</small>
                  </span>
                </li>
              )}
            </ul>

            {count > 1 && perDrink > 0 && (
              <div className="batch">
                <p>
                  <strong>Batch total:</strong> about {showVolume(perDrink * count + water, units)} for {count} drinks.
                </p>
                <label className="check">
                  <input type="checkbox" checked={dilute} onChange={(e) => setDilute(e.target.checked)} />
                  <span>Pre-batching to pour straight from a pitcher? Add water for dilution.</span>
                </label>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>How to make it</h2>
            </div>
            {recipe.steps.length ? (
              <ol className="steps">
                {recipe.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            ) : (
              <p className="muted">No steps written down for this one. Ask the bartender.</p>
            )}
          </section>
        </div>
      </article>
    </GuestLayout>
  );
}

export function BarPage() {
  const [groups, setGroups] = useState<BarGroup[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    get<{ groups: BarGroup[] }>('/api/public/bar')
      .then((data) => setGroups(data.groups))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <GuestLayout>
      <h1 className="page-title">Behind the bar</h1>
      <p className="page-intro">Everything we have on hand right now. Help yourself, or ask.</p>
      {!groups ? (
        error ? (
          <EmptyState title="Can’t load the list">{error}</EmptyState>
        ) : (
          <Loading />
        )
      ) : groups.length === 0 ? (
        <EmptyState title="The shelves are empty">Nothing has been stocked yet.</EmptyState>
      ) : (
        <div className="shelves">
          {groups.map((group) => (
            <section key={group.kind} className="panel shelf">
              <h2>{group.label}</h2>
              <ul>
                {group.items.map((item) => (
                  <li key={item.name}>
                    <span>{item.name}</span>
                    {item.bottles.length > 0 && <small>{item.bottles.join(', ')}</small>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </GuestLayout>
  );
}
