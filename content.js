// DeepSeek Chat Tracker - Content Script with Chat Session Detection
console.log('DeepSeek Chat Tracker (Session-aware) loaded');

let messageCount = 0;
let currentChatId = null;
let observer = null;
let lastMessageTime = 0;
const MESSAGE_DELAY = 1000;

// Detect chat ID from page
function detectChatId() {
  // Try multiple methods to identify chat session
  
  // 1. From URL
  const url = window.location.href;
  const urlObj = new URL(url);
  let chatId = urlObj.searchParams.get('session') || 
               urlObj.pathname.split('/').pop();
  
  // 2. From page title or content
  if (!chatId || chatId === 'chat' || chatId === '') {
    // Look for chat-specific elements
    const chatElements = document.querySelectorAll([
      '[data-chat-id]',
      '[data-session-id]',
      '[class*="session"]',
      '[class*="chat-"]',
      '.conversation-id',
      '#conversationId'
    ].join(','));
    
    for (const el of chatElements) {
      const id = el.getAttribute('data-chat-id') || 
                 el.getAttribute('data-session-id') ||
                 el.textContent;
      if (id && id.length < 50) {
        chatId = id;
        break;
      }
    }
  }
  
  // 3. Generate from page state
  if (!chatId || chatId === 'chat' || chatId === '') {
    // Use first message timestamp or page load time
    const firstMsg = document.querySelector('[class*="message"]');
    if (firstMsg) {
      chatId = 'chat_' + Date.now();
    } else {
      chatId = 'new_chat_' + Date.now();
    }
  }
  
  return chatId;
}

// Check if this is a new chat session
function checkForNewChatSession() {
  const newChatId = detectChatId();
  const url = window.location.href;
  
  if (newChatId !== currentChatId) {
    console.log('New chat session detected:', { 
      old: currentChatId, 
      new: newChatId,
      url: url 
    });
    
    currentChatId = newChatId;
    messageCount = 0;
    
    // Notify background
    chrome.runtime.sendMessage({
      type: 'NEW_CHAT_DETECTED',
      data: {
        url: url,
        chatId: newChatId,
        title: document.title || 'DeepSeek Chat'
      }
    });
    
    return true;
  }
  
  return false;
}

// Count messages in current chat
function countMessages() {
  // DeepSeek specific selectors
  const selectors = [
    '[data-message-author-role="user"]',
    '.prose',
    '.markdown-body',
    '[class*="message"]',
    '[class*="Message"]',
    'div[class*="user"]'
  ];
  
  let count = 0;
  
  for (const selector of selectors) {
    try {
      const elements = document.querySelectorAll(selector);
      count = Math.max(count, elements.length);
    } catch (e) {
      // Ignore invalid selectors
    }
  }
  
  return count;
}

// Send message to background
function sendMessageToBackground() {
  const now = Date.now();
  
  if (now - lastMessageTime < MESSAGE_DELAY) {
    return;
  }
  
  lastMessageTime = now;
  
  // First check if we're in a new chat
  checkForNewChatSession();
  
  chrome.runtime.sendMessage({
    type: 'NEW_MESSAGE',
    data: {
      url: window.location.href,
      chatId: currentChatId,
      timestamp: new Date().toISOString()
    }
  }, function(response) {
    if (response && response.success) {
      console.log(`Message tracked: ${response.count}/${response.limit}`);
    }
  });
}

// Monitor for new messages
function checkAndReportMessages() {
  const currentCount = countMessages();
  
  if (currentCount > messageCount) {
    const newMessages = currentCount - messageCount;
    console.log(`Detected ${newMessages} new message(s) in chat ${currentChatId}`);
    
    messageCount = currentCount;
    
    // Send one notification per detection
    sendMessageToBackground();
  }
}

// Set up mutation observer
function initObserver() {
  let timeoutId = null;
  
  observer = new MutationObserver(function(mutations) {
    let shouldCheck = false;
    
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            const text = node.textContent || '';
            if (text.length > 10 && text.length < 5000) {
              shouldCheck = true;
              break;
            }
          }
        }
      }
      if (shouldCheck) break;
    }
    
    if (shouldCheck && !timeoutId) {
      timeoutId = setTimeout(function() {
        checkAndReportMessages();
        timeoutId = null;
      }, 800);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
  
  console.log('Mutation observer started');
}

// Detect new chat button clicks
function setupChatDetection() {
  // Listen for clicks that might start new chats
  document.addEventListener('click', function(e) {
    const target = e.target;
    const text = target.textContent || '';
    const href = target.getAttribute('href') || '';
    
    // Look for "New Chat" buttons or links
    if (text.toLowerCase().includes('new chat') ||
        text.toLowerCase().includes('new conversation') ||
        href.includes('new') ||
        target.getAttribute('aria-label')?.toLowerCase().includes('new chat')) {
      
      console.log('New chat button clicked');
      setTimeout(checkForNewChatSession, 1000);
    }
  });
  
  // Also check URL changes
  let lastUrl = window.location.href;
  setInterval(function() {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      setTimeout(checkForNewChatSession, 500);
    }
  }, 1000);
}

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
      // Detect initial chat
      currentChatId = detectChatId();
      console.log('Initial chat ID:', currentChatId);
      
      initObserver();
      setupChatDetection();
      messageCount = countMessages();
      
      // Report initial messages
      if (messageCount > 0) {
        sendMessageToBackground();
      }
    }, 2000);
  });
} else {
  setTimeout(function() {
    currentChatId = detectChatId();
    console.log('Initial chat ID:', currentChatId);
    
    initObserver();
    setupChatDetection();
    messageCount = countMessages();
    
    if (messageCount > 0) {
      sendMessageToBackground();
    }
  }, 2000);
}

// Listen for messages from background
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.type === 'CHECK_CHAT_SESSION') {
    const isNewChat = checkForNewChatSession();
    sendResponse({ isNewChat: isNewChat, chatId: currentChatId });
  }
});

// Clean up
window.addEventListener('beforeunload', function() {
  if (observer) {
    observer.disconnect();
  }
});

console.log('Content script initialized for chat session tracking');