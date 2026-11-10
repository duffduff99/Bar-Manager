import crypto from 'node:crypto';

const COOKIE = 'bar_session';
const SESSION_DAYS = 60;
const MIN_PASSWORD = 8;

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return `Password must be at least ${MIN_PASSWORD} characters.`;
  }
  if (password.length > 200) return 'Password is too long.';
  return null;
}

export function validateUsername(username) {
  if (typeof username !== 'string' || !/^[a-zA-Z0-9._-]{2,32}$/.test(username)) {
    return 'Username must be 2-32 letters, numbers, dots, dashes or underscores.';
  }
  return null;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = crypto.scryptSync(String(password), Buffer.from(salt, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return null;
}

function setCookie(req, res, value, maxAgeSeconds) {
  const parts = [
    `${COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (req.secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

export function startSession(db, req, res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = Date.now() + SESSION_DAYS * 86400_000;
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    sha256(token),
    userId,
    expires,
  );
  setCookie(req, res, token, SESSION_DAYS * 86400);
}

export function endSession(db, req, res) {
  const token = readCookie(req, COOKIE);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  setCookie(req, res, '', 0);
}

export function currentUser(db, req) {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.username, s.expires_at AS expiresAt FROM sessions s
       JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    )
    .get(sha256(token));
  if (!row || row.expiresAt < Date.now()) return null;
  return { id: row.id, username: row.username };
}

/** Small in-memory limiter so the login form cannot be hammered. */
export function createRateLimiter({ max, windowMs }) {
  const hits = new Map();
  return {
    blocked(key) {
      const entry = hits.get(key);
      return !!entry && entry.resetAt > Date.now() && entry.count >= max;
    },
    fail(key) {
      const now = Date.now();
      if (hits.size > 5000) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      }
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) hits.set(key, { count: 1, resetAt: now + windowMs });
      else entry.count++;
    },
    clear(key) {
      hits.delete(key);
    },
  };
}
