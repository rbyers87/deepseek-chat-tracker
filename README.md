# AI Chat Limit Tracker

Chrome extension (Manifest V3) that warns you **before** an AI chat runs out of room, and carries the conversation into a new chat.

| Site | What it tracks |
|---|---|
| DeepSeek | Chat length: estimated tokens vs. the context limit (default 128K), including attached files |
| ChatGPT, Claude, Gemini, Copilot, Grok, Perplexity | Free-tier usage: prompts you send inside a rolling time window vs. a limit you set |

## Install
1. `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → pick this folder.
2. Reload any open AI tabs. Pin the extension to see the toolbar badge (per tab: `82%` on DeepSeek, `7/10` elsewhere).

## The handoff
When a chat reaches the warning level (or a free limit is reached) a card appears in the page:
1. **Ask the AI for a handoff summary** puts a ready-made request in the message box. You press send.
2. **Open** starts a new chat (in the same AI or a different one) with the summary already pasted into the message box. It is also copied to the clipboard. You press send.

If the site has already blocked you from sending, **Open** falls back to the most recent messages from the screen.

## Limits
Free-tier numbers are not published precisely and change. The defaults (ChatGPT ~10 per 5 h, Claude ~15 per 5 h, Gemini ~5 per day) are estimates; change them in the popup under *Limits*. Claude's real limit depends on message length, so its count is only a rough guide. Copilot, Grok and Perplexity default to "no limit set" and just count.

## If a site stops being read correctly
Each site's page selectors live in `providers.js`. The popup's *Diagnostics* section shows which selector matched and how many messages it found; `NO MATCH` means that site changed its markup and the selectors need updating. The DeepSeek, Claude, Gemini, Copilot, Grok and Perplexity selectors are best-effort and could not be checked against the live sites.

## Files
`manifest.json` · `providers.js` (per-site config, limits, handoff text) · `content.js` (reads the page, banner, handoff) · `background.js` (storage, badge) · `popup.html/js/css`

All data stays in your browser (`chrome.storage.local`). Nothing is sent anywhere. Only counts and file names/sizes are saved, plus the handoff text, which is kept just until it is pasted into the new chat (it expires after 20 minutes).
