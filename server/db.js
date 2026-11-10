import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { seedDatabase } from './seed.js';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

const MIGRATIONS = [
  `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  -- A generic ingredient ("Bourbon", "Lime Juice"). Recipes point at these.
  -- status is used when the type has no named bottles; otherwise the bottles decide.
  CREATE TABLE ingredient_types (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    kind TEXT NOT NULL DEFAULT 'other',
    parent_id INTEGER REFERENCES ingredient_types(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'none' CHECK (status IN ('none','in','low','out')),
    always_available INTEGER NOT NULL DEFAULT 0
  );

  -- A specific product on the shelf ("Buffalo Trace") belonging to a type.
  CREATE TABLE bottles (
    id INTEGER PRIMARY KEY,
    type_id INTEGER NOT NULL REFERENCES ingredient_types(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'in' CHECK (status IN ('in','low','out')),
    notes TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX bottles_type ON bottles(type_id);

  CREATE TABLE recipes (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    image TEXT,
    steps TEXT NOT NULL DEFAULT '[]',
    glass TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    featured INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE recipe_ingredients (
    id INTEGER PRIMARY KEY,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    type_id INTEGER NOT NULL REFERENCES ingredient_types(id) ON DELETE RESTRICT,
    bottle_id INTEGER REFERENCES bottles(id) ON DELETE SET NULL,
    amount REAL,
    unit TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    optional INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX recipe_ingredients_recipe ON recipe_ingredients(recipe_id);

  CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    position INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE recipe_categories (
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (recipe_id, category_id)
  );

  CREATE TABLE tags (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
  );
  CREATE TABLE recipe_tags (
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (recipe_id, tag_id)
  );
  `,
];

export function openDatabase(file) {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const current = db.pragma('user_version', { simple: true });
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
    if (v === 0 && process.env.SEED !== 'false') seedDatabase(db);
  }
  return db;
}

export const DEFAULT_SETTINGS = {
  bar_name: process.env.BAR_NAME || 'Home Bar',
  tagline: 'Pull up a stool.',
  units: 'oz',
  logo: '',
  icon192: '',
  icon512: '',
  public_url: '',
  tv_interval: '15',
  tv_message: 'Scan for the full menu',
  tv_background: '',
  tv_logo_slide: '1',
  tv_board_slide: '1',
  tv_all_drinks: '0',
  tv_announcement: '',
  theme: 'classic',
  theme_custom: '{}',
};

/** Settings that hold an uploaded picture. */
export const IMAGE_SETTINGS = ['logo', 'icon192', 'icon512', 'tv_background'];
/** Settings stored as '1' or '0'. */
export const FLAG_SETTINGS = ['tv_logo_slide', 'tv_board_slide', 'tv_all_drinks'];

export function getSettings(db) {
  const out = { ...DEFAULT_SETTINGS };
  for (const row of db.prepare('SELECT key, value FROM settings').all()) {
    if (row.key in out) out[row.key] = row.value;
  }
  return out;
}

export function saveSettings(db, patch) {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  db.transaction(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (key in DEFAULT_SETTINGS && typeof value === 'string') stmt.run(key, value);
    }
  })();
}
