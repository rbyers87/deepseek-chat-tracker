const $ = (id) => document.getElementById(id);
const fmtK = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K' : String(Math.round(n)));
const fmtDur = (ms) => { const m = Math.max(1, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };

let tab = null, pid = null, st = null;

function say(text, err) { const m = $('msg'); m.textContent = text; m.className = 'msg' + (err ? ' err' : ''); }

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try { pid = tab?.url ? providerForHost(new URL(tab.url).hostname) : null; } catch { pid = null; }
  await renderAll();
  setInterval(refreshLive, 2000);
}

async function refreshLive() {
  if (!pid) return;
  try { st = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' }); } catch { st = null; }
  renderLive();
}

async function renderAll() {
  renderAllList();
  if (!pid) {
    $('where').textContent = 'No supported AI site in this tab';
    $('empty').hidden = false;
    return;
  }
  $('where').textContent = PROVIDERS[pid].name + (PROVIDERS[pid].mode === 'context' ? ' · chat length' : ' · free-tier usage');
  await buildSettings();
  await refreshLive();
}

function renderLive() {
  const live = $('live'), empty = $('empty');
  if (!st) {
    live.hidden = true; $('actions').hidden = true; $('filesBox').hidden = true; $('diagBox').hidden = true;
    empty.hidden = false;
    $('empty').firstChild.textContent = 'Can’t reach this tab yet. Reload the page (the extension was probably just installed or updated).';
    return;
  }
  empty.hidden = true; live.hidden = false; $('actions').hidden = false;
  $('chatTitle').textContent = st.title || (st.chatKey === 'new' ? 'New chat' : st.name + ' chat');

  const bar = $('barFill');
  bar.style.width = Math.max(st.pct ? 3 : 0, Math.round(st.pct)) + '%';
  bar.className = st.level === 'crit' ? 'crit' : st.level === 'warn' ? 'warn' : '';
  const warn = $('warn');
  warn.className = 'warnline';

  if (st.mode === 'context') {
    $('bigValue').textContent = '~' + fmtK(st.tokens);
    $('bigOf').textContent = `of ${fmtK(st.limit)} tokens · ${Math.round(st.pct)}%`;
    $('liveLine').textContent = `${st.msgCount} messages · ${fmtK(st.remaining)} left` + (st.fileTokens ? ` · files ${fmtK(st.fileTokens)}` : '');
    $('filesBox').hidden = false;
    renderFiles();
    $('resetUsage').hidden = true;
  } else {
    $('bigValue').textContent = String(st.used);
    $('bigOf').textContent = st.limit ? `of ~${st.limit} prompts · last ${st.windowHours} h` : `prompts in the last ${st.windowHours} h (no limit set)`;
    $('liveLine').textContent = st.resetsInMs ? `Next slot opens in ${fmtDur(st.resetsInMs)}` : 'Nothing to wait for';
    $('filesBox').hidden = true;
    $('resetUsage').hidden = false;
  }
  if (st.limitHit) { warn.textContent = 'The site says you’ve hit its limit.'; warn.classList.add('crit'); }
  else if (st.level === 'crit') { warn.textContent = st.mode === 'context' ? 'Almost full. Hand off now.' : 'Limit reached.'; warn.classList.add('crit'); }
  else if (st.level === 'warn') { warn.textContent = st.mode === 'context' ? 'Getting full. Consider a handoff.' : 'Getting close to the limit.'; warn.classList.add('warn'); }
  else warn.textContent = '';

  // diagnostics
  $('diagBox').hidden = false;
  const d = st.diag || {};
  $('diag').textContent = [
    `provider: ${st.provider}   chat: ${st.chatKey}`,
    `your messages:  ${d.userN} via ${d.user || 'NO MATCH'}${d.userEstimated ? '  (estimated from page text)' : ''}`,
    `AI messages:    ${d.assistantN} via ${d.assistant || 'NO MATCH'}`,
    `message box:    ${d.composer ? 'found' : 'NOT FOUND'}`,
  ].join('\n');
}

function renderFiles() {
  const list = $('fileList');
  list.textContent = '';
  const files = st.files || [];
  $('fileTokens').textContent = files.length ? `${fmtK(st.fileTokens)} tokens` : 'none yet';
  for (const f of files) {
    const row = document.createElement('div');
    row.className = 'file';
    const a = document.createElement('span'); a.textContent = f.name;
    const b = document.createElement('span'); b.textContent = `~${fmtK(f.tokens)}`; b.title = f.how || '';
    const x = document.createElement('button'); x.textContent = '×'; x.title = 'Remove from the count';
    x.onclick = async () => {
      await chrome.runtime.sendMessage({ type: 'FILE_REMOVED', provider: pid, chatId: st.chatKey, name: f.name, sizeKB: f.sizeKB });
      setTimeout(refreshLive, 200);
    };
    row.append(a, b, x);
    list.append(row);
  }
}

// ----- settings -----
async function buildSettings() {
  const P = PROVIDERS[pid];
  const saved = (await chrome.storage.local.get('settings')).settings?.[pid] || {};
  const S = { ...P.defaults, ...saved };
  const fields = P.mode === 'context'
    ? [['contextLimit', 'Context limit (tokens)', 1000], ['warnPct', 'Warn at %', 1], ['critPct', 'Urgent at %', 1]]
    : [['limit', 'Prompts allowed (0 = unknown)', 1], ['windowHours', 'Window (hours)', 1], ['warnPct', 'Warn at %', 1]];
  $('setName').textContent = P.name;
  const body = $('settingsBody');
  body.textContent = '';
  for (const [key, label, step] of fields) {
    const row = document.createElement('div'); row.className = 'setrow';
    const l = document.createElement('label'); l.textContent = label;
    const i = document.createElement('input'); i.type = 'number'; i.min = 0; i.step = step; i.value = S[key];
    i.onchange = async () => {
      const all = (await chrome.storage.local.get('settings')).settings || {};
      all[pid] = { ...(all[pid] || {}), [key]: Math.max(0, Number(i.value) || 0) };
      await chrome.storage.local.set({ settings: all });
      setTimeout(refreshLive, 200);
    };
    row.append(l, i); body.append(row);
  }
  $('settingsBox').hidden = false;

  const sel = $('target');
  sel.textContent = '';
  sel.append(new Option(`New chat in ${P.name}`, pid));
  for (const [id, p] of Object.entries(PROVIDERS)) if (id !== pid) sel.append(new Option(`Continue in ${p.name}`, id));
}

// ----- all AIs -----
async function renderAllList() {
  const all = await chrome.storage.local.get(null);
  const settings = all.settings || {};
  const list = $('allList');
  list.textContent = '';
  for (const [id, p] of Object.entries(PROVIDERS)) {
    const S = { ...p.defaults, ...(settings[id] || {}) };
    const row = document.createElement('div'); row.className = 'all';
    const a = document.createElement('span'); a.textContent = p.name;
    const b = document.createElement('span');
    if (p.mode === 'usage') {
      const used = (all[`usage:${id}`] || []).filter((t) => Date.now() - t < S.windowHours * 3600e3).length;
      b.textContent = `${used}${S.limit ? ' / ' + S.limit : ''} in ${S.windowHours} h`;
    } else {
      const chats = Object.values(all).filter((v) => v && v.provider === id && v.chatId).sort((x, y) => y.updated - x.updated);
      b.textContent = chats.length ? `${chats.length} chats · latest ${Math.round((chats[0].tokens / S.contextLimit) * 100)}%` : 'no chats yet';
    }
    row.append(a, b); list.append(row);
  }
}

// ----- buttons -----
async function toTab(msg) {
  try { return await chrome.tabs.sendMessage(tab.id, msg); }
  catch { say('Reload the page first.', true); return null; }
}
$('ask').onclick = async () => { const r = await toTab({ type: 'ASK_SUMMARY' }); if (r) { say('Request is in the message box. Press send.'); } };
$('open').onclick = async () => { const r = await toTab({ type: 'OPEN_HANDOFF', target: $('target').value }); if (r) say('Opened. The handoff is copied too.'); };
$('banner').onclick = async () => { const r = await toTab({ type: 'SHOW_BANNER' }); if (r) window.close(); };
$('copy').onclick = async () => {
  const r = await toTab({ type: 'GET_HANDOFF' });
  if (!r) return;
  try { await navigator.clipboard.writeText(r.text); say('Handoff copied.'); } catch { say('Copy failed.', true); }
};
$('addFile').onclick = async () => {
  const input = prompt('File name and size, e.g. "report.pdf 500KB" or "data.csv 2MB"');
  const m = input && input.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(kb|mb)?$/i);
  if (!m) return;
  const sizeKB = parseFloat(m[2]) * (m[3]?.toLowerCase() === 'mb' ? 1024 : 1);
  const ext = (m[1].split('.').pop() || '').toLowerCase();
  const per = { txt: 256, md: 256, csv: 256, pdf: 120, doc: 200, docx: 200, xls: 200, xlsx: 200, jpg: 100, jpeg: 100, png: 100 }[ext] ?? 333;
  await chrome.runtime.sendMessage({
    type: 'FILE_ADDED', provider: pid, chatId: st.chatKey,
    file: { name: m[1], ext, sizeKB, tokens: Math.ceil(sizeKB * per), how: 'manual estimate' },
  });
  setTimeout(refreshLive, 200);
};
$('resetUsage').onclick = async () => {
  if (!confirm('Reset the prompt count for ' + PROVIDERS[pid].name + '?')) return;
  await chrome.runtime.sendMessage({ type: 'RESET_USAGE', provider: pid });
  setTimeout(() => { refreshLive(); renderAllList(); }, 200);
};
$('clearAll').onclick = async () => {
  if (!confirm('Delete all saved chats, usage counts and pending handoffs? Your limit settings are kept.')) return;
  await chrome.runtime.sendMessage({ type: 'CLEAR_ALL' });
  renderAll();
};

init();
