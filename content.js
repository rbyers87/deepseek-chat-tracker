// AI Chat Limit Tracker - content script (runs on every supported site; config in providers.js)
(() => {
  if (window.__aclt) return;
  window.__aclt = true;

  const pid = providerForHost(location.hostname);
  if (!pid) return;
  const P = PROVIDERS[pid];

  // ---------- lifetime guard ----------
  // After the extension is reloaded this script keeps running but chrome.* is gone.
  let dead = false;
  const timers = [];
  let observer = null;
  const alive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };
  function teardown() {
    if (dead) return;
    dead = true;
    timers.forEach(clearInterval);
    try { observer?.disconnect(); } catch {}
    try { host?.remove(); } catch {}
  }
  const send = (msg) => {
    if (dead) return Promise.resolve(null);
    if (!alive()) { teardown(); return Promise.resolve(null); }
    try { return chrome.runtime.sendMessage(msg).catch(() => null); } catch { teardown(); return Promise.resolve(null); }
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- settings / stored state ----------
  let S = { ...P.defaults };
  let usageTimes = [];          // timestamps of prompts sent (usage providers)
  let files = [];               // files attached to the current chat (context providers)
  let dismissRank = 0;          // highest banner level the user has dismissed for this chat

  const chatKeyNow = () => P.chatIdRe.exec(location.pathname)?.[1] || 'new';
  let chatKey = chatKeyNow();
  let navAt = Date.now();

  async function loadStored() {
    if (!alive()) return teardown();
    try {
      const r = await chrome.storage.local.get(['settings', `usage:${pid}`, `chat:${pid}:${chatKey}`, `dismiss:${pid}:${chatKey}`]);
      S = { ...P.defaults, ...(r.settings?.[pid] || {}) };
      usageTimes = r[`usage:${pid}`] || [];
      files = r[`chat:${pid}:${chatKey}`]?.files || [];
      dismissRank = r[`dismiss:${pid}:${chatKey}`] || 0;
    } catch { teardown(); }
  }
  try {
    chrome.storage.onChanged.addListener((c) => {
      if (dead) return;
      if (!alive()) return teardown();
      if (c.settings) S = { ...P.defaults, ...(c.settings.newValue?.[pid] || {}) };
      if (c[`usage:${pid}`]) usageTimes = c[`usage:${pid}`].newValue || [];
      if (c[`chat:${pid}:${chatKey}`]) files = c[`chat:${pid}:${chatKey}`].newValue?.files || [];
      schedule(100);
    });
  } catch {}

  // ---------- reading the page ----------
  // Return elements for the first selector that matches, dropping any element nested inside another match
  // (this is what stopped the old version counting one message several times).
  function query(list) {
    for (const s of list) {
      let els;
      try { els = [...document.querySelectorAll(s)]; } catch { continue; }
      if (!els.length) continue;
      const set = new Set(els);
      const top = els.filter((e) => { for (let p = e.parentElement; p; p = p.parentElement) if (set.has(p)) return false; return true; });
      return { sel: s, els: top };
    }
    return { sel: null, els: [] };
  }

  const visible = (el) => el.getClientRects().length > 0;
  function findComposer() {
    for (const s of P.dom.composer) {
      let els;
      try { els = [...document.querySelectorAll(s)].filter(visible); } catch { continue; }
      if (els.length) return els[0];
    }
    return null;
  }

  function readMessages() {
    const u = query(P.dom.user);
    const a = query(P.dom.assistant);
    const msgs = [
      ...u.els.map((el) => ({ role: 'user', el })),
      ...a.els.map((el) => ({ role: 'assistant', el })),
    ].sort((x, y) => (x.el.compareDocumentPosition(y.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    return { msgs, diag: { user: u.sel, userN: u.els.length, assistant: a.sel, assistantN: a.els.length } };
  }

  // nearest scrollable ancestor that holds all the messages (used when we can't tell user turns apart)
  function transcriptRoot(msgs) {
    let node = msgs.length ? msgs[0].el : document.querySelector('main') || document.body;
    if (msgs.length > 1) {
      const last = msgs[msgs.length - 1].el;
      while (node && !node.contains(last)) node = node.parentElement;
    }
    for (let p = node; p && p !== document.body; p = p.parentElement) {
      const oy = getComputedStyle(p).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 20) return p;
    }
    return node || document.body;
  }

  // ---------- token estimate ----------
  const CJK = /[぀-ヿ㐀-鿿가-힯]/g;
  function estimate(text, code) {
    const cjk = (text.match(CJK) || []).length;
    return Math.ceil(cjk * 0.7 + (text.length - cjk) / (code ? 3.2 : 4)) + 4;
  }
  const TEXT_EXT = new Set(['txt', 'md', 'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php', 'sh', 'html', 'css', 'json', 'xml', 'yml', 'yaml', 'csv', 'tsv', 'sql', 'log', 'ini', 'toml']);
  const CODE_EXT = new Set(['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php', 'sh', 'html', 'css', 'json', 'xml', 'yml', 'yaml', 'sql']);
  const BIN_PER_KB = { pdf: 120, doc: 200, docx: 200, xls: 200, xlsx: 200, ppt: 150, pptx: 150, jpg: 100, jpeg: 100, png: 100, gif: 100, webp: 100 };

  async function describeFile(f) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    const sizeKB = Math.round((f.size / 1024) * 10) / 10;
    let tokens, how;
    if (TEXT_EXT.has(ext) && f.size < 8e6) {
      try { tokens = estimate(await f.text(), CODE_EXT.has(ext)); how = 'counted'; } catch {}
    }
    if (tokens == null) {
      const perKB = BIN_PER_KB[ext] ?? 150;
      tokens = Math.ceil(sizeKB * perKB);
      if (/^(jpe?g|png|gif|webp)$/.test(ext)) tokens = Math.min(tokens, 3000);
      how = 'estimated from size';
    }
    return { name: f.name, ext, sizeKB, tokens, how };
  }

  // Real File objects from the page's own events: far more reliable than scraping the DOM for "file-looking" nodes.
  async function onFiles(list) {
    if (P.mode !== 'context' || !list.length) return;
    for (const f of list) {
      const info = await describeFile(f);
      await send({ type: 'FILE_ADDED', provider: pid, chatId: chatKey, file: info });
    }
  }
  document.addEventListener('change', (e) => { if (e.target?.type === 'file' && e.target.files?.length) onFiles([...e.target.files]); }, true);
  document.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) onFiles([...e.dataTransfer.files]); }, true);
  document.addEventListener('paste', (e) => { if (e.clipboardData?.files?.length) onFiles([...e.clipboardData.files]); }, true);

  // ---------- prompt counting (usage providers) ----------
  let baseline = null, baseKey = chatKey, lastCount = -1, stable = 0;
  function trackPrompts(userCount) {
    if (P.mode !== 'usage') return;
    if (baseKey !== chatKey) {
      // a brand-new chat gets its id in the URL right after the first send: keep counting, don't re-baseline
      const continuing = baseKey === 'new' && baseline != null && userCount >= baseline;
      baseKey = chatKey;
      if (!continuing) { baseline = null; lastCount = -1; stable = 0; }
    }
    if (baseline == null) {
      if (chatKey === 'new' && userCount === 0) { baseline = 0; return; }
      // an existing chat: wait until the message list has finished loading so history isn't counted as new prompts
      if (userCount === lastCount) stable++; else { stable = 0; lastCount = userCount; }
      const settled = stable >= 2 && (userCount > 0 || Date.now() - navAt > 6000);
      if (settled && findComposer()) baseline = userCount;
      return;
    }
    if (userCount < baseline) { baseline = userCount; return; }   // message edited / removed
    const added = userCount - baseline;
    if (added > 0) {
      baseline = userCount;
      if (added <= 3) {                                           // more than 3 at once = a history load, not real sends
        const now = Date.now();
        for (let i = 0; i < added; i++) usageTimes.push(now);
        usageTimes = usageTimes.slice(-500);
        send({ type: 'PROMPT_SENT', provider: pid, ts: now });
      }
    }
  }

  // ---------- "the site says you're out" detection ----------
  let limitHitAt = 0;
  const msgSelectors = [...P.dom.user, ...P.dom.assistant].join(',');
  function scanNodeForLimit(node) {
    if (node.nodeType !== 1) return;
    const t = node.textContent || '';
    if (t.length < 8 || t.length > 500 || !LIMIT_HIT_RE.test(t)) return;
    try { if (msgSelectors && node.closest(msgSelectors)) return; } catch {}   // ignore the chat's own text
    limitHitAt = Date.now();
  }

  // ---------- status ----------
  let lastMutation = 0;
  let status = null;
  const levelFor = (pct, warn, crit) => (pct >= crit ? 'crit' : pct >= warn ? 'warn' : 'ok');
  const fmtK = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K' : String(n));
  function fmtDur(ms) {
    const m = Math.max(1, Math.round(ms / 60000));
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  }

  function compute() {
    const { msgs, diag } = readMessages();
    const composer = findComposer();
    diag.composer = !!composer;
    const st = {
      provider: pid, name: P.name, mode: P.mode, chatKey, title: cleanTitle(),
      msgCount: msgs.length, diag, limitHit: Date.now() - limitHitAt < 60 * 60 * 1000 && limitHitAt > navAt,
    };

    if (P.mode === 'context') {
      let tokens = 0, assistantChars = 0;
      for (const m of msgs) {
        const text = m.el.textContent || '';
        if (m.role === 'assistant') assistantChars += text.length;
        tokens += estimate(text, !!m.el.querySelector('pre,code'));
      }
      // couldn't tell your messages apart from the page: estimate them from the whole transcript instead
      if (diag.userN === 0 && diag.assistantN > 0) {
        const root = transcriptRoot(msgs);
        const rest = Math.max(0, (root.textContent || '').length - assistantChars);
        tokens += Math.ceil(rest / 4);
        diag.userEstimated = true;
      }
      const fileTokens = files.reduce((s, f) => s + (f.tokens || 0), 0);
      const total = tokens + fileTokens;
      const limit = S.contextLimit || 128000;
      const pct = Math.min(100, (total / limit) * 100);
      const level = st.limitHit ? 'crit' : levelFor(pct, S.warnPct, S.critPct);
      Object.assign(st, {
        tokens: total, messageTokens: tokens, fileTokens, files, limit, pct, level,
        remaining: Math.max(0, limit - total),
        rank: st.limitHit ? 3 : level === 'crit' ? 2 : level === 'warn' ? 1 : 0,
        badge: Math.round(pct) + '%',
      });
      st.tip = `${P.name}: ~${fmtK(total)} / ${fmtK(limit)} tokens (${Math.round(pct)}%)`;
      trackedUserCount = diag.userN;
    } else {
      trackPrompts(diag.userN);
      const win = (S.windowHours || 5) * 3600e3, now = Date.now();
      const times = usageTimes.filter((t) => now - t < win).sort((a, b) => a - b);
      const used = times.length, limit = S.limit || 0;
      const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
      const level = st.limitHit ? 'crit' : limit ? levelFor(pct, S.warnPct, 100) : 'idle';
      // the next slot frees up when the prompt that is `limit` places back falls out of the window
      const freeAt = limit && used >= limit ? times[used - limit] + win : times[0] ? times[0] + win : 0;
      Object.assign(st, {
        used, limit, pct, level, windowHours: S.windowHours, resetsInMs: freeAt ? Math.max(0, freeAt - now) : 0,
        rank: st.limitHit || (limit && used >= limit) ? 3 : level === 'crit' ? 2 : level === 'warn' ? 1 : 0,
        badge: limit ? `${used}/${limit}` : String(used || ''),
      });
      st.tip = `${P.name}: ${used}${limit ? ' / ' + limit : ''} prompts in the last ${S.windowHours} h` +
        (st.resetsInMs ? ` (next slot in ${fmtDur(st.resetsInMs)})` : '');
    }
    return st;
  }
  let trackedUserCount = 0;

  function cleanTitle() {
    return (document.title || '').replace(new RegExp(`\\s*[-|–·]\\s*${P.name}.*$|^${P.name}\\s*[-|–]\\s*`, 'i'), '').trim().slice(0, 120);
  }

  // ---------- main loop ----------
  let timer = null, lastSig = '', lastSentAt = 0, lastChatSig = '';
  function schedule(ms = 1200) {
    if (dead || timer) return;
    timer = setTimeout(() => { timer = null; tick(); }, ms);
  }

  function tick() {
    if (dead) return;
    status = compute();
    const sig = [status.badge, status.level, status.rank].join('|');
    if (sig !== lastSig || Date.now() - lastSentAt > 20000) {
      lastSig = sig; lastSentAt = Date.now();
      send({ type: 'STATUS', text: status.badge, level: status.level, tip: status.tip });
    }
    // persist the chat snapshot (context providers only, and only once the chat has a real id)
    if (P.mode === 'context' && chatKey !== 'new') {
      const csig = `${chatKey}|${status.messageTokens}|${status.msgCount}`;
      if (csig !== lastChatSig) {
        lastChatSig = csig;
        send({ type: 'CHAT_UPDATE', provider: pid, chatId: chatKey, title: status.title, url: location.href, tokens: status.tokens, msgCount: status.msgCount });
      }
    }
    renderBanner();
  }

  function onNav() {
    const old = chatKey;
    chatKey = chatKeyNow();
    navAt = Date.now();
    lastChatSig = ''; lastSig = ''; limitHitAt = 0; asked = null;
    // files attached before the first send were stored under 'new': move them to the real chat id
    const migrate = old === 'new' && chatKey !== 'new' && P.mode === 'context' ? files.slice() : [];
    loadStored().then(async () => {
      for (const f of migrate) await send({ type: 'FILE_ADDED', provider: pid, chatId: chatKey, file: f });
      if (migrate.length) send({ type: 'RESET_CHAT', provider: pid, chatId: 'new' });
      schedule(600);
      maybeFillHandoff();
    });
  }

  // ---------- UI (shadow DOM so site CSS can't touch it) ----------
  let host = null, root = null, card = null, toastEl = null, toastTimer = null;
  const CSS = `
    :host{all:initial}
    *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
    #card{position:fixed;right:16px;bottom:16px;width:340px;max-width:calc(100vw - 32px);background:#1b1d23;color:#f2f3f5;border-radius:12px;
      box-shadow:0 8px 32px rgba(0,0,0,.45);padding:14px 14px 12px;border-left:5px solid #e08a00;font-size:13px;line-height:1.4}
    #card.crit{border-left-color:#d64545}
    #card[hidden],#toast[hidden]{display:none}
    .row{display:flex;gap:8px;align-items:center}
    .title{font-weight:650;font-size:14px;margin:0 0 6px}
    .sub{opacity:.8;font-size:12px;margin:0 0 8px}
    .bar{height:6px;border-radius:3px;background:rgba(255,255,255,.15);overflow:hidden;margin:6px 0 10px}
    .bar>i{display:block;height:100%;background:#e08a00}
    .crit .bar>i{background:#d64545}
    button,select{font:inherit;font-size:12px;border-radius:7px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:inherit;padding:7px 9px;cursor:pointer}
    button:hover{background:rgba(255,255,255,.16)}
    button.primary{background:#4f7cff;border-color:#4f7cff;color:#fff;font-weight:600}
    button.primary:hover{background:#6a90ff}
    .full{width:100%;text-align:left;margin-bottom:6px}
    select{flex:1;min-width:0;background:#2a2d35}
    .note{font-size:11px;opacity:.7;margin:2px 0 8px}
    .x{position:absolute;top:6px;right:8px;background:none;border:none;font-size:16px;padding:2px 6px;opacity:.6}
    #toast{position:fixed;right:16px;bottom:16px;max-width:340px;background:#111;color:#fff;padding:10px 14px;border-radius:10px;font-size:13px;box-shadow:0 6px 24px rgba(0,0,0,.4)}
  `;
  function ensureUI() {
    if (host?.isConnected) return;
    host = document.createElement('div');
    host.id = 'aclt-host';
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;right:0;bottom:0';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style><div id="card" hidden></div><div id="toast" hidden></div>`;
    card = root.getElementById('card');
    toastEl = root.getElementById('toast');
    document.documentElement.appendChild(host);
  }
  function toast(msg, ms = 4500) {
    ensureUI();
    toastEl.textContent = msg;
    toastEl.hidden = false;
    card.style.bottom = '70px';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; card.style.bottom = ''; }, ms);
  }

  let asked = null;          // { assistantCount } once we've inserted the "write a handoff" prompt
  let forceShow = false;
  let lastCardSig = '';

  function bannerText(st) {
    if (st.mode === 'context') {
      if (st.limitHit) return ['This chat has hit its limit', 'The site reports the chat is full. Start a new one and carry the context over.'];
      const t = `~${fmtK(st.tokens)} of ${fmtK(st.limit)} tokens used (${Math.round(st.pct)}%)`;
      return st.level === 'crit'
        ? [`Almost out of room: ${Math.round(st.pct)}% full`, `${t}. Hand off now, before the chat gets cut off.`]
        : [`This chat is ${Math.round(st.pct)}% full`, `${t}. Good moment to ask for a handoff summary.`];
    }
    const reset = st.resetsInMs ? ` Next slot opens in ${fmtDur(st.resetsInMs)}.` : '';
    if (st.limitHit) return [`${st.name} says you've hit the free limit`, 'Carry this conversation to another AI while you wait.' + reset];
    if (st.limit && st.used >= st.limit) return [`Free limit reached: ${st.used} of ~${st.limit} prompts`, 'Carry this conversation to another AI while you wait.' + reset];
    return [`${st.used} of ~${st.limit} free prompts used`, `Limit is a rolling ${st.windowHours} h window, so plan your next prompt.` + reset];
  }

  function renderBanner() {
    const st = status;
    if (!st || !document.body) return;
    const show = forceShow || (st.rank > dismissRank && (st.mode === 'context' || st.limit || st.limitHit));
    if (!show) { if (card) { card.hidden = true; lastCardSig = ''; } return; }
    ensureUI();

    const h = handoffPreview();
    const [title, sub] = bannerText(st);
    const sig = [st.level, st.rank, Math.round(st.pct), st.used, h.kind, h.streaming, !!asked, st.resetsInMs && Math.round(st.resetsInMs / 60000)].join('|');
    if (sig === lastCardSig && !card.hidden) return;   // don't rebuild (and reset the dropdown) when nothing changed
    lastCardSig = sig;

    const others = Object.entries(PROVIDERS).filter(([id]) => id !== pid);
    const prev = root.getElementById('target')?.value;
    card.className = st.level === 'crit' || st.rank >= 2 ? 'crit' : '';
    card.innerHTML = `
      <button class="x" id="close" title="Dismiss">×</button>
      <p class="title">${esc(title)}</p>
      <p class="sub">${esc(sub)}</p>
      <div class="bar"><i style="width:${Math.max(3, Math.round(st.pct))}%"></i></div>
      <button class="full" id="ask">1 · Ask the AI for a handoff summary</button>
      <div class="row" style="margin-bottom:4px">
        <select id="target">
          <option value="${pid}">New chat in ${esc(P.name)}</option>
          ${others.map(([id, p]) => `<option value="${id}">Continue in ${esc(p.name)}</option>`).join('')}
        </select>
        <button class="primary" id="go">2 · Open</button>
      </div>
      <p class="note">${esc(h.note)}</p>
      <div class="row"><button id="copy">Copy handoff</button><button id="later">Remind me later</button></div>`;
    if (prev) root.getElementById('target').value = prev;
    root.getElementById('close').onclick = () => dismiss(true);
    root.getElementById('later').onclick = () => dismiss(false);
    root.getElementById('ask').onclick = doAsk;
    root.getElementById('go').onclick = () => startNewChat(root.getElementById('target').value);
    root.getElementById('copy').onclick = async () => {
      const r = handoffPreview();
      await copy(wrapHandoff(r));
      toast('Handoff copied. Paste it into a new chat.');
    };
    card.hidden = false;
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function dismiss(forever) {
    forceShow = false;
    if (forever && status) {
      dismissRank = Math.max(dismissRank, status.rank);
      chrome.storage.local.set({ [`dismiss:${pid}:${chatKey}`]: dismissRank }).catch?.(() => {});
    } else if (status) {
      // "later": hide until the next level is reached
      dismissRank = Math.max(dismissRank, status.rank);
    }
    if (card) card.hidden = true;
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    ta.remove();
    return ok;
  }

  // ---------- writing into the site's message box ----------
  async function setComposerText(text) {
    const el = findComposer();
    if (!el) return false;
    el.focus();
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);   // React-controlled inputs ignore plain .value =
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const sel = getSelection(), r = document.createRange();
      r.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(r);
      let ok = false;
      try { ok = document.execCommand('insertText', false, text); } catch {}
      if (!ok) {
        const dt = new DataTransfer(); dt.setData('text/plain', text);
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      }
    }
    await sleep(200);
    return ((el.value ?? el.innerText) || '').trim().length > 0;
  }

  async function doAsk() {
    const { msgs } = readMessages();
    const ok = await setComposerText(HANDOFF_REQUEST);
    if (ok) {
      asked = { assistantCount: msgs.filter((m) => m.role === 'assistant').length };
      toast('Handoff request is in the message box. Press send, then use "Open" when the summary finishes.');
    } else {
      await copy(HANDOFF_REQUEST);
      toast("Couldn't type into the box, so I copied the request. Paste it and send.");
    }
    lastCardSig = '';
    schedule(300);
  }

  // ---------- building the handoff ----------
  const clip = (s, n) => (s.length > n ? s.slice(0, n) + ' …[cut]' : s);

  function localTranscript(msgs) {
    const parts = [];
    if (msgs.length) {
      const firstUser = msgs.find((m) => m.role === 'user');
      if (firstUser) parts.push('ORIGINAL REQUEST:\n' + clip(firstUser.el.innerText.trim(), 1500));
      let budget = 9000;
      const recent = [];
      for (let i = msgs.length - 1; i >= 0 && recent.length < 8 && budget > 0; i--) {
        const t = clip(msgs[i].el.innerText.trim(), 2500);
        budget -= t.length;
        recent.unshift(`[${msgs[i].role === 'user' ? 'ME' : 'AI'}]\n${t}`);
      }
      parts.push('MOST RECENT MESSAGES (oldest first):\n' + recent.join('\n\n'));
    } else {
      const root = transcriptRoot([]);
      parts.push('MOST RECENT PAGE TEXT:\n' + (root.innerText || '').trim().slice(-9000));
    }
    return parts.join('\n\n');
  }

  // what "Open" / "Copy" would hand over right now
  function handoffPreview() {
    const { msgs } = readMessages();
    const asst = msgs.filter((m) => m.role === 'assistant');
    const streaming = Date.now() - lastMutation < 2500;
    if (asked && asst.length > asked.assistantCount) {
      const text = asst[asst.length - 1].el.innerText.trim();
      if (text.length > 150) {
        return { kind: 'ai', text, streaming, note: streaming ? 'The summary is still being written. Wait a moment.' : 'Will hand over: the AI’s summary ✓' };
      }
    }
    return {
      kind: 'local', text: localTranscript(msgs), streaming: false,
      note: asked ? 'Waiting for the summary. Until then I’ll hand over the recent messages as-is.'
        : 'No summary yet. Step 1 gives the best result; otherwise I’ll hand over the recent messages as-is.',
    };
  }

  const wrapHandoff = (h) =>
    `${HANDOFF_HEADER}${h.kind === 'local' ? ' (This is a raw excerpt of the old chat rather than a summary, so infer the goal and state from it.)' : ''}\n\n--- HANDOFF START ---\n${h.text}\n--- HANDOFF END ---\n`;

  async function startNewChat(targetId) {
    const h = handoffPreview();
    if (h.streaming) { toast('The summary is still being written. Try again in a moment.'); return; }
    const target = PROVIDERS[targetId] || P;
    await chrome.storage.local.set({ handoff: { target: targetId, text: wrapHandoff(h), from: pid, ts: Date.now() } });
    await copy(wrapHandoff(h));   // belt and braces: it's on the clipboard even if auto-fill fails
    await send({ type: 'OPEN_TAB', url: target.newChatUrl });
    toast(`Opened a new ${target.name} chat. The handoff will be filled in for you (also copied).`);
  }

  // runs on the NEW chat page: drop the stored handoff into the empty message box
  let filling = false;
  async function maybeFillHandoff() {
    if (filling || dead || chatKey !== 'new') return;
    let h;
    try { h = (await chrome.storage.local.get('handoff')).handoff; } catch { return; }
    if (!h || h.target !== pid || Date.now() - h.ts > 20 * 60e3) return;
    filling = true;
    try {
      for (let i = 0; i < 30 && !dead; i++) {      // the message box can take a few seconds to appear
        const el = findComposer();
        if (el && !((el.value ?? el.innerText) || '').trim()) {
          if (await setComposerText(h.text)) {
            await chrome.storage.local.remove('handoff');
            toast('Handoff pasted. Read it over, then press send.', 7000);
          }
          break;
        }
        await sleep(800);
      }
    } finally { filling = false; }
  }

  // ---------- messages from the popup ----------
  try {
    chrome.runtime.onMessage.addListener((m, _s, reply) => {
      if (dead) return;
      if (m.type === 'GET_STATUS') { status = compute(); reply({ ...status, files: files }); return; }
      if (m.type === 'ASK_SUMMARY') { doAsk().then(() => reply({ ok: true })); return true; }
      if (m.type === 'OPEN_HANDOFF') { startNewChat(m.target || pid).then(() => reply({ ok: true })); return true; }
      if (m.type === 'GET_HANDOFF') { reply({ text: wrapHandoff(handoffPreview()) }); return; }
      if (m.type === 'SHOW_BANNER') { forceShow = true; lastCardSig = ''; tick(); reply({ ok: true }); return; }
    });
  } catch {}

  // ---------- start ----------
  async function init() {
    await loadStored();
    observer = new MutationObserver((muts) => {
      lastMutation = Date.now();
      for (const m of muts) for (const n of m.addedNodes) scanNodeForLimit(n);
      schedule(1200);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    timers.push(setInterval(() => {                 // SPA navigation + slow backstop
      if (dead) return;
      if (chatKeyNow() !== chatKey) onNav();
      else if (Date.now() - lastSentAt > 5000) schedule(0);
    }, 1000));
    tick();
    maybeFillHandoff();
  }
  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init, { once: true });
})();
