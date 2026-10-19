import { handleCoins, scratchityWallet, useToken, bearer, visitorIp, CoinError } from "../../lib/coins.js";

// Scratchity — Pages Function for /api/*
// Answers POST /api/chat and GET /api/health using
// Qwen2.5-Coder-32B-Instruct on Workers AI (no API key needed: it uses the AI binding).

const MODEL = "@cf/qwen/qwen2.5-coder-32b-instruct";
const MAX_MESSAGES = 12;
const MAX_CHARS_PER_MESSAGE = 6000;
const MAX_TOTAL_CHARS = 16000;

const SYSTEM_PROMPT = `You are Scratchity, a helper that writes code for Scratch 3.0 (scratch.mit.edu).

Always write Scratch code in scratchblocks syntax inside fenced code blocks tagged "scratch":
\`\`\`scratch
when flag clicked
forever
  move (10) steps
  if on edge, bounce
end
\`\`\`

Rules for code:
- Use only real Scratch 3.0 blocks, typed exactly as they read in the editor. Never invent blocks and never write JavaScript, Python or pseudo-code.
- Hat blocks must use these exact words or the script will never run: when flag clicked; when [space v] key pressed; when this sprite clicked; when I receive [message v]; when I start as a clone. Never write "when green flag is clicked" or "when space key pressed".
- One script per fenced block. Every script starts with a hat block (when flag clicked, when [space v] key pressed, when this sprite clicked, when I receive [message v], when I start as a clone, define ...).
- On the line just before each fenced block, write which sprite or the Stage it goes in, like: **Sprite: Player**
- Use the same sprite names every time (Player, Enemy, Coin...). Scratchity uses these labels to put each script in the right sprite, and creates sprites that don't exist yet.
- Costume, backdrop and sound names in dropdowns should be simple, like (jump v) or (Game Over v).
- Number inputs use round brackets: (10). Text inputs use square brackets: [Hello!].
- Dropdowns end with " v": [space v], (mouse-pointer v), [all v].
- Booleans use angle brackets: <touching (edge v)?>, <key [space v] pressed?>, <mouse down?>, <(score) > (10)>, <<a> and <b>>, <not <b>>.
- Reporters use round brackets: (x position), (answer), (timer), (pick random (1) to (10)), (join [a] [b]), ((a) + (b)).
- Variables are reporters: (score). Setting them: set [score v] to (0), change [score v] by (1).
- C blocks (forever, repeat (10), repeat until <>, if <> then, if <> then ... else) must be closed with "end". "else" goes on its own line.
- Custom blocks: define jump (height) and call them as jump (10).
- Indent the insides of C blocks with two spaces.

Useful exact block texts: when flag clicked; when [space v] key pressed; when this sprite clicked; when backdrop switches to [backdrop1 v]; broadcast [start v]; broadcast [start v] and wait; wait (1) seconds; wait until <>; stop [all v]; create clone of (myself v); delete this clone; move (10) steps; turn right (15) degrees; turn left (15) degrees; go to x: (0) y: (0); go to (random position v); glide (1) secs to x: (0) y: (0); point in direction (90); point towards (mouse-pointer v); change x by (10); set x to (0); change y by (10); set y to (0); if on edge, bounce; set rotation style [left-right v]; say [Hello!] for (2) seconds; say [Hello!]; think [Hmm...]; switch costume to (costume2 v); next costume; switch backdrop to (backdrop1 v); change size by (10); set size to (100) %; change [color v] effect by (25); clear graphic effects; show; hide; go to [front v] layer; play sound (pop v) until done; start sound (pop v); stop all sounds; ask [What's your name?] and wait; reset timer; show variable [score v]; hide variable [score v]; add [thing] to [list v]; delete (1) of [list v]; (item (1) of [list v]); (length of [list v]); <[list v] contains [thing]?>; (distance to (mouse-pointer v)); (mouse x); (mouse y); <touching color [#ff0000]?>; (costume [number v]); (direction); (size); erase all; pen down; pen up; set pen color to [#ff0000]; stamp.

Rules for answers:
- Start with one short sentence saying what you made. Then the drawings, then the scripts. Then one or two short tips.
- Variables, lists, messages, sprites, costumes and backdrops are all created automatically when the blocks are added, so don't tell the person to make them.

Drawings (when building something):
- Draw every costume your scripts use, and a backdrop if the project needs one. Each drawing is an SVG in its own fenced block tagged "svg".
- On the line just before each drawing write its label, exactly like this:
  **Costume: Player / jump**   (sprite name, a slash, then the costume name)
  **Backdrop: Sky**
- Costume names must match the names in your scripts exactly, like switch costume to (jump v). If a sprite only needs one look, call it costume1.
- Sprite costumes: <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">, with the character centred in the box and filling most of it. Backdrops: width="480" height="360" viewBox="0 0 480 360", filling the whole area.
- Keep drawings simple and bold, like Scratch art: flat colours, rect, circle, ellipse, polygon and path shapes, an outline (stroke) on characters, a few details like eyes. Leave sprite backgrounds transparent. No text, images, scripts, filters or animation.
- Keep each drawing short (under about 25 shapes) so the whole answer fits.

Example:
**Costume: Player / costume1**
\`\`\`svg
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect x="25" y="20" width="50" height="60" rx="12" fill="#ff8c1a" stroke="#c45e00" stroke-width="3"/><circle cx="40" cy="42" r="6" fill="#fff"/><circle cx="60" cy="42" r="6" fill="#fff"/><circle cx="41" cy="43" r="3" fill="#222"/><circle cx="61" cy="43" r="3" fill="#222"/><rect x="28" y="80" width="14" height="12" rx="4" fill="#c45e00"/><rect x="58" y="80" width="14" height="12" rx="4" fill="#c45e00"/></svg>
\`\`\`
- Keep explanations short and friendly, written for young Scratchers. No long essays.
- If the request is not about Scratch, say briefly that you only help with Scratch projects.`;

