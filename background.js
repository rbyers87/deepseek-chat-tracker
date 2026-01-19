// DeepSeek Chat Tracker - Chrome V3 Background Script
console.log('DeepSeek Tracker background script starting...');

// Default chat statistics
let chatStats = {
  messagesToday: 0,
  lastReset: new Date().toDateString(),
  chatLimit: 30,
  chats: []
};

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
  
  const defaultStats = {
    messagesToday: 0,
    lastReset: new Date().toDateString(),
    chatLimit: 30,
    chats: []
  };
  
  chrome.storage.local.set({ chatStats: defaultStats });
  updateBadge();
});

// Load data
chrome.storage.local.get(['chatStats']).then(result => {
  if (result.chatStats) {
    chatStats = result.chatStats;
    updateBadge();
  }
});

// Update badge
function updateBadge() {
  const used = chatStats.messagesToday || 0;
  const limit = chatStats.chatLimit || 30;
  
  if (used > 0) {
    chrome.action.setBadgeText({ text: used.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
  
  chrome.action.setTitle({
    title: `DeepSeek: ${used}/${limit} messages`
  });
}

// Handle messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request.type);
  
  if (request.type === 'NEW_MESSAGE') {
    chatStats.messagesToday = (chatStats.messagesToday || 0) + 1;
    
    chrome.storage.local.set({ chatStats: chatStats }).then(() => {
      updateBadge();
      sendResponse({ success: true, count: chatStats.messagesToday });
    });
    
    return true; // Keep message channel open
  }
  
  if (request.type === 'GET_STATS') {
    sendResponse(chatStats);
    return true;
  }
  
  if (request.type === 'RESET_COUNTER') {
    chatStats.messagesToday = 0;
    chatStats.lastReset = new Date().toDateString();
    
    chrome.storage.local.set({ chatStats: chatStats }).then(() => {
      updateBadge();
      sendResponse({ success: true });
    });
    
    return true;
  }
  
  if (request.type === 'UPDATE_LIMIT') {
    chatStats.chatLimit = request.limit;
    chrome.storage.local.set({ chatStats: chatStats }).then(() => {
      updateBadge();
      sendResponse({ success: true });
    });
    return true;
  }
});