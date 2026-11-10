// Recipe import without any AI: read schema.org Recipe data from a web page,
// or pick a pasted block of text apart with plain heuristics. Expect it to be
// right most of the time, not all of the time; the editor lets you fix the rest.

const FRACTIONS = {
  '½': 0.5,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 0.25,
  '¾': 0.75,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
  '⅕': 0.2,
  '⅙': 1 / 6,
};
const FRACTION_CHARS = Object.keys(FRACTIONS).join('');

const UNIT_ALIASES = {
  oz: ['oz', 'ounce', 'ounces', 'fl oz', 'fluid ounce', 'fluid ounces'],
  ml: ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'],
  cl: ['cl', 'centiliter', 'centiliters', 'centilitre', 'centilitres'],
  dash: ['dash', 'dashes'],
  drop: ['drop', 'drops'],
  barspoon: ['barspoon', 'barspoons', 'bar spoon', 'bar spoons', 'bsp'],
  tsp: ['tsp', 'teaspoon', 'teaspoons'],
  tbsp: ['tbsp', 'tablespoon', 'tablespoons'],
  cup: ['cup', 'cups'],
  part: ['part', 'parts'],
  splash: ['splash', 'splashes'],
  pinch: ['pinch', 'pinches'],
  leaf: ['leaf', 'leaves'],
  sprig: ['sprig', 'sprigs'],
  slice: ['slice', 'slices'],
  wedge: ['wedge', 'wedges'],
  shot: ['shot', 'shots'],
};
export const UNITS = ['', ...Object.keys(UNIT_ALIASES), 'top'];

const UNIT_LOOKUP = Object.entries(UNIT_ALIASES)
  .flatMap(([unit, aliases]) => aliases.map((alias) => [alias, unit]))
  .sort((a, b) => b[0].length - a[0].length);

const AMOUNT_RE = new RegExp(
  `^(?:(\\d+)\\s*([${FRACTION_CHARS}])|(\\d+)\\s+(\\d+)\\s*/\\s*(\\d+)|(\\d+)\\s*/\\s*(\\d+)|(\\d*\\.\\d+|\\d+)|([${FRACTION_CHARS}]))`,
);

function readAmount(text) {
  const m = AMOUNT_RE.exec(text);
  if (!m) return null;
  let value;
  if (m[1]) value = Number(m[1]) + FRACTIONS[m[2]];
  else if (m[3]) value = Number(m[3]) + Number(m[4]) / Number(m[5]);
  else if (m[6]) value = Number(m[6]) / Number(m[7]);
  else if (m[8]) value = Number(m[8]);
  else value = FRACTIONS[m[9]];
  if (!Number.isFinite(value)) return null;
  return { value: Math.round(value * 1000) / 1000, rest: text.slice(m[0].length) };
}

/** "1 1/2 oz fresh lime juice (strained)" -> { amount, unit, name, note, optional } */
export function parseIngredientLine(raw) {
  let text = String(raw)
    .replace(/\s+/g, ' ')
    .replace(/^[\s•·*▢☐□–—-]+/, '')
    .trim();
  let optional = false;
  let unit = '';
  let amount = null;
  const notes = [];

  const garnish = /^garnish(?:es)?(?:\s+with)?\s*[:\-–]?\s*/i.exec(text);
  if (garnish && garnish[0].length < text.length) {
    text = text.slice(garnish[0].length);
    optional = true;
    notes.push('for garnish');
  }

  const top = /^(?:top(?:ped)?(?: up| off)?(?: with)?|fill with)\s+/i.exec(text);
  if (top) {
    text = text.slice(top[0].length);
    unit = 'top';
  }

  const first = readAmount(text);
  if (first) {
    amount = first.value;
    text = first.rest.trim();
    // A range such as "2-3 dashes" or "2 to 3 dashes": keep the lower number.
    const range = /^(?:-|–|—|to)\s*/i.exec(text);
    if (range) {
      const second = readAmount(text.slice(range[0].length));
      if (second) text = second.rest.trim();
    }
  }

  if (unit !== 'top') {
    const lower = text.toLowerCase();
    for (const [alias, canonical] of UNIT_LOOKUP) {
      if (!lower.startsWith(alias)) continue;
      const after = text.slice(alias.length);
      if (after && !/^[.\s,)]/.test(after)) continue;
      // "leaves of mint" is a unit; a bare "Dash" with nothing after it is not.
      if (amount === null && !/^\.?\s+\S/.test(after)) continue;
      unit = canonical;
      text = after.replace(/^\./, '').trim();
      break;
    }
  }
  text = text.replace(/^of\s+/i, '');

  text = text
    .replace(/\(([^)]*)\)/g, (_, inner) => {
      if (inner.trim()) notes.push(inner.trim());
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();

  if (/\boptional\b/i.test(text) || notes.some((n) => /\boptional\b/i.test(n))) optional = true;
  if (/\b(?:for|to|as(?: a)?)\s+garnish\b/i.test(text)) {
    optional = true;
    if (!notes.includes('for garnish')) notes.push('for garnish');
  }
  text = text
    .replace(/[,;]?\s*\boptional\b/gi, '')
    .replace(/[,;]?\s*\b(?:for|to|as(?: a)?)\s+garnish\b/gi, '')
    .trim();

  const comma = text.indexOf(',');
  if (comma > 0) {
    const tail = text.slice(comma + 1).trim();
    if (tail) notes.push(tail);
    text = text.slice(0, comma).trim();
  }

  const cleanNotes = notes
    .map((n) => n.replace(/\boptional\b/gi, '').replace(/^[\s,;]+|[\s,;]+$/g, ''))
    .filter(Boolean);

  return {
    raw: String(raw).trim(),
    amount,
    unit,
    name: text.replace(/^[\s:.-]+|[\s:.,-]+$/g, ''),
    note: [...new Set(cleanNotes)].join(', '),
    optional,
  };
}

