document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const todayCount = document.getElementById('todayCount');
  const dailyLimit = document.getElementById('dailyLimit');
  const remaining = document.getElementById('remaining');
  const progressBar = document.getElementById('progressBar');
  const percentage = document.getElementById('percentage');
  const updateTime = document.getElementById('updateTime');
  const statusDot = document.getElementById('statusDot');
  const resetBtn = document.getElementById('resetBtn');
  const limitInput = document.getElementById('limitInput');
  const saveLimitBtn = document.getElementById('saveLimitBtn');
  
  // Get runtime API (works for both Chrome and Firefox)
  const runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
  
  // Load stats from background
  function loadStats() {
    runtime.sendMessage({ type: 'GET_STATS' }, (response) => {
      if (runtime.lastError) {
        console.error('Error:', runtime.lastError);
        return;
      }
      
      if (response) {
        updateDisplay(response);
      }
    });
  }
  
  // Update display with stats
  function updateDisplay(stats) {
    const used = stats.messagesToday || 0;
    const limit = stats.chatLimit || 30;
    const remainingCount = Math.max(0, limit - used);
    
    // Update text
    todayCount.textContent = used;
    dailyLimit.textContent = limit;
    remaining.textContent = remainingCount;
    
    // Update progress bar
    const percent = Math.min(100, (used / limit) * 100);
    progressBar.style.width = `${percent}%`;
    percentage.textContent = `${Math.round(percent)}%`;
    
    // Update status dot color
    if (percent >= 90) {
      statusDot.style.background = '#f44336';
      statusDot.style.boxShadow = '0 0 5px #f44336';
    } else if (percent >= 70) {
      statusDot.style.background = '#ff9800';
      statusDot.style.boxShadow = '0 0 5px #ff9800';
    } else {
      statusDot.style.background = '#4CAF50';
      statusDot.style.boxShadow = '0 0 5px #4CAF50';
    }
    
    // Update time
    updateTime.textContent = new Date().toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    // Update limit input
    limitInput.value = limit;
  }
  
  // Event Listeners
  resetBtn.addEventListener('click', () => {
    if (confirm('Reset today\'s message count to zero?')) {
      runtime.sendMessage({ type: 'RESET_COUNTER' }, (response) => {
        if (response && response.success) {
          loadStats();
        }
      });
    }
  });
  
  saveLimitBtn.addEventListener('click', () => {
    const newLimit = parseInt(limitInput.value);
    if (newLimit > 0 && newLimit <= 999) {
      runtime.sendMessage({ 
        type: 'UPDATE_LIMIT', 
        limit: newLimit 
      }, (response) => {
        if (response && response.success) {
          loadStats();
          // Show confirmation
          const originalText = saveLimitBtn.textContent;
          saveLimitBtn.textContent = 'Saved!';
          saveLimitBtn.style.background = '#4CAF50';
          setTimeout(() => {
            saveLimitBtn.textContent = originalText;
            saveLimitBtn.style.background = '';
          }, 1500);
        }
      });
    } else {
      alert('Please enter a valid number between 1 and 999');
    }
  });
  
  // Initialize
  loadStats();
  
  // Auto-refresh every 2 seconds
  setInterval(loadStats, 2000);
});
