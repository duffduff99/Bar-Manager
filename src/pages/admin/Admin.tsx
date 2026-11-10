import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  api,
  get,
  type BottleStatus,
  type IngType,
  type Kind,
  type Shopping,
  type Status,
  type TypesResponse,
} from '../../api';
import { useApp } from '../../app';
import { EmptyState, Loading, Modal, Starburst, StatusToggle } from '../../components/ui';

export function AdminLayout({ children }: { children: ReactNode }) {
  const { config, setUser } = useApp();
  const navigate = useNavigate();

  const signOut = async () => {
    await api('POST', '/api/auth/logout').catch(() => undefined);
    setUser(null);
    navigate('/');
  };

  return (
    <div className="admin">
      <header className="admin-bar">
        <Link to="/admin" className="admin-brand">
          <Starburst />
          <span>{config.barName}</span>
        </Link>
        <nav className="admin-nav" aria-label="Manage">
          <NavLink to="/admin/inventory">Inventory</NavLink>
          <NavLink to="/admin/recipes">Recipes</NavLink>
          <NavLink to="/admin/shopping">Shopping</NavLink>
          <NavLink to="/admin/settings">Settings</NavLink>
        </nav>
        <div className="admin-links">
          <Link to="/">View menu</Link>
          <button type="button" className="link-btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <main className="admin-main">{children}</main>
    </div>
  );
}

// ---------- inventory ----------

type TypesReply = { types: IngType[] };

