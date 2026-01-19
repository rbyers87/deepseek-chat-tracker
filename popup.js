// popup.js - Show chat session information
console.log('Popup script loading...');

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

const elements = {
  currentChatCount: document.getElementById('todayCount'),
  dailyLimit: document.getElementById('dailyLimit'),
  remainingCount: document.getElementById('remainingCount'),
  progressFill: document.getElementById('progressFill'),
  percentage: document.getElementById('percentage'),
  lastReset: document.getElementById('lastReset'),
  updateTime: document.getElementById('updateTime'),
  warningMessage: document.getElementById('warningMessage'),
  limitInput: document.getElementById('limitInput'),
  sessionsCount: document.getElementById('sessionsCount') // Add this to popup.html
};

const buttons = {
  refreshBtn: document.getElementById('refreshBtn'),
  resetBtn: document.getElementById('resetBtn'),
  forceResetBtn: document.getElementById('forceResetBtn'),
  testMsgBtn: document.getElementById('testMsgBtn'),
  setLimitBtn: document.getElementById('setLimitBtn'),
  endChatBtn: document.getElementById('endChatBtn') // Add this button
};

let stats = {
  currentSession: null,
  sessionsToday: [],
  settings: { chatLimit: 30 }
};

// Update display
function updateDisplay(data) {
  stats = { ...stats, ...data };
  
  const currentCount = stats.currentSession?.messageCount || 0;
  const limit = stats.settings?.chatLimit || 30;
  const remaining = Math.max(0, limit - currentCount);
  const percent = Math.min(100, (currentCount / limit) * 100);
  
  // Update main stats
  elements.currentChatCount.textContent = currentCount;
  elements.dailyLimit.textContent = limit;
  elements.remainingCount.textContent = remaining;
  elements.percentage.textContent = Math.round(percent) + '%';
  elements.progressFill.style.width = percent + '%';
  
  // Color coding
  if (percent >= 90) {
    elements.progressFill.style.background = '#ff4444';
    elements.warningMessage.innerHTML = '<span class="critical">⚠️ Chat almost full!</span>';
  } else if (percent >= 70) {
    elements.progressFill.style.background = '#ff9800';
    elements.warningMessage.innerHTML = '<span class="warning">⚠️ Chat getting full</span>';
  } else {
    elements.progressFill.style.background = '#4CAF50';
    elements.warningMessage.innerHTML = '';
  }
  
  // Sessions info
  if (elements.sessionsCount) {
    elements.sessionsCount.textContent = stats.sessionsToday?.length || 0;
  }
  
  // Update time
  elements.updateTime.textContent = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
  
  // Limit input
  elements.limitInput.value = limit;
}

// Load data
function loadData() {
  browserAPI.runtime.sendMessage({ type: 'GET_STATS' })
    .then(response => {
      if (response) {
        updateDisplay(response);
      }
    })
    .catch(error => {
      console.error('Error:', error);
    });
}

// Button handlers
buttons.refreshBtn.addEventListener('click', () => loadData());

buttons.resetBtn.addEventListener('click', () => {
  if (confirm('End current chat and start fresh?')) {
    browserAPI.runtime.sendMessage({ type: 'END_CURRENT_CHAT' })
      .then(() => loadData());
  }
});

buttons.forceResetBtn.addEventListener('click', () => {
  // Manual reset check
  loadData();
});

buttons.testMsgBtn.addEventListener('click', function() {
  browserAPI.runtime.sendMessage({ type: 'NEW_MESSAGE', data: {} })
    .then(response => {
      if (response && response.success) {
        loadData();
      }
    });
});

buttons.setLimitBtn.addEventListener('click', function() {
  const newLimit = parseInt(elements.limitInput.value);
  if (newLimit >= 1 && newLimit <= 999) {
    browserAPI.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: { chatLimit: newLimit }
    })
      .then(() => loadData());
  }
});

if (buttons.endChatBtn) {
  buttons.endChatBtn.addEventListener('click', function() {
    if (confirm('End current chat session?')) {
      browserAPI.runtime.sendMessage({ type: 'END_CURRENT_CHAT' })
        .then(() => loadData());
    }
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  const interval = setInterval(loadData, 3000);
  window.addEventListener('beforeunload', () => clearInterval(interval));
});