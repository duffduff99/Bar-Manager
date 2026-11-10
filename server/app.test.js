import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import { createApp } from './app.js';
import { openDatabase } from './db.js';
import {
  buildDraft,
  extractRecipeFromHtml,
  parseIngredientLine,
  parseRecipeText,
} from './parse.js';

// ---------- parsing ----------

test('parses amounts, units and notes from ingredient lines', () => {
  const cases = [
    ['1 1/2 oz fresh lime juice', 1.5, 'oz', 'fresh lime juice'],
    ['1½ ounces bourbon', 1.5, 'oz', 'bourbon'],
    ['¾ oz. simple syrup', 0.75, 'oz', 'simple syrup'],
    ['2-3 dashes Angostura bitters', 2, 'dash', 'Angostura bitters'],
    ['45 ml gin', 45, 'ml', 'gin'],
    ['2 cl club soda', 2, 'cl', 'club soda'],
    ['• 1/2 tsp sugar', 0.5, 'tsp', 'sugar'],
    ['8 mint leaves', 8, '', 'mint leaves'],
    ['Orange peel', null, '', 'Orange peel'],
    ['Top with ginger beer', null, 'top', 'ginger beer'],
    ['.5 oz Campari', 0.5, 'oz', 'Campari'],
  ];
  for (const [line, amount, unit, name] of cases) {
    const parsed = parseIngredientLine(line);
    assert.deepEqual([parsed.amount, parsed.unit, parsed.name], [amount, unit, name], line);
  }

  const noted = parseIngredientLine('1 oz lemon juice, freshly squeezed (about half a lemon)');
  assert.equal(noted.name, 'lemon juice');
  assert.match(noted.note, /freshly squeezed/);
  assert.match(noted.note, /half a lemon/);

  const garnish = parseIngredientLine('Garnish: lemon twist');
  assert.equal(garnish.name, 'lemon twist');
  assert.equal(garnish.optional, true);

  assert.equal(parseIngredientLine('1 egg white (optional)').optional, true);
});

test('splits pasted recipe text into its parts', () => {
  const recipe = parseRecipeText(`Jungle Bird

A bitter tiki drink from Kuala Lumpur.

Ingredients
1 1/2 oz dark rum
3/4 oz Campari
1 1/2 oz pineapple juice
1/2 oz lime juice
Pineapple wedge

Instructions
1. Shake everything with ice.
2. Strain over fresh ice in a rocks glass.`);
  assert.equal(recipe.title, 'Jungle Bird');
  assert.equal(recipe.description, 'A bitter tiki drink from Kuala Lumpur.');
  assert.equal(recipe.ingredientLines.length, 5);
  assert.deepEqual(recipe.steps, [
    'Shake everything with ice.',
    'Strain over fresh ice in a rocks glass.',
  ]);

  const bare = parseRecipeText(`Gimlet
2 oz gin
3/4 oz lime juice
Shake with ice and strain into a chilled coupe.`);
  assert.equal(bare.title, 'Gimlet');
  assert.equal(bare.ingredientLines.length, 2);
  assert.equal(bare.steps.length, 1);
});

test('reads schema.org recipe data from a page', () => {
  const html = `<html><head>
    <script type="application/ld+json">{"@type":"WebSite","name":"x"}</script>
    <script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[{"@type":["Recipe"],"name":"Caf&#233; Negroni &amp; Co",
        "description":"<p>Bitter.</p>","image":{"url":"https://example.com/a.jpg"},
        "recipeIngredient":["1 oz gin","1 oz Campari","1 oz sweet vermouth"],
        "recipeInstructions":[{"@type":"HowToStep","text":"Stir with ice."},
          {"@type":"HowToSection","itemListElement":[{"@type":"HowToStep","text":"Strain."}]}],
        "keywords":"bitter, stirred"}]}
    </script></head></html>`;
  const recipe = extractRecipeFromHtml(html);
  assert.equal(recipe.title, 'Café Negroni & Co');
  assert.equal(recipe.description, 'Bitter.');
  assert.equal(recipe.image, 'https://example.com/a.jpg');
  assert.deepEqual(recipe.steps, ['Stir with ice.', 'Strain.']);
  assert.deepEqual(recipe.tags, ['bitter', 'stirred']);
  assert.equal(extractRecipeFromHtml('<html></html>'), null);
});