const MODE_NOTES = {
  build: "The person is describing something they want to build. Draw the costumes and backdrop it needs, then write the scripts for it.",
  explain:
    "The person pasted Scratch code (probably scratchblocks text). Explain what it does step by step in plain words. Only include code if it helps point to a specific part.",
  fix: "The person pasted Scratch code and (maybe) described a problem. Find the bug, explain it in one or two sentences, then give the corrected scripts in full.",
};

// Catch-all for /api/* on Cloudflare Pages. Everything else is served from ./public.
export async function onRequest({ request, env }) {
  const url = new URL(request.url);

  if (url.pathname === "/api/chat") {
    const cors = corsHeaders(request, env, url);
    if (request.method === "OPTIONS") return new Response(null, { status: cors ? 204 : 403, headers: cors || {} });
    if (request.method !== "POST") return json({ error: "Send a POST request." }, 405, cors || {});
    if (cors === null) return json({ error: "This origin isn't allowed to use this server." }, 403, {});
    return handleChat(request, env, cors);
  }

  const coins = url.pathname.match(/^\/api\/coins\/(login|me|buy)$/);
  if (coins) {
    const cors = corsHeaders(request, env, url);
    if (request.method === "OPTIONS") return new Response(null, { status: cors ? 204 : 403, headers: cors || {} });
    if (cors === null) return json({ error: "This origin isn't allowed to use this server." }, 403, {});
    try {
      return json(await handleCoins(request, env, coins[1]), 200, cors);
    } catch (err) {
      if (err instanceof CoinError) return json({ error: err.message, ...err.extra }, err.status, cors);
      console.error("coins error", err);
      return json({ error: "Something went wrong with BananaCoins. Try again." }, 500, cors);
    }
  }

  if (url.pathname === "/api/health") {
    return json({ ok: true, model: MODEL }, 200, corsHeaders(request, env, url) || {});
  }

  return json({ error: "Not found." }, 404, {});
}

