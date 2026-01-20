// DeepSeek Token Tracker - Background Script
console.log('DeepSeek Token Tracker background starting...');

// Chat token tracking with file upload support
let chatSessions = {
  currentSession: null,
  sessions: [],
  settings: {
    tokenLimit: 128000,
    warningThreshold: 102400,
    criticalThreshold: 115200,
    showNotifications: true,
    trackFileUploads: true
  },
  lastReset: new Date().toDateString()
};

// Initialize
chrome.runtime.onInstalled.addListener(() => {
  console.log('Token Tracker installed');
  
  chrome.storage.local.get(['chatSessions']).then(result => {
    if (result.chatSessions) {
      chatSessions = result.chatSessions;
    }
    saveSessions();
    updateBadge();
  });
  
  // Create daily alarm
  chrome.alarms.create('dailyReset', { periodInMinutes: 60 });
});

// Load on startup
chrome.storage.local.get(['chatSessions']).then(result => {
  if (result.chatSessions) {
    chatSessions = result.chatSessions;
  }
  updateBadge();
});

// Save to storage
function saveSessions() {
  chrome.storage.local.set({ chatSessions: chatSessions });
}

// Start new chat session
function startNewChatSession(chatId, url, title) {
  console.log(`Starting new chat session: ${chatId}`);
  
  if (chatSessions.currentSession) {
    endCurrentChatSession();
  }
  
  chatSessions.currentSession = {
    id: chatId,
    startTime: new Date().toISOString(),
    url: url,
    title: title || 'DeepSeek Chat',
    totalTokens: 0,
    messageCount: 0,
    fileUploads: [],
    tokenHistory: [],
    lastUpdate: new Date().toISOString()
  };
  
  chatSessions.sessions.push(chatSessions.currentSession);
  saveSessions();
  updateBadge();
  
  return chatSessions.currentSession;
}

// End current session
function endCurrentChatSession() {
  if (!chatSessions.currentSession) return;
  
  chatSessions.currentSession.endTime = new Date().toISOString();
  chatSessions.currentSession.ended = true;
  chatSessions.currentSession = null;
  saveSessions();
  updateBadge();
}

// Update badge
function updateBadge() {
  if (!chatSessions.currentSession) {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({ 
      title: 'DeepSeek Token Tracker\nNo active chat'
    });
    return;
  }
  
  const tokens = chatSessions.currentSession.totalTokens || 0;
  const limit = chatSessions.settings.tokenLimit || 128000;
  const percent = Math.min(100, (tokens / limit) * 100);
  
  // Format badge text
  let badgeText = '';
  if (tokens > 0) {
    if (tokens >= 100000) {
      badgeText = Math.round(tokens / 1000) + 'K';
    } else if (tokens >= 1000) {
      badgeText = (tokens / 1000).toFixed(1) + 'K';
    } else {
      badgeText = tokens.toString();
    }
  }
  
  // Set badge
  chrome.action.setBadgeText({ text: badgeText });
  
  // Set color
  if (percent >= 90) {
    chrome.action.setBadgeBackgroundColor({ color: '#ff4444' });
  } else if (percent >= 70) {
    chrome.action.setBadgeBackgroundColor({ color: '#ff9800' });
  } else {
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
  }
  
  // Set tooltip
  const remaining = Math.max(0, limit - tokens);
  const remainingK = remaining >= 1000 ? (remaining / 1000).toFixed(1) + 'K' : remaining;
  chrome.action.setTitle({
    title: `Tokens: ${formatNumber(tokens)}/${formatNumber(limit)} (${Math.round(percent)}%)\n` +
           `Remaining: ${remainingK}\n` +
           `Files: ${chatSessions.currentSession.fileUploads?.length || 0}\n` +
           `Chats today: ${chatSessions.sessions.length}`
  });
}

// Format numbers
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

// Check token warnings
function checkTokenWarnings(session) {
  if (!chatSessions.settings.showNotifications) return;
  
  const tokens = session.totalTokens;
  const limit = chatSessions.settings.tokenLimit;
  const warning = chatSessions.settings.warningThreshold;
  const critical = chatSessions.settings.criticalThreshold;
  const percent = Math.round((tokens / limit) * 100);
  
  const history = session.tokenHistory || [];
  if (history.length < 2) return;
  
  const prevTokens = history[history.length - 2].tokens || 0;
  
  if (prevTokens < warning && tokens >= warning) {
    showNotification(
      'Token Usage Warning',
      `Chat is at ${percent}% capacity (${formatNumber(tokens)} tokens). ` +
      `Consider starting a new chat soon.`
    );
  } else if (prevTokens < critical && tokens >= critical) {
    showNotification(
      'Token Usage Critical!',
      `Chat is at ${percent}% capacity (${formatNumber(tokens)} tokens). ` +
      `Context window almost full!`
    );
  }
}

// Show notification
function showNotification(title, message) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: title,
      message: message
    });
  } catch (e) {
    console.log('Notification error:', e);
  }
}