test('matches imported ingredient names to known types', () => {
  const types = [
    { id: 1, name: 'Gin', kind: 'spirit' },
    { id: 2, name: 'Lime Juice', kind: 'juice' },
    { id: 3, name: 'Soda Water', kind: 'mixer' },
    { id: 4, name: 'Angostura Bitters', kind: 'bitters' },
    { id: 5, name: 'Orange Peel', kind: 'garnish' },
    { id: 6, name: 'Rum', kind: 'spirit' },
    { id: 7, name: 'Aged Rum', kind: 'spirit' },
  ];
  const draft = buildDraft(
    {
      ingredientLines: [
        '2 oz London dry gin',
        '3/4 oz freshly squeezed lime juice',
        'Club soda, to top',
        '2 dashes Angostura bitters',
        'orange twist',
        '1 oz aged rum',
        '1 oz overproof rum',
        '1 oz dragonfruit shrub',
      ],
    },
    types,
  );
  assert.deepEqual(
    draft.ingredients.map((i) => i.typeId),
    [1, 2, 3, 4, 5, 7, 6, null],
  );
  assert.equal(draft.ingredients[4].optional, true, 'garnishes default to optional');
  assert.equal(draft.ingredients[7].suggestedName, 'dragonfruit shrub');
});

// ---------- API ----------

let server;
let base;
let cookie = '';
let tmp;

