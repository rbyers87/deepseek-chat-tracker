// Service worker. It keeps no state in memory (MV3 workers are killed after ~30 s idle);
// everything lives in chrome.storage.local and every write goes through one queue.
importScripts('providers.js');

const DAY = 24 * 3600 * 1000;
const COLORS = { ok: '#2e9e5b', warn: '#e08a00', crit: '#d64545', idle: '#6b7280' };

let queue = Promise.resolve();
const enqueue = (fn) => (queue = queue.then(fn, fn));

const get = async (key, fallback) => {
  const r = await chrome.storage.local.get(key);
  return r[key] === undefined ? fallback : r[key];
};
const set = (obj) => chrome.storage.local.set(obj);

async function handle(msg, sender) {
  switch (msg.type) {
    // content script -> latest snapshot of the open chat (replaces, never accumulates)
    case 'CHAT_UPDATE': {
      const { provider, chatId } = msg;
      const key = `chat:${provider}:${chatId}`;
      const old = await get(key, null);
      const rec = {
        ...(old || { started: Date.now(), files: [] }),
        provider, chatId,
        title: msg.title || old?.title || '',
        url: msg.url,
        tokens: msg.tokens,
        msgCount: msg.msgCount,
        updated: Date.now(),
      };
      await set({ [key]: rec });
      await pruneChats();
      return { ok: true };
    }

    // a prompt was sent on a 'usage' provider
    case 'PROMPT_SENT': {
      const key = `usage:${msg.provider}`;
      const list = await get(key, []);
      list.push(msg.ts || Date.now());
      await set({ [key]: list.filter((t) => Date.now() - t < 7 * DAY).slice(-500) });
      return { ok: true };
    }

    case 'FILE_ADDED': {
      const key = `chat:${msg.provider}:${msg.chatId}`;
      const rec = (await get(key, null)) || {
        provider: msg.provider, chatId: msg.chatId, title: '', url: '', tokens: 0, msgCount: 0,
        started: Date.now(), updated: Date.now(), files: [],
      };
      rec.files = rec.files || [];
      // same name + size in the same chat = same file, don't add twice
      if (!rec.files.some((f) => f.name === msg.file.name && f.sizeKB === msg.file.sizeKB)) {
        rec.files.push({ ...msg.file, addedAt: Date.now() });
      }
      await set({ [key]: rec });
      return { ok: true };
    }

    case 'FILE_REMOVED': {
      const key = `chat:${msg.provider}:${msg.chatId}`;
      const rec = await get(key, null);
      if (rec) {
        rec.files = (rec.files || []).filter((f) => !(f.name === msg.name && f.sizeKB === msg.sizeKB));
        await set({ [key]: rec });
      }
      return { ok: true };
    }

    case 'RESET_USAGE': {
      await set({ [`usage:${msg.provider}`]: [] });
      return { ok: true };
    }

    case 'RESET_CHAT': {
      await chrome.storage.local.remove(`chat:${msg.provider}:${msg.chatId}`);
      return { ok: true };
    }

    case 'CLEAR_ALL': {
      const all = await chrome.storage.local.get(null);
      const keys = Object.keys(all).filter((k) => /^(chat|usage|dismiss):/.test(k) || k === 'handoff');
      await chrome.storage.local.remove(keys);
      return { ok: true };
    }

    // content script -> badge for its own tab
    case 'STATUS': {
      const tabId = sender.tab?.id;
      if (tabId == null) return { ok: false };
      await chrome.action.setBadgeText({ tabId, text: msg.text || '' });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: COLORS[msg.level] || COLORS.idle });
      if (msg.tip) await chrome.action.setTitle({ tabId, title: msg.tip });
      return { ok: true };
    }

    case 'OPEN_TAB': {
      await chrome.tabs.create({ url: msg.url });
      return { ok: true };
    }
  }
  return { error: 'unknown message ' + msg.type };
}

async function pruneChats() {
  const all = await chrome.storage.local.get(null);
  const chats = Object.entries(all).filter(([k]) => k.startsWith('chat:'));
  if (chats.length < 60) return;
  chats.sort((a, b) => (b[1].updated || 0) - (a[1].updated || 0));
  const drop = chats.slice(50).map(([k]) => k);
  if (drop.length) await chrome.storage.local.remove(drop);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  enqueue(() => handle(msg, sender)).then(sendResponse, (e) => sendResponse({ error: String(e) }));
  return true; // async response
});