// Handle messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message:', request.type, request.data);
  
  if (request.type === 'NEW_CHAT_STARTED') {
    const data = request.data || {};
    const session = startNewChatSession(data.chatId, data.url, data.title);
    sendResponse({ success: true, session: session });
    return true;
  }
  
  if (request.type === 'TOKENS_UPDATED') {
    const data = request.data || {};
    
    let session = chatSessions.currentSession;
    if (!session || session.id !== data.chatId) {
      session = startNewChatSession(data.chatId, sender.tab?.url, 'DeepSeek Chat');
    }
    
    session.totalTokens = data.totalTokens || 0;
    session.messageCount = (session.messageCount || 0) + (data.messageCount || 0);
    session.lastUpdate = new Date().toISOString();
    
    if (!session.tokenHistory) session.tokenHistory = [];
    session.tokenHistory.push({
      timestamp: new Date().toISOString(),
      tokens: session.totalTokens,
      newTokens: data.newTokens || 0,
      type: 'message'
    });
    
    if (session.tokenHistory.length > 100) {
      session.tokenHistory = session.tokenHistory.slice(-100);
    }
    
    saveSessions();
    updateBadge();
    checkTokenWarnings(session);
    
    sendResponse({
      success: true,
      session: session,
      totalTokens: session.totalTokens,
      limit: chatSessions.settings.tokenLimit,
      remaining: Math.max(0, chatSessions.settings.tokenLimit - session.totalTokens),
      percent: Math.round((session.totalTokens / chatSessions.settings.tokenLimit) * 100)
    });
    
    return true;
  }
  
  if (request.type === 'FILE_UPLOAD_DETECTED') {
    const data = request.data || {};
    
    if (!chatSessions.settings.trackFileUploads) {
      sendResponse({ success: false, reason: 'File tracking disabled' });
      return true;
    }
    
    let session = chatSessions.currentSession;
    if (!session || session.id !== data.chatId) {
      session = startNewChatSession(data.chatId, sender.tab?.url, 'DeepSeek Chat');
    }
    
    // Add file tokens
    const fileTokens = data.totalTokens || 0;
    session.totalTokens = (session.totalTokens || 0) + fileTokens;
    
    // Track file uploads
    if (!session.fileUploads) session.fileUploads = [];
    data.files?.forEach(file => {
      session.fileUploads.push({
        ...file,
        addedAt: new Date().toISOString()
      });
    });
    
    // Update session
    session.lastUpdate = new Date().toISOString();
    
    // Add to token history
    if (!session.tokenHistory) session.tokenHistory = [];
    session.tokenHistory.push({
      timestamp: new Date().toISOString(),
      tokens: session.totalTokens,
      newTokens: fileTokens,
      type: 'file_upload',
      files: data.files
    });
    
    saveSessions();
    updateBadge();
    checkTokenWarnings(session);
    
    sendResponse({
      success: true,
      session: session,
      files: data.files,
      totalTokens: session.totalTokens,
      fileTokens: fileTokens,
      fileCount: session.fileUploads.length
    });
    
    return true;
  }
  
  if (request.type === 'MANUAL_FILE_ADDED') {
    const data = request.data || {};
    
    let session = chatSessions.currentSession;
    if (!session) {
      session = startNewChatSession('manual_' + Date.now(), '', 'Manual Chat');
    }
    
    // Add file tokens
    const fileTokens = data.tokens || 0;
    session.totalTokens = (session.totalTokens || 0) + fileTokens;
    
    // Track file
    if (!session.fileUploads) session.fileUploads = [];
    session.fileUploads.push({
      fileName: data.fileName,
      extension: data.fileName.split('.').pop(),
      sizeKB: data.sizeKB,
      tokens: fileTokens,
      description: data.description || 'Manual entry',
      addedAt: new Date().toISOString(),
      manual: true
    });
    
    saveSessions();
    updateBadge();
    checkTokenWarnings(session);
    
    sendResponse({
      success: true,
      session: session,
      totalTokens: session.totalTokens
    });
    
    return true;
  }
  
  if (request.type === 'GET_STATS') {
    const todaySessions = chatSessions.sessions.filter(s => 
      new Date(s.startTime).toDateString() === new Date().toDateString()
    );
    
    sendResponse({
      currentSession: chatSessions.currentSession,
      sessionsToday: todaySessions,
      totalSessions: chatSessions.sessions.length,
      settings: chatSessions.settings,
      today: new Date().toDateString()
    });
    return true;
  }
  
  if (request.type === 'END_CURRENT_CHAT') {
    endCurrentChatSession();
    sendResponse({ success: true });
    return true;
  }
  
  if (request.type === 'UPDATE_SETTINGS') {
    const settings = request.settings || {};
    chatSessions.settings = { ...chatSessions.settings, ...settings };
    saveSessions();
    sendResponse({ success: true, settings: chatSessions.settings });
    return true;
  }
  
  if (request.type === 'RESET_CHAT') {
    const data = request.data || {};
    if (data.chatId && chatSessions.currentSession?.id === data.chatId) {
      chatSessions.currentSession.totalTokens = 0;
      chatSessions.currentSession.fileUploads = [];
      chatSessions.currentSession.tokenHistory = [];
      saveSessions();
      updateBadge();
    }
    sendResponse({ success: true });
    return true;
  }
  
  sendResponse({ error: 'Unknown message type' });
  return false;
});

// Update badge periodically
setInterval(updateBadge, 30000);
