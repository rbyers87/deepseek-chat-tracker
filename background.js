// Background script for Manifest V2
let chatStats = {
  messagesToday: 0,
  lastReset: new Date().toDateString(),
  chatLimit: 30,
  chats: []
};

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('DeepSeek Tracker installed');
  const today = new Date().toDateString();
  chatStats = {
    messagesToday: 0,
    lastReset: today,
    chatLimit: 30,
    chats: []
  };
  chrome.storage.local.set({ chatStats });
  
  // Create daily reset alarm
  chrome.alarms.create('dailyReset', { periodInMinutes: 1440 });
});

// Load saved data
chrome.storage.local.get(['chatStats'], (result) => {
  if (result.chatStats) {
    chatStats = result.chatStats;
    
    // Reset if new day
    const today = new Date().toDateString();
    if (chatStats.lastReset !== today) {
      chatStats.messagesToday = 0;
      chatStats.lastReset = today;
      chrome.storage.local.set({ chatStats });
    }
  }
});

// Handle alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailyReset') {
    const today = new Date().toDateString();
    if (chatStats.lastReset !== today) {
      chatStats.messagesToday = 0;
      chatStats.lastReset = today;
      chrome.storage.local.set({ chatStats });
      console.log('Daily reset completed');
    }
  }
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request.type);
  
  if (request.type === 'NEW_MESSAGE') {
    chatStats.messagesToday++;
    
    // Save to storage
    chrome.storage.local.set({ chatStats }, () => {
      console.log('Updated count:', chatStats.messagesToday);
      
      // Send notification at 80% usage
      if (chatStats.messagesToday >= Math.floor(chatStats.chatLimit * 0.8)) {
        const remaining = chatStats.chatLimit - chatStats.messagesToday;
        
        // Firefox uses different notification API
        if (typeof browser !== 'undefined' && browser.notifications) {
          // Firefox
          browser.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'DeepSeek Limit Warning',
            message: `Messages: ${chatStats.messagesToday}/${chatStats.chatLimit}. ${remaining} remaining.`
          });
        } else {
          // Chrome
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'DeepSeek Limit Warning',
            message: `Messages: ${chatStats.messagesToday}/${chatStats.chatLimit}. ${remaining} remaining.`
          });
        }
      }
      
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
    chrome.storage.local.set({ chatStats }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.type === 'UPDATE_LIMIT') {
    chatStats.chatLimit = request.limit;
    chrome.storage.local.set({ chatStats }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});
