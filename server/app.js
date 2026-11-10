import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

import {
  createRateLimiter,
  currentUser,
  endSession,
  hashPassword,
  startSession,
  validatePassword,
  validateUsername,
  verifyPassword,
} from './auth.js';
import {
  KIND_KEYS,
  KINDS,
  loadInventory,
  loadRecipes,
  publicBar,
  publicMenu,
  shoppingList,
  wouldCreateLoop,
} from './bar.js';
import { cleanCustom, parseCustom, resolveTheme, THEMES } from '../shared/themes.js';
import { DEFAULT_SETTINGS, FLAG_SETTINGS, getSettings, IMAGE_SETTINGS, saveSettings } from './db.js';
import { fetchPublic } from './fetcher.js';
import { buildDraft, extractRecipeFromHtml, parseRecipeText, UNITS } from './parse.js';
import { slugify } from './seed.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const UPLOAD_URL = '/uploads/';
const STATUSES = ['none', 'in', 'low', 'out'];
const BOTTLE_STATUSES = ['in', 'low', 'out'];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (message) => new HttpError(400, message);

const str = (value, max = 500) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function sniffImage(buffer) {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') {
    return 'webp';
  }
  if (buffer.toString('latin1', 0, 4) === 'GIF8') return 'gif';
  return null;
}

