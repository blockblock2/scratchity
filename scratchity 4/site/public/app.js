// Scratchity — shared UI for the web page and the Chrome side panel.
(() => {
  const IS_EXT = typeof chrome !== "undefined" && !!chrome.storage && !!chrome.runtime?.id;
  const HISTORY = 12;
  // The website the extension talks to (and links to). Change this if you deploy somewhere else.
  const DEFAULT_SITE = "https://scratchity.pages.dev";

  const MODES = {
    build: {
      label: "Build",
      hat: "when I ask for",
      placeholder: "a cat that jumps when I press space",
      send: "Build it",
    },
    explain: {
      label: "Explain",
      hat: "when I paste code to explain",
      placeholder: "when flag clicked\nforever\n  move (10) steps\nend",
      send: "Explain it",
    },
    fix: {
      label: "Fix",
      hat: "when I paste code to fix",
      placeholder: "Paste your blocks, then say what goes wrong",
      send: "Fix it",
    },
  };

  const EXAMPLES = [
    "A player that walks with the arrow keys and jumps with space, with gravity",
    "A clicker game: click the cookie to get points, and buy an auto-clicker for 50",
    "A snake of clones that follows the mouse pointer",
  ];

  let mode = "build";
  let messages = [];
  let busy = false;
  let apiBase = IS_EXT ? DEFAULT_SITE : "";
  let autoAdd = true;
  let makeSprites = false; // add code to existing sprites instead of creating new ones
  // Build answers cost a Scratchity token, bought with BananaCoins from a BananaPeel account
  // (pretend coins). The first month is free. Explain and Fix are always free.
  let coinToken = null;    // BananaPeel sign-in
  let wallet = null;       // { username, coins, scratchity: { tokens, free, freeUntil, pack } }
  let sbCount = 0;

  const logo = `<svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
    <path d="M2 9c0-5 5-7 10-7s8 3 9 5h6a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" fill="#ffbf00" stroke="#cc9900"/>
    <rect x="2" y="14" width="22" height="6" rx="1.5" fill="#4c97ff" stroke="#3373cc"/>
    <rect x="2" y="22" width="16" height="6" rx="1.5" fill="#9966ff" stroke="#774dcb"/>
  </svg>`;

  const gear = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`;

  const app = document.getElementById("app");
  app.innerHTML = `
    <header class="top">
      <div class="brand">${logo}<div><h1>Scratchity</h1><p>Describe a Scratch project. Get the blocks.</p></div></div>
      ${IS_EXT ? `<a class="ghost" id="siteLink" href="${DEFAULT_SITE}" target="_blank" rel="noopener">Website</a>` : ""}
      <button class="ghost" id="newChat" type="button">New chat</button>
      <button class="ghost icon-btn" id="gear" type="button" aria-label="Settings and account" aria-expanded="false">${gear}</button>
    </header>
    <section class="settings" id="settings" hidden>
      <div class="account" id="account"></div>
      ${IS_EXT ? `
      <label class="check"><input type="checkbox" id="autoAdd" checked> Add new blocks to my open Scratch project automatically</label>
      <label class="check"><input type="checkbox" id="makeSprites"> Make new sprites when an answer needs them (otherwise code goes into the sprite you have selected)</label>
      <label for="apiUrl">Scratchity website</label>
      <div class="row">
        <input id="apiUrl" type="url" placeholder="${DEFAULT_SITE}" spellcheck="false">
        <button class="ghost" id="saveUrl" type="button">Save</button>
      </div>
      <small id="settingsNote">Only change this if you host Scratchity at a different address.</small>` : ""}
    </section>
    <nav class="modes" aria-label="What should Scratchity do?">
      ${Object.entries(MODES).map(([k, m]) => `<button type="button" data-mode="${k}" aria-pressed="${k === mode}">${m.label}</button>`).join("")}
    </nav>
    <p class="purse" id="purse" hidden></p>
    <main class="thread" id="thread" aria-live="polite"></main>
    <section class="lock" id="lock" hidden aria-live="polite"></section>
    <form class="composer" id="composer">
      <div class="hat">
        <label class="hat-label" for="input" id="hatLabel"></label>
        <div class="hat-row">
          <textarea id="input" rows="1"></textarea>
          <button class="send" id="send" type="submit"></button>
        </div>
      </div>
      <p class="foot">Runs Qwen2.5-Coder-32B on Cloudflare Workers AI. It can get blocks wrong, so test scripts before you share.</p>
    </form>`;

  const $ = (id) => document.getElementById(id);
  const thread = $("thread");
  const input = $("input");
  const sendBtn = $("send");

  // ---------- modes ----------
  function setMode(next) {
    mode = next;
    const m = MODES[mode];
    $("hatLabel").textContent = m.hat;
    input.placeholder = m.placeholder;
    sendBtn.textContent = m.send;
    document.querySelectorAll(".modes button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
    if (!messages.length) renderEmpty();
    drawCoins();
  }
  document.querySelector(".modes").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-mode]");
    if (b) { setMode(b.dataset.mode); input.focus(); }
  });

  // ---------- empty state ----------
  function renderEmpty() {
    thread.innerHTML = "";
    const box = el("section", "empty");
    if (mode === "build") {
      box.innerHTML = `<h2>What do you want to make?</h2>
        <p>${IS_EXT
          ? "Describe a game, animation or effect. With a Scratch project open in the editor, the blocks get added to it for you."
          : "Describe a game, animation or effect. You'll get the blocks, and you can download them as a Scratch project."}</p>`;
      const list = el("div", "examples");
      EXAMPLES.forEach((t) => {
        const b = el("button");
        b.type = "button";
        b.textContent = t;
        b.addEventListener("click", () => send(t));
        list.append(b);
      });
      box.append(list);
    } else if (mode === "explain") {
      box.innerHTML = `<h2>Paste some Scratch code</h2>
        <p>Write it in scratchblocks text (the format the Scratch Forums use) and you'll get a plain-words walkthrough of what it does.</p>`;
    } else {
      box.innerHTML = `<h2>Something not working?</h2>
        <p>Paste your blocks as scratchblocks text and say what goes wrong. You'll get the bug explained and fixed scripts.</p>`;
    }
    thread.append(box);
  }

  // ---------- sending ----------
  $("composer").addEventListener("submit", (e) => { e.preventDefault(); send(input.value); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); }
  });
  input.addEventListener("input", autosize);
  function autosize() { input.style.height = "auto"; input.style.height = input.scrollHeight + 2 + "px"; }

  async function send(text) {
    text = (text || "").trim();
    if (!text || busy) return;

    if (!messages.length) thread.innerHTML = "";
    messages.push({ role: "user", content: text });
    const bubble = addUser(text);
    input.value = "";
    autosize();
    setBusy(true);
    const pending = el("div", "pending");
    pending.setAttribute("aria-label", "Writing blocks");
    pending.innerHTML = "<span></span><span></span><span></span>";
    thread.append(pending);
    scrollDown();

    try {
      const project = IS_EXT ? await readProject() : null;
      const res = await fetch(`${apiBase}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(coinToken ? { Authorization: `Bearer ${coinToken}` } : {}) },
        body: JSON.stringify({ mode, messages: messages.slice(-HISTORY), project: project && { ...project, makeSprites } }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.needsLogin || data.needsTokens) {
        if (data.needsLogin) signedOut();
        else if (data.wallet) setWallet(data.wallet);
        const e = new Error(data.error);
        e.locked = true;
        throw e;
      }
      if (!res.ok) throw new Error(data.error || `The server answered with status ${res.status}.`);
      if (data.wallet) setWallet(data.wallet);
      messages.push({ role: "assistant", content: data.reply });
      pending.remove();
      const reply = addReply(data.reply);
      if (IS_EXT && autoAdd && mode !== "explain" && (reply.scripts.length || reply.art.length)) addToScratch(reply, true);
    } catch (err) {
      pending.remove();
      messages.pop();
      bubble.remove();
      input.value = text;
      autosize();
      const msg = err instanceof TypeError
        ? "Couldn't reach Scratchity. Check your connection" + (IS_EXT ? " and the website address in settings." : ".")
        : err.message;
      const box = el("div", "error");
      box.textContent = err.locked
        ? `${msg} Your message is back in the box for when you're ready.`
        : `${msg} Your message is back in the box, so you can send it again.`;
      thread.append(box);
    } finally {
      setBusy(false);
      scrollDown();
      input.focus();
    }
  }

  function setBusy(v) { busy = v; sendBtn.disabled = v || gated(); }
  function scrollDown() { thread.scrollTop = thread.scrollHeight; }

  $("newChat").addEventListener("click", () => { messages = []; renderEmpty(); input.focus(); });

  // ---------- rendering ----------
  function addUser(text) {
    const wrap = el("div", "msg user");
    const b = el("div", "bubble");
    b.textContent = text;
    wrap.append(b);
    thread.append(wrap);
    return wrap;
  }

  function addReply(md) {
    const wrap = el("div", "msg reply");
    thread.append(wrap);
    const reply = { el: wrap, scripts: [], art: [] };
    let sprite = null, drawing = null;
    const text = (t) => {
      const d = drawingLabel(t, sprite);
      if (d.label) drawing = d.label;
      addText(wrap, d.text);
      const s = spriteFrom(d.text);
      if (s !== undefined) sprite = s;
    };
    const code = (lang, c) => {
      if (/^(svg|xml|html|image)$/i.test(lang) || /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(c)) {
        const label = drawing || { sprite, name: "" };
        reply.art.push({ sprite: label.sprite, name: label.name, svg: c });
        addDrawing(wrap, label, c);
        drawing = null;
        return;
      }
      if (addCode(wrap, lang, c)) reply.scripts.push({ sprite, code: c });
    };

    const fence = /```([\w-]*)[^\n]*\n([\s\S]*?)```/g;
    let last = 0, m;
    while ((m = fence.exec(md))) {
      text(md.slice(last, m.index));
      code(m[1], m[2]);
      last = fence.lastIndex;
    }
    let rest = md.slice(last);
    const open = rest.indexOf("```"); // answer got cut off mid-script
    if (open >= 0) {
      text(rest.slice(0, open));
      const after = rest.slice(open + 3);
      const nl = after.indexOf("\n");
      code(nl >= 0 ? after.slice(0, nl).trim() : "", nl >= 0 ? after.slice(nl + 1) : "");
      rest = "";
    }
    addText(wrap, rest);
    if (reply.scripts.length || reply.art.length) addActions(reply);
    return reply;
  }

  // "**Costume: Player / jump**" or "**Backdrop: Sky**" before a drawing. Removes the label line
  // from the text (the drawing card shows it) and returns { sprite, name }.
  function drawingLabel(t, currentSprite) {
    let label = null;
    const re = /(^|\n)[ \t*#>_-]*(costume|backdrop)\b[ \t*_]*[:\-\u2013][ \t*_]*([^\n]*)/gi;
    const out = t.replace(re, (all, lead, kind, rest) => {
      const v = rest.replace(/[*_`]+/g, "").trim();
      if (/^backdrop$/i.test(kind)) label = { sprite: "Stage", name: v };
      else {
        const parts = v.split("/").map((x) => x.trim());
        label = parts.length > 1 && parts[0] ? { sprite: parts[0], name: parts.slice(1).join("/") } : { sprite: currentSprite, name: v };
      }
      return lead;
    });
    return { text: out, label };
  }

  // A drawn costume or backdrop, shown as a small card. Images in <img> can't run scripts.
  function addDrawing(parent, label, svg) {
    const isStage = /^stage$/i.test(label.sprite || "");
    let strip = parent.lastElementChild;
    if (!strip || !strip.classList.contains("drawings")) { strip = el("div", "drawings"); parent.append(strip); }
    const card = el("figure", isStage ? "drawing backdrop" : "drawing");
    const clean = window.ScratchityBlocks.cleanSvg(svg, isStage);
    if (clean) {
      const img = el("img");
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(clean.svg);
      img.alt = `${label.name || "Drawing"} for ${isStage ? "the Stage" : label.sprite || "this sprite"}`;
      card.append(img);
    } else {
      const bad = el("div", "drawing-bad");
      bad.textContent = "Couldn't draw this one";
      card.append(bad);
    }
    const cap = el("figcaption");
    cap.textContent = isStage ? `Backdrop: ${label.name || "backdrop"}` : `${label.sprite || "Sprite"}: ${label.name || "costume"}`;
    card.append(cap);
    strip.append(card);
  }

  // "**Sprite: Player**" -> "Player", "**Stage**" -> "Stage". undefined = no label in this text.
  function spriteFrom(t) {
    let found;
    const re = /(?:^|\n)[\s*#>_-]*(sprite|stage)\b[\s*_]*[:\-\u2013]?[\s*_]*([^\n]*)/gi;
    let m;
    while ((m = re.exec(t))) {
      const name = m[2].replace(/[*_`:]+/g, "").replace(/\(.*?\)/g, "").trim();
      if (/^stage$/i.test(m[1])) found = "Stage";
      else if (name && name.length <= 40) found = name;
    }
    return found;
  }

  // ---------- Scratch actions: download .sb3, add to the open project ----------
  function addActions(reply) {
    const bar = el("div", "reply-actions");
    if (IS_EXT) {
      const add = el("button", "act primary");
      add.type = "button";
      add.textContent = "Add to Scratch";
      add.addEventListener("click", () => addToScratch(reply, false));
      bar.append(add);
    }
    const dl = el("button", "act");
    dl.type = "button";
    dl.textContent = "Download .sb3";
    dl.addEventListener("click", () => downloadSb3(reply));
    bar.append(dl);
    reply.status = el("p", "reply-status");
    reply.status.setAttribute("role", "status");
    reply.el.append(bar, reply.status);
  }

  function setStatus(reply, msg, isError) {
    reply.status.textContent = msg;
    reply.status.classList.toggle("bad", !!isError);
  }

  function convertReply(reply) {
    try {
      return window.ScratchityBlocks.convert(reply.scripts, reply.art);
    } catch (e) {
      setStatus(reply, `Couldn't turn these scripts into blocks: ${e.message}`, true);
      return null;
    }
  }

  function skipped(conv) {
    const n = conv.warnings.length, f = conv.fixes || 0;
    let out = n ? ` ${n === 1 ? "One block was" : n + " blocks were"} skipped because Scratch doesn't have ${n === 1 ? "it" : "them"}.` : "";
    const h = conv.hatsAdded || 0;
    if (h) out += ` ${h === 1 ? "One script had" : h + " scripts had"} no hat block, so Scratchity put "when green flag clicked" on top so ${h === 1 ? "it runs" : "they run"}.`;
    const d = conv.drawings || 0;
    if (d) out = ` Includes ${d} drawing${d === 1 ? "" : "s"}.` + out;
    if (f) out += ` ${f === 1 ? "One block" : f + " blocks"} couldn't snap in where the AI put ${f === 1 ? "it" : "them"}, so Scratchity moved or left ${f === 1 ? "it" : "them"} out.`;
    return out;
  }

  function downloadSb3(reply) {
    const conv = convertReply(reply);
    if (!conv) return;
    const bytes = window.ScratchityBlocks.makeSb3(conv);
    const ask = [...messages].reverse().find((m) => m.role === "user");
    const slug = (ask ? ask.content : "project").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").slice(0, 5).join("-") || "project";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes], { type: "application/x.scratch.sb3" }));
    a.download = `scratchity-${slug}.sb3`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    setStatus(reply, `Downloaded ${a.download}. Open it in Scratch with File, then Load from your computer.${skipped(conv)}`);
  }

  // What's in the open Scratch project (sprite names, which one is selected), so the AI can put
  // code into those sprites. null when no project is open in the editor.
  async function readProject() {
    try {
      const tab = await scratchTab();
      if (!tab) return null;
      const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", func: scratchityProjectInfo });
      return (res && res.result) || null;
    } catch (e) {
      return null;
    }
  }

  async function scratchTab() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab && /^https:\/\/scratch\.mit\.edu\/projects\//.test(tab.url || "") ? tab : null;
  }

  async function addToScratch(reply, auto) {
    const tab = await scratchTab();
    if (!tab) {
      if (!auto) setStatus(reply, "Open a Scratch project in the editor (See inside) in this window, then press Add to Scratch.", true);
      return;
    }
    const conv = convertReply(reply);
    if (!conv) return;
    const payload = {
      makeSprites,
      variables: conv.variables,
      sprites: conv.sprites.map((s, i) => ({
        name: s.name, isStage: s.isStage, isCurrent: s.isCurrent, scriptCount: s.scriptCount, blocks: s.blocks, art: s.art,
        sprite3: makeSprites && !s.isStage && !s.isCurrent ? toBase64(window.ScratchityBlocks.makeSprite3(s.name, s.costumes, i, s.art)) : null,
      })),
    };
    setStatus(reply, "Adding blocks to your project…");
    try {
      const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", func: scratchityInsert, args: [payload] });
      const r = res && res.result;
      if (!r || !r.ok) throw new Error((r && r.error) || "Scratch didn't answer.");
      const merged = new Map(); // several answer sprites can land in the same project sprite
      for (const a of r.added) {
        const m = merged.get(a.name);
        if (m) { m.scripts += a.scripts; m.drawings += a.drawings || 0; m.created = m.created || a.created; }
        else merged.set(a.name, { ...a, drawings: a.drawings || 0 });
      }
      r.added = [...merged.values()].filter((a) => a.scripts > 0 || a.drawings > 0 || a.created);
      const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
      const parts = r.added.map((a) => {
        const what = [a.scripts && plural(a.scripts, "script"), a.drawings && plural(a.drawings, a.name === "the Stage" ? "backdrop" : "costume")].filter(Boolean).join(" and ");
        return `${what || "a sprite"} to ${a.name}${a.created ? " (new sprite)" : ""}`;
      });
      const moved = (r.redirected || []).length
        ? ` Your project has no ${r.redirected.map((n) => `"${n}"`).join(" or ")} sprite, so that code went into ${r.home}.`
        : "";
      const kept = r.keptCostumes ? ` Kept your own ${r.keptCostumes === 1 ? "costume" : r.keptCostumes + " costumes"} with the same name instead of the new drawing.` : "";
      const lost = r.missing ? ` ${r.missing} script${r.missing === 1 ? "" : "s"} didn't make it in; press Add to Scratch to try again.` : "";
      setStatus(reply, `Added ${parts.join(", ")}.${moved}${kept}${lost}${skipped({ ...conv, drawings: 0 })}`, !!r.missing);
    } catch (e) {
      setStatus(reply, `Couldn't add the blocks: ${e.message}`, true);
    }
  }

  function toBase64(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  const BLOCK_LANGS = new Set(["", "scratch", "scratchblocks", "blocks", "sb", "sb3", "scratch3"]);

  function addCode(parent, lang, code) {
    code = code.replace(/\s+$/, "");
    if (!code.trim()) return false;
    if (!BLOCK_LANGS.has(lang.toLowerCase())) {
      const pre = el("pre", "plain");
      pre.textContent = code;
      parent.append(pre);
      return false;
    }
    const card = el("div", "script");
    const canvas = el("div", "script-canvas");
    const pre = el("pre", "blocks");
    pre.id = `sb${++sbCount}`;
    pre.textContent = code;
    canvas.append(pre);

    const text = el("pre", "script-text");
    text.textContent = code;
    text.hidden = true;

    const bar = el("div", "script-bar");
    const toggle = el("button");
    toggle.type = "button";
    toggle.textContent = "Show text";
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", () => {
      text.hidden = !text.hidden;
      toggle.textContent = text.hidden ? "Show text" : "Hide text";
      toggle.setAttribute("aria-expanded", String(!text.hidden));
    });
    const copy = el("button");
    copy.type = "button";
    copy.textContent = "Copy text";
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(code); copy.textContent = "Copied"; }
      catch { copy.textContent = "Copy failed"; }
      setTimeout(() => (copy.textContent = "Copy text"), 1600);
    });
    bar.append(toggle, copy);
    card.append(canvas, bar, text);
    parent.append(card);

    try {
      window.scratchblocks.renderMatching(`#${pre.id}`, { style: "scratch3", languages: ["en"], scale: 0.7 });
    } catch (e) {
      console.warn("scratchblocks couldn't draw this script", e);
    }
    return true;
  }

  function addText(parent, t) {
    t = t.trim();
    if (!t) return;
    let para = [], list = null;
    const flushPara = () => {
      if (!para.length) return;
      const p = el("p");
      p.innerHTML = para.map(inline).join("<br>");
      parent.append(p);
      para = [];
    };
    for (const raw of t.split("\n")) {
      const line = raw.trimEnd();
      const bullet = line.match(/^\s*(?:[-*\u2022]|(\d+)[.)])\s+(.*)$/);
      if (bullet) {
        flushPara();
        const tag = bullet[1] ? "ol" : "ul";
        if (!list || list.tagName.toLowerCase() !== tag) { list = el(tag); parent.append(list); }
        const li = el("li");
        li.innerHTML = inline(bullet[2]);
        list.append(li);
        continue;
      }
      list = null;
      if (!line.trim()) { flushPara(); continue; }
      const head = line.match(/^#{1,6}\s+(.*)$/);
      if (head) { flushPara(); const h = el("h3"); h.innerHTML = inline(head[1]); parent.append(h); continue; }
      para.push(line);
    }
    flushPara();
  }

  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  }
  function esc(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function el(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }

  // ---------- extension settings ----------
  function openSettings(note) {
    const s = $("settings");
    if (!s) return;
    s.hidden = false;
    $("gear").setAttribute("aria-expanded", "true");
    const n = $("settingsNote");
    if (note) { n.textContent = note; n.classList.add("note"); }
    $("apiUrl").focus();
  }

  $("gear").addEventListener("click", () => {
    const s = $("settings");
    s.hidden = !s.hidden;
    $("gear").setAttribute("aria-expanded", String(!s.hidden));
    if (!s.hidden) (s.querySelector("input") || $("gear")).focus();
  });

  if (IS_EXT) {
    $("saveUrl").addEventListener("click", saveUrl);
    $("apiUrl").addEventListener("keydown", (e) => { if (e.key === "Enter") saveUrl(); });

    $("autoAdd").addEventListener("change", (e) => {
      autoAdd = e.target.checked;
      chrome.storage.sync.set({ autoAdd });
    });
    $("makeSprites").addEventListener("change", (e) => {
      makeSprites = e.target.checked;
      chrome.storage.sync.set({ makeSprites });
    });
    chrome.storage.sync.get(["apiBase", "autoAdd", "makeSprites"]).then((saved) => {
      apiBase = saved.apiBase || DEFAULT_SITE;
      autoAdd = saved.autoAdd !== false;
      makeSprites = saved.makeSprites === true;
      $("makeSprites").checked = makeSprites;
      $("apiUrl").value = apiBase;
      $("autoAdd").checked = autoAdd;
      $("siteLink").href = apiBase;
    });
  }

  async function saveUrl() {
    const n = $("settingsNote");
    let v = $("apiUrl").value.trim().replace(/\/+$/, "") || DEFAULT_SITE;
    if (v && !/^https?:\/\//i.test(v)) v = "https://" + v;
    try { new URL(v); } catch { n.textContent = "That doesn't look like a web address."; n.classList.add("note"); return; }
    apiBase = v;
    $("apiUrl").value = v;
    $("siteLink").href = v;
    await chrome.storage.sync.set({ apiBase: v });
    n.classList.remove("note");
    n.textContent = "Checking…";
    try {
      const r = await fetch(`${v}/api/health`);
      const d = await r.json();
      n.textContent = d.ok ? "Connected. You're ready to go." : "Saved, but the server didn't answer as expected.";
      if (d.ok) setTimeout(() => { $("settings").hidden = true; $("gear").setAttribute("aria-expanded", "false"); }, 1200);
    } catch {
      n.textContent = "Saved, but couldn't reach that address. Check the URL.";
      n.classList.add("note");
    }
  }

  // ---------- Scratchity tokens (bought with BananaCoins) ----------
  // The sign-in is kept in the extension's storage, or this browser's storage on the website.
  const tokenStore = {
    async get() {
      if (IS_EXT) return (await chrome.storage.local.get("coinToken")).coinToken || null;
      try { return localStorage.getItem("scratchity.coinToken"); } catch { return null; }
    },
    async set(v) {
      if (IS_EXT) return v ? chrome.storage.local.set({ coinToken: v }) : chrome.storage.local.remove("coinToken");
      try { v ? localStorage.setItem("scratchity.coinToken", v) : localStorage.removeItem("scratchity.coinToken"); } catch { /* private window */ }
    },
  };

  const coinApi = async (path, opts = {}) => {
    const res = await fetch(`${apiBase}/api/coins/${path}`, {
      method: opts.method || "POST",
      headers: { "Content-Type": "application/json", ...(coinToken ? { Authorization: `Bearer ${coinToken}` } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = res.status === 404 || res.status === 405
        ? "The Scratchity website doesn't have tokens yet. Deploy the newest version of the site."
        : data.error || `The server answered with status ${res.status}.`;
      const e = new Error(msg); e.status = res.status; throw e;
    }
    return data;
  };

  const sc = () => (wallet && wallet.scratchity) || null;
  const pack = () => (sc() && sc().pack) || { tokens: 10, coins: 10 };
  const day = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric" });
  // Build needs a sign-in, and a token once the free month is over.
  const gated = () => mode === "build" && (!wallet || !sc() || (!sc().free && sc().tokens < 1));

  function setWallet(w) { wallet = w; drawCoins(); }

  function signedOut() {
    coinToken = null;
    wallet = null;
    tokenStore.set(null);
    drawCoins();
  }

  async function refreshWallet() {
    if (!coinToken) return drawCoins();
    try { setWallet(await coinApi("me", { method: "GET" })); }
    catch (e) { if (e.status === 401) signedOut(); else drawCoins(); }
  }

  async function signIn(username, password, note) {
    if (!username || !password) { note.textContent = "Type your BananaPeel username and password."; note.classList.add("note"); return; }
    note.textContent = "Signing in…";
    note.classList.remove("note");
    try {
      const r = await coinApi("login", { body: { username, password } });
      coinToken = r.token;
      await tokenStore.set(coinToken);
      setWallet(r.wallet);
    } catch (e) {
      note.textContent = e.message;
      note.classList.add("note");
    }
  }

  async function buyTokens(button, note) {
    button.disabled = true;
    note.textContent = "Buying…";
    note.classList.remove("note");
    try {
      setWallet(await coinApi("buy", { body: { packs: 1 } }));
    } catch (e) {
      button.disabled = false;
      note.textContent = e.message;
      note.classList.add("note");
    }
  }

  // The sign-in form, used in settings and on the Build card.
  function signInForm(prefix) {
    const form = el("form", "signin");
    form.innerHTML = `
      <div class="row">
        <input id="${prefix}User" autocomplete="username" placeholder="BananaPeel username" spellcheck="false" aria-label="BananaPeel username">
        <input id="${prefix}Pass" type="password" autocomplete="current-password" placeholder="Password" aria-label="BananaPeel password">
      </div>
      <div class="row"><button class="ghost" type="submit">Sign in with BananaPeel</button></div>
      <small></small>`;
    const note = form.querySelector("small");
    note.textContent = "No account? Make one with: bananapeel signup";
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      signIn(form.querySelector(`#${prefix}User`).value.trim(), form.querySelector(`#${prefix}Pass`).value, note);
    });
    return form;
  }

  function buyButton(cls) {
    const p = pack();
    const wrap = el("div", "buy");
    const btn = el("button", cls);
    btn.type = "button";
    btn.textContent = `Buy ${p.tokens} tokens for ${p.coins} 🍌`;
    const short = wallet && !wallet.admin && wallet.coins < p.coins;
    btn.disabled = !wallet || short;
    const note = el("small");
    if (short) note.textContent = `You have ${wallet.coins} 🍌. You get +10 every day.`;
    btn.addEventListener("click", () => buyTokens(btn, note));
    wrap.append(btn, note);
    return wrap;
  }

  function tokenLine() {
    if (!sc()) return "";
    if (sc().unlimited) return "👑 Admin: Build is always free";
    return sc().free
      ? `Build is free until ${day(sc().freeUntil)}, then you'll use your ${sc().tokens} tokens`
      : `🎟 ${sc().tokens} token${sc().tokens === 1 ? "" : "s"}`;
  }

  function drawCoins() {
    const p = pack();

    // Settings: BananaPeel account
    const acct = $("account");
    acct.innerHTML = "";
    const h = el("p", "account-title");
    h.textContent = "BananaPeel account";
    acct.append(h);
    if (wallet) {
      const line = el("p", "account-line");
      line.textContent = `Signed in as ${wallet.username} · 🍌 ${wallet.coins} BananaCoins` + (sc() ? ` · ${tokenLine()}` : "");
      const out = el("button", "ghost");
      out.type = "button";
      out.textContent = "Sign out";
      out.addEventListener("click", signedOut);
      acct.append(line, buyButton("ghost"), out);
    } else {
      const why = el("p", "account-line");
      why.textContent = `Build answers use Scratchity tokens (${p.tokens} for ${p.coins} 🍌 BananaCoins, pretend coins). Your first month is free.`;
      acct.append(why, signInForm("set"));
    }

    // Under the modes: what you have
    const purse = $("purse");
    purse.hidden = !(wallet && sc());
    if (wallet && sc()) purse.textContent = `🍌 ${wallet.coins} · ${tokenLine()}`;

    // The Build card: sign in, or buy tokens
    const lock = $("lock");
    const locked = gated();
    lock.hidden = !locked;
    $("composer").classList.toggle("is-locked", locked);
    input.disabled = locked;
    sendBtn.disabled = locked || busy;
    if (!locked) return;
    if (!wallet) {
      lock.innerHTML = `
        <h2>Sign in to Build</h2>
        <p>Build answers use Scratchity tokens. <strong>Your first month is free</strong>, and you get ${p.tokens} free tokens for after that. More tokens are ${p.tokens} for ${p.coins} 🍌 BananaCoins (pretend coins, not real money). Explain and Fix are always free.</p>`;
      lock.append(signInForm("lock"));
    } else {
      lock.innerHTML = `
        <h2>You're out of tokens</h2>
        <p>Each Build answer uses 1 token. Explain and Fix are still free.</p>`;
      lock.append(buyButton("send"));
    }
  }

  tokenStore.get().then((t) => {
    coinToken = t;
    refreshWallet();
  });

  setMode("build");
  input.focus();

  // Runs inside the Scratch editor tab: lists the sprites so the AI can use them. Self-contained.
  function scratchityProjectInfo() {
    const node = document.querySelector('[class*="blocks_blocks"]');
    if (!node) return null;
    const key = Object.keys(node).find((k) => k.startsWith("__reactInternalInstance$") || k.startsWith("__reactFiber$"));
    let f = key && node[key], hops = 0, vm = null;
    while (f && hops++ < 300 && !vm) {
      const p = f.memoizedProps;
      if (p && p.vm && p.vm.runtime) vm = p.vm;
      f = f.return;
    }
    if (!vm || !vm.editingTarget) return null;
    const sprites = vm.runtime.targets.filter((t) => t.isOriginal && !t.isStage);
    const sel = !vm.editingTarget.isStage ? vm.editingTarget : sprites[0];
    return {
      sprites: sprites.slice(0, 40).map((t) => t.getName().slice(0, 40)),
      selected: sel ? sel.getName().slice(0, 40) : null,
      stageSelected: vm.editingTarget.isStage,
      colab: document.documentElement.dataset.scratchColab === "live",
      costumes: sel ? sel.getCostumes().slice(0, 30).map((c) => c.name.slice(0, 40)) : [],
      backdrops: vm.runtime.getTargetForStage().getCostumes().slice(0, 30).map((c) => c.name.slice(0, 40)),
    };
  }

  // Runs inside the Scratch editor tab (main world), injected by the extension.
  // Must stay self-contained: Chrome copies just this function into the page.
  //
  // Blocks are handed to the editor's own block workspace (like pasting or dropping from the
  // backpack), so the editor stays in charge of the project. Changing the project directly and
  // then asking the editor to redraw races with the editor's own updates, which can delete the
  // new blocks or crash the code area.
  async function scratchityInsert(payload) {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const settle = async () => { await new Promise((r) => requestAnimationFrame(() => r())); await wait(250); };

    const findEditor = () => {
      const node = document.querySelector('[class*="blocks_blocks"]');
      if (!node) return null;
      const key = Object.keys(node).find((k) => k.startsWith("__reactInternalInstance$") || k.startsWith("__reactFiber$"));
      let f = key && node[key], hops = 0, vm = null;
      while (f && hops++ < 300) {
        const st = f.stateNode;
        if (st && st.workspace && st.ScratchBlocks && st.props && st.props.vm) return { vm: st.props.vm, ws: st.workspace, SB: st.ScratchBlocks };
        const p = f.memoizedProps;
        if (!vm && p && p.vm && p.vm.runtime) vm = p.vm;
        f = f.return;
      }
      return vm ? { vm, ws: null, SB: null } : null;
    };

    const ed = findEditor();
    if (!ed) return { ok: false, error: "this project isn't open in the editor. Click See inside, then try again." };
    if (!ed.ws) return { ok: false, error: "couldn't reach Scratch's code area. Reload the page and try again." };
    const vm = ed.vm;
    const stage = vm.runtime.getTargetForStage();
    const BlocksContainer = stage.blocks.constructor;
    const textToDom = (x) => (ed.SB.utils && ed.SB.utils.xml && ed.SB.utils.xml.textToDom ? ed.SB.utils.xml.textToDom(x) : ed.SB.Xml.textToDom(x));
    const fromB64 = (s) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const SOUP = "!#%()*+,-./:;=?@[]^_`{|}~ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const uid = () => Array.from({ length: 20 }, () => SOUP[(Math.random() * SOUP.length) | 0]).join("");

    const added = [];
    const redirected = [];
    let firstShown = null, keptCostumes = 0;

    // "Home" is the sprite that was selected when Scratchity started. If the Stage was selected,
    // use the first sprite instead (most blocks only work in sprites).
    const sprites = vm.runtime.targets.filter((t) => t.isOriginal && !t.isStage);
    const home = !vm.editingTarget.isStage ? vm.editingTarget : sprites[0] || null;
    const byName = (n) => sprites.find((t) => t.getName().toLowerCase() === String(n || "").trim().toLowerCase()) || null;

    for (const sp of payload.sprites) {
      // 1. Find the sprite. Unknown names go into the home sprite, unless making sprites is on.
      let target = sp.isStage ? stage : sp.isCurrent ? home : byName(sp.name);
      let created = false;
      if (!target && sp.sprite3 && payload.makeSprites) {
        await vm.addSprite(fromB64(sp.sprite3).buffer);
        await settle();
        target = vm.runtime.getSpriteTargetByName(sp.name);
        created = !!target;
      }
      if (!target && !sp.isStage && !sp.isCurrent && sp.name && home) redirected.push(sp.name);
      if (!target) target = home || stage;

      // 2. Show that sprite's code, and let the editor finish redrawing.
      if (vm.editingTarget.id !== target.id) {
        vm.setEditingTarget(target.id);
        await settle();
      }

      // 2b. Drawings. New sprites already came with theirs; existing sprites and the Stage get them
      //     added (or a same-named costume redrawn), and switch to the first one.
      let drawings = created ? (sp.art || []).length : 0;
      if (!created && sp.art && sp.art.length) {
        const storage = vm.runtime.storage;
        let first = -1;
        for (const a of sp.art) {
          try {
            const at = target.getCostumes().findIndex((c) => c.name.toLowerCase() === a.name.toLowerCase());
            if (at >= 0) {
              keptCostumes++; // never draw over a costume the person already has
              continue;
            } else {
              const asset = storage.createAsset(storage.AssetType.ImageVector, storage.DataFormat.SVG, new TextEncoder().encode(a.svg), null, true);
              const costume = { name: a.name, dataFormat: "svg", asset, md5: `${asset.assetId}.svg`, assetId: asset.assetId,
                rotationCenterX: a.cx, rotationCenterY: a.cy, bitmapResolution: 1, skinId: null };
              await vm.addCostume(costume.md5, costume, target.id);
              if (first < 0) first = target.getCostumes().length - 1;
            }
            drawings++;
          } catch (e) { /* skip a drawing Scratch won't take */ }
        }
        if (first >= 0) target.setCostume(first);
        await settle();
      }
      if (!sp.blocks.some((b) => b.topLevel)) {
        added.push({ name: target.isStage ? "the Stage" : target.getName(), scripts: 0, missing: 0, drawings, created, hadScripts: false });
        continue;
      }

      // 3. Reuse variables, lists and messages the project already has; create the rest (for all sprites).
      const idMap = {};
      for (const v of payload.variables) {
        const found = target.lookupVariableByNameAndType(v.name, v.type);
        if (found) idMap[v.id] = found.id;
        else { stage.createVariable(v.id, v.name, v.type); idMap[v.id] = v.id; }
      }

      // 4. Fresh block ids every time, so adding the same answer twice doesn't collide.
      const blocks = JSON.parse(JSON.stringify(sp.blocks));
      const newIds = {};
      for (const b of blocks) newIds[b.id] = uid();
      for (const b of blocks) {
        b.id = newIds[b.id];
        if (b.parent) b.parent = newIds[b.parent] || null;
        if (b.next) b.next = newIds[b.next] || null;
        for (const inp of Object.values(b.inputs)) {
          if (inp.block) inp.block = newIds[inp.block] || null;
          if (inp.shadow) inp.shadow = newIds[inp.shadow] || null;
        }
        for (const f of Object.values(b.fields)) if (f.id && idMap[f.id]) f.id = idMap[f.id];
      }

      // 5. Place new scripts to the right of what's already there.
      const tops = Object.values(target.blocks._blocks).filter((b) => b.topLevel);
      const x0 = tops.length ? Math.max(...tops.map((b) => b.x || 0)) + 480 : 40;
      for (const b of blocks) if (b.topLevel) { b.x = (b.x || 0) + x0; b.y = (b.y || 0) + 40; }

      // 6. Turn them into Scratch's XML using the VM's own serializer, then drop them into the workspace.
      const temp = new BlocksContainer(vm.runtime, true);
      for (const b of blocks) temp.createBlock(b);
      const topIds = blocks.filter((b) => b.topLevel).map((b) => b.id);
      const xml = `<xml xmlns="http://www.w3.org/1999/xhtml">${topIds.map((id) => temp.blockToXML(id, {})).join("")}</xml>`;
      if (typeof ed.SB.Events.setGroup === "function") ed.SB.Events.setGroup(true);
      try {
        ed.SB.Xml.domToWorkspace(textToDom(xml), ed.ws);
      } finally {
        if (typeof ed.SB.Events.setGroup === "function") ed.SB.Events.setGroup(false);
      }
      await settle();

      // 7. Check the project really has them now.
      const landed = topIds.filter((id) => target.blocks.getBlock(id)).length;
      if (!firstShown && landed) firstShown = { target, id: topIds[0] };
      added.push({ name: target.isStage ? "the Stage" : target.getName(), scripts: landed, missing: topIds.length - landed, drawings, created, hadScripts: tops.length > 0 });
    }

    // Show the first sprite that got code, scrolled to the new scripts.
    if (firstShown) {
      if (vm.editingTarget.id !== firstShown.target.id) { vm.setEditingTarget(firstShown.target.id); await settle(); }
      try { if (ed.ws.centerOnBlock && ed.ws.getBlockById(firstShown.id)) ed.ws.centerOnBlock(firstShown.id); } catch (e) { /* scrolling is optional */ }
    }
    const missing = added.reduce((n, a) => n + a.missing, 0);
    return {
      ok: missing === 0 || added.some((a) => a.scripts > 0 || a.drawings > 0), added, missing,
      redirected: [...new Set(redirected)], home: home ? home.getName() : "the Stage", keptCostumes,
    };
  }
})();
