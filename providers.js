// Shared by the content script, the service worker and the popup.
// Everything site-specific lives here, so when a site changes its markup this is the only file to edit.
//
// mode 'context' -> the site caps the length of ONE chat. We estimate tokens in the chat vs. a limit.
// mode 'usage'   -> the site caps how much you can send per time window (free tier). We count prompts
//                   you send inside a rolling window vs. a limit you can edit in the popup.
//
// dom.user / dom.assistant / dom.composer are lists of CSS selectors. The first selector that matches
// anything wins, so put the most specific / newest markup first.

const PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    hosts: ['chat.deepseek.com'],
    mode: 'context',
    newChatUrl: 'https://chat.deepseek.com/',
    chatIdRe: /\/a\/chat\/s\/([\w-]+)/,
    defaults: { contextLimit: 128000, warnPct: 80, critPct: 90 },
    dom: {
      user: ['.ds-message:not(:has(.ds-markdown))'],
      assistant: ['.ds-markdown'],
      composer: ['textarea#chat-input', 'textarea', '[contenteditable="true"]'],
    },
  },
  chatgpt: {
    name: 'ChatGPT',
    hosts: ['chatgpt.com', 'chat.openai.com'],
    mode: 'usage',
    newChatUrl: 'https://chatgpt.com/',
    chatIdRe: /\/c\/([\w-]+)/,
    // OpenAI doesn't publish an exact number (about 10 per rolling 5 h on the free plan). Edit in the popup.
    defaults: { limit: 10, windowHours: 5, warnPct: 70 },
    dom: {
      user: ['[data-message-author-role="user"]'],
      assistant: ['[data-message-author-role="assistant"]'],
      composer: ['#prompt-textarea', 'div[contenteditable="true"]', 'textarea'],
    },
  },
  claude: {
    name: 'Claude',
    hosts: ['claude.ai'],
    mode: 'usage',
    newChatUrl: 'https://claude.ai/new',
    chatIdRe: /\/chat\/([\w-]+)/,
    // Claude's free limit is usage-based (long chats and files use it up faster), reset every 5 h.
    // This count is only a rough stand-in; edit it to match what you actually get.
    defaults: { limit: 15, windowHours: 5, warnPct: 70 },
    dom: {
      user: ['[data-testid="user-message"]'],
      assistant: ['.font-claude-response', '.font-claude-message', '[data-is-streaming]'],
      composer: ['div.ProseMirror[contenteditable="true"]', '[contenteditable="true"]', 'textarea'],
    },
  },
  gemini: {
    name: 'Gemini',
    hosts: ['gemini.google.com'],
    mode: 'usage',
    newChatUrl: 'https://gemini.google.com/app',
    chatIdRe: /\/app\/([\w-]+)/,
    // Google has documented about 5 prompts/day on the free tier for its top model. Edit in the popup.
    defaults: { limit: 5, windowHours: 24, warnPct: 60 },
    dom: {
      user: ['user-query', '.query-text'],
      assistant: ['model-response', 'message-content', '.model-response-text'],
      composer: ['rich-textarea .ql-editor', 'div.ql-editor[contenteditable="true"]', '[contenteditable="true"]'],
    },
  },
  copilot: {
    name: 'Copilot',
    hosts: ['copilot.microsoft.com'],
    mode: 'usage',
    newChatUrl: 'https://copilot.microsoft.com/',
    chatIdRe: /\/chats\/([\w-]+)/,
    defaults: { limit: 0, windowHours: 24, warnPct: 80 }, // 0 = no known limit, just count
    dom: {
      user: ['[data-content="user-message"]', '[data-testid="user-message"]', '[class*="user-message"]'],
      assistant: ['[data-content="ai-message"]', '[data-testid="ai-message"]', '[class*="ai-message"]'],
      composer: ['textarea', '[contenteditable="true"]'],
    },
  },
  grok: {
    name: 'Grok',
    hosts: ['grok.com'],
    mode: 'usage',
    newChatUrl: 'https://grok.com/',
    chatIdRe: /\/chat\/([\w-]+)/,
    defaults: { limit: 0, windowHours: 2, warnPct: 80 },
    dom: {
      user: ['[class*="message-bubble"][class*="items-end"]', '[class*="user-message"]'],
      assistant: ['[class*="message-bubble"]:not([class*="items-end"])', '.response-content-markdown'],
      composer: ['textarea', '[contenteditable="true"]'],
    },
  },
  perplexity: {
    name: 'Perplexity',
    hosts: ['www.perplexity.ai', 'perplexity.ai'],
    mode: 'usage',
    newChatUrl: 'https://www.perplexity.ai/',
    chatIdRe: /\/search\/([\w.-]+)/,
    defaults: { limit: 0, windowHours: 24, warnPct: 80 },
    dom: {
      user: ['[class*="group/query"]', 'h1[class*="query"]'],
      assistant: ['[id^="markdown-content"]', '.prose'],
      composer: ['#ask-input', 'textarea', '[contenteditable="true"]'],
    },
  },
};

// Phrases that mean "the site is telling you the limit has been hit".
const LIMIT_HIT_RE = /(you['’]ve|you have) (reached|hit)( your| the)?[^.]{0,40}\b(limit|cap)\b|\b(usage|message|daily|free) limit (reached|exceeded)\b|\bcome back (later|after|at|tomorrow)\b|\bout of (free )?(messages|prompts)\b|\blimit (will )?resets?\b|\bconversation (has )?reached (its|the) (maximum|max) length\b|\bchat (is )?(too long|has reached)\b/i;

function providerForHost(hostname) {
  for (const [id, p] of Object.entries(PROVIDERS)) {
    if (p.hosts.some((h) => hostname === h || hostname.endsWith('.' + h))) return id;
  }
  return null;
}

// Handoff prompts
const HANDOFF_REQUEST = [
  "I'm about to run out of room in this chat, so I need to continue in a brand-new chat.",
  'Please write a handoff summary I can paste into that new chat so the next assistant can pick up exactly where we are. Include:',
  '1. Goal: what I am trying to achieve / the problem being solved.',
  '2. Key context: constraints, environment, versions, decisions already made.',
  '3. What we tried and the result of each attempt (what worked, what failed and why).',
  '4. Current state: the latest working version of any code, config or text we are editing (in full if short; otherwise the exact parts that changed).',
  '5. Next steps: the exact point where we stopped and what to do next.',
  '6. Open questions or risks.',
  "Write it as a self-contained message addressed to a fresh assistant. Output only the summary, with no preamble.",
].join('\n');

const HANDOFF_HEADER = [
  "I'm continuing a conversation from a previous chat that ran out of room. Below is a handoff of where we left off.",
  'Please read it, reply with a two-line confirmation of the current state, then continue from the "next steps".',
].join(' ');

globalThis.PROVIDERS = PROVIDERS;
globalThis.LIMIT_HIT_RE = LIMIT_HIT_RE;
globalThis.providerForHost = providerForHost;
globalThis.HANDOFF_REQUEST = HANDOFF_REQUEST;
globalThis.HANDOFF_HEADER = HANDOFF_HEADER;
