// Domain logic: what is in stock, and which recipes can be made from it.

export const KINDS = [
  ['spirit', 'Spirits'],
  ['liqueur', 'Liqueurs'],
  ['wine', 'Vermouth & Wine'],
  ['bitters', 'Bitters'],
  ['syrup', 'Syrups'],
  ['juice', 'Juices'],
  ['mixer', 'Mixers'],
  ['garnish', 'Garnishes & Pantry'],
  ['other', 'Other'],
];
export const KIND_KEYS = KINDS.map(([k]) => k);

const RANK = { in: 3, low: 2, out: 1, none: 0 };
const inStock = (status) => status === 'in' || status === 'low';

const ML = { oz: 30, ml: 1, cl: 10, tsp: 5, tbsp: 15, cup: 240, shot: 45, barspoon: 5 };

/** Snapshot of ingredient types and bottles with derived stock state. */
export function loadInventory(db) {
  const types = db
    .prepare(
      'SELECT id, name, kind, parent_id AS parentId, status, always_available AS alwaysAvailable FROM ingredient_types ORDER BY name COLLATE NOCASE',
    )
    .all();
  const bottles = db
    .prepare(
      'SELECT id, type_id AS typeId, name, status, notes FROM bottles ORDER BY name COLLATE NOCASE',
    )
    .all();

  const byId = new Map();
  for (const t of types) {
    t.alwaysAvailable = !!t.alwaysAvailable;
    t.bottles = [];
    t.children = [];
    byId.set(t.id, t);
  }
  const bottleById = new Map();
  for (const b of bottles) {
    bottleById.set(b.id, b);
    byId.get(b.typeId)?.bottles.push(b);
  }
  for (const t of types) {
    if (t.parentId && byId.has(t.parentId)) byId.get(t.parentId).children.push(t);
  }

  for (const t of types) {
    // With named bottles the best bottle decides; otherwise the type's own toggle does.
    t.effectiveStatus = t.bottles.length
      ? t.bottles.reduce((best, b) => (RANK[b.status] > RANK[best] ? b.status : best), 'out')
      : t.status;
  }

  const resolve = (t, seen) => {
    if (t.available !== undefined) return;
    if (seen.has(t.id)) return; // guards against a parent loop
    seen.add(t.id);
    const have = [];
    for (const b of t.bottles) if (inStock(b.status)) have.push(b.name);
    let childAvailable = false;
    for (const c of t.children) {
      resolve(c, seen);
      if (c.available) {
        childAvailable = true;
        if (c.have?.length) have.push(...c.have);
        else have.push(c.name);
      }
    }
    t.have = have;
    t.available = t.alwaysAvailable || inStock(t.effectiveStatus) || childAvailable;
  };
  for (const t of types) resolve(t, new Set());
  for (const t of types) {
    t.available = !!t.available;
    t.have ??= [];
  }

  return { types, byId, bottleById };
}

function rootOf(inv, type) {
  let t = type;
  const seen = new Set();
  while (t.parentId && inv.byId.has(t.parentId) && !seen.has(t.id)) {
    seen.add(t.id);
    t = inv.byId.get(t.parentId);
  }
  return t;
}

/** All recipes with ingredients, categories, tags and availability. */
export function loadRecipes(db, inv = loadInventory(db)) {
  const recipes = db
    .prepare(
      `SELECT id, slug, title, description, image, steps, glass, source_url AS sourceUrl,
              featured, hidden, updated_at AS updatedAt
       FROM recipes ORDER BY title COLLATE NOCASE`,
    )
    .all();
  const byId = new Map();
  for (const r of recipes) {
    try {
      r.steps = JSON.parse(r.steps);
    } catch {
      r.steps = [];
    }
    r.featured = !!r.featured;
    r.hidden = !!r.hidden;
    r.ingredients = [];
    r.categories = [];
    r.tags = [];
    byId.set(r.id, r);
  }

  const ings = db
    .prepare(
      `SELECT recipe_id AS recipeId, type_id AS typeId, bottle_id AS bottleId, amount, unit, note, optional
       FROM recipe_ingredients ORDER BY recipe_id, position`,
    )
    .all();
  for (const i of ings) {
    const r = byId.get(i.recipeId);
    const type = inv.byId.get(i.typeId);
    if (!r || !type) continue;
    const bottle = i.bottleId ? inv.bottleById.get(i.bottleId) : null;
    r.ingredients.push({
      typeId: i.typeId,
      bottleId: bottle ? bottle.id : null,
      amount: i.amount,
      unit: i.unit,
      note: i.note,
      optional: !!i.optional,
      name: bottle ? bottle.name : type.name,
      typeName: type.name,
      kind: type.kind,
      available: bottle ? inStock(bottle.status) : type.available,
      have: bottle ? [] : type.have,
    });
  }

  for (const row of db
    .prepare(
      `SELECT rc.recipe_id AS recipeId, c.name FROM recipe_categories rc
       JOIN categories c ON c.id = rc.category_id ORDER BY c.position, c.name COLLATE NOCASE`,
    )
    .all()) {
    byId.get(row.recipeId)?.categories.push(row.name);
  }
  for (const row of db
    .prepare(
      `SELECT rt.recipe_id AS recipeId, t.name FROM recipe_tags rt
       JOIN tags t ON t.id = rt.tag_id ORDER BY t.name COLLATE NOCASE`,
    )
    .all()) {
    byId.get(row.recipeId)?.tags.push(row.name);
  }

  for (const r of recipes) {
    const required = r.ingredients.filter((i) => !i.optional);
    r.missing = [...new Set(required.filter((i) => !i.available).map((i) => i.name))];
    r.missingTypeIds = [
      ...new Set(required.filter((i) => !i.available).map((i) => i.typeId)),
    ];
    // A recipe with no ingredients yet is a draft, not something to pour.
    r.available = required.length > 0 && r.missing.length === 0;

    let best = null;
    let bestVolume = -1;
    for (const i of r.ingredients) {
      if (i.kind !== 'spirit') continue;
      const volume = (i.amount ?? 0) * (ML[i.unit] ?? 0);
      if (volume > bestVolume) {
        best = i;
        bestVolume = volume;
      }
    }
    r.baseSpirit = best ? rootOf(inv, inv.byId.get(best.typeId)).name : null;
  }
  return recipes;
}

