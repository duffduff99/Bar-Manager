// Starter data: common ingredient types and a set of classic cocktails.
// Everything starts as "not stocked", so the menu stays empty until inventory is taken.

// [name, kind, parent?, alwaysAvailable?]
const TYPES = [
  ['Whiskey', 'spirit'],
  ['Bourbon', 'spirit', 'Whiskey'],
  ['Rye Whiskey', 'spirit', 'Whiskey'],
  ['Scotch', 'spirit', 'Whiskey'],
  ['Irish Whiskey', 'spirit', 'Whiskey'],
  ['Gin', 'spirit'],
  ['Vodka', 'spirit'],
  ['Rum', 'spirit'],
  ['White Rum', 'spirit', 'Rum'],
  ['Aged Rum', 'spirit', 'Rum'],
  ['Dark Rum', 'spirit', 'Rum'],
  ['Spiced Rum', 'spirit', 'Rum'],
  ['Tequila', 'spirit'],
  ['Blanco Tequila', 'spirit', 'Tequila'],
  ['Reposado Tequila', 'spirit', 'Tequila'],
  ['Mezcal', 'spirit'],
  ['Brandy', 'spirit'],
  ['Cognac', 'spirit', 'Brandy'],

  ['Orange Liqueur', 'liqueur'],
  ['Campari', 'liqueur'],
  ['Aperol', 'liqueur'],
  ['Coffee Liqueur', 'liqueur'],
  ['Amaretto', 'liqueur'],
  ['Maraschino Liqueur', 'liqueur'],
  ['Green Chartreuse', 'liqueur'],
  ['Elderflower Liqueur', 'liqueur'],
  ['Irish Cream', 'liqueur'],
  ['Crème de Violette', 'liqueur'],
  ['Amaro', 'liqueur'],
  ['Absinthe', 'liqueur'],
  ['Peach Schnapps', 'liqueur'],

  ['Sweet Vermouth', 'wine'],
  ['Dry Vermouth', 'wine'],
  ['Sparkling Wine', 'wine'],

  ['Angostura Bitters', 'bitters'],
  ['Orange Bitters', 'bitters'],
  ["Peychaud's Bitters", 'bitters'],

  ['Simple Syrup', 'syrup'],
  ['Honey Syrup', 'syrup'],
  ['Grenadine', 'syrup'],
  ['Orgeat', 'syrup'],
  ['Agave Syrup', 'syrup'],

  ['Lime Juice', 'juice'],
  ['Lemon Juice', 'juice'],
  ['Orange Juice', 'juice'],
  ['Grapefruit Juice', 'juice'],
  ['Pineapple Juice', 'juice'],
  ['Cranberry Juice', 'juice'],

  ['Soda Water', 'mixer'],
  ['Tonic Water', 'mixer'],
  ['Ginger Beer', 'mixer'],
  ['Ginger Ale', 'mixer'],
  ['Cola', 'mixer'],
  ['Grapefruit Soda', 'mixer'],
  ['Cream of Coconut', 'mixer'],
  ['Espresso', 'mixer'],
  ['Heavy Cream', 'mixer'],
  ['Egg White', 'mixer'],

  ['Mint', 'garnish'],
  ['Orange Peel', 'garnish'],
  ['Lemon Peel', 'garnish'],
  ['Lime Wedge', 'garnish'],
  ['Cocktail Cherry', 'garnish'],
  ['Olives', 'garnish'],
  ['Salt', 'garnish'],
  ['Sugar', 'garnish'],
  ['Water', 'other', null, true],
];

const CATEGORIES = [
  'Spirit-Forward',
  'Sours',
  'Tall & Refreshing',
  'Bubbly',
  'Tropical',
  'After Dinner',
];

