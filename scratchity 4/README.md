# Scratchity

Describe a Scratch project, get the blocks. Uses Qwen2.5-Coder-32B-Instruct through
Cloudflare Workers AI, and draws the answer as real Scratch 3 blocks with scratchblocks.

```
scratchity/
  shared/      <- edit these (app.js, app.css, sb3.js converter, scratchblocks, icon)
  site/        <- Cloudflare Pages: public/ (web page) + functions/api (Qwen)
  extension/   <- Chrome side panel extension
```

## Deploy the web version

```sh
cd ~/sites/scratchity/site
npx wrangler pages deploy
```

The project name in `site/wrangler.toml` is `scratchity`, so it deploys to
`https://scratchity.pages.dev` if that name is free. If Cloudflare adds a random suffix, the name is taken too:
change `name` in `wrangler.toml` and deploy again.

That URL is the web version, and it's also the server the extension talks to. No API key
needed: the `[ai]` binding in `wrangler.toml` gives the Pages Function access to Qwen2.5-Coder
on your Cloudflare account.

If Wrangler mentions a config file outside this folder (like `~/Downloads/wrangler.jsonc`),
it's picking up another project's config. Deploy from `~/sites/scratchity/site` so it
finds this one.

## Load the extension

1. Open `chrome://extensions` and turn on Developer mode.
2. Click Load unpacked and pick the `extension` folder.
3. Click the Scratchity icon. The side panel opens with the settings box.
4. That's it: the extension already points at `https://scratchity.pages.dev`. If you deployed
   somewhere else, open settings (the gear) and paste your address, or change `DEFAULT_SITE`
   at the top of `shared/app.js` and run `npm run build`.

## Adding blocks to Scratch

Open a project in the Scratch editor (See inside), then ask Scratchity for something in the
side panel. The blocks go straight into your project:

- Before asking the AI, Scratchity tells it which sprites your project has and which one is
  selected, so the code is written for your sprites.
- Scripts labeled with a sprite that exists go into that sprite. Anything else goes into the
  sprite you have selected; no new sprites are made. (Turn on "Make new sprites when an answer
  needs them" in settings if you want them.)
- A drawn costume never replaces one you already have with the same name.
- Stage scripts go on the Stage; unlabeled scripts go into the sprite you have selected.
- Variables, lists and broadcast messages are created, or reused if you already have them.
- If the sprite already has scripts, new ones land to the right. Right-click the code area and
  pick Clean up blocks to tidy.

Turn off automatic adding in settings to use the Add to Scratch button instead. Explain mode
never adds blocks automatically. Blocks Scratch doesn't have are skipped, and the panel says so.

## Drawings

In Build mode the AI also draws the costumes and backdrops (as SVG). They show up as little
cards in the answer and go into the project with the blocks:

- New sprites are created wearing their drawn costumes.
- Existing sprites get the new costumes added; a costume with the same name gets redrawn.
- Backdrops are added to the Stage.
- Any costume a script mentions that wasn't drawn gets a plain placeholder.

Drawings are cleaned before they're used: scripts, click handlers and outside links are removed.

## Tokens (bought with BananaCoins)

- **Explain and Fix are free.** No sign-in needed.
- **Build answers use 1 Scratchity token**, on the website and in the extension. Build needs a
  BananaPeel sign-in (the gear, or the card above the box). Scratchity never stores the password.
- **The first month is free:** for 30 days from your first time using Scratchity, Build costs
  nothing. Everyone also gets 10 free tokens for after that.
- **More tokens:** 10 tokens for 10 BananaCoins (pretend coins, not real money).
- Tokens and BananaCoins live in your BananaPeel account on the BananaPeel server (wallets are
  saved in bananapeel-db). They're the same coins the BananaPeel CLI and BananaPeel Store show.
  The prices are at the top of the BananaPeel server's `server.js`.
- Scratch Colab doesn't need anything extra: Build costs a token there like anywhere else.
- Admins (`ADMINS` in the BananaPeel server's `wrangler.toml`) never use tokens or coins.

Scratchity reaches the BananaPeel server through the `BANANAPEEL` service binding in
`site/wrangler.toml`. Cloudflare doesn't let one of your Workers call another one by its
workers.dev address, so the binding connects them directly. Its `service` must be the
BananaPeel server's Worker name, `bananapeel-server`.

## Download as .sb3

Every answer with scripts has a Download .sb3 button, on the website and in the extension.
Open the file in Scratch with File, then Load from your computer.

## Lock the API to your extension (optional)

Anyone's Chrome extension can call your API by default. To allow only yours, copy your
extension ID from `chrome://extensions` into `EXTENSION_ID` in `site/wrangler.toml`
and run `npx wrangler pages deploy` again. The web page always works because it's same-origin.

## Making changes

Edit files in `shared/`, then from the project root:

```sh
npm run build     # copies shared/ into site/public and extension/
npm run deploy    # build + wrangler pages deploy
npm run zip       # build + zip the extension for the Chrome Web Store
```

After a build, press the reload button on the extension card in `chrome://extensions`.

## API

`POST /api/chat` with `{ "mode": "build" | "explain" | "fix", "messages": [{ "role": "user", "content": "..." }] }`
returns `{ "reply": "..." }`. Scripts come back in ```` ```scratch ```` fences as scratchblocks text.
