// DeepSeek Chat Tracker - Background Script
// Includes daily auto-reset, notifications, and popup support

console.log('DeepSeek Tracker background script starting...');

// Default chat statistics
let chatStats = {
  messagesToday: 0,
  lastReset: new Date().toDateString(),
  chatLimit: 30,
  chats: [],
  history: []
};

// Initialize everything when extension is installed/updated
chrome.runtime.onInstalled.addListener(function() {
  console.log('DeepSeek Tracker installed/updated');
  
  // Load existing data first
  chrome.storage.local.get(['chatStats'], function(result) {
    if (result.chatStats) {
      chatStats = result.chatStats;
      console.log('Loaded existing stats:', chatStats);
    } else {
      // First time setup
      chatStats.lastReset = new Date().toDateString();
      chatStats.messagesToday = 0;
      chatStats.chatLimit = 30;
      chatStats.chats = [];
      chatStats.history = [];
      console.log('Created new stats:', chatStats);
    }
    
    // Check if we need to reset for new day
    checkAndResetDailyCounter();
    
    // Save initial state
    chrome.storage.local.set({ chatStats: chatStats });
    
    // Update badge immediately
    updateBadge();
  });
  
  // Create daily reset alarm (check every hour)
  chrome.alarms.create('dailyReset', {
    periodInMinutes: 60
  });
  
  console.log('Daily reset alarm created');
});

// Load stats on startup
chrome.storage.local.get(['chatStats'], function(result) {
  if (result.chatStats) {
    chatStats = result.chatStats;
    console.log('Loaded stats on startup:', chatStats);
  }
  
  // Check if we need to reset (in case extension was off at midnight)
  checkAndResetDailyCounter();
  
  // Update badge
  updateBadge();
});

// Handle daily reset alarm
chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name === 'dailyReset') {
    console.log('Daily reset check triggered');
    checkAndResetDailyCounter();
  }
});

// Function to check and reset daily counter
function checkAndResetDailyCounter() {
  const today = new Date().toDateString();
  const lastReset = chatStats.lastReset || new Date().toDateString();
  
  console.log('Daily reset check:', { today, lastReset, messagesToday: chatStats.messagesToday });
  
  if (lastReset !== today) {
    console.log('New day detected! Resetting counter...');
    
    // Save yesterday's data before resetting
    const yesterdayStats = {
      date: lastReset,
      messages: chatStats.messagesToday,
      limit: chatStats.chatLimit
    };
    
    // Add to history (keep last 30 days)
    if (!chatStats.history) chatStats.history = [];
    chatStats.history.push(yesterdayStats);
    
    // Keep only last 30 days
    if (chatStats.history.length > 30) {
      chatStats.history = chatStats.history.slice(-30);
    }
    
    // Reset for new day
    chatStats.messagesToday = 0;
    chatStats.lastReset = today;
    
    // Save to storage
    chrome.storage.local.set({ chatStats: chatStats }, function() {
      console.log('Daily reset completed. Messages reset to 0.');
      
      // Update badge
      updateBadge();
      
      // Show reset notification
      showNotification(
        'Daily Counter Reset',
        'Your DeepSeek message counter has been reset for the new day!'
      );
    });
  }
}

// Update badge on browser action icon
function updateBadge() {
  const used = chatStats.messagesToday || 0;
  const limit = chatStats.chatLimit || 30;
  const percent = (used / limit) * 100;
  
  // Set badge text (show count)
  chrome.browserAction.setBadgeText({
    text: used > 0 ? used.toString() : ''
  });
  
  // Set badge color based on usage
  if (percent >= 90) {
    chrome.browserAction.setBadgeBackgroundColor({ color: '#ff4444' }); // Red
  } else if (percent >= 70) {
    chrome.browserAction.setBadgeBackgroundColor({ color: '#ff9800' }); // Orange
  } else {
    chrome.browserAction.setBadgeBackgroundColor({ color: '#4CAF50' }); // Green
  }
  
  // Update tooltip
  const remaining = Math.max(0, limit - used);
  chrome.browserAction.setTitle({
    title: `DeepSeek Tracker\nUsed: ${used}/${limit}\nRemaining: ${remaining}\nClick to open tracker`
  });
}

// Show notification helper
function showNotification(title, message) {
  const runtime = typeof browser !== 'undefined' ? browser : chrome;
  
  try {
    runtime.notifications.create({
      type: 'basic',
      iconUrl: runtime.runtime.getURL('icons/icon128.png'),
      title: title,
      message: message
    });
  } catch (error) {
    console.log('Notification error (might be disabled):', error);
  }
}

