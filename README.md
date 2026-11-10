# Bar Manager

A small self-hosted app for a home bar. You keep track of what is on the shelf, and your guests
get a live menu that only lists the drinks you can make right now.

- **Guest menu** at the base URL, no sign-in. Search, filter by category or spirit, and a
  "Pick a drink for me" button that asks two questions and spins.
- **Drink pages** with scaling (make 4, make 8), an oz/ml switch and a batch total with optional
  dilution water.
- **Behind the bar** page listing every bottle and mixer that is in stock.
- **Inventory** built for quick stocktakes: one tap for In / Low / Out per ingredient or bottle.
- **Recipes** with picture, description, ingredients, steps, categories, tags and a "featured" pin.
  Import from a recipe link or pasted text.
- **Shopping** list of what is low or out, plus single purchases that would unlock new drinks.
- **TV display** at `/tv`: logo, rotating featured drinks and a QR code for the menu.
- **Installable** as an app on a phone (PWA).
- Backup and restore as one JSON file.

One container, one volume. Data is a SQLite file plus an uploads folder.

## Run it

```bash
docker compose up -d --build
```

Then open `http://<host>:3000`. The first visit to **Sign in** asks you to create the admin
account. Do that straight away: until an account exists, whoever opens the page first can create it.

The app ships with about 70 common ingredients and 33 classic cocktails. Everything starts as
"not stocked", so the menu is empty until you go to **Inventory**, switch to **Everything** and
tap **In** on what you have.

### Dockhand

Create a stack from this Git repository and point it at `compose.yaml`. The compose file builds
the image from the `Dockerfile` in the repo, so the Docker host needs internet access during the
build. After pulling new commits, redeploy with a rebuild so the image is refreshed.

### Settings

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `3000` | Port the app listens on inside the container. |
| `BAR_NAME` | `Home Bar` | Name shown until you set one in Settings. |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | unset | Create the first admin at startup instead of using the setup screen. Ignored once any account exists. |
| `SEED` | `true` | Set to `false` to start with no ingredients or recipes. Only read when the database is first created. |
| `TRUST_PROXY` | `1` | Number of reverse proxies in front of the app. |
| `ALLOW_PRIVATE_IMPORT` | `false` | Allow recipe import from addresses on your own network. |

Data lives in `/data` inside the container (`bar.db` and `uploads/`). The compose file keeps it
in a named volume called `bar-data`. If you bind-mount a host folder instead, make it writable by
user id 1000, which is what the container runs as.

### Reverse proxy

Put it behind your proxy like any other web app and forward the `Host` and `X-Forwarded-Proto`
headers. HTTPS is needed for the app to be installable on phones. Uploads are capped at 12 MB and
a restore file can be large, so raise the proxy's body size limit if a restore fails.

## How stock works

- An **ingredient** is the generic thing a recipe asks for: Bourbon, Lime Juice, Campari.
- A **bottle** is a specific product that belongs to an ingredient: Buffalo Trace is a Bourbon.
  Bottles are optional. Without them, the ingredient itself has the In / Low / Out switch. With
  them, each bottle has its own switch and the ingredient is in stock if any bottle is.
- An ingredient can **count as** another. Bourbon counts as Whiskey, so a recipe that asks for
  any whiskey is available when you have bourbon.
- A recipe line can ask for any bottle of an ingredient, or only one specific bottle.
- A drink is on the menu when every ingredient not marked **optional** is In or Low, and the
  recipe is not hidden. Garnishes default to optional.

## Importing recipes

On **New recipe**, paste a link or the recipe text and press Import. There is no AI involved:

- A link works when the page publishes structured recipe data (schema.org), which most large
  recipe sites do. Sites that block automated requests, or have no structured data, will fail.
  Copy the text from the page and paste that instead.
- Pasted text should be the name, then ingredient lines, then steps. Headings such as
  "Ingredients" and "Instructions" help but are not required.

Each ingredient line is matched to your ingredient list. Lines that could not be matched are
highlighted so you can pick the right one or add it as a new ingredient. Always read the result
before saving.

## The TV

`/tv` is a full-screen page made for a 16:9 screen. It shows featured drinks, or the whole menu
if nothing is featured, and refreshes itself.

- **From a laptop:** open `/tv` in Chrome and use Cast > Cast tab.
- **From Home Assistant:** the built-in Cast integration only casts Home Assistant dashboards.
  For an arbitrary web page, use the community
  [DashCast integration](https://github.com/AlexxIT/DashCast) (`dash_cast.load_url` with your
  media player and the `/tv` address), or the `catt` command line tool (`catt cast_site <url>`).

Two things commonly trip this up. A Chromecast needs to resolve the address itself, and many of
them ignore the DNS server handed out by your router and ask Google's instead, so a name that
only exists in local DNS may not load. It also needs a certificate it trusts, so a private
certificate authority will not work; a public certificate (for example Let's Encrypt through a
DNS challenge) will.

## Development

```bash
npm install
npm run dev     # API on :3000, web app with hot reload on :5173
npm test        # server tests
npm run build   # production build into dist/
npm start       # serve the built app
```

Node 22 or newer. The server is plain JavaScript (Express and better-sqlite3) in `server/`; the
web app is React and TypeScript in `src/`.

## License

MIT