const STOPWORDS = new Set([
  'fresh', 'freshly', 'squeezed', 'chilled', 'cold', 'good', 'quality', 'premium', 'of', 'the',
  'a', 'an', 'your', 'favorite', 'favourite', 'homemade', 'large', 'small', 'to', 'taste', 'for',
  'garnish', 'optional', 'strained', 'pressed', 'brewed',
]);

export function normalizeName(name) {
  return String(name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOPWORDS.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join(' ');
}

// Common names from recipe sites -> the starter ingredient types.
const ALIASES = {
  'Soda Water': ['club soda', 'soda', 'sparkling water', 'seltzer', 'carbonated water'],
  'Orange Liqueur': ['triple sec', 'cointreau', 'curacao', 'orange curacao', 'dry curacao', 'grand marnier'],
  'Coffee Liqueur': ['kahlua'],
  'Rye Whiskey': ['rye', 'rye whisky'],
  Bourbon: ['bourbon whiskey'],
  Scotch: ['scotch whisky', 'blended scotch'],
  Whiskey: ['whisky'],
  'White Rum': ['light rum', 'silver rum'],
  'Aged Rum': ['gold rum', 'amber rum'],
  'Dark Rum': ['black rum', 'blackstrap rum'],
  'Blanco Tequila': ['silver tequila', 'tequila blanco'],
  'Reposado Tequila': ['tequila reposado'],
  'Sparkling Wine': ['champagne', 'prosecco', 'cava'],
  'Simple Syrup': ['sugar syrup', 'rich simple syrup', 'demerara syrup', 'simple'],
  'Agave Syrup': ['agave nectar', 'agave'],
  'Honey Syrup': ['honey'],
  'Angostura Bitters': ['angostura', 'aromatic bitters'],
  'Maraschino Liqueur': ['maraschino', 'luxardo maraschino'],
  'Elderflower Liqueur': ['st germain', 'st germain elderflower liqueur'],
  'Cream of Coconut': ['coconut cream'],
  'Heavy Cream': ['cream', 'double cream'],
  'Cocktail Cherry': ['maraschino cherry', 'cherry', 'brandied cherry', 'luxardo cherry'],
  'Orange Peel': ['orange twist', 'orange zest'],
  'Lemon Peel': ['lemon twist', 'lemon zest'],
  'Lime Wedge': ['lime wheel', 'lime slice'],
  Espresso: ['coffee'],
  'Sweet Vermouth': ['red vermouth', 'rosso vermouth', 'italian vermouth'],
  'Dry Vermouth': ['french vermouth', 'white vermouth'],
};

/** Build a matcher over the current ingredient types: name -> type id or null. */
export function createTypeMatcher(types) {
  const phrases = new Map(); // normalized phrase -> type id
  const idByName = new Map();
  for (const t of types) {
    idByName.set(t.name.toLowerCase(), t.id);
    const key = normalizeName(t.name);
    if (key && !phrases.has(key)) phrases.set(key, t.id);
  }
  for (const [typeName, aliases] of Object.entries(ALIASES)) {
    const id = idByName.get(typeName.toLowerCase());
    if (!id) continue;
    for (const alias of aliases) {
      const key = normalizeName(alias);
      if (key && !phrases.has(key)) phrases.set(key, id);
    }
  }

  return (name) => {
    const n = normalizeName(name);
    if (!n) return null;
    if (phrases.has(n)) return phrases.get(n);
    // Otherwise the longest known phrase that appears inside the name wins,
    // so "london dry gin" lands on Gin and "fresh lime juice" on Lime Juice.
    const padded = ` ${n} `;
    let best = null;
    let bestLength = 0;
    for (const [phrase, id] of phrases) {
      if (phrase.length > bestLength && padded.includes(` ${phrase} `)) {
        best = id;
        bestLength = phrase.length;
      }
    }
    return best;
  };
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

export function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    const lower = code.toLowerCase();
    if (lower in ENTITIES) return ENTITIES[lower];
    if (lower.startsWith('#x')) return safeCodePoint(parseInt(lower.slice(2), 16), whole);
    if (lower.startsWith('#')) return safeCodePoint(parseInt(lower.slice(1), 10), whole);
    return whole;
  });
}

