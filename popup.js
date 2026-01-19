// popup.js - For popup.html
console.log('Popup script loading...');

// Get browser API
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// DOM Elements
const elements = {
  todayCount: document.getElementById('todayCount'),
  dailyLimit: document.getElementById('dailyLimit'),
  remainingCount: document.getElementById('remainingCount'),
  progressFill: document.getElementById('progressFill'),
  percentage: document.getElementById('percentage'),
  lastReset: document.getElementById('lastReset'),
  updateTime: document.getElementById('updateTime'),
  warningMessage: document.getElementById('warningMessage'),
  limitInput: document.getElementById('limitInput')
};

// Buttons
const buttons = {
  refreshBtn: document.getElementById('refreshBtn'),
  resetBtn: document.getElementById('resetBtn'),
  forceResetBtn: document.getElementById('forceResetBtn'),
  testMsgBtn: document.getElementById('testMsgBtn'),
  setLimitBtn: document.getElementById('setLimitBtn')
};

let currentStats = {
  messagesToday: 0,
  chatLimit: 30,
  lastReset: new Date().toDateString()
};

// Update the display
function updateDisplay(stats) {
  console.log('Updating display with:', stats);
  
  currentStats = { ...currentStats, ...stats };
  
  const used = currentStats.messagesToday || 0;
  const limit = currentStats.chatLimit || 30;
  const remaining = Math.max(0, limit - used);
  const percent = Math.min(100, (used / limit) * 100);
  
  // Update text
  elements.todayCount.textContent = used;
  elements.dailyLimit.textContent = limit;
  elements.remainingCount.textContent = remaining;
  elements.percentage.textContent = Math.round(percent) + '%';
  
  // Update progress bar
  elements.progressFill.style.width = percent + '%';
  
  // Update color based on usage
  if (percent >= 90) {
    elements.progressFill.style.background = '#ff4444';
    elements.warningMessage.innerHTML = '<span class="critical">⚠️ CRITICAL: Almost at limit!</span>';
  } else if (percent >= 70) {
    elements.progressFill.style.background = '#ff9800';
    elements.warningMessage.innerHTML = '<span class="warning">⚠️ Warning: High usage</span>';
  } else {
    elements.progressFill.style.background = '#4CAF50';
    elements.warningMessage.innerHTML = '';
  }
  
  // Update last reset date
  if (currentStats.lastReset) {
    const resetDate = new Date(currentStats.lastReset);
    const today = new Date();
    
    if (resetDate.toDateString() === today.toDateString()) {
      elements.lastReset.textContent = 'Today';
    } else {
      elements.lastReset.textContent = resetDate.toLocaleDateString();
    }
  }
  
  // Update timestamp
  elements.updateTime.textContent = new Date().toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  // Update limit input
  elements.limitInput.value = limit;
}

// Load data from background
function loadData() {
  console.log('Loading data...');
  
  browserAPI.runtime.sendMessage({ type: 'GET_STATS' })
    .then(response => {
      if (response) {
        updateDisplay(response);
      }
    })
    .catch(error => {
      console.error('Error loading data:', error);
      // Fallback
      browserAPI.storage.local.get(['chatStats'])
        .then(result => {
          if (result.chatStats) {
            updateDisplay(result.chatStats);
          }
        });
    });
}

// Button event handlers
buttons.refreshBtn.addEventListener('click', () => {
  console.log('Refresh clicked');
  loadData();
});

buttons.resetBtn.addEventListener('click', () => {
  if (confirm('Reset today\'s message counter to zero?')) {
    browserAPI.runtime.sendMessage({ type: 'RESET_COUNTER' })
      .then(response => {
        if (response && response.success) {
          updateDisplay({ messagesToday: 0 });
        }
      });
  }
});

buttons.forceResetBtn.addEventListener('click', () => {
  if (confirm('Force daily reset check?')) {
    browserAPI.runtime.sendMessage({ type: 'MANUAL_RESET_CHECK' })
      .then(response => {
        if (response && response.success) {
          loadData();
        }
      });
  }
});

buttons.testMsgBtn.addEventListener('click', function() {
  browserAPI.runtime.sendMessage({ type: 'NEW_MESSAGE' })
    .then(response => {
      if (response && response.success) {
        updateDisplay({ 
          messagesToday: response.count,
          chatLimit: response.limit 
        });
      }
    });
});

buttons.setLimitBtn.addEventListener('click', function() {
  const newLimit = parseInt(elements.limitInput.value);
  
  if (!newLimit || newLimit < 1 || newLimit > 999) {
    alert('Please enter a valid number between 1 and 999');
    return;
  }
  
  browserAPI.runtime.sendMessage({ 
    type: 'UPDATE_LIMIT', 
    limit: newLimit 
  })
    .then(response => {
      if (response && response.success) {
        updateDisplay({ chatLimit: newLimit });
      }
    });
});

// Initialize when popup opens
document.addEventListener('DOMContentLoaded', () => {
  console.log('Popup DOM loaded');
  loadData();
  
  // Auto-refresh every 2 seconds while popup is open
  const refreshInterval = setInterval(loadData, 2000);
  
  // Clear interval when popup closes
  window.addEventListener('beforeunload', () => {
    clearInterval(refreshInterval);
  });
});