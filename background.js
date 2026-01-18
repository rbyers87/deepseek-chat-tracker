// Background service worker
let chatStats = {
  messagesToday: 0,
  lastReset: new Date().toDateString(),
  chatLimit: 30, // Default DeepSeek limit
  chats: []
};

// Load saved data
chrome.storage.local.get(['chatStats', 'settings'], (result) => {
  if (result.chatStats) {
    chatStats = result.chatStats;
    
    // Reset counter if it's a new day
    const today = new Date().toDateString();
    if (chatStats.lastReset !== today) {
      chatStats.messagesToday = 0;
      chatStats.lastReset = today;
      saveStats();
    }
  }
});

// Save stats to storage
function saveStats() {
  chrome.storage.local.set({ chatStats });
}

// Check and create daily reset alarm
chrome.alarms.create('dailyReset', { periodInMinutes: 1440 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailyReset') {
    const today = new Date().toDateString();
    if (chatStats.lastReset !== today) {
      chatStats.messagesToday = 0;
      chatStats.lastReset = today;
      saveStats();
    }
  }
});

// Listen for message count updates
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'NEW_MESSAGE') {
    chatStats.messagesToday++;
    chatStats.chats.push({
      timestamp: new Date().toISOString(),
      url: sender.tab?.url || 'unknown',
      messageCount: chatStats.messagesToday
    });
    
    // Keep only last 100 chats
    if (chatStats.chats.length > 100) {
      chatStats.chats = chatStats.chats.slice(-100);
    }
    
    saveStats();
    
    // Check if approaching limit
    const warningThreshold = Math.floor(chatStats.chatLimit * 0.8); // 80% of limit
    if (chatStats.messagesToday >= warningThreshold) {
      const remaining = chatStats.chatLimit - chatStats.messagesToday;
      
      // Show notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'DeepSeek Limit Warning',
        message: `You've used ${chatStats.messagesToday}/${chatStats.chatLimit} messages. ${remaining} remaining.`
      });
    }
    
    sendResponse({ success: true });
  }
  
  if (request.type === 'GET_STATS') {
    sendResponse(chatStats);
  }
  
  if (request.type === 'UPDATE_SETTINGS') {
    chatStats.chatLimit = request.limit || chatStats.chatLimit;
    saveStats();
    sendResponse({ success: true });
  }
  
  return true; // Keep message channel open for async response
});
