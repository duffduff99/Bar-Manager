import { useEffect, useState, type FormEvent } from 'react';
import { api, get, type Settings, type User } from '../../api';
import { useApp } from '../../app';
import { Loading } from '../../components/ui';
import { shrink, squareIcon, upload } from '../../images';

interface Category {
  id: number;
  name: string;
  count: number;
}

function BarSettings() {
  const { fail, toast, reloadConfig } = useApp();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [qrVersion, setQrVersion] = useState(0);

  useEffect(() => {
    get<{ settings: Settings }>('/api/admin/settings')
      .then((d) => setSettings(d.settings))
      .catch(fail);
  }, [fail]);

  if (!settings) return <Loading />;
  const set = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch });

  const store = async (patch: Partial<Settings>, message: string) => {
    setBusy(true);
    try {
      const data = await api<{ settings: Settings }>('PUT', '/api/admin/settings', patch);
      setSettings(data.settings);
      await reloadConfig();
      setQrVersion((v) => v + 1);
      toast(message);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    const { bar_name, tagline, units, public_url, tv_interval, tv_message } = settings;
    void store({ bar_name, tagline, units, public_url, tv_interval, tv_message }, 'Settings saved.');
  };

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      // One upload for the logo itself and two square versions for the home-screen icon.
      const [logo, icon192, icon512] = await Promise.all([
        shrink(file, 800, 'image/png').then(upload),
        squareIcon(file, 192).then(upload),
        squareIcon(file, 512).then(upload),
      ]);
      await store({ logo, icon192, icon512 }, 'Logo updated.');
    } catch (e) {
      fail(e);
      setBusy(false);
    }
  };

  const address = settings.public_url || window.location.origin;

  return (
    <form className="panel form" onSubmit={save}>
      <h2>The bar</h2>
      <div className="field-row">
        <label className="field">
          <span>Name</span>
          <input value={settings.bar_name} onChange={(e) => set({ bar_name: e.target.value })} required maxLength={60} />
        </label>
        <label className="field">
          <span>Tagline</span>
          <input value={settings.tagline} onChange={(e) => set({ tagline: e.target.value })} maxLength={120} />
        </label>
      </div>

      <div className="field">
        <span>Logo</span>
        <div className="logo-input">
          <div className="logo-preview">{settings.logo ? <img src={settings.logo} alt="Current logo" /> : <em>No logo yet</em>}</div>
          <div className="image-buttons">
            <label className="btn">
              {settings.logo ? 'Change logo' : 'Upload logo'}
              <input
                type="file"
                accept="image/*"
                hidden
                disabled={busy}
                onChange={(e) => {
                  void pickLogo(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            {settings.logo && (
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => store({ logo: '', icon192: '', icon512: '' }, 'Logo removed.')}>
                Remove
              </button>
            )}
            <small className="muted">
              Shown on the menu header (dark wood background) and the TV, and used as the app icon. A PNG with a
              transparent background works best.
            </small>
          </div>
        </div>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Measurements shown to guests</span>
          <select value={settings.units} onChange={(e) => set({ units: e.target.value as Settings['units'] })}>
            <option value="oz">Ounces (oz)</option>
            <option value="ml">Millilitres (ml)</option>
          </select>
          <small>Anyone can switch on a drink page; this is the starting choice.</small>
        </label>
        <label className="field">
          <span>Menu address for the QR code</span>
          <input
            value={settings.public_url}
            onChange={(e) => set({ public_url: e.target.value })}
            placeholder={window.location.origin}
            inputMode="url"
          />
          <small>Leave empty to use the address this page was opened with.</small>
        </label>
      </div>

      <h2>TV display</h2>
      <div className="field-row">
        <label className="field">
          <span>Seconds per drink</span>
          <input
            type="number"
            min={5}
            max={120}
            value={settings.tv_interval}
            onChange={(e) => set({ tv_interval: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Text next to the QR code</span>
          <input value={settings.tv_message} onChange={(e) => set({ tv_message: e.target.value })} maxLength={60} />
        </label>
      </div>
      <div className="qr-preview">
        <img src={`/api/qr.svg?v=${qrVersion}`} alt="QR code for the menu" />
        <div>
          <p>
            This code opens <strong>{address}</strong>
          </p>
          <p className="muted">
            The TV display lives at <a href="/tv" target="_blank" rel="noreferrer">{window.location.origin}/tv</a>. It
            rotates through featured drinks, or the whole menu when nothing is featured.
          </p>
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Save settings
        </button>
      </div>
    </form>
  );
}

function Categories() {
  const { fail } = useApp();
  const [list, setList] = useState<Category[] | null>(null);
  const [name, setName] = useState('');

  const run = (request: Promise<{ categories: Category[] }>) =>
    request.then((d) => setList(d.categories)).catch(fail);

  useEffect(() => {
    void run(get('/api/admin/categories'));
  }, []);

  if (!list) return null;

  const move = (index: number, by: number) => {
    const ids = list.map((c) => c.id);
    const target = index + by;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(api('PUT', '/api/admin/categories/order', { ids }));
  };

  return (
    <section className="panel">
      <h2>Categories</h2>
      <p className="muted">The filter buttons at the top of the menu, in this order.</p>
      <ul className="manage-list">
        {list.map((c, index) => (
          <li key={c.id}>
            <input
              defaultValue={c.name}
              key={c.name}
              aria-label={`Name of ${c.name}`}
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value && value !== c.name) void run(api('PUT', `/api/admin/categories/${c.id}`, { name: value }));
              }}
            />
            <small>
              {c.count} {c.count === 1 ? 'recipe' : 'recipes'}
            </small>
            <button type="button" className="icon-btn" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${c.name} up`}>
              ↑
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => move(index, 1)}
              disabled={index === list.length - 1}
              aria-label={`Move ${c.name} down`}
            >
              ↓
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Delete ${c.name}`}
              onClick={() =>
                confirm(`Delete the category "${c.name}"? The recipes in it are kept.`) &&
                void run(api('DELETE', `/api/admin/categories/${c.id}`))
              }
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void run(api('POST', '/api/admin/categories', { name })).then(() => setName(''));
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" aria-label="New category name" />
        <button type="submit" className="btn">
          Add
        </button>
      </form>
    </section>
  );
}

function Users() {
  const { fail, toast } = useApp();
  const [users, setUsers] = useState<User[] | null>(null);
  const [me, setMe] = useState(0);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const take = (d: { users: User[]; me: number }) => {
    setUsers(d.users);
    setMe(d.me);
  };

  useEffect(() => {
    get<{ users: User[]; me: number }>('/api/admin/users').then(take).catch(fail);
  }, [fail]);

  if (!users) return null;

  const add = async (event: FormEvent) => {
    event.preventDefault();
    try {
      take(await api('POST', '/api/admin/users', { username, password }));
      setUsername('');
      setPassword('');
      toast('Account created.');
    } catch (e) {
      fail(e);
    }
  };

  const changePassword = async (user: User) => {
    const next = prompt(`New password for ${user.username} (at least 8 characters):`);
    if (!next) return;
    try {
      await api('PUT', `/api/admin/users/${user.id}/password`, { password: next });
      toast('Password changed.');
    } catch (e) {
      fail(e);
    }
  };

  return (
    <section className="panel">
      <h2>Admin accounts</h2>
      <p className="muted">Everyone listed here can manage the bar. Guests never need an account.</p>
      <ul className="manage-list">
        {users.map((u) => (
          <li key={u.id}>
            <strong>
              {u.username}
              {u.id === me && <small> (you)</small>}
            </strong>
            <span className="spacer" />
            <button type="button" className="btn btn-small" onClick={() => changePassword(u)}>
              Change password
            </button>
            {u.id !== me && (
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() =>
                  confirm(`Remove the account "${u.username}"?`) &&
                  api<{ users: User[]; me: number }>('DELETE', `/api/admin/users/${u.id}`).then(take).catch(fail)
                }
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <form className="inline-form" onSubmit={add}>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          aria-label="New account username"
          autoCapitalize="none"
          autoComplete="off"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (8+ characters)"
          aria-label="New account password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <button type="submit" className="btn">
          Add account
        </button>
      </form>
    </section>
  );
}

function Backup() {
  const { fail, toast, reloadConfig } = useApp();
  const [busy, setBusy] = useState(false);

  const restore = async (file: File | undefined) => {
    if (!file) return;
    if (!confirm('Restoring replaces every recipe, ingredient, bottle and setting with the contents of this file. Admin accounts are kept. Continue?')) {
      return;
    }
    setBusy(true);
    try {
      const data: unknown = JSON.parse(await file.text());
      const result = await api<{ recipes: number }>('POST', '/api/admin/restore', data);
      await reloadConfig();
      toast(`Restored ${result.recipes} recipes.`);
    } catch (e) {
      fail(e instanceof SyntaxError ? new Error('That file is not a backup from this app.') : e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>Backup</h2>
      <p className="muted">
        One file with your recipes, pictures, inventory and settings. Keep a copy somewhere safe, or use it to move
        to another machine.
      </p>
      <div className="form-actions">
        <a className="btn" href="/api/admin/export" download>
          Download backup
        </a>
        <label className="btn">
          {busy ? 'Restoring…' : 'Restore from a backup'}
          <input
            type="file"
            accept="application/json,.json"
            hidden
            disabled={busy}
            onChange={(e) => {
              void restore(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </section>
  );
}

export function SettingsPage() {
  return (
    <>
      <div className="page-head">
        <h1>Settings</h1>
      </div>
      <BarSettings />
      <Categories />
      <Users />
      <Backup />
    </>
  );
}