export function createApp(db, { uploadDir }) {
  fs.mkdirSync(uploadDir, { recursive: true });
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY ?? 1);

  const loginLimiter = createRateLimiter({ max: 10, windowMs: 15 * 60_000 });

  // ---------- uploads ----------

  function saveImage(buffer) {
    const ext = sniffImage(buffer);
    if (!ext) throw bad('That file is not a JPEG, PNG, WebP or GIF image.');
    const name = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(uploadDir, name), buffer);
    return UPLOAD_URL + name;
  }

  const isUpload = (url) =>
    typeof url === 'string' && /^\/uploads\/[a-zA-Z0-9._-]+$/.test(url) && !url.includes('..');

  function imageInUse(url) {
    if (db.prepare('SELECT 1 FROM recipes WHERE image = ? LIMIT 1').get(url)) return true;
    const s = getSettings(db);
    return IMAGE_SETTINGS.some((key) => s[key] === url);
  }

  function discardImage(url) {
    if (!isUpload(url) || imageInUse(url)) return;
    fs.rm(path.join(uploadDir, path.basename(url)), { force: true }, () => {});
  }

  // ---------- common middleware ----------

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    // The TV page may be framed (some cast receivers load pages in an iframe).
    if (!req.path.startsWith('/tv')) res.set('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  app.use(
    UPLOAD_URL,
    express.static(uploadDir, { immutable: true, maxAge: '365d', index: false, dotfiles: 'deny' }),
  );
  app.use(UPLOAD_URL, (req, res) => res.status(404).end());

  const json = express.json({ limit: '1mb' });
  const bigJson = express.json({ limit: '200mb' });
  const rawImage = express.raw({ type: () => true, limit: '12mb' });

  const api = express.Router();
  app.use('/api', api);
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const wrap = (handler) => (req, res, next) => {
    try {
      Promise.resolve(handler(req, res)).catch(next);
    } catch (error) {
      next(error);
    }
  };

  const publicConfig = () => {
    const s = getSettings(db);
    return {
      barName: s.bar_name,
      tagline: s.tagline,
      units: s.units === 'ml' ? 'ml' : 'oz',
      logo: s.logo,
      tvInterval: Math.min(120, Math.max(5, Number(s.tv_interval) || 15)),
      tvMessage: s.tv_message,
      tvBackground: s.tv_background,
      tvLogoSlide: s.tv_logo_slide === '1',
      tvBoardSlide: s.tv_board_slide === '1',
      tvAllDrinks: s.tv_all_drinks === '1',
      tvAnnouncement: s.tv_announcement,
      theme: s.theme,
      themeCustom: parseCustom(s.theme_custom),
      needsSetup: db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0,
    };
  };

  // ---------- public ----------

  api.get('/public/config', (req, res) => res.json(publicConfig()));
  api.get('/public/menu', (req, res) => res.json(publicMenu(db)));
  api.get('/public/bar', (req, res) => res.json(publicBar(db)));

  const siteUrl = (req) =>
    getSettings(db).public_url.replace(/\/+$/, '') || `${req.protocol}://${req.get('host')}`;

  api.get(
    '/qr.svg',
    wrap(async (req, res) => {
      const svg = await QRCode.toString(siteUrl(req) + '/', {
        type: 'svg',
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#2b2118', light: '#fbf5e9' },
      });
      res.type('image/svg+xml').send(svg);
    }),
  );

  // ---------- auth ----------

  api.get('/auth/me', (req, res) => {
    res.json({ user: currentUser(db, req), needsSetup: publicConfig().needsSetup });
  });

  // First run only: whoever opens the app first creates the admin account.
  api.post(
    '/auth/setup',
    json,
    wrap((req, res) => {
      const username = str(req.body?.username, 40);
      const password = req.body?.password;
      const problem = validateUsername(username) || validatePassword(password);
      if (problem) throw bad(problem);
      const id = db.transaction(() => {
        if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) {
          throw new HttpError(403, 'Setup has already been completed.');
        }
        return db
          .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
          .run(username, hashPassword(password)).lastInsertRowid;
      })();
      startSession(db, req, res, id);
      res.json({ user: { id, username } });
    }),
  );

  api.post(
    '/auth/login',
    json,
    wrap((req, res) => {
      const key = req.ip || 'unknown';
      if (loginLimiter.blocked(key)) {
        throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
      }
      const username = str(req.body?.username, 40);
      const user = db
        .prepare('SELECT id, username, password_hash AS hash FROM users WHERE username = ?')
        .get(username);
      if (!user || !verifyPassword(req.body?.password ?? '', user.hash)) {
        loginLimiter.fail(key);
        throw new HttpError(401, 'Wrong username or password.');
      }
      loginLimiter.clear(key);
      startSession(db, req, res, user.id);
      res.json({ user: { id: user.id, username: user.username } });
    }),
  );

  api.post('/auth/logout', (req, res) => {
    endSession(db, req, res);
    res.json({ ok: true });
  });

  // ---------- admin ----------

  const admin = express.Router();
  api.use('/admin', admin);
  admin.use((req, res, next) => {
    req.user = currentUser(db, req);
    if (!req.user) return next(new HttpError(401, 'Please sign in.'));
    next();
  });

  const idParam = (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'Not found.');
    return id;
  };

  // ----- ingredient types & bottles -----

  const adminTypes = () => {
    const inv = loadInventory(db);
    const counts = new Map(
      db
        .prepare(
          'SELECT type_id AS id, COUNT(DISTINCT recipe_id) AS n FROM recipe_ingredients GROUP BY type_id',
        )
        .all()
        .map((r) => [r.id, r.n]),
    );
    return inv.types.map((t) => ({
      id: t.id,
      name: t.name,
      kind: t.kind,
      parentId: t.parentId,
      status: t.status,
      alwaysAvailable: t.alwaysAvailable,
      effectiveStatus: t.effectiveStatus,
      available: t.available,
      recipeCount: counts.get(t.id) || 0,
      bottles: t.bottles.map((b) => ({ id: b.id, name: b.name, status: b.status, notes: b.notes })),
    }));
  };

  admin.get('/types', (req, res) => {
    res.json({ types: adminTypes(), kinds: KINDS.map(([key, label]) => ({ key, label })), units: UNITS });
  });

  function typeFields(body, existing) {
    const out = {};
    if (body.name !== undefined || !existing) {
      out.name = str(body.name, 80);
      if (!out.name) throw bad('Give the ingredient a name.');
    }
    if (body.kind !== undefined || !existing) {
      out.kind = KIND_KEYS.includes(body.kind) ? body.kind : 'other';
    }
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) throw bad('Unknown stock status.');
      out.status = body.status;
    }
    if (body.alwaysAvailable !== undefined) out.always_available = body.alwaysAvailable ? 1 : 0;
    if (body.parentId !== undefined) {
      const parentId = body.parentId === null ? null : Number(body.parentId);
      if (parentId !== null) {
        if (!db.prepare('SELECT 1 FROM ingredient_types WHERE id = ?').get(parentId)) {
          throw bad('That parent ingredient does not exist.');
        }
        if (existing && wouldCreateLoop(db, existing.id, parentId)) {
          throw bad('An ingredient cannot sit underneath itself.');
        }
      }
      out.parent_id = parentId;
    }
    return out;
  }

  const uniqueGuard = (fn, message) => {
    try {
      return fn();
    } catch (error) {
      if (String(error.code).startsWith('SQLITE_CONSTRAINT_UNIQUE')) {
        throw new HttpError(409, message);
      }
      throw error;
    }
  };

  admin.post(
    '/types',
    json,
    wrap((req, res) => {
      const f = typeFields(req.body || {}, null);
      const id = uniqueGuard(
        () =>
          db
            .prepare(
              'INSERT INTO ingredient_types (name, kind, parent_id, status, always_available) VALUES (?, ?, ?, ?, ?)',
            )
            .run(f.name, f.kind, f.parent_id ?? null, f.status ?? 'none', f.always_available ?? 0)
            .lastInsertRowid,
        `"${f.name}" already exists.`,
      );
      res.json({ id, types: adminTypes() });
    }),
  );

  admin.put(
    '/types/:id',
    json,
    wrap((req, res) => {
      const id = idParam(req);
      const existing = db.prepare('SELECT id FROM ingredient_types WHERE id = ?').get(id);
      if (!existing) throw new HttpError(404, 'Ingredient not found.');
      const f = typeFields(req.body || {}, existing);
      const keys = Object.keys(f);
      if (keys.length) {
        uniqueGuard(
          () =>
            db
              .prepare(`UPDATE ingredient_types SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
              .run(...keys.map((k) => f[k]), id),
          `"${f.name}" already exists.`,
        );
      }
      res.json({ types: adminTypes() });
    }),
  );

  admin.delete(
    '/types/:id',
    wrap((req, res) => {
      const id = idParam(req);
      const used = db
        .prepare(
          `SELECT DISTINCT r.title FROM recipe_ingredients ri JOIN recipes r ON r.id = ri.recipe_id
           WHERE ri.type_id = ? ORDER BY r.title LIMIT 4`,
        )
        .all(id);
      if (used.length) {
        throw new HttpError(
          409,
          `Still used in ${used.map((r) => r.title).join(', ')}. Change those recipes first.`,
        );
      }
      db.prepare('DELETE FROM ingredient_types WHERE id = ?').run(id);
      res.json({ types: adminTypes() });
    }),
  );

  admin.post(
    '/bottles',
    json,
    wrap((req, res) => {
      const typeId = Number(req.body?.typeId);
      const name = str(req.body?.name, 80);
      const status = BOTTLE_STATUSES.includes(req.body?.status) ? req.body.status : 'in';
      if (!name) throw bad('Give the bottle a name.');
      if (!db.prepare('SELECT 1 FROM ingredient_types WHERE id = ?').get(typeId)) {
        throw bad('Pick what kind of ingredient this bottle is.');
      }
      const id = db
        .prepare('INSERT INTO bottles (type_id, name, status, notes) VALUES (?, ?, ?, ?)')
        .run(typeId, name, status, str(req.body?.notes, 300)).lastInsertRowid;
      res.json({ id, types: adminTypes() });
    }),
  );

  admin.put(
    '/bottles/:id',
    json,
    wrap((req, res) => {
      const id = idParam(req);
      const body = req.body || {};
      const f = {};
      if (body.name !== undefined) {
        f.name = str(body.name, 80);
        if (!f.name) throw bad('Give the bottle a name.');
      }
      if (body.status !== undefined) {
        if (!BOTTLE_STATUSES.includes(body.status)) throw bad('Unknown stock status.');
        f.status = body.status;
      }
      if (body.notes !== undefined) f.notes = str(body.notes, 300);
      const keys = Object.keys(f);
      if (keys.length) {
        const info = db
          .prepare(`UPDATE bottles SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
          .run(...keys.map((k) => f[k]), id);
        if (!info.changes) throw new HttpError(404, 'Bottle not found.');
      }
      res.json({ types: adminTypes() });
    }),
  );

  admin.delete(
    '/bottles/:id',
    wrap((req, res) => {
      const id = idParam(req);
      db.transaction(() => {
        const bottle = db.prepare('SELECT type_id AS typeId, status FROM bottles WHERE id = ?').get(id);
        if (!bottle) return;
        db.prepare('DELETE FROM bottles WHERE id = ?').run(id);
        const left = db.prepare('SELECT COUNT(*) AS n FROM bottles WHERE type_id = ?').get(bottle.typeId).n;
        // The last bottle hands its stock state back to the ingredient itself.
        if (!left) {
          db.prepare('UPDATE ingredient_types SET status = ? WHERE id = ?').run(bottle.status, bottle.typeId);
        }
      })();
      res.json({ types: adminTypes() });
    }),
  );

  admin.get('/shopping', (req, res) => res.json(shoppingList(db)));

  // ----- recipes -----

  const adminRecipe = (r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    image: r.image,
    glass: r.glass,
    sourceUrl: r.sourceUrl,
    featured: r.featured,
    hidden: r.hidden,
    steps: r.steps,
    categories: r.categories,
    tags: r.tags,
    available: r.available,
    missing: r.missing,
    baseSpirit: r.baseSpirit,
    ingredients: r.ingredients.map((i) => ({
      typeId: i.typeId,
      bottleId: i.bottleId,
      amount: i.amount,
      unit: i.unit,
      note: i.note,
      optional: i.optional,
      name: i.name,
      available: i.available,
    })),
  });

  const recipeMeta = () => ({
    categories: db
      .prepare('SELECT name FROM categories ORDER BY position, name COLLATE NOCASE')
      .all()
      .map((c) => c.name),
    tags: db
      .prepare('SELECT name FROM tags ORDER BY name COLLATE NOCASE')
      .all()
      .map((t) => t.name),
  });

  admin.get('/recipes', (req, res) => {
    res.json({ recipes: loadRecipes(db).map(adminRecipe), ...recipeMeta() });
  });

  admin.get(
    '/recipes/:id',
    wrap((req, res) => {
      const id = idParam(req);
      const recipe = loadRecipes(db).find((r) => r.id === id);
      if (!recipe) throw new HttpError(404, 'Recipe not found.');
      res.json({ recipe: adminRecipe(recipe) });
    }),
  );

  function uniqueSlug(title, exceptId) {
    const base = slugify(title);
    const taken = db.prepare('SELECT 1 FROM recipes WHERE slug = ? AND id IS NOT ?');
    let slug = base;
    for (let n = 2; taken.get(slug, exceptId ?? null); n++) slug = `${base}-${n}`;
    return slug;
  }

  const nameList = (value, max) =>
    [...new Map((Array.isArray(value) ? value : []).map((v) => str(v, 40)).filter(Boolean).map((v) => [v.toLowerCase(), v])).values()].slice(0, max);

  function recipeFields(body) {
    const title = str(body.title, 120);
    if (!title) throw bad('Give the drink a name.');
    const image = body.image ? String(body.image) : null;
    if (image && !isUpload(image)) throw bad('Images must be uploaded first.');
    const sourceUrl = str(body.sourceUrl, 500);

    const ingredients = (Array.isArray(body.ingredients) ? body.ingredients : []).map((i, index) => {
      const typeId = Number(i?.typeId);
      if (!db.prepare('SELECT 1 FROM ingredient_types WHERE id = ?').get(typeId)) {
        throw bad(`Ingredient ${index + 1} needs to be matched to something in your ingredient list.`);
      }
      let bottleId = i.bottleId ? Number(i.bottleId) : null;
      if (bottleId && !db.prepare('SELECT 1 FROM bottles WHERE id = ? AND type_id = ?').get(bottleId, typeId)) {
        bottleId = null;
      }
      const amount = i.amount === null || i.amount === undefined || i.amount === '' ? null : Number(i.amount);
      if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 100000)) {
        throw bad(`Ingredient ${index + 1} has an amount that is not a number.`);
      }
      return {
        typeId,
        bottleId,
        amount,
        unit: UNITS.includes(i.unit) ? i.unit : '',
        note: str(i.note, 200),
        optional: i.optional ? 1 : 0,
      };
    });

    return {
      title,
      description: str(body.description, 2000),
      image,
      glass: str(body.glass, 80),
      sourceUrl: /^https?:\/\//i.test(sourceUrl) ? sourceUrl : '',
      featured: body.featured ? 1 : 0,
      hidden: body.hidden ? 1 : 0,
      steps: (Array.isArray(body.steps) ? body.steps : []).map((s) => str(s, 1000)).filter(Boolean),
      categories: nameList(body.categories, 12),
      tags: nameList(body.tags, 20),
      ingredients,
    };
  }

  function writeRecipeLinks(recipeId, f) {
    db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(recipeId);
    const ins = db.prepare(
      'INSERT INTO recipe_ingredients (recipe_id, position, type_id, bottle_id, amount, unit, note, optional) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    f.ingredients.forEach((i, position) =>
      ins.run(recipeId, position, i.typeId, i.bottleId, i.amount, i.unit, i.note, i.optional),
    );

    db.prepare('DELETE FROM recipe_categories WHERE recipe_id = ?').run(recipeId);
    for (const name of f.categories) {
      let row = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
      if (!row) {
        const position = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM categories').get().p;
        row = { id: db.prepare('INSERT INTO categories (name, position) VALUES (?, ?)').run(name, position).lastInsertRowid };
      }
      db.prepare('INSERT OR IGNORE INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, row.id);
    }

    db.prepare('DELETE FROM recipe_tags WHERE recipe_id = ?').run(recipeId);
    for (const name of f.tags) {
      let row = db.prepare('SELECT id FROM tags WHERE name = ?').get(name);
      if (!row) row = { id: db.prepare('INSERT INTO tags (name) VALUES (?)').run(name).lastInsertRowid };
      db.prepare('INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, row.id);
    }
    db.prepare('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM recipe_tags)').run();
  }

  admin.post(
    '/recipes',
    json,
    wrap((req, res) => {
      const f = recipeFields(req.body || {});
      const id = db.transaction(() => {
        const recipeId = db
          .prepare(
            `INSERT INTO recipes (slug, title, description, image, steps, glass, source_url, featured, hidden)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(uniqueSlug(f.title), f.title, f.description, f.image, JSON.stringify(f.steps), f.glass, f.sourceUrl, f.featured, f.hidden)
          .lastInsertRowid;
        writeRecipeLinks(recipeId, f);
        return recipeId;
      })();
      res.json({ id });
    }),
  );

  admin.put(
    '/recipes/:id',
    json,
    wrap((req, res) => {
      const id = idParam(req);
      const existing = db.prepare('SELECT title, slug, image FROM recipes WHERE id = ?').get(id);
      if (!existing) throw new HttpError(404, 'Recipe not found.');
      const f = recipeFields(req.body || {});
      db.transaction(() => {
        const slug = existing.title === f.title ? existing.slug : uniqueSlug(f.title, id);
        db.prepare(
          `UPDATE recipes SET slug = ?, title = ?, description = ?, image = ?, steps = ?, glass = ?,
             source_url = ?, featured = ?, hidden = ?, updated_at = datetime('now') WHERE id = ?`,
        ).run(slug, f.title, f.description, f.image, JSON.stringify(f.steps), f.glass, f.sourceUrl, f.featured, f.hidden, id);
        writeRecipeLinks(id, f);
      })();
      if (existing.image && existing.image !== f.image) discardImage(existing.image);
      res.json({ id });
    }),
  );

  // Quick toggles from the recipe list, without sending the whole recipe.
  admin.patch(
    '/recipes/:id',
    json,
    wrap((req, res) => {
      const id = idParam(req);
      const sets = [];
      const values = [];
      for (const key of ['featured', 'hidden']) {
        if (req.body?.[key] !== undefined) {
          sets.push(`${key} = ?`);
          values.push(req.body[key] ? 1 : 0);
        }
      }
      if (sets.length) {
        const info = db.prepare(`UPDATE recipes SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
        if (!info.changes) throw new HttpError(404, 'Recipe not found.');
      }
      res.json({ ok: true });
    }),
  );

  admin.delete(
    '/recipes/:id',
    wrap((req, res) => {
      const id = idParam(req);
      const existing = db.prepare('SELECT image FROM recipes WHERE id = ?').get(id);
      db.prepare('DELETE FROM recipes WHERE id = ?').run(id);
      db.prepare('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM recipe_tags)').run();
      if (existing?.image) discardImage(existing.image);
      res.json({ ok: true });
    }),
  );

  // ----- categories -----

  const adminCategories = () =>
    db
      .prepare(
        `SELECT c.id, c.name, COUNT(rc.recipe_id) AS count FROM categories c
         LEFT JOIN recipe_categories rc ON rc.category_id = c.id
         GROUP BY c.id ORDER BY c.position, c.name COLLATE NOCASE`,
      )
      .all();

  admin.get('/categories', (req, res) => res.json({ categories: adminCategories() }));

  admin.post(
    '/categories',
    json,
    wrap((req, res) => {
      const name = str(req.body?.name, 40);
      if (!name) throw bad('Give the category a name.');
      const position = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM categories').get().p;
      uniqueGuard(
        () => db.prepare('INSERT INTO categories (name, position) VALUES (?, ?)').run(name, position),
        `"${name}" already exists.`,
      );
      res.json({ categories: adminCategories() });
    }),
  );

  admin.put(
    '/categories/order',
    json,
    wrap((req, res) => {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
      const stmt = db.prepare('UPDATE categories SET position = ? WHERE id = ?');
      db.transaction(() => ids.forEach((id, position) => stmt.run(position, id)))();
      res.json({ categories: adminCategories() });
    }),
  );

  admin.put(
    '/categories/:id',
    json,
    wrap((req, res) => {
      const name = str(req.body?.name, 40);
      if (!name) throw bad('Give the category a name.');
      uniqueGuard(
        () => db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, idParam(req)),
        `"${name}" already exists.`,
      );
      res.json({ categories: adminCategories() });
    }),
  );

  admin.delete(
    '/categories/:id',
    wrap((req, res) => {
      db.prepare('DELETE FROM categories WHERE id = ?').run(idParam(req));
      res.json({ categories: adminCategories() });
    }),
  );

  // ----- import -----

  async function importImage(url, pageUrl) {
    if (!url) return '';
    try {
      const file = await fetchPublic(new URL(url, pageUrl).href, {
        maxBytes: 10 * 1024 * 1024,
        accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
      });
      return saveImage(file.body);
    } catch {
      return ''; // A missing picture should not sink the whole import.
    }
  }

  admin.post(
    '/import/url',
    json,
    wrap(async (req, res) => {
      const url = str(req.body?.url, 1000);
      if (!url) throw bad('Paste a link to a recipe.');
      let page;
      try {
        page = await fetchPublic(url, { maxBytes: 5 * 1024 * 1024, accept: 'text/html,*/*;q=0.8' });
      } catch (error) {
        throw new HttpError(422, `Could not load that page. ${error.message}`);
      }
      const extracted = extractRecipeFromHtml(page.body.toString('utf8'));
      if (!extracted || (!extracted.ingredientLines.length && !extracted.steps.length)) {
        throw new HttpError(
          422,
          'No recipe data was found on that page. Try copying the recipe text and pasting it instead.',
        );
      }
      extracted.image = await importImage(extracted.image, page.url);
      res.json({ draft: buildDraft(extracted, loadInventory(db).types, page.url) });
    }),
  );

  admin.post(
    '/import/text',
    json,
    wrap((req, res) => {
      const text = typeof req.body?.text === 'string' ? req.body.text.slice(0, 20000) : '';
      if (!text.trim()) throw bad('Paste the recipe text first.');
      res.json({ draft: buildDraft(parseRecipeText(text), loadInventory(db).types) });
    }),
  );

  admin.post(
    '/upload',
    rawImage,
    wrap((req, res) => {
      if (!Buffer.isBuffer(req.body) || !req.body.length) throw bad('No image was received.');
      res.json({ url: saveImage(req.body) });
    }),
  );

  // An upload that ended up unused (editor cancelled, picture replaced before saving).
  admin.post(
    '/upload/discard',
    json,
    wrap((req, res) => {
      discardImage(req.body?.url);
      res.json({ ok: true });
    }),
  );

  // ----- settings -----

  admin.get('/settings', (req, res) => res.json({ settings: getSettings(db) }));

  admin.put(
    '/settings',
    json,
    wrap((req, res) => {
      const before = getSettings(db);
      const patch = {};
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (req.body?.[key] === undefined) continue;
        if (key === 'theme_custom') {
          // Accepts the colours as an object; stored as tidy JSON.
          const raw = req.body[key];
          patch[key] = JSON.stringify(typeof raw === 'string' ? parseCustom(raw) : cleanCustom(raw));
          continue;
        }
        if (FLAG_SETTINGS.includes(key)) {
          patch[key] = req.body[key] === true || req.body[key] === '1' ? '1' : '0';
          continue;
        }
        let value = str(String(req.body[key]), 300);
        if (IMAGE_SETTINGS.includes(key) && value && !isUpload(value)) {
          throw bad('Images must be uploaded first.');
        }
        if (key === 'theme' && !THEMES.some((t) => t.key === value)) throw bad('Unknown theme.');
        if (key === 'units') value = value === 'ml' ? 'ml' : 'oz';
        if (key === 'bar_name' && !value) throw bad('The bar needs a name.');
        if (key === 'public_url' && value && !/^https?:\/\/[^\s/]+/i.test(value)) {
          throw bad('The menu address should start with http:// or https://');
        }
        patch[key] = value;
      }
      saveSettings(db, patch);
      for (const key of IMAGE_SETTINGS) {
        if (before[key] && patch[key] !== undefined && before[key] !== patch[key]) discardImage(before[key]);
      }
      res.json({ settings: getSettings(db) });
    }),
  );

  // ----- users -----

  const listUsers = () =>
    db.prepare('SELECT id, username, created_at AS createdAt FROM users ORDER BY username COLLATE NOCASE').all();

  admin.get('/users', (req, res) => res.json({ users: listUsers(), me: req.user.id }));

  admin.post(
    '/users',
    json,
    wrap((req, res) => {
      const username = str(req.body?.username, 40);
      const problem = validateUsername(username) || validatePassword(req.body?.password);
      if (problem) throw bad(problem);
      uniqueGuard(
        () => db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hashPassword(req.body.password)),
        'That username is taken.',
      );
      res.json({ users: listUsers(), me: req.user.id });
    }),
  );

  admin.put(
    '/users/:id/password',
    json,
    wrap((req, res) => {
      const id = idParam(req);
      const problem = validatePassword(req.body?.password);
      if (problem) throw bad(problem);
      const info = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(req.body.password), id);
      if (!info.changes) throw new HttpError(404, 'User not found.');
      // Sign that account out everywhere else; keep the current browser signed in.
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
      if (id === req.user.id) startSession(db, req, res, id);
      res.json({ ok: true });
    }),
  );

  admin.delete(
    '/users/:id',
    wrap((req, res) => {
      const id = idParam(req);
      if (id === req.user.id) throw bad('You cannot delete the account you are signed in with.');
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
      res.json({ users: listUsers(), me: req.user.id });
    }),
  );

  // ----- export & restore -----

  function exportData() {
    const inv = loadInventory(db);
    const settings = getSettings(db);
    const recipes = loadRecipes(db, inv);
    const images = {};
    const addImage = (url) => {
      if (!isUpload(url) || images[url]) return;
      try {
        images[url] = fs.readFileSync(path.join(uploadDir, path.basename(url))).toString('base64');
      } catch {
        /* file is gone; export the rest */
      }
    };
    IMAGE_SETTINGS.forEach((key) => addImage(settings[key]));
    recipes.forEach((r) => addImage(r.image));

    return {
      app: 'bar-manager',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      categories: recipeMeta().categories,
      types: inv.types.map((t) => ({
        name: t.name,
        kind: t.kind,
        parent: t.parentId ? (inv.byId.get(t.parentId)?.name ?? null) : null,
        status: t.status,
        alwaysAvailable: t.alwaysAvailable,
        bottles: t.bottles.map((b) => ({ name: b.name, status: b.status, notes: b.notes })),
      })),
      recipes: recipes.map((r) => ({
        title: r.title,
        description: r.description,
        image: r.image,
        glass: r.glass,
        sourceUrl: r.sourceUrl,
        featured: r.featured,
        hidden: r.hidden,
        steps: r.steps,
        categories: r.categories,
        tags: r.tags,
        ingredients: r.ingredients.map((i) => ({
          type: i.typeName,
          bottle: i.bottleId ? i.name : null,
          amount: i.amount,
          unit: i.unit,
          note: i.note,
          optional: i.optional,
        })),
      })),
      images,
    };
  }

  admin.get('/export', (req, res) => {
    const stamp = new Date().toISOString().slice(0, 10);
    res.set('Content-Disposition', `attachment; filename="bar-backup-${stamp}.json"`);
    res.json(exportData());
  });

  admin.post(
    '/restore',
    bigJson,
    wrap((req, res) => {
      const data = req.body;
      if (data?.app !== 'bar-manager' || !Array.isArray(data.types) || !Array.isArray(data.recipes)) {
        throw bad('That file is not a backup from this app.');
      }

      // Write the pictures first; a failed restore then leaves only stray files behind.
      const imageMap = new Map();
      for (const [url, base64] of Object.entries(data.images || {})) {
        if (typeof base64 !== 'string') continue;
        try {
          imageMap.set(url, saveImage(Buffer.from(base64, 'base64')));
        } catch {
          /* skip anything that is not an image */
        }
      }
      const mapImage = (url) => imageMap.get(url) || null;
      const oldFiles = fs.readdirSync(uploadDir);

      db.transaction(() => {
        db.exec(
          'DELETE FROM recipes; DELETE FROM tags; DELETE FROM categories; DELETE FROM bottles; DELETE FROM ingredient_types; DELETE FROM settings;',
        );
        const s = data.settings || {};
        saveSettings(db, {
          ...Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v === 'string')),
          ...Object.fromEntries(IMAGE_SETTINGS.map((key) => [key, mapImage(s[key]) || ''])),
        });

        const typeIds = new Map();
        const bottleIds = new Map();
        const insType = db.prepare(
          'INSERT INTO ingredient_types (name, kind, status, always_available) VALUES (?, ?, ?, ?)',
        );
        const insBottle = db.prepare('INSERT INTO bottles (type_id, name, status, notes) VALUES (?, ?, ?, ?)');
        for (const t of data.types) {
          const name = str(t?.name, 80);
          if (!name || typeIds.has(name.toLowerCase())) continue;
          const id = insType.run(
            name,
            KIND_KEYS.includes(t.kind) ? t.kind : 'other',
            STATUSES.includes(t.status) ? t.status : 'none',
            t.alwaysAvailable ? 1 : 0,
          ).lastInsertRowid;
          typeIds.set(name.toLowerCase(), id);
          for (const b of Array.isArray(t.bottles) ? t.bottles : []) {
            const bottleName = str(b?.name, 80);
            if (!bottleName) continue;
            const bottleId = insBottle.run(
              id,
              bottleName,
              BOTTLE_STATUSES.includes(b.status) ? b.status : 'in',
              str(b.notes, 300),
            ).lastInsertRowid;
            bottleIds.set(`${id}:${bottleName.toLowerCase()}`, bottleId);
          }
        }
        const setParent = db.prepare('UPDATE ingredient_types SET parent_id = ? WHERE id = ?');
        for (const t of data.types) {
          const id = typeIds.get(str(t?.name, 80).toLowerCase());
          const parentId = typeIds.get(str(t?.parent, 80).toLowerCase());
          if (id && parentId && !wouldCreateLoop(db, id, parentId)) setParent.run(parentId, id);
        }

        const insCat = db.prepare('INSERT OR IGNORE INTO categories (name, position) VALUES (?, ?)');
        (Array.isArray(data.categories) ? data.categories : []).forEach((name, position) => {
          if (str(name, 40)) insCat.run(str(name, 40), position);
        });

        const insRecipe = db.prepare(
          `INSERT INTO recipes (slug, title, description, image, steps, glass, source_url, featured, hidden)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const r of data.recipes) {
          const ingredients = [];
          for (const i of Array.isArray(r?.ingredients) ? r.ingredients : []) {
            const typeName = str(i?.type, 80);
            if (!typeName) continue;
            let typeId = typeIds.get(typeName.toLowerCase());
            if (!typeId) {
              typeId = insType.run(typeName, 'other', 'none', 0).lastInsertRowid;
              typeIds.set(typeName.toLowerCase(), typeId);
            }
            ingredients.push({
              ...i,
              typeId,
              bottleId: i.bottle ? (bottleIds.get(`${typeId}:${str(i.bottle, 80).toLowerCase()}`) ?? null) : null,
            });
          }
          let f;
          try {
            f = recipeFields({ ...r, image: null, ingredients });
          } catch {
            continue; // skip a recipe that does not validate rather than failing everything
          }
          const id = insRecipe.run(
            uniqueSlug(f.title),
            f.title,
            f.description,
            mapImage(r.image),
            JSON.stringify(f.steps),
            f.glass,
            f.sourceUrl,
            f.featured,
            f.hidden,
          ).lastInsertRowid;
          writeRecipeLinks(id, f);
        }
      })();

      // The old pictures belonged to the data that was just replaced.
      const keep = new Set([...imageMap.values()].map((url) => path.basename(url)));
      for (const file of oldFiles) {
        if (!keep.has(file)) fs.rm(path.join(uploadDir, file), { force: true }, () => {});
      }
      res.json({ ok: true, recipes: db.prepare('SELECT COUNT(*) AS n FROM recipes').get().n });
    }),
  );

  // ---------- API errors ----------

  api.use((req, res) => res.status(404).json({ error: 'Not found.' }));
  api.use((error, req, res, next) => {
    void next;
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'That file is too large.' });
    }
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'That file could not be read.' });
    }
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server.' : error.message });
  });

  // ---------- PWA bits and the web app ----------

  const iconFile = (size) => {
    const s = getSettings(db);
    const custom = size === 512 ? s.icon512 : s.icon192;
    if (isUpload(custom)) {
      const file = path.join(uploadDir, path.basename(custom));
      if (fs.existsSync(file)) return file;
    }
    return path.join(DIST, 'icons', `icon-${size}.png`);
  };

  app.get(['/app-icon-192.png', '/app-icon-512.png'], (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(iconFile(req.path.includes('512') ? 512 : 192), (error) => {
      if (error && !res.headersSent) res.status(404).end();
    });
  });

  app.get('/manifest.webmanifest', (req, res) => {
    const s = getSettings(db);
    const v = encodeURIComponent(s.icon512 || 'default');
    const theme = resolveTheme(s.theme, parseCustom(s.theme_custom));
    res.set('Cache-Control', 'no-cache');
    res.type('application/manifest+json').send(
      JSON.stringify({
        name: s.bar_name,
        short_name: s.bar_name.slice(0, 12),
        description: `${s.bar_name} drinks menu`,
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: theme.bg,
        theme_color: theme.header,
        icons: [
          { src: `/app-icon-192.png?v=${v}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `/app-icon-512.png?v=${v}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `/app-icon-512.png?v=${v}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      }),
    );
  });

  if (fs.existsSync(path.join(DIST, 'index.html'))) {
    const template = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
    app.use(
      express.static(DIST, {
        index: false,
        setHeaders(res, file) {
          if (file.includes(`${path.sep}assets${path.sep}`)) {
            res.set('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            res.set('Cache-Control', 'no-cache');
          }
        },
      }),
    );
    app.get('*', (req, res) => {
      const config = publicConfig();
      const boot = JSON.stringify(config).replace(/</g, '\\u003c');
      res
        .set('Cache-Control', 'no-cache')
        .type('html')
        .send(
          template
            .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(config.barName)}</title>`)
            .replace('<!--boot-->', () => `<script>window.__BAR__=${boot}</script>`),
        );
    });
  } else {
    app.get('*', (req, res) => {
      res.status(503).type('text').send('The web app has not been built yet. Run "npm run build".');
    });
  }

  return app;
}
