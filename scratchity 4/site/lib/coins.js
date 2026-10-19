// Scratchity tokens and BananaCoins live in your BananaPeel wallet, on the BananaPeel server.
// This file only passes requests through, using the person's own BananaPeel sign-in.
//
// - Explain and Fix are free. Build answers use 1 Scratchity token.
// - The first 30 days after someone first uses Scratchity are free, plus 10 free tokens.
// - Tokens come in packs (10 tokens for 10 BananaCoins). The BananaPeel server sets the prices.
//
// Cloudflare won't let one of your Workers fetch another of your Workers by its workers.dev
// address (error 1042), so the BANANAPEEL service binding is used when it's set up.

const DEFAULT_BANANAPEEL = "https://bananapeel-server.acute-percent5v.workers.dev";
const NAME = /^[a-z0-9][a-z0-9_-]{2,19}$/;

export class CoinError extends Error {
  constructor(message, status = 400, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

// The BananaPeel sign-in sent by the panel or website, or null.
export function bearer(request) {
  const m = (request.headers.get("Authorization") || "").match(/^Bearer\s+([A-Za-z0-9._~+/=-]{10,600})$/);
  return m ? m[1] : null;
}

// The visitor's internet address, passed on so the BananaPeel server's bans and auto-bans see
// each person, not Scratchity's server.
const visitorIp = (request) => (request && request.headers.get("cf-connecting-ip")) || null;

async function bananapeel(env, path, { method = "GET", body, token, ip } = {}) {
  const server = String(env.BANANAPEEL_SERVER || DEFAULT_BANANAPEEL).replace(/\/+$/, "");
  const init = {
    method,
    headers: { "content-type": "application/json", "User-Agent": "scratchity", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(ip ? { "x-client-ip": ip } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
  let res;
  try {
    res = env.BANANAPEEL && typeof env.BANANAPEEL.fetch === "function"
      ? await env.BANANAPEEL.fetch(new Request(`${server}${path}`, init))
      : await fetch(`${server}${path}`, init);
  } catch (e) {
    throw new CoinError(`Couldn't reach the BananaPeel server (${e.message || "no answer"}).`, 502);
  }
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch { /* not JSON: a Cloudflare error page or similar */ }
  if (/\b1042\b/.test(text) || (res.status === 404 && !data.error)) {
    throw new CoinError("Scratchity can't talk to the BananaPeel server yet. It needs the BANANAPEEL service binding (see the README).", 502);
  }
  if (res.status === 404 && /Not found/i.test(data.error || "") && path !== "/login") {
    throw new CoinError("Your BananaPeel server doesn't have wallets yet. Deploy the newest BananaPeel server.", 502);
  }
  return { status: res.status, ok: res.ok, data };
}

// Turns a BananaPeel error into one Scratchity can show.
function problem(r) {
  if (r.status === 401) return new CoinError("Your BananaPeel sign-in ran out. Sign in again.", 401, { needsLogin: true });
  if (r.status === 403 && r.data.banned) return new CoinError(r.data.error, 403, { banned: true });
  if (r.status === 402) return new CoinError(r.data.error || "Not enough BananaCoins.", 402, r.data.needsTokens ? { needsTokens: true, wallet: strip(r.data) } : {});
  if (r.status === 429) return new CoinError(r.data.error || "Too many tries. Wait a bit.", 429);
  if (r.status >= 500) return new CoinError(`The BananaPeel server had a problem (${r.data.error || `HTTP ${r.status}`}).`, 502);
  return new CoinError(r.data.error || `BananaPeel answered with HTTP ${r.status}.`, r.status);
}

// Only what Scratchity shows (not the list of apps someone owns).
const strip = (w) => ({ username: w.username, coins: w.coins, scratchity: w.scratchity || null, ...(w.admin ? { admin: true } : {}) });

async function login(env, body, ip) {
  const username = String(body?.username || "").trim().toLowerCase();
  const password = String(body?.password || "");
  if (!NAME.test(username)) throw new CoinError("That isn't a BananaPeel username.");
  if (!password || password.length > 200) throw new CoinError("Type your BananaPeel password.");
  const r = await bananapeel(env, "/login", { method: "POST", body: { username, password }, ip });
  if (!r.ok) {
    if (r.status === 401 || r.status === 403 || r.status === 404) {
      throw new CoinError(r.data.error ? `${r.data.banned ? "" : "BananaPeel says: "}${String(r.data.error).slice(0, 150)}` : "Wrong BananaPeel username or password.", 401);
    }
    throw problem(r);
  }
  if (!r.data.token) throw new CoinError("The BananaPeel server sent back something unexpected.", 502);
  return { token: r.data.token, wallet: await scratchityWallet(env, r.data.token, ip) };
}

// The wallet, with Scratchity's part started (the free month begins the first time).
export async function scratchityWallet(env, token, ip) {
  const r = await bananapeel(env, "/scratchity", { token, ip });
  if (!r.ok) throw problem(r);
  return strip(r.data);
}

// Uses one token for a Build answer (free during the first month).
export async function useToken(env, token, ip) {
  const r = await bananapeel(env, "/scratchity/use", { method: "POST", token, body: {}, ip });
  if (!r.ok) throw problem(r);
  return strip(r.data);
}

// /api/coins/login (POST), /api/coins/me (GET), /api/coins/buy (POST)
export async function handleCoins(request, env, action) {
  const ip = visitorIp(request);
  if (action === "login" && request.method === "POST") return login(env, await request.json().catch(() => ({})), ip);
  const token = bearer(request);
  if (!token) throw new CoinError("Sign in with your BananaPeel account first.", 401, { needsLogin: true });
  if (action === "me" && request.method === "GET") return scratchityWallet(env, token, ip);
  if (action === "buy" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const packs = Number.isInteger(body.packs) ? body.packs : 1;
    const r = await bananapeel(env, "/scratchity/buy", { method: "POST", token, body: { packs }, ip });
    if (!r.ok) throw problem(r);
    return strip(r.data);
  }
  throw new CoinError("Not found.", 404);
}

export { visitorIp };