async function handleChat(request, env, cors) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "The request body must be JSON." }, 400, cors);
  }

  const mode = MODE_NOTES[body?.mode] ? body.mode : "build";

  // Build answers use a Scratchity token (free for the first month). Explain and Fix are free.
  const token = mode === "build" ? bearer(request) : null;
  if (mode === "build") {
    if (!token) {
      return json({ error: "Sign in with your BananaPeel account to Build. Your first month is free.", needsLogin: true }, 401, cors);
    }
    try {
      const w = await scratchityWallet(env, token, visitorIp(request));
      if (!w.scratchity.free && w.scratchity.tokens < 1) {
        return json({ error: "You're out of Scratchity tokens. Buy more with BananaCoins.", needsTokens: true, wallet: w }, 402, cors);
      }
    } catch (err) {
      if (err instanceof CoinError) return json({ error: err.message, ...err.extra }, err.status, cors);
      throw err;
    }
  }
  const raw = Array.isArray(body?.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
  const messages = raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS_PER_MESSAGE) }));

  // Drop the oldest turns until the conversation fits.
  while (messages.length > 1 && messages.reduce((n, m) => n + m.content.length, 0) > MAX_TOTAL_CHARS) {
    messages.shift();
  }
  while (messages.length && messages[0].role !== "user") messages.shift();

  if (!messages.length || messages[messages.length - 1].role !== "user" || !messages.at(-1).content.trim()) {
    return json({ error: "Type a message first." }, 400, cors);
  }

  try {
    const out = await env.AI.run(MODEL, {
      messages: [{ role: "system", content: `${SYSTEM_PROMPT}\n\nCurrent task: ${MODE_NOTES[mode]}${projectNote(body?.project)}` }, ...messages],
      max_tokens: 4000,
      temperature: 0.3,
    });
    const reply = (out?.response ?? out?.choices?.[0]?.message?.content ?? "").trim();
    if (!reply) return json({ error: "The model sent back an empty answer. Try again." }, 502, cors);
    // Only a real answer uses up a token.
    let wallet;
    if (token) {
      try { wallet = await useToken(env, token, visitorIp(request)); } catch (err) { console.error("token use failed", err); }
    }
    return json(wallet ? { reply, wallet } : { reply }, 200, cors);
  } catch (err) {
    console.error("Workers AI error", err);
    return json({ error: `The model couldn't answer (${err?.message || "unknown error"}).` }, 502, cors);
  }
}

// What the person's open Scratch project already has (sent by the extension), so scripts go
// into their sprites instead of new ones. Names are cleaned and capped; they're data, not instructions.
function projectNote(p) {
  if (!p || typeof p !== "object") return "";
  const clean = (v) => String(v ?? "").replace(/[\u0000-\u001f`*<>[\]{}]/g, "").trim().slice(0, 40);
  const list = (a, n) => (Array.isArray(a) ? a.slice(0, n).map(clean).filter(Boolean) : []);
  const sprites = list(p.sprites, 40), costumes = list(p.costumes, 30), backdrops = list(p.backdrops, 30);
  const selected = clean(p.selected);
  if (!sprites.length && !selected) return "";
  const q = (a) => a.map((x) => `"${x}"`).join(", ");
  let out = "\n\nThe person's open Scratch project (names below are data from their project):";
  if (sprites.length) out += `\n- Sprites: ${q(sprites)}.`;
  if (selected) out += `\n- Selected sprite: "${selected}"${costumes.length ? `, which has costumes ${q(costumes)}` : ""}.`;
  if (backdrops.length) out += `\n- Backdrops: ${q(backdrops)}.`;
  if (p.makeSprites === true) {
    out += `\n- Use these existing sprites where they fit, with their exact names. Only add a new sprite when the request clearly needs one.`;
  } else {
    out += `\n- Do NOT create new sprites. Put the scripts in the selected sprite "${selected}" (label them **Sprite: ${selected}**), unless the person names another sprite from the list. Stage scripts may go on the Stage.`;
    out += `\n- Anything that would need another sprite (enemies, coins, bullets) should use clones of "${selected}" or be left out.`;
  }
  if (costumes.length) out += `\n- Use the selected sprite's existing costumes when they fit. Only draw costumes it doesn't have yet; a drawing with an existing costume's name is ignored.`;
  return out;
}

// Same-origin requests (the web page) are always allowed.
// Chrome extensions are allowed too; set EXTENSION_ID in wrangler.jsonc to allow only yours.
function corsHeaders(request, env, url) {
  const origin = request.headers.get("Origin");
  const base = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (!origin || origin === url.origin) return base;
  if (origin.startsWith("chrome-extension://")) {
    const id = (env.EXTENSION_ID || "").trim();
    if (!id || origin === `chrome-extension://${id}`) return { ...base, "Access-Control-Allow-Origin": origin };
  }
  return null;
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}