// ing: [amount, unit, type, note?, optional?]
const RECIPES = [
  {
    title: 'Old Fashioned',
    description: 'Whiskey, a little sugar and bitters over a big cube. The original cocktail.',
    glass: 'Rocks glass',
    cats: ['Spirit-Forward'],
    tags: ['stirred', 'classic'],
    ing: [
      [2, 'oz', 'Bourbon'],
      [0.25, 'oz', 'Simple Syrup'],
      [2, 'dash', 'Angostura Bitters'],
      [1, '', 'Orange Peel', 'for garnish', true],
    ],
    steps: [
      'Add the syrup and bitters to a rocks glass.',
      'Add the bourbon and one large ice cube, then stir for about 20 seconds.',
      'Express the orange peel over the glass and drop it in.',
    ],
  },
  {
    title: 'Manhattan',
    description: 'Rye and sweet vermouth, stirred until silky and served up.',
    glass: 'Coupe',
    cats: ['Spirit-Forward'],
    tags: ['stirred', 'classic'],
    ing: [
      [2, 'oz', 'Rye Whiskey'],
      [1, 'oz', 'Sweet Vermouth'],
      [2, 'dash', 'Angostura Bitters'],
      [1, '', 'Cocktail Cherry', 'for garnish', true],
    ],
    steps: [
      'Stir everything with ice in a mixing glass until well chilled.',
      'Strain into a chilled coupe.',
      'Garnish with a cherry.',
    ],
  },
  {
    title: 'Whiskey Sour',
    description: 'Bright lemon against warm bourbon. Add egg white for a foamy top.',
    glass: 'Rocks glass',
    cats: ['Sours'],
    tags: ['shaken', 'classic', 'citrusy'],
    ing: [
      [2, 'oz', 'Bourbon'],
      [0.75, 'oz', 'Lemon Juice'],
      [0.75, 'oz', 'Simple Syrup'],
      [0.5, 'oz', 'Egg White', '', true],
      [1, '', 'Cocktail Cherry', 'for garnish', true],
    ],
    steps: [
      'Shake everything hard with ice. If using egg white, shake once without ice first.',
      'Strain over fresh ice in a rocks glass.',
      'Garnish with a cherry.',
    ],
  },
  {
    title: 'Boulevardier',
    description: 'A Negroni that swapped gin for bourbon. Bittersweet and warming.',
    glass: 'Rocks glass',
    cats: ['Spirit-Forward'],
    tags: ['stirred', 'bitter'],
    ing: [
      [1.5, 'oz', 'Bourbon'],
      [1, 'oz', 'Campari'],
      [1, 'oz', 'Sweet Vermouth'],
      [1, '', 'Orange Peel', 'for garnish', true],
    ],
    steps: [
      'Stir with ice until well chilled.',
      'Strain over a large ice cube.',
      'Garnish with an orange peel.',
    ],
  },
  {
    title: 'Mint Julep',
    description: 'Bourbon, mint and crushed ice. Frosty and strong.',
    glass: 'Julep cup or rocks glass',
    cats: ['Spirit-Forward', 'Tall & Refreshing'],
    tags: ['built', 'minty'],
    ing: [
      [2, 'oz', 'Bourbon'],
      [0.5, 'oz', 'Simple Syrup'],
      [8, 'leaf', 'Mint', 'plus a sprig for garnish'],
    ],
    steps: [
      'Gently press the mint leaves with the syrup in the bottom of the cup.',
      'Add the bourbon and pack the cup with crushed ice.',
      'Stir until the cup frosts, top with more ice and garnish with a mint sprig.',
    ],
  },
  {
    title: 'Gold Rush',
    description: 'A whiskey sour sweetened with honey. Three ingredients, hard to beat.',
    glass: 'Rocks glass',
    cats: ['Sours'],
    tags: ['shaken', 'citrusy'],
    ing: [
      [2, 'oz', 'Bourbon'],
      [0.75, 'oz', 'Lemon Juice'],
      [0.75, 'oz', 'Honey Syrup'],
    ],
    steps: ['Shake with ice.', 'Strain over a large ice cube.'],
  },
  {
    title: 'Paper Plane',
    description: 'Equal parts bourbon, Aperol, amaro and lemon. Bitter, sour and bright.',
    glass: 'Coupe',
    cats: ['Sours'],
    tags: ['shaken', 'bitter', 'citrusy'],
    ing: [
      [0.75, 'oz', 'Bourbon'],
      [0.75, 'oz', 'Aperol'],
      [0.75, 'oz', 'Amaro', 'Amaro Nonino if you have it'],
      [0.75, 'oz', 'Lemon Juice'],
    ],
    steps: ['Shake with ice.', 'Strain into a chilled coupe.'],
  },
  {
    title: 'Whiskey Highball',
    description: 'Whiskey and very cold soda. Simple and endlessly drinkable.',
    glass: 'Highball',
    cats: ['Tall & Refreshing'],
    tags: ['built', 'easy'],
    ing: [
      [2, 'oz', 'Whiskey'],
      [4, 'oz', 'Soda Water'],
      [1, '', 'Lemon Peel', 'for garnish', true],
    ],
    steps: [
      'Fill a highball glass with ice and add the whiskey.',
      'Top with cold soda water and stir once, gently.',
    ],
  },
  {
    title: 'Sazerac',
    description: 'Rye, sugar and Peychaud’s in an absinthe-rinsed glass. A New Orleans classic.',
    glass: 'Rocks glass',
    cats: ['Spirit-Forward'],
    tags: ['stirred', 'classic'],
    ing: [
      [2, 'oz', 'Rye Whiskey'],
      [0.25, 'oz', 'Simple Syrup'],
      [3, 'dash', "Peychaud's Bitters"],
      [1, 'barspoon', 'Absinthe', 'to rinse the glass'],
      [1, '', 'Lemon Peel', 'for garnish', true],
    ],
    steps: [
      'Rinse a chilled rocks glass with the absinthe and discard the excess.',
      'Stir the rye, syrup and bitters with ice.',
      'Strain into the glass with no ice and express a lemon peel over the top.',
    ],
  },
  {
    title: 'Negroni',
    description: 'Equal parts gin, Campari and sweet vermouth. Bitter, sweet and balanced.',
    glass: 'Rocks glass',
    cats: ['Spirit-Forward'],
    tags: ['stirred', 'classic', 'bitter'],
    ing: [
      [1, 'oz', 'Gin'],
      [1, 'oz', 'Campari'],
      [1, 'oz', 'Sweet Vermouth'],
      [1, '', 'Orange Peel', 'for garnish', true],
    ],
    steps: [
      'Stir with ice until well chilled.',
      'Strain over a large ice cube.',
      'Garnish with an orange peel.',
    ],
  },
  {
    title: 'Martini',
    description: 'Gin and dry vermouth, ice cold. Olive or a twist, your call.',
    glass: 'Martini glass or coupe',
    cats: ['Spirit-Forward'],
    tags: ['stirred', 'classic'],
    ing: [
      [2.5, 'oz', 'Gin'],
      [0.5, 'oz', 'Dry Vermouth'],
      [1, 'dash', 'Orange Bitters', '', true],
      [1, '', 'Olives', 'or a lemon peel, for garnish', true],
    ],
    steps: [
      'Stir with plenty of ice for about 30 seconds.',
      'Strain into a chilled glass.',
      'Garnish with an olive or a lemon twist.',
    ],
  },
  {
    title: 'Gin & Tonic',
    description: 'Crisp, bitter and bubbly. Good gin, cold tonic, lots of ice.',
    glass: 'Highball',
    cats: ['Tall & Refreshing'],
    tags: ['built', 'easy'],
    ing: [
      [2, 'oz', 'Gin'],
      [4, 'oz', 'Tonic Water'],
      [1, '', 'Lime Wedge', 'for garnish', true],
    ],
    steps: [
      'Fill a glass with ice and add the gin.',
      'Top with tonic and stir once.',
      'Garnish with a lime wedge.',
    ],
  },
  {
    title: 'Tom Collins',
    description: 'Sparkling gin lemonade for grown-ups.',
    glass: 'Collins glass',
    cats: ['Tall & Refreshing'],
    tags: ['shaken', 'citrusy'],
    ing: [
      [2, 'oz', 'Gin'],
      [1, 'oz', 'Lemon Juice'],
      [0.5, 'oz', 'Simple Syrup'],
      [3, 'oz', 'Soda Water'],
    ],
    steps: [
      'Shake the gin, lemon juice and syrup with ice.',
      'Strain into an ice-filled Collins glass and top with soda water.',
    ],
  },
  {
    title: 'Gimlet',
    description: 'Gin and lime, sharp and clean.',
    glass: 'Coupe',
    cats: ['Sours'],
    tags: ['shaken', 'citrusy'],
    ing: [
      [2, 'oz', 'Gin'],
      [0.75, 'oz', 'Lime Juice'],
      [0.75, 'oz', 'Simple Syrup'],
    ],
    steps: ['Shake with ice.', 'Strain into a chilled coupe.'],
  },
  {
    title: 'French 75',
    description: 'Gin and lemon topped with sparkling wine. Celebration in a glass.',
    glass: 'Flute',
    cats: ['Bubbly'],
    tags: ['shaken', 'citrusy'],
    ing: [
      [1, 'oz', 'Gin'],
      [0.5, 'oz', 'Lemon Juice'],
      [0.5, 'oz', 'Simple Syrup'],
      [3, 'oz', 'Sparkling Wine'],
    ],
    steps: [
      'Shake the gin, lemon juice and syrup with ice.',
      'Strain into a flute and top with sparkling wine.',
    ],
  },
  {
    title: 'Aviation',
    description: 'Floral, tart and pale violet. A pre-Prohibition gin sour.',
    glass: 'Coupe',
    cats: ['Sours'],
    tags: ['shaken', 'floral'],
    ing: [
      [2, 'oz', 'Gin'],
      [0.5, 'oz', 'Maraschino Liqueur'],
      [0.25, 'oz', 'Crème de Violette'],
      [0.75, 'oz', 'Lemon Juice'],
    ],
    steps: ['Shake with ice.', 'Strain into a chilled coupe.'],
  },
  {
    title: 'Last Word',
    description: 'Equal parts gin, Chartreuse, maraschino and lime. Herbal and punchy.',
    glass: 'Coupe',
    cats: ['Sours'],
    tags: ['shaken', 'herbal'],
    ing: [
      [0.75, 'oz', 'Gin'],
      [0.75, 'oz', 'Green Chartreuse'],
      [0.75, 'oz', 'Maraschino Liqueur'],
      [0.75, 'oz', 'Lime Juice'],
    ],
    steps: ['Shake with ice.', 'Strain into a chilled coupe.'],
  },
  {
    title: "Bee's Knees",
    description: 'Gin, lemon and honey. Soft, bright and easy to like.',
    glass: 'Coupe',
    cats: ['Sours'],
    tags: ['shaken', 'citrusy'],
    ing: [
      [2, 'oz', 'Gin'],
      [0.75, 'oz', 'Lemon Juice'],
      [0.75, 'oz', 'Honey Syrup'],
    ],
    steps: ['Shake with ice.', 'Strain into a chilled coupe.'],
  },
  {
    title: 'Margarita',
    description: 'Tequila, lime and orange liqueur with a salted rim.',
    glass: 'Rocks glass',
    cats: ['Sours'],
    tags: ['shaken', 'classic', 'citrusy'],
    ing: [
      [2, 'oz', 'Blanco Tequila'],
      [1, 'oz', 'Lime Juice'],
      [0.75, 'oz', 'Orange Liqueur'],
      [0.25, 'oz', 'Agave Syrup', '', true],
      [1, '', 'Salt', 'for the rim', true],
    ],
    steps: [
      'Salt half the rim of a rocks glass.',
      'Shake everything with ice.',
      'Strain over fresh ice.',
    ],
  },
  {
    title: 'Paloma',
    description: 'Tequila and grapefruit soda with a squeeze of lime. Mexico’s favourite highball.',
    glass: 'Highball',
    cats: ['Tall & Refreshing'],
    tags: ['built', 'easy', 'citrusy'],
    ing: [
      [2, 'oz', 'Tequila'],
      [0.5, 'oz', 'Lime Juice'],
      [4, 'oz', 'Grapefruit Soda'],
      [1, '', 'Salt', 'pinch, or for the rim', true],
    ],
    steps: [
      'Fill a highball glass with ice and add the tequila and lime juice.',
      'Top with grapefruit soda and stir gently.',
    ],
  },
  {
    title: 'Tequila Sunrise',
    description: 'Tequila and orange juice with grenadine sinking through it.',
    glass: 'Highball',
    cats: ['Tall & Refreshing'],
    tags: ['built', 'easy', 'sweet'],
    ing: [
      [2, 'oz', 'Tequila'],
      [4, 'oz', 'Orange Juice'],
      [0.5, 'oz', 'Grenadine'],
    ],
    steps: [
      'Fill a glass with ice, add the tequila and orange juice and stir.',
      'Slowly pour the grenadine down the side so it settles at the bottom.',
    ],
  },
  {
    title: 'Daiquiri',
    description: 'Rum, lime and sugar. Nothing to hide behind.',
    glass: 'Coupe',
    cats: ['Sours'],
    tags: ['shaken', 'classic', 'citrusy'],
    ing: [
      [2, 'oz', 'White Rum'],
      [1, 'oz', 'Lime Juice'],
      [0.75, 'oz', 'Simple Syrup'],
    ],
    steps: ['Shake hard with ice.', 'Strain into a chilled coupe.'],
  },
  {
    title: 'Mojito',
    description: 'Rum, lime, mint and soda. Tall, cold and fresh.',
    glass: 'Highball',
    cats: ['Tall & Refreshing'],
    tags: ['built', 'minty', 'citrusy'],
    ing: [
      [2, 'oz', 'White Rum'],
      [0.75, 'oz', 'Lime Juice'],
      [0.75, 'oz', 'Simple Syrup'],
      [8, 'leaf', 'Mint'],
      [2, 'oz', 'Soda Water'],
    ],
    steps: [
      'Gently press the mint with the syrup in a highball glass.',
      'Add the rum and lime juice, fill with ice and stir.',
      'Top with soda water and garnish with more mint.',
    ],
  },
  {
    title: 'Dark & Stormy',
    description: 'Dark rum floated over spicy ginger beer.',
    glass: 'Highball',
    cats: ['Tall & Refreshing'],
    tags: ['built', 'easy', 'spicy'],
    ing: [
      [2, 'oz', 'Dark Rum'],
      [0.5, 'oz', 'Lime Juice', '', true],
      [4, 'oz', 'Ginger Beer'],
    ],
    steps: [
      'Fill a glass with ice and add the ginger beer and lime juice.',
      'Float the rum on top.',
    ],
  },
  {
    title: 'Mai Tai',
    description: 'Aged rum, lime, orange liqueur and almondy orgeat. The tiki standard.',
    glass: 'Rocks glass',
    cats: ['Tropical'],
    tags: ['shaken', 'tiki'],
    ing: [
      [2, 'oz', 'Aged Rum'],
      [0.75, 'oz', 'Lime Juice'],
      [0.5, 'oz', 'Orange Liqueur'],
      [0.5, 'oz', 'Orgeat'],
      [1, 'sprig', 'Mint', 'for garnish', true],
    ],
    steps: [
      'Shake with ice.',
      'Pour into a rocks glass over crushed ice.',
      'Garnish with a mint sprig.',
    ],
  },
  {
    title: 'Piña Colada',
    description: 'Rum, pineapple and coconut. A holiday in a glass.',
    glass: 'Hurricane or tall glass',
    cats: ['Tropical'],
    tags: ['blended', 'sweet', 'tiki'],
    ing: [
      [2, 'oz', 'White Rum'],
      [3, 'oz', 'Pineapple Juice'],
      [1.5, 'oz', 'Cream of Coconut'],
      [0.5, 'oz', 'Lime Juice', '', true],
    ],
    steps: [
      'Blend with a cup of ice until smooth, or shake hard with ice.',
      'Pour into a tall glass.',
    ],
  },
  {
    title: 'Moscow Mule',
    description: 'Vodka, lime and ginger beer in a cold copper mug.',
    glass: 'Copper mug',
    cats: ['Tall & Refreshing'],
    tags: ['built', 'easy', 'spicy'],
    ing: [
      [2, 'oz', 'Vodka'],
      [0.5, 'oz', 'Lime Juice'],
      [4, 'oz', 'Ginger Beer'],
    ],
    steps: [
      'Fill a mug with ice and add the vodka and lime juice.',
      'Top with ginger beer and stir gently.',
    ],
  },
  {
    title: 'Cosmopolitan',
    description: 'Vodka, cranberry, lime and orange liqueur. Tart and pink.',
    glass: 'Coupe',
    cats: ['Sours'],
    tags: ['shaken', 'citrusy'],
    ing: [
      [1.5, 'oz', 'Vodka'],
      [0.75, 'oz', 'Orange Liqueur'],
      [0.75, 'oz', 'Cranberry Juice'],
      [0.5, 'oz', 'Lime Juice'],
    ],
    steps: ['Shake with ice.', 'Strain into a chilled coupe.'],
  },
  {
    title: 'Espresso Martini',
    description: 'Vodka, coffee liqueur and fresh espresso, shaken to a creamy foam.',
    glass: 'Coupe',
    cats: ['After Dinner'],
    tags: ['shaken', 'coffee'],
    ing: [
      [2, 'oz', 'Vodka'],
      [1, 'oz', 'Coffee Liqueur'],
      [1, 'oz', 'Espresso', 'freshly brewed'],
      [0.25, 'oz', 'Simple Syrup', '', true],
    ],
    steps: ['Shake very hard with ice.', 'Strain into a chilled coupe.'],
  },
  {
    title: 'White Russian',
    description: 'Vodka and coffee liqueur with a float of cream.',
    glass: 'Rocks glass',
    cats: ['After Dinner'],
    tags: ['built', 'easy', 'creamy', 'coffee'],
    ing: [
      [2, 'oz', 'Vodka'],
      [1, 'oz', 'Coffee Liqueur'],
      [1, 'oz', 'Heavy Cream'],
    ],
    steps: [
      'Add the vodka and coffee liqueur to a rocks glass filled with ice.',
      'Float the cream on top.',
    ],
  },
  {
    title: 'Aperol Spritz',
    description: 'Aperol, sparkling wine and a splash of soda. Light and bittersweet.',
    glass: 'Wine glass',
    cats: ['Bubbly', 'Tall & Refreshing'],
    tags: ['built', 'easy', 'bitter'],
    ing: [
      [2, 'oz', 'Aperol'],
      [3, 'oz', 'Sparkling Wine'],
      [1, 'oz', 'Soda Water'],
    ],
    steps: ['Fill a wine glass with ice.', 'Add everything and stir gently.'],
  },
  {
    title: 'Sidecar',
    description: 'Cognac, orange liqueur and lemon with a sugared rim.',
    glass: 'Coupe',
    cats: ['Sours'],
    tags: ['shaken', 'classic', 'citrusy'],
    ing: [
      [2, 'oz', 'Cognac'],
      [0.75, 'oz', 'Orange Liqueur'],
      [0.75, 'oz', 'Lemon Juice'],
      [1, '', 'Sugar', 'for the rim', true],
    ],
    steps: [
      'Sugar the rim of a chilled coupe.',
      'Shake everything with ice and strain into the glass.',
    ],
  },
  {
    title: 'Amaretto Sour',
    description: 'Sweet almond liqueur sharpened with lemon.',
    glass: 'Rocks glass',
    cats: ['Sours', 'After Dinner'],
    tags: ['shaken', 'sweet'],
    ing: [
      [2, 'oz', 'Amaretto'],
      [1, 'oz', 'Lemon Juice'],
      [0.25, 'oz', 'Simple Syrup', '', true],
      [0.5, 'oz', 'Egg White', '', true],
    ],
    steps: ['Shake hard with ice.', 'Strain over fresh ice.'],
  },
];