function TypeEditor({
  type,
  types,
  kinds,
  onTypes,
  onClose,
}: {
  type: IngType | null;
  types: IngType[];
  kinds: Kind[];
  onTypes: (types: IngType[]) => void;
  onClose: () => void;
}) {
  const { fail, toast } = useApp();
  const [name, setName] = useState(type?.name ?? '');
  const [kind, setKind] = useState(type?.kind ?? 'spirit');
  const [parentId, setParentId] = useState<number | null>(type?.parentId ?? null);
  const [always, setAlways] = useState(type?.alwaysAvailable ?? false);
  const [busy, setBusy] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const body = { name, kind, parentId, alwaysAvailable: always };
      const data = type
        ? await api<TypesReply>('PUT', `/api/admin/types/${type.id}`, body)
        : await api<TypesReply>('POST', '/api/admin/types', { ...body, status: 'in' });
      onTypes(data.types);
      onClose();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const run = async (request: Promise<TypesReply>, close = false) => {
    try {
      onTypes((await request).types);
      if (close) onClose();
    } catch (e) {
      fail(e);
    }
  };

  const remove = () => {
    if (!type || !confirm(`Delete "${type.name}" from your ingredient list?`)) return;
    void run(api<TypesReply>('DELETE', `/api/admin/types/${type.id}`), true);
  };

  return (
    <Modal title={type ? `Edit ${type.name}` : 'Add an ingredient'} onClose={onClose}>
      <form onSubmit={save} className="form">
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus={!type} placeholder="e.g. Bourbon, Lime Juice" />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Shelf</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {kinds.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Also counts as</span>
            <select value={parentId ?? ''} onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Nothing else</option>
              {types
                .filter((t) => t.id !== type?.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <p className="hint">
          “Also counts as” lets a specific ingredient stand in for a general one: Bourbon counts as Whiskey, so a
          recipe asking for any whiskey shows up when you have bourbon.
        </p>
        <label className="check">
          <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} />
          <span>Always available (water, ice and the like)</span>
        </label>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {type ? 'Save' : 'Add to my bar'}
          </button>
          {type && type.bottles.length === 0 && type.status !== 'none' && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                toast(`${type.name} is no longer tracked.`);
                void run(api<TypesReply>('PUT', `/api/admin/types/${type.id}`, { status: 'none' }), true);
              }}
            >
              We don’t carry this
            </button>
          )}
          {type && type.recipeCount === 0 && (
            <button type="button" className="btn btn-danger" onClick={remove}>
              Delete
            </button>
          )}
        </div>
        {type && type.recipeCount > 0 && (
          <p className="hint">
            {type.name} is used in {type.recipeCount} {type.recipeCount === 1 ? 'recipe' : 'recipes'}, so it cannot be
            deleted: those drinks would lose an ingredient. Use “We don’t carry this” to take it off your list, or
            remove it from the recipes first.
          </p>
        )}
      </form>

      {type && type.bottles.length > 0 && (
        <div className="bottle-editor">
          <h3>Bottles</h3>
          {type.bottles.map((b) => (
            <div key={b.id} className="bottle-edit-row">
              <input
                defaultValue={b.name}
                aria-label={`Name of ${b.name}`}
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value && value !== b.name) {
                    void run(api<TypesReply>('PUT', `/api/admin/bottles/${b.id}`, { name: value }));
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() =>
                  confirm(`Remove ${b.name}?`) && void run(api<TypesReply>('DELETE', `/api/admin/bottles/${b.id}`))
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

type View = 'mine' | 'all' | 'short';

export function InventoryPage() {
  const { fail } = useApp();
  const [data, setData] = useState<TypesResponse | null>(null);
  const [view, setView] = useState<View>('mine');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [bottleName, setBottleName] = useState('');

  useEffect(() => {
    get<TypesResponse>('/api/admin/types')
      .then((d) => {
        setData(d);
        // A brand new bar has nothing tracked yet, so start on the full list.
        if (!d.types.some((t) => t.status !== 'none' || t.bottles.length)) setView('all');
      })
      .catch(fail);
  }, [fail]);

  const setTypes = useCallback((types: IngType[]) => setData((d) => (d ? { ...d, types } : d)), []);

  // Flip the switch on screen straight away, then let the server's answer settle it.
  const patch = (change: (types: IngType[]) => IngType[], request: Promise<TypesReply>) => {
    setData((d) => (d ? { ...d, types: change(d.types) } : d));
    request
      .then((r) => setTypes(r.types))
      .catch((e) => {
        fail(e);
        get<TypesResponse>('/api/admin/types').then(setData).catch(() => undefined);
      });
  };

  const setTypeStatus = (id: number, status: Status) =>
    patch(
      (types) => types.map((t) => (t.id === id ? { ...t, status, effectiveStatus: status } : t)),
      api<TypesReply>('PUT', `/api/admin/types/${id}`, { status }),
    );

  const setBottleStatus = (typeId: number, id: number, status: BottleStatus) =>
    patch(
      (types) =>
        types.map((t) =>
          t.id === typeId ? { ...t, bottles: t.bottles.map((b) => (b.id === id ? { ...b, status } : b)) } : t,
        ),
      api<TypesReply>('PUT', `/api/admin/bottles/${id}`, { status }),
    );

  const removeBottle = (id: number, name: string) => {
    if (!confirm(`Remove ${name} from your inventory?`)) return;
    api<TypesReply>('DELETE', `/api/admin/bottles/${id}`)
      .then((r) => setTypes(r.types))
      .catch(fail);
  };

  const addBottle = async (event: FormEvent, typeId: number) => {
    event.preventDefault();
    const name = bottleName.trim();
    if (!name) return;
    try {
      setTypes((await api<TypesReply>('POST', '/api/admin/bottles', { typeId, name })).types);
      setBottleName('');
      setAddingTo(null);
    } catch (e) {
      fail(e);
    }
  };

  const counts = useMemo(() => {
    const c = { in: 0, low: 0, out: 0 };
    for (const t of data?.types ?? []) {
      if (t.bottles.length) for (const b of t.bottles) c[b.status]++;
      else if (t.status !== 'none') c[t.status]++;
    }
    return c;
  }, [data]);

  if (!data) return <Loading />;

  const query = search.trim().toLowerCase();
  const byId = new Map(data.types.map((t) => [t.id, t]));
  const tracked = (t: IngType) => t.status !== 'none' || t.bottles.length > 0;
  const short = (t: IngType) =>
    t.bottles.length ? t.bottles.some((b) => b.status !== 'in') : t.status === 'low' || t.status === 'out';

  const visible = data.types.filter((t) => {
    if (query) {
      return t.name.toLowerCase().includes(query) || t.bottles.some((b) => b.name.toLowerCase().includes(query));
    }
    if (t.alwaysAvailable) return view === 'all';
    if (view === 'mine') return tracked(t);
    if (view === 'short') return short(t);
    return true;
  });

  const editingType = typeof editing === 'number' ? (byId.get(editing) ?? null) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Inventory</h1>
          <p className="muted">
            {counts.in} in stock · {counts.low} low · {counts.out} out
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
          + Add ingredient
        </button>
      </div>

      <div className="toolbar">
        <input
          type="search"
          className="search"
          placeholder="Find an ingredient or bottle"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Find an ingredient"
        />
        <div className="chips" role="group" aria-label="Which ingredients to show">
          {(
            [
              ['mine', 'My bar'],
              ['short', 'Low & out'],
              ['all', 'Everything'],
            ] as [View, string][]
          ).map(([key, label]) => (
            <button type="button" key={key} className={view === key ? 'chip active' : 'chip'} onClick={() => setView(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'all' && !query && (
        <p className="hint">
          Tap <strong>In</strong> on everything you have. Things you leave untouched stay off your list. Add named
          bottles to an ingredient when you want to track brands separately.
        </p>
      )}

      {visible.length === 0 ? (
        <EmptyState title={query ? 'No matches' : view === 'short' ? 'Fully stocked' : 'Nothing here yet'}>
          {query
            ? 'Nothing in your ingredient list matches that. You can add it with the button above.'
            : view === 'short'
              ? 'Nothing is low or out.'
              : 'Switch to “Everything” and tap In on what you have.'}
        </EmptyState>
      ) : (
        data.kinds.map((kind) => {
          const rows = visible.filter((t) => t.kind === kind.key);
          if (!rows.length) return null;
          return (
            <section key={kind.key} className="inv-group">
              <h2>{kind.label}</h2>
              <ul className="inv-list">
                {rows.map((t) => (
                  <li key={t.id} className={tracked(t) ? 'inv-item' : 'inv-item untracked'}>
                    <div className="inv-row">
                      <button type="button" className="inv-name" onClick={() => setEditing(t.id)}>
                        <span>{t.name}</span>
                        <small>
                          {[
                            t.parentId && byId.get(t.parentId) ? `counts as ${byId.get(t.parentId)!.name}` : '',
                            t.recipeCount ? `${t.recipeCount} ${t.recipeCount === 1 ? 'recipe' : 'recipes'}` : '',
                            t.alwaysAvailable ? 'always available' : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                      </button>
                      {!t.alwaysAvailable && t.bottles.length === 0 && (
                        <StatusToggle value={t.status} label={t.name} onChange={(s) => setTypeStatus(t.id, s)} />
                      )}
                      <button
                        type="button"
                        className="icon-btn inv-edit"
                        aria-label={`Edit or delete ${t.name}`}
                        title="Edit or delete"
                        onClick={() => setEditing(t.id)}
                      >
                        ✎
                      </button>
                      {!t.alwaysAvailable && (
                        <button
                          type="button"
                          className="btn btn-small btn-ghost add-bottle"
                          aria-label={`Add a bottle of ${t.name}`}
                          onClick={() => {
                            setAddingTo(addingTo === t.id ? null : t.id);
                            setBottleName('');
                          }}
                        >
                          +<span> Bottle</span>
                        </button>
                      )}
                    </div>
                    {t.bottles.map((b) => (
                      <div key={b.id} className="inv-row inv-bottle">
                        <span className="inv-name">
                          <span>{b.name}</span>
                        </span>
                        <StatusToggle value={b.status} label={b.name} onChange={(s) => setBottleStatus(t.id, b.id, s)} />
                        <button
                          type="button"
                          className="icon-btn inv-edit"
                          aria-label={`Remove ${b.name}`}
                          title="Remove this bottle"
                          onClick={() => removeBottle(b.id, b.name)}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {addingTo === t.id && (
                      <form className="inv-row inv-bottle inv-add" onSubmit={(e) => addBottle(e, t.id)}>
                        <input
                          autoFocus
                          value={bottleName}
                          onChange={(e) => setBottleName(e.target.value)}
                          placeholder={`Which ${t.name.toLowerCase()}? e.g. a brand name`}
                          aria-label={`New ${t.name} bottle`}
                        />
                        <button type="submit" className="btn btn-small btn-primary">
                          Add
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}

      {editing !== null && (
        <TypeEditor
          key={String(editing)}
          type={editingType}
          types={data.types}
          kinds={data.kinds}
          onTypes={setTypes}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

// ---------- shopping ----------

export function ShoppingPage() {
  const { fail, toast } = useApp();
  const [data, setData] = useState<Shopping | null>(null);

  const reload = useCallback(() => {
    get<Shopping>('/api/admin/shopping').then(setData).catch(fail);
  }, [fail]);
  useEffect(reload, [reload]);

  if (!data) return <Loading />;

  const restock = async (item: Shopping['items'][number]) => {
    try {
      if (item.bottleId) await api('PUT', `/api/admin/bottles/${item.bottleId}`, { status: 'in' });
      else await api('PUT', `/api/admin/types/${item.typeId}`, { status: 'in' });
      reload();
    } catch (e) {
      fail(e);
    }
  };

  const label = (item: Shopping['items'][number]) =>
    item.name === item.typeName ? item.name : `${item.name} (${item.typeName})`;

  const copy = async () => {
    const lines = [
      ...data.items.filter((i) => i.status === 'out').map((i) => `- ${label(i)}`),
      ...data.items.filter((i) => i.status === 'low').map((i) => `- ${label(i)} (running low)`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast('Shopping list copied.');
    } catch {
      toast('Could not copy. Your browser blocked clipboard access.', true);
    }
  };

  const section = (status: 'out' | 'low', title: string) => {
    const items = data.items.filter((i) => i.status === status);
    if (!items.length) return null;
    return (
      <section className="panel">
        <h2>{title}</h2>
        <ul className="shop-list">
          {items.map((item) => (
            <li key={item.key}>
              <div>
                <strong>{label(item)}</strong>
                <small>
                  {[
                    item.usedIn ? `used in ${item.usedIn} ${item.usedIn === 1 ? 'recipe' : 'recipes'}` : 'not used in any recipe',
                    item.covered ? 'another bottle covers it for now' : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </div>
              <button type="button" className="btn btn-small" onClick={() => restock(item)}>
                Restocked
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Shopping</h1>
          <p className="muted">What to pick up, based on your inventory.</p>
        </div>
        {data.items.length > 0 && (
          <button type="button" className="btn" onClick={copy}>
            Copy list
          </button>
        )}
      </div>

      {data.items.length === 0 && (
        <EmptyState title="Nothing to buy">Mark things Low or Out in Inventory and they will show up here.</EmptyState>
      )}
      {section('out', 'Out')}
      {section('low', 'Running low')}

      {data.oneAway.length > 0 && (
        <section className="panel">
          <h2>One bottle away</h2>
          <p className="muted">Each of these would put new drinks on the menu.</p>
          <ul className="shop-list">
            {data.oneAway.map((entry) => (
              <li key={entry.typeId}>
                <div>
                  <strong>{entry.name}</strong>
                  <small>
                    unlocks {entry.recipes.slice(0, 5).join(', ')}
                    {entry.recipes.length > 5 ? ` and ${entry.recipes.length - 5} more` : ''}
                  </small>
                </div>
                <span className="count-badge">+{entry.recipes.length}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
