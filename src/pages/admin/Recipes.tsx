import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  api,
  get,
  type AdminRecipe,
  type Draft,
  type IngType,
  type TypesResponse,
} from '../../api';
import { useApp } from '../../app';
import { DrinkImage, EmptyState, Loading } from '../../components/ui';
import { discardUpload, shrink, upload } from '../../images';
import { amountToText, parseAmount, UNIT_LABELS } from '../../units';

interface RecipesReply {
  recipes: AdminRecipe[];
  categories: string[];
  tags: string[];
}

// ---------- list ----------

type Filter = 'all' | 'on' | 'off' | 'featured';

export function RecipesPage() {
  const { fail } = useApp();
  const [data, setData] = useState<RecipesReply | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    get<RecipesReply>('/api/admin/recipes').then(setData).catch(fail);
  }, [fail]);

  if (!data) return <Loading />;

  const toggleFeatured = (recipe: AdminRecipe) => {
    const featured = !recipe.featured;
    setData({ ...data, recipes: data.recipes.map((r) => (r.id === recipe.id ? { ...r, featured } : r)) });
    api('PATCH', `/api/admin/recipes/${recipe.id}`, { featured }).catch(fail);
  };

  const query = search.trim().toLowerCase();
  const onMenu = (r: AdminRecipe) => r.available && !r.hidden;
  const shown = data.recipes.filter((r) => {
    if (query && !r.title.toLowerCase().includes(query)) return false;
    if (filter === 'on') return onMenu(r);
    if (filter === 'off') return !onMenu(r);
    if (filter === 'featured') return r.featured;
    return true;
  });
  const live = data.recipes.filter(onMenu).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Recipes</h1>
          <p className="muted">
            {live} of {data.recipes.length} on the menu right now
          </p>
        </div>
        <Link to="/admin/recipes/new" className="btn btn-primary">
          + New recipe
        </Link>
      </div>

      <div className="toolbar">
        <input
          type="search"
          className="search"
          placeholder="Find a recipe"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Find a recipe"
        />
        <div className="chips" role="group" aria-label="Which recipes to show">
          {(
            [
              ['all', 'All'],
              ['on', 'On the menu'],
              ['off', 'Not on the menu'],
              ['featured', 'Featured'],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button type="button" key={key} className={filter === key ? 'chip active' : 'chip'} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState title="No recipes here">Try a different filter, or add a new recipe.</EmptyState>
      ) : (
        <ul className="recipe-list">
          {shown.map((r) => (
            <li key={r.id}>
              <Link to={`/admin/recipes/${r.id}`} className="recipe-row">
                <span className="recipe-thumb">
                  <DrinkImage image={r.image} title={r.title} glass={r.glass} />
                </span>
                <span className="recipe-row-text">
                  <strong>{r.title}</strong>
                  {r.hidden ? (
                    <small className="state-off">Hidden from the menu</small>
                  ) : r.available ? (
                    <small className="state-on">On the menu</small>
                  ) : (
                    <small className="state-off">
                      {r.ingredients.length ? `Missing ${r.missing.join(', ')}` : 'No ingredients yet'}
                    </small>
                  )}
                </span>
              </Link>
              <button
                type="button"
                className={r.featured ? 'star active' : 'star'}
                aria-pressed={r.featured}
                aria-label={r.featured ? `Stop featuring ${r.title}` : `Feature ${r.title}`}
                title={r.featured ? 'Featured' : 'Feature this drink'}
                onClick={() => toggleFeatured(r)}
              >
                ★
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ---------- editor ----------

interface Row {
  key: number;
  amount: string;
  unit: string;
  typeId: number | null;
  bottleId: number | null;
  note: string;
  optional: boolean;
  /** The original line from an import, shown until the row is matched. */
  raw: string;
  /** Name to offer when nothing in the ingredient list matched. */
  suggestion: string;
}

let rowKey = 1;
const blankRow = (): Row => ({
  key: rowKey++,
  amount: '',
  unit: 'oz',
  typeId: null,
  bottleId: null,
  note: '',
  optional: false,
  raw: '',
  suggestion: '',
});

function guessKind(name: string): string {
  const n = name.toLowerCase();
  if (/bitters/.test(n)) return 'bitters';
  if (/syrup|grenadine|orgeat|cordial|honey|agave/.test(n)) return 'syrup';
  if (/juice/.test(n)) return 'juice';
  if (/vermouth|wine|sherry|port|champagne|prosecco|lillet/.test(n)) return 'wine';
  if (/liqueur|cr[eè]me de|schnapps|amaro|curaçao|curacao|aperitif/.test(n)) return 'liqueur';
  if (/whisk|bourbon|rye|scotch|gin|vodka|rum|tequila|mezcal|brandy|cognac|pisco|cacha/.test(n)) return 'spirit';
  if (/soda|tonic|water|beer|ale|cola|cream|milk|egg|coffee|tea/.test(n)) return 'mixer';
  if (/peel|twist|wedge|wheel|sprig|mint|cherry|olive|salt|sugar|nutmeg|leaf|slice/.test(n)) return 'garnish';
  return 'other';
}

const titleCase = (text: string) => text.replace(/(^|\s)\S/g, (c) => c.toUpperCase());

/** Type-ahead box for choosing an ingredient, with a shortcut to add a new one. */
function TypePicker({
  types,
  value,
  suggestion,
  onPick,
  onCreate,
}: {
  types: IngType[];
  value: number | null;
  suggestion: string;
  onPick: (id: number) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const selected = types.find((t) => t.id === value) ?? null;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const query = text.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return types.slice(0, 50);
    const starts = types.filter((t) => t.name.toLowerCase().startsWith(query));
    const contains = types.filter((t) => !t.name.toLowerCase().startsWith(query) && t.name.toLowerCase().includes(query));
    return [...starts, ...contains].slice(0, 12);
  }, [types, query]);
  const exact = types.some((t) => t.name.toLowerCase() === query);
  const canCreate = !!query && !exact;
  const total = matches.length + (canCreate ? 1 : 0);

  const choose = (index: number) => {
    if (index < matches.length) onPick(matches[index].id);
    else if (canCreate) void onCreate(titleCase(text.trim()));
    setOpen(false);
    input.current?.blur();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(total - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (total) choose(active);
    } else if (e.key === 'Escape') {
      setOpen(false);
      input.current?.blur();
    }
  };

  return (
    <div className="type-picker">
      <input
        ref={input}
        className={value === null ? 'unmatched' : ''}
        value={open ? text : (selected?.name ?? '')}
        placeholder="Choose an ingredient"
        aria-label="Ingredient"
        autoComplete="off"
        onFocus={() => {
          setText(selected ? '' : suggestion);
          setActive(0);
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKey}
      />
      {open && total > 0 && (
        // preventDefault on mousedown keeps focus in the box so the click registers.
        <ul className="type-options" onMouseDown={(e) => e.preventDefault()}>
          {matches.map((t, index) => (
            <li key={t.id}>
              <button type="button" className={index === active ? 'active' : ''} onClick={() => choose(index)}>
                <span>{t.name}</span>
                <small className={t.available ? 'state-on' : 'state-off'}>{t.available ? 'in stock' : 'not in stock'}</small>
              </button>
            </li>
          ))}
          {canCreate && (
            <li>
              <button
                type="button"
                className={matches.length === active ? 'active create' : 'create'}
                onClick={() => choose(matches.length)}
              >
                + Add “{titleCase(text.trim())}” as a new ingredient
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function TokenInput({
  label,
  values,
  suggestions,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  suggestions: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const value = raw.trim().replace(/,$/, '').trim();
    if (value && !values.some((v) => v.toLowerCase() === value.toLowerCase())) onChange([...values, value]);
    setText('');
  };
  const unused = suggestions.filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()));

  return (
    <div className="field">
      <span>{label}</span>
      <div className="tokens">
        {values.map((v) => (
          <span key={v} className="token">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>
              ✕
            </button>
          </span>
        ))}
        <input
          value={text}
          placeholder={placeholder}
          aria-label={label}
          onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value) : setText(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(text);
            } else if (e.key === 'Backspace' && !text && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => text.trim() && add(text)}
        />
      </div>
      {unused.length > 0 && (
        <div className="token-suggestions">
          {unused.slice(0, 14).map((s) => (
            <button type="button" key={s} className="chip chip-tiny" onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RecipeEditPage() {
  const { id } = useParams();
  const recipeId = id ? Number(id) : null;
  const navigate = useNavigate();
  const { fail, toast } = useApp();

  const [ready, setReady] = useState(false);
  const [types, setTypes] = useState<IngType[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [glass, setGlass] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [featured, setFeatured] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [stepsText, setStepsText] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>(() => [blankRow(), blankRow(), blankRow()]);

  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const savedImage = useRef<string | null>(null);

  useEffect(() => {
    Promise.all([get<TypesResponse>('/api/admin/types'), get<RecipesReply>('/api/admin/recipes')])
      .then(([t, r]) => {
        setTypes(t.types);
        setUnits(t.units);
        setAllCategories(r.categories);
        setAllTags(r.tags);
        if (recipeId !== null) {
          const recipe = r.recipes.find((x) => x.id === recipeId);
          if (!recipe) {
            toast('That recipe no longer exists.', true);
            navigate('/admin/recipes', { replace: true });
            return;
          }
          setTitle(recipe.title);
          setDescription(recipe.description);
          setImage(recipe.image);
          savedImage.current = recipe.image;
          setGlass(recipe.glass);
          setSourceUrl(recipe.sourceUrl);
          setFeatured(recipe.featured);
          setHidden(recipe.hidden);
          setStepsText(recipe.steps.join('\n'));
          setCategories(recipe.categories);
          setTags(recipe.tags);
          setRows(
            recipe.ingredients.map((i) => ({
              ...blankRow(),
              amount: amountToText(i.amount),
              unit: i.unit,
              typeId: i.typeId,
              bottleId: i.bottleId,
              note: i.note,
              optional: i.optional,
            })),
          );
        }
        setReady(true);
      })
      .catch(fail);
  }, [recipeId, fail, toast, navigate]);

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const updateRow = (key: number, change: Partial<Row>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...change } : r)));

  const moveRow = (index: number, by: number) =>
    setRows((list) => {
      const target = index + by;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const createType = async (key: number, name: string) => {
    try {
      const reply = await api<{ id: number; types: IngType[] }>('POST', '/api/admin/types', {
        name,
        kind: guessKind(name),
      });
      setTypes(reply.types);
      updateRow(key, { typeId: reply.id, bottleId: null });
      toast(`Added ${name}. It is marked as not in stock until you update Inventory.`);
    } catch (e) {
      fail(e);
    }
  };

  const replaceImage = (next: string | null) => {
    // Clean up a picture that was uploaded during this visit and never saved.
    if (image && image !== savedImage.current) discardUpload(image);
    setImage(next);
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      replaceImage(await upload(await shrink(file, 1400, 'image/jpeg')));
    } catch (e) {
      fail(e);
    } finally {
      setUploading(false);
    }
  };

  const runImport = async () => {
    const text = importText.trim();
    if (!text) return;
    const isLink = /^https?:\/\/\S+$/i.test(text);
    setImporting(true);
    setImportNote('');
    try {
      const { draft } = isLink
        ? await api<{ draft: Draft }>('POST', '/api/admin/import/url', { url: text })
        : await api<{ draft: Draft }>('POST', '/api/admin/import/text', { text });
      if (draft.title) setTitle(draft.title);
      if (draft.description) setDescription(draft.description);
      if (draft.image) replaceImage(draft.image);
      if (draft.steps.length) setStepsText(draft.steps.join('\n'));
      if (draft.sourceUrl) setSourceUrl(draft.sourceUrl);
      if (draft.ingredients.length) {
        setRows(
          draft.ingredients.map((i) => ({
            ...blankRow(),
            amount: amountToText(i.amount),
            unit: i.unit,
            typeId: i.typeId,
            note: i.note,
            optional: i.optional,
            raw: i.raw,
            suggestion: i.suggestedName,
          })),
        );
      }
      const unmatched = draft.ingredients.filter((i) => i.typeId === null).length;
      setImportNote(
        `Imported ${draft.ingredients.length} ${draft.ingredients.length === 1 ? 'ingredient' : 'ingredients'} and ${draft.steps.length} ${draft.steps.length === 1 ? 'step' : 'steps'}.` +
          (unmatched
            ? ` ${unmatched} ${unmatched === 1 ? 'ingredient needs' : 'ingredients need'} matching below.`
            : ' Check it over, then save.'),
      );
      setImportText('');
    } catch (e) {
      setImportNote(e instanceof Error ? e.message : 'The import did not work.');
    } finally {
      setImporting(false);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const used = rows.filter((r) => r.typeId !== null || r.amount.trim() || r.note.trim() || r.raw);
    const ingredients = [];
    for (const [index, row] of used.entries()) {
      if (row.typeId === null) {
        toast(`Choose an ingredient for line ${index + 1}, or remove the line.`, true);
        return;
      }
      const amount = parseAmount(row.amount);
      if (amount === undefined) {
        toast(`“${row.amount}” on line ${index + 1} is not an amount. Try 1.5 or 1 1/2.`, true);
        return;
      }
      ingredients.push({
        typeId: row.typeId,
        bottleId: row.bottleId,
        amount,
        unit: row.unit,
        note: row.note,
        optional: row.optional,
      });
    }

    setSaving(true);
    try {
      const body = {
        title,
        description,
        image,
        glass,
        sourceUrl,
        featured,
        hidden,
        steps: stepsText.split('\n').map((s) => s.replace(/^\s*(?:step\s*)?\d+[.)]\s*/i, '').trim()).filter(Boolean),
        categories,
        tags,
        ingredients,
      };
      if (recipeId === null) await api('POST', '/api/admin/recipes', body);
      else await api('PUT', `/api/admin/recipes/${recipeId}`, body);
      savedImage.current = image;
      toast('Recipe saved.');
      navigate('/admin/recipes');
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (recipeId === null || !confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await api('DELETE', `/api/admin/recipes/${recipeId}`);
      toast('Recipe deleted.');
      navigate('/admin/recipes');
    } catch (e) {
      fail(e);
    }
  };

  const cancel = () => {
    if (image && image !== savedImage.current) discardUpload(image);
    navigate('/admin/recipes');
  };

  if (!ready) return <Loading />;

  return (
    <form onSubmit={save} className="editor">
      <div className="page-head">
        <h1>{recipeId === null ? 'New recipe' : 'Edit recipe'}</h1>
        <div className="head-actions">
          <button type="button" className="btn" onClick={cancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || uploading}>
            Save
          </button>
        </div>
      </div>

      <details className="panel import" open={recipeId === null}>
        <summary>Import from a website or pasted text</summary>
        <p className="muted">
          Paste a link to a recipe page, or paste the recipe itself (name, ingredient lines, then steps). It fills in
          the form below for you to check. It works on many sites, not all.
        </p>
        <textarea
          rows={4}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder={'https://…\n\nor\n\nGimlet\n2 oz gin\n3/4 oz lime juice\nShake with ice and strain.'}
          aria-label="Link or recipe text to import"
        />
        <div className="import-actions">
          <button type="button" className="btn" onClick={runImport} disabled={importing || !importText.trim()}>
            {importing ? 'Importing…' : 'Import'}
          </button>
          {importNote && <span role="status">{importNote}</span>}
        </div>
      </details>

      <div className="editor-grid">
        <section className="panel">
          <label className="field">
            <span>Name</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A sentence or two for the menu." />
          </label>
          <label className="field">
            <span>Glass</span>
            <input value={glass} onChange={(e) => setGlass(e.target.value)} placeholder="Rocks glass, coupe, highball…" list="glasses" />
            <datalist id="glasses">
              {['Rocks glass', 'Coupe', 'Highball', 'Collins glass', 'Martini glass', 'Flute', 'Wine glass', 'Copper mug'].map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </label>
        </section>

        <section className="panel">
          <div className="field">
            <span>Picture (optional)</span>
            <div className="image-input">
              <div className="image-preview">
                <DrinkImage image={image} title={title || 'New drink'} glass={glass} />
              </div>
              <div className="image-buttons">
                <label className="btn">
                  {uploading ? 'Uploading…' : image ? 'Change picture' : 'Add a picture'}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    disabled={uploading}
                    onChange={(e) => {
                      void pickImage(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
                {image && (
                  <button type="button" className="btn btn-ghost" onClick={() => replaceImage(null)}>
                    Remove
                  </button>
                )}
                <small className="muted">Without a picture, the menu draws one like this.</small>
              </div>
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
            <span>Feature at the top of the menu and on the TV</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
            <span>Hide from guests, even when everything is in stock</span>
          </label>
        </section>
      </div>

      <section className="panel">
        <h2>Ingredients</h2>
        <p className="muted">
          A drink shows on the menu when every ingredient that is not marked optional is in stock.
        </p>
        <div className="rows">
          {rows.map((row, index) => {
            const type = row.typeId !== null ? typeById.get(row.typeId) : undefined;
            return (
              <div key={row.key} className="ing-row">
                {row.raw && row.typeId === null && (
                  <div className="ing-raw">
                    Imported as “{row.raw}”. Choose what it is, or add it as a new ingredient.
                  </div>
                )}
                <input
                  className="ing-amount"
                  value={row.amount}
                  onChange={(e) => updateRow(row.key, { amount: e.target.value })}
                  placeholder="1 1/2"
                  inputMode="text"
                  aria-label={`Amount for line ${index + 1}`}
                />
                <select
                  className="ing-unit"
                  value={row.unit}
                  onChange={(e) => updateRow(row.key, { unit: e.target.value })}
                  aria-label={`Unit for line ${index + 1}`}
                >
                  {units.map((u) => (
                    <option key={u} value={u}>
                      {UNIT_LABELS[u] ?? u}
                    </option>
                  ))}
                </select>
                <TypePicker
                  types={types}
                  value={row.typeId}
                  suggestion={row.suggestion}
                  onPick={(typeId) => {
                    const picked = typeById.get(typeId);
                    updateRow(row.key, {
                      typeId,
                      bottleId: null,
                      // Garnishes rarely decide whether a drink can be made.
                      optional: row.optional || (row.typeId === null && picked?.kind === 'garnish'),
                    });
                  }}
                  onCreate={(name) => createType(row.key, name)}
                />
                {type && type.bottles.length > 0 && (
                  <select
                    className="ing-bottle"
                    value={row.bottleId ?? ''}
                    onChange={(e) => updateRow(row.key, { bottleId: e.target.value ? Number(e.target.value) : null })}
                    aria-label={`Bottle for line ${index + 1}`}
                  >
                    <option value="">Any {type.name}</option>
                    {type.bottles.map((b) => (
                      <option key={b.id} value={b.id}>
                        Only {b.name}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  className="ing-note-input"
                  value={row.note}
                  onChange={(e) => updateRow(row.key, { note: e.target.value })}
                  placeholder="Note (e.g. freshly squeezed)"
                  aria-label={`Note for line ${index + 1}`}
                />
                <label className="check ing-optional">
                  <input type="checkbox" checked={row.optional} onChange={(e) => updateRow(row.key, { optional: e.target.checked })} />
                  <span>Optional</span>
                </label>
                <div className="ing-tools">
                  <button type="button" className="icon-btn" onClick={() => moveRow(index, -1)} disabled={index === 0} aria-label="Move up">
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => moveRow(index, 1)}
                    disabled={index === rows.length - 1}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
                    aria-label={`Remove line ${index + 1}`}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <button type="button" className="btn" onClick={() => setRows((list) => [...list, blankRow()])}>
          + Add ingredient
        </button>
      </section>

      <section className="panel">
        <label className="field">
          <span>Steps</span>
          <textarea
            rows={Math.max(5, stepsText.split('\n').length + 1)}
            value={stepsText}
            onChange={(e) => setStepsText(e.target.value)}
            placeholder={'One step per line.\nShake everything with ice.\nStrain into a chilled coupe.'}
          />
          <small>One step per line. Numbers are added for you.</small>
        </label>
      </section>

      <section className="panel">
        <TokenInput
          label="Categories"
          values={categories}
          suggestions={allCategories}
          onChange={setCategories}
          placeholder="Add a category"
        />
        <TokenInput label="Tags" values={tags} suggestions={allTags} onChange={setTags} placeholder="Add a tag" />
        <label className="field">
          <span>Source link (optional)</span>
          <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" inputMode="url" />
        </label>
      </section>

      <div className="editor-foot">
        {recipeId !== null && (
          <button type="button" className="btn btn-danger" onClick={remove}>
            Delete recipe
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn" onClick={cancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving || uploading}>
          Save
        </button>
      </div>
    </form>
  );
}