export function slugify(text) {
  return (
    String(text)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'drink'
  );
}

export function seedDatabase(db) {
  db.transaction(() => {
    const typeIds = new Map();
    const insType = db.prepare(
      'INSERT INTO ingredient_types (name, kind, parent_id, always_available) VALUES (?, ?, ?, ?)',
    );
    for (const [name, kind, parent, always] of TYPES) {
      const info = insType.run(name, kind, parent ? typeIds.get(parent) : null, always ? 1 : 0);
      typeIds.set(name, info.lastInsertRowid);
    }

    const catIds = new Map();
    const insCat = db.prepare('INSERT INTO categories (name, position) VALUES (?, ?)');
    CATEGORIES.forEach((name, i) => catIds.set(name, insCat.run(name, i).lastInsertRowid));

    const tagIds = new Map();
    const insTag = db.prepare('INSERT INTO tags (name) VALUES (?)');
    const insRecipe = db.prepare(
      'INSERT INTO recipes (slug, title, description, glass, steps) VALUES (?, ?, ?, ?, ?)',
    );
    const insIng = db.prepare(
      'INSERT INTO recipe_ingredients (recipe_id, position, type_id, amount, unit, note, optional) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const insRC = db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)');
    const insRT = db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)');

    for (const r of RECIPES) {
      const id = insRecipe.run(
        slugify(r.title),
        r.title,
        r.description,
        r.glass,
        JSON.stringify(r.steps),
      ).lastInsertRowid;
      r.ing.forEach(([amount, unit, type, note, optional], i) => {
        if (!typeIds.has(type)) throw new Error(`Seed: unknown ingredient type ${type}`);
        insIng.run(id, i, typeIds.get(type), amount, unit, note || '', optional ? 1 : 0);
      });
      for (const c of r.cats) insRC.run(id, catIds.get(c));
      for (const t of r.tags) {
        if (!tagIds.has(t)) tagIds.set(t, insTag.run(t).lastInsertRowid);
        insRT.run(id, tagIds.get(t));
      }
    }
  })();
}
