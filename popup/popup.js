document.addEventListener('DOMContentLoaded', () => {
  const elements = {
    messagesCount: document.getElementById('messagesCount'),
    dailyLimit: document.getElementById('dailyLimit'),
    remainingCount: document.getElementById('remainingCount'),
    progressBar: document.getElementById('progressBar'),
    percentage: document.getElementById('percentage'),
    lastReset: document.getElementById('lastReset'),
    resetButton: document.getElementById('resetButton'),
    optionsButton: document.getElementById('optionsButton'),
    exportButton: document.getElementById('exportButton'),
    statusIndicator: document.getElementById('statusIndicator')
  };

  // Load and display stats
  function loadStats() {
    chrome.runtime.sendMessage({ type: 'GET_STATS' }, (response) => {
      if (response) {
        updateDisplay(response);
      }
    });
  }

  function updateDisplay(stats) {
    elements.messagesCount.textContent = stats.messagesToday;
    elements.dailyLimit.textContent = stats.chatLimit;
    
    const remaining = Math.max(0, stats.chatLimit - stats.messagesToday);
    elements.remainingCount.textContent = remaining;
    
    const percentage = Math.min(100, (stats.messagesToday / stats.chatLimit) * 100);
    elements.progressBar.style.width = `${percentage}%`;
    elements.percentage.textContent = `${Math.round(percentage)}%`;
    
    // Update status indicator color
    if (percentage >= 90) {
      elements.statusIndicator.style.background = '#ef4444'; // Red
    } else if (percentage >= 70) {
      elements.statusIndicator.style.background = '#f59e0b'; // Orange
    } else {
      elements.statusIndicator.style.background = '#4ade80'; // Green
    }
    
    // Format last reset date
    const resetDate = new Date(stats.lastReset);
    const today = new Date();
    if (resetDate.toDateString() === today.toDateString()) {
      elements.lastReset.textContent = 'Today';
    } else {
      elements.lastReset.textContent = resetDate.toLocaleDateString();
    }
  }

  // Event Listeners
  elements.resetButton.addEventListener('click', () => {
    if (confirm('Reset today\'s message count?')) {
      chrome.runtime.sendMessage({ 
        type: 'UPDATE_SETTINGS',
        reset: true 
      }, () => {
        loadStats();
      });
    }
  });

  elements.optionsButton.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  elements.exportButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'GET_STATS' }, (stats) => {
      const dataStr = JSON.stringify(stats, null, 2);
      const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
      
      const exportFileDefaultName = `deepseek-chat-stats-${new Date().toISOString().slice(0,10)}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
    });
  });

  // Initialize
  loadStats();
  
  // Update every 5 seconds
  setInterval(loadStats, 5000);
});