function safeCodePoint(code, fallback) {
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

function clean(value) {
  if (value == null) return '';
  return decodeEntities(String(value).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function findRecipeNode(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNode(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (asArray(node['@type']).some((t) => String(t).toLowerCase() === 'recipe')) return node;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage']) {
    const found = findRecipeNode(node[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function instructionSteps(value, out = []) {
  for (const item of asArray(value)) {
    if (typeof item === 'string') {
      // A single blob: split on line breaks or list markup.
      for (const part of item.split(/<\/(?:li|p)>|<br\s*\/?>|\r?\n/i)) {
        const text = clean(part).replace(/^(?:step\s*)?\d+[.):]\s*/i, '');
        if (text) out.push(text);
      }
    } else if (item && typeof item === 'object') {
      if (item.itemListElement) instructionSteps(item.itemListElement, out);
      else if (item.text || item.name) out.push(clean(item.text || item.name));
    }
  }
  return out;
}

function imageUrl(value) {
  for (const item of asArray(value)) {
    if (typeof item === 'string' && item) return item;
    if (item && typeof item === 'object') {
      const url = imageUrl(item.url || item.contentUrl);
      if (url) return url;
    }
  }
  return '';
}

/** Pull a schema.org Recipe out of a page's JSON-LD. Returns null when there is none. */
export function extractRecipeFromHtml(html) {
  const scripts = String(html).matchAll(
    /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const [, body] of scripts) {
    let data;
    try {
      data = JSON.parse(body.trim());
    } catch {
      continue;
    }
    const node = findRecipeNode(data);
    if (!node) continue;
    const keywords = asArray(node.keywords)
      .flatMap((k) => String(k).split(','))
      .map(clean)
      .filter((k) => k && k.length <= 30);
    return {
      title: clean(node.name || node.headline),
      description: clean(node.description),
      image: imageUrl(node.image),
      ingredientLines: asArray(node.recipeIngredient || node.ingredients)
        .map(clean)
        .filter(Boolean),
      steps: instructionSteps(node.recipeInstructions),
      tags: [...new Set(keywords.map((k) => k.toLowerCase()))].slice(0, 8),
    };
  }
  return null;
}

const INGREDIENT_HEADER = /^(?:ingredients?|what you(?:'|’)?ll need|you(?:'|’)?ll need)\s*:?$/i;
const STEP_HEADER =
  /^(?:steps?|instructions?|directions?|method|preparation|how to make(?: it)?|to make)\s*:?$/i;
const STEP_PREFIX = /^(?:step\s*\d+\s*[:.)-]?|\d+[.)])\s+/i;
const BULLET = /^[\s•·*▢☐□–—-]+/;

function looksLikeIngredient(line) {
  const text = line.replace(BULLET, '');
  if (STEP_PREFIX.test(line)) return false;
  if (/^garnish/i.test(text)) return true;
  if (/^(?:top(?:ped)?(?: up| off)?(?: with)?|fill with)\s+\S/i.test(text) && text.length < 50) {
    return true;
  }
  return readAmount(text) !== null && text.length < 90;
}

/** Split pasted text into title, description, ingredient lines and steps. */
export function parseRecipeText(input) {
  const lines = String(input)
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const out = { title: '', description: '', image: '', ingredientLines: [], steps: [], tags: [] };
  const description = [];
  let section = 'intro';
  let sawIngredientHeader = false;

  for (const line of lines) {
    if (INGREDIENT_HEADER.test(line)) {
      section = 'ingredients';
      sawIngredientHeader = true;
      continue;
    }
    if (STEP_HEADER.test(line)) {
      section = 'steps';
      continue;
    }

    if (section === 'intro') {
      if (looksLikeIngredient(line)) {
        section = 'ingredients';
        out.ingredientLines.push(line);
      } else if (!out.title) {
        out.title = line.replace(/\s*recipe$/i, '');
      } else {
        description.push(line);
      }
      continue;
    }

    if (section === 'ingredients') {
      // Under an explicit header every line is an ingredient until the steps start.
      const isStep =
        STEP_PREFIX.test(line) ||
        (!looksLikeIngredient(line) && (!sawIngredientHeader || line.length > 70));
      if (!isStep) {
        out.ingredientLines.push(line);
        continue;
      }
      section = 'steps';
    }

    const step = line.replace(STEP_PREFIX, '').replace(BULLET, '').trim();
    if (step) out.steps.push(step);
  }

  out.description = description.join(' ');
  return out;
}

/** Turn extracted lines into a draft the recipe editor can load. */
export function buildDraft(extracted, types, sourceUrl = '') {
  const match = createTypeMatcher(types);
  const kindById = new Map(types.map((t) => [t.id, t.kind]));
  return {
    title: extracted.title || '',
    description: extracted.description || '',
    image: extracted.image || '',
    steps: extracted.steps || [],
    tags: extracted.tags || [],
    sourceUrl,
    ingredients: (extracted.ingredientLines || []).map((line) => {
      const parsed = parseIngredientLine(line);
      const typeId = match(parsed.name);
      return {
        raw: parsed.raw,
        amount: parsed.amount,
        unit: parsed.unit,
        note: parsed.note,
        optional: parsed.optional || kindById.get(typeId) === 'garnish',
        typeId,
        suggestedName: parsed.name,
      };
    }),
  };
}