/** Shape a recipe for guests: no internal ids, no admin-only fields. */
export function publicRecipe(r) {
  return {
    slug: r.slug,
    title: r.title,
    description: r.description,
    image: r.image,
    glass: r.glass,
    featured: r.featured,
    baseSpirit: r.baseSpirit,
    categories: r.categories,
    tags: r.tags,
    steps: r.steps,
    ingredients: r.ingredients.map((i) => ({
      name: i.name,
      amount: i.amount,
      unit: i.unit,
      note: i.note,
      optional: i.optional,
      available: i.available,
      have: i.have,
    })),
  };
}

export function publicMenu(db) {
  const recipes = loadRecipes(db).filter((r) => r.available && !r.hidden);
  const categories = db
    .prepare('SELECT name FROM categories ORDER BY position, name COLLATE NOCASE')
    .all()
    .map((c) => c.name)
    .filter((name) => recipes.some((r) => r.categories.includes(name)));
  return { recipes: recipes.map(publicRecipe), categories };
}

/** What guests can see is behind the bar, grouped by kind. */
export function publicBar(db) {
  const inv = loadInventory(db);
  const groups = [];
  for (const [kind, label] of KINDS) {
    const items = inv.types
      .filter((t) => t.kind === kind && !t.alwaysAvailable && inStock(t.effectiveStatus))
      .map((t) => ({
        name: t.name,
        bottles: t.bottles.filter((b) => inStock(b.status)).map((b) => b.name),
      }));
    if (items.length) groups.push({ kind, label, items });
  }
  return { groups };
}

/** Things to buy, plus single purchases that would unlock new drinks. */
export function shoppingList(db) {
  const inv = loadInventory(db);
  const recipes = loadRecipes(db, inv).filter((r) => !r.hidden);

  const usedIn = new Map();
  for (const r of recipes) {
    for (const id of new Set(r.ingredients.filter((i) => !i.optional).map((i) => i.typeId))) {
      usedIn.set(id, (usedIn.get(id) || 0) + 1);
    }
  }

  const items = [];
  for (const t of inv.types) {
    if (t.bottles.length) {
      for (const b of t.bottles) {
        if (b.status === 'in') continue;
        items.push({
          key: `b${b.id}`,
          bottleId: b.id,
          typeId: t.id,
          name: b.name,
          typeName: t.name,
          kind: t.kind,
          status: b.status,
          // Out of this bottle, but another one of the same type covers it.
          covered: b.status === 'out' && t.available,
          usedIn: usedIn.get(t.id) || 0,
        });
      }
    } else if (t.status === 'low' || t.status === 'out') {
      items.push({
        key: `t${t.id}`,
        bottleId: null,
        typeId: t.id,
        name: t.name,
        typeName: t.name,
        kind: t.kind,
        status: t.status,
        covered: t.status === 'out' && t.available,
        usedIn: usedIn.get(t.id) || 0,
      });
    }
  }

  const oneAway = new Map();
  for (const r of recipes) {
    if (r.available || r.missingTypeIds.length !== 1) continue;
    const id = r.missingTypeIds[0];
    if (!oneAway.has(id)) oneAway.set(id, { typeId: id, name: r.missing[0], recipes: [] });
    oneAway.get(id).recipes.push(r.title);
  }

  return {
    items,
    oneAway: [...oneAway.values()].sort((a, b) => b.recipes.length - a.recipes.length),
  };
}

/** True when making `parentId` the parent of `typeId` would create a loop. */
export function wouldCreateLoop(db, typeId, parentId) {
  let current = parentId;
  const seen = new Set();
  const stmt = db.prepare('SELECT parent_id AS parentId FROM ingredient_types WHERE id = ?');
  while (current) {
    if (current === typeId) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    current = stmt.get(current)?.parentId ?? null;
  }
  return false;
}