async function call(method, url, body, { raw } = {}) {
  const headers = { Cookie: cookie };
  if (body !== undefined && !raw) headers['Content-Type'] = 'application/json';
  if (raw) headers['Content-Type'] = 'image/png';
  const response = await fetch(base + url, {
    method,
    headers,
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bar-test-'));
  const db = openDatabase(':memory:');
  const app = createApp(db, { uploadDir: path.join(tmp, 'uploads') });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const typeByName = (types, name) => types.find((t) => t.name === name);
const menuTitles = async () => (await call('GET', '/api/public/menu')).data.recipes.map((r) => r.title);

test('admin routes need a session and setup only works once', async () => {
  assert.equal((await call('GET', '/api/admin/types')).status, 401);
  assert.equal((await call('GET', '/api/public/config')).data.needsSetup, true);

  const weak = await call('POST', '/api/auth/setup', { username: 'travis', password: 'short' });
  assert.equal(weak.status, 400);

  const ok = await call('POST', '/api/auth/setup', { username: 'travis', password: 'correct horse' });
  assert.equal(ok.status, 200);
  assert.equal((await call('GET', '/api/auth/me')).data.user.username, 'travis');

  const again = await call('POST', '/api/auth/setup', { username: 'other', password: 'correct horse' });
  assert.equal(again.status, 403);

  const saved = cookie;
  cookie = '';
  assert.equal((await call('POST', '/api/auth/login', { username: 'travis', password: 'nope nope' })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { username: 'TRAVIS', password: 'correct horse' })).status, 200);
  cookie = saved;
});

test('the menu only shows drinks that can be made from what is in stock', async () => {
  assert.deepEqual(await menuTitles(), [], 'nothing is stocked to begin with');

  const { types } = (await call('GET', '/api/admin/types')).data;
  const id = (name) => typeByName(types, name).id;
  for (const name of ['Gin', 'Campari', 'Sweet Vermouth']) {
    await call('PUT', `/api/admin/types/${id(name)}`, { status: 'in' });
  }
  // The Negroni's orange peel is optional, so it does not hold the drink back.
  assert.deepEqual(await menuTitles(), ['Negroni']);

  await call('PUT', `/api/admin/types/${id('Campari')}`, { status: 'low' });
  assert.deepEqual(await menuTitles(), ['Negroni'], 'low still counts as available');

  await call('PUT', `/api/admin/types/${id('Campari')}`, { status: 'out' });
  assert.deepEqual(await menuTitles(), []);
  await call('PUT', `/api/admin/types/${id('Campari')}`, { status: 'in' });
});

test('bottles decide stock for their type, and child types satisfy the parent', async () => {
  const { types } = (await call('GET', '/api/admin/types')).data;
  const id = (name) => typeByName(types, name).id;
  await call('PUT', `/api/admin/types/${id('Soda Water')}`, { status: 'in' });

  // Whiskey Highball asks for any Whiskey; a bottle of Bourbon should do.
  assert.ok(!(await menuTitles()).includes('Whiskey Highball'));
  const bottle = await call('POST', '/api/admin/bottles', { typeId: id('Bourbon'), name: 'Buffalo Trace' });
  assert.ok((await menuTitles()).includes('Whiskey Highball'));

  const menu = (await call('GET', '/api/public/menu')).data;
  const highball = menu.recipes.find((r) => r.title === 'Whiskey Highball');
  assert.deepEqual(highball.ingredients[0].have, ['Buffalo Trace']);
  assert.equal(highball.baseSpirit, 'Whiskey');

  await call('PUT', `/api/admin/bottles/${bottle.data.id}`, { status: 'out' });
  assert.ok(!(await menuTitles()).includes('Whiskey Highball'));

  const shopping = (await call('GET', '/api/admin/shopping')).data;
  assert.ok(shopping.items.some((i) => i.name === 'Buffalo Trace' && i.status === 'out'));
  assert.ok(shopping.oneAway.some((o) => o.name === 'Whiskey' && o.recipes.includes('Whiskey Highball')));

  await call('PUT', `/api/admin/bottles/${bottle.data.id}`, { status: 'in' });
  const bar = (await call('GET', '/api/public/bar')).data;
  const spirits = bar.groups.find((g) => g.kind === 'spirit');
  assert.deepEqual(spirits.items.find((i) => i.name === 'Bourbon').bottles, ['Buffalo Trace']);
});

test('recipes can be created, featured, edited and deleted', async () => {
  const { types } = (await call('GET', '/api/admin/types')).data;
  const gin = typeByName(types, 'Gin').id;
  const soda = typeByName(types, 'Soda Water').id;

  const invalid = await call('POST', '/api/admin/recipes', { title: 'Broken', ingredients: [{ typeId: 99999 }] });
  assert.equal(invalid.status, 400);

  const created = await call('POST', '/api/admin/recipes', {
    title: 'Gin Rickey',
    description: 'Dry and fizzy.',
    steps: ['Build over ice.', ''],
    categories: ['Tall & Refreshing', 'House Specials'],
    tags: ['Easy', 'easy', 'fizzy'],
    featured: true,
    ingredients: [
      { typeId: gin, amount: 2, unit: 'oz' },
      { typeId: soda, amount: null, unit: 'top', note: 'cold' },
    ],
  });
  assert.equal(created.status, 200);

  const menu = (await call('GET', '/api/public/menu')).data;
  const rickey = menu.recipes.find((r) => r.slug === 'gin-rickey');
  assert.equal(rickey.featured, true);
  assert.deepEqual(rickey.steps, ['Build over ice.']);
  assert.deepEqual(rickey.tags, ['easy', 'fizzy']);
  assert.ok(menu.categories.includes('House Specials'));
  assert.equal(rickey.id, undefined, 'internal ids stay out of the public menu');

  await call('PATCH', `/api/admin/recipes/${created.data.id}`, { hidden: true });
  assert.ok(!(await menuTitles()).includes('Gin Rickey'));

  const full = (await call('GET', `/api/admin/recipes/${created.data.id}`)).data.recipe;
  await call('PUT', `/api/admin/recipes/${created.data.id}`, { ...full, title: 'Lime Rickey', hidden: false });
  assert.ok((await menuTitles()).includes('Lime Rickey'));

  const inUse = await call('DELETE', `/api/admin/types/${gin}`);
  assert.equal(inUse.status, 409);

  await call('DELETE', `/api/admin/recipes/${created.data.id}`);
  assert.ok(!(await menuTitles()).includes('Lime Rickey'));
});

test('uploads are checked, and a backup restores into the same state', async () => {
  const notImage = await call('POST', '/api/admin/upload', Buffer.from('<svg onload=alert(1)>'), { raw: true });
  assert.equal(notImage.status, 400);

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  const upload = await call('POST', '/api/admin/upload', png, { raw: true });
  assert.match(upload.data.url, /^\/uploads\/[a-f0-9]+\.png$/);
  await call('PUT', '/api/admin/settings', { bar_name: 'DuffBar', logo: upload.data.url, units: 'ml' });
  assert.equal((await fetch(base + upload.data.url)).status, 200);

  const before = await menuTitles();
  const backup = (await call('GET', '/api/admin/export')).data;
  assert.equal(backup.settings.bar_name, 'DuffBar');
  assert.equal(Object.keys(backup.images).length, 1);

  // Wreck things, then restore.
  const { types } = (await call('GET', '/api/admin/types')).data;
  await call('PUT', `/api/admin/types/${typeByName(types, 'Gin').id}`, { status: 'out' });
  await call('PUT', '/api/admin/settings', { bar_name: 'Other' });
  assert.notDeepEqual(await menuTitles(), before);

  const restored = await call('POST', '/api/admin/restore', backup);
  assert.equal(restored.status, 200);
  assert.deepEqual(await menuTitles(), before);

  const config = (await call('GET', '/api/public/config')).data;
  assert.equal(config.barName, 'DuffBar');
  assert.equal(config.units, 'ml');
  assert.equal((await fetch(base + config.logo)).status, 200, 'the logo came back with the restore');
  assert.equal((await fetch(base + upload.data.url)).status, 404, 'the replaced file was cleaned up');

  const after = (await call('GET', '/api/admin/types')).data.types;
  assert.equal(typeByName(after, 'Bourbon').parentId, typeByName(after, 'Whiskey').id);
  assert.equal(typeByName(after, 'Bourbon').bottles[0].name, 'Buffalo Trace');
  assert.equal((await call('GET', '/api/auth/me')).data.user.username, 'travis', 'accounts survive a restore');
});

test('the manifest and QR code follow the settings', async () => {
  const manifest = await (await fetch(base + '/manifest.webmanifest')).json();
  assert.equal(manifest.name, 'DuffBar');
  await call('PUT', '/api/admin/settings', { public_url: 'https://bar.example.com/' });
  const qr = await fetch(base + '/api/qr.svg');
  assert.match(qr.headers.get('content-type'), /svg/);
  assert.match(await qr.text(), /<svg/);
  assert.equal((await call('PUT', '/api/admin/settings', { public_url: 'not a url' })).status, 400);
});
