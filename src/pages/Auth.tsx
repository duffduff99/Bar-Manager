import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, type User } from '../api';
import { useApp } from '../app';
import { Starburst } from '../components/ui';

/** Sign-in, or on a brand new install, creating the first admin account. */
export function AuthPage({ mode }: { mode: 'login' | 'setup' }) {
  const { config, user, setUser, reloadConfig } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/admin" replace />;
  if (mode === 'login' && config.needsSetup) return <Navigate to="/setup" replace />;
  if (mode === 'setup' && !config.needsSetup) return <Navigate to="/login" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api<{ user: User }>('POST', `/api/auth/${mode}`, { username, password });
      if (mode === 'setup') await reloadConfig();
      setUser(data.user);
      navigate('/admin', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <Starburst />
        <h1>{mode === 'setup' ? `Welcome to ${config.barName}` : 'Sign in'}</h1>
        <p className="muted">
          {mode === 'setup'
            ? 'Create the first admin account. You can add more people later in Settings.'
            : 'For the people who run the bar.'}
        </p>
        <label className="field">
          <span>Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            required
            autoFocus
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
            minLength={mode === 'setup' ? 8 : undefined}
            required
          />
          {mode === 'setup' && <small>At least 8 characters.</small>}
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {mode === 'setup' ? 'Create account' : 'Sign in'}
        </button>
        <Link to="/" className="auth-back">
          ← Back to the menu
        </Link>
      </form>
    </div>
  );
}