// Show warning notification at 80% usage
function checkAndShowWarning() {
  const usagePercent = (chatStats.messagesToday / chatStats.chatLimit) * 100;
  
  if (usagePercent >= 80 && usagePercent < 90) {
    const remaining = chatStats.chatLimit - chatStats.messagesToday;
    showNotification(
      'DeepSeek Usage Warning',
      `You've used ${chatStats.messagesToday}/${chatStats.chatLimit} messages (${Math.round(usagePercent)}%). ${remaining} messages remaining.`
    );
  } else if (usagePercent >= 90) {
    const remaining = chatStats.chatLimit - chatStats.messagesToday;
    showNotification(
      'DeepSeek Usage Critical!',
      `CRITICAL: ${chatStats.messagesToday}/${chatStats.chatLimit} messages (${Math.round(usagePercent)}%). Only ${remaining} messages left!`
    );
  }
}

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('Background received message:', request.type);
  
  if (request.type === 'NEW_MESSAGE') {
    // Increment message count
    chatStats.messagesToday = (chatStats.messagesToday || 0) + 1;
    
    // Add to chat history
    const newChat = {
      timestamp: new Date().toISOString(),
      url: sender.tab ? sender.tab.url : 'unknown',
      count: chatStats.messagesToday
    };
    
    if (!chatStats.chats) chatStats.chats = [];
    chatStats.chats.push(newChat);
    
    // Keep only last 100 chats
    if (chatStats.chats.length > 100) {
      chatStats.chats = chatStats.chats.slice(-100);
    }
    
    // Save to storage
    chrome.storage.local.set({ chatStats: chatStats }, function() {
      console.log('Message count updated:', chatStats.messagesToday);
      
      // Update badge
      updateBadge();
      
      // Check and show warning if needed
      checkAndShowWarning();
      
      // Send response back
      if (sendResponse) {
        sendResponse({
          success: true,
          count: chatStats.messagesToday,
          limit: chatStats.chatLimit,
          remaining: chatStats.chatLimit - chatStats.messagesToday
        });
      }
    });
    
    return true; // Keep message channel open for async response
  }
  
  if (request.type === 'GET_STATS') {
    // Send current stats
    if (sendResponse) {
      sendResponse({
        messagesToday: chatStats.messagesToday || 0,
        chatLimit: chatStats.chatLimit || 30,
        lastReset: chatStats.lastReset || new Date().toDateString(),
        history: chatStats.history || [],
        chats: chatStats.chats || []
      });
    }
    return true;
  }
  
  if (request.type === 'RESET_COUNTER') {
    console.log('Manual counter reset requested');
    
    // Reset counter
    chatStats.messagesToday = 0;
    chatStats.lastReset = new Date().toDateString();
    
    // Save to storage
    chrome.storage.local.set({ chatStats: chatStats }, function() {
      console.log('Manual reset completed');
      
      // Update badge
      updateBadge();
      
      // Show confirmation
      showNotification('Counter Reset', 'Message counter has been reset to 0.');
      
      if (sendResponse) {
        sendResponse({ success: true, count: 0 });
      }
    });
    
    return true;
  }
  
  if (request.type === 'UPDATE_LIMIT') {
    console.log('Updating limit to:', request.limit);
    
    // Update limit
    chatStats.chatLimit = request.limit;
    
    // Save to storage
    chrome.storage.local.set({ chatStats: chatStats }, function() {
      console.log('Limit updated to:', chatStats.chatLimit);
      
      // Update badge
      updateBadge();
      
      if (sendResponse) {
        sendResponse({ success: true, limit: chatStats.chatLimit });
      }
    });
    
    return true;
  }
  
  if (request.type === 'MANUAL_RESET_CHECK') {
    console.log('Manual reset check requested');
    checkAndResetDailyCounter();
    
    if (sendResponse) {
      sendResponse({ 
        success: true, 
        today: new Date().toDateString(),
        lastReset: chatStats.lastReset,
        wasReset: (chatStats.lastReset === new Date().toDateString())
      });
    }
    return true;
  }
  
  if (request.type === 'GET_BADGE_INFO') {
    // Return badge info for popup
    const used = chatStats.messagesToday || 0;
    const limit = chatStats.chatLimit || 30;
    const remaining = Math.max(0, limit - used);
    const percent = Math.min(100, (used / limit) * 100);
    
    if (sendResponse) {
      sendResponse({
        used: used,
        limit: limit,
        remaining: remaining,
        percent: Math.round(percent),
        lastReset: chatStats.lastReset
      });
    }
    return true;
  }
  
  // Unknown message type
  console.warn('Unknown message type:', request.type);
  if (sendResponse) {
    sendResponse({ error: 'Unknown message type' });
  }
  return false;
});

// Listen for storage changes (in case multiple tabs update)
chrome.storage.onChanged.addListener(function(changes, namespace) {
  if (namespace === 'local' && changes.chatStats) {
    console.log('Storage changed, updating local stats');
    chatStats = changes.chatStats.newValue || chatStats;
    
    // Update badge when storage changes
    updateBadge();
  }
});

// Update badge periodically (every minute) to ensure it's current
setInterval(updateBadge, 60000);

// Export for debugging (optional)
if (typeof window !== 'undefined') {
  window.chatStats = chatStats;
}

console.log('Background script fully loaded and ready');