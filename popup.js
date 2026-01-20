// DeepSeek Token Tracker Popup
console.log('Token Tracker popup loading...');

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Format tokens for display
function formatTokens(tokens) {
  if (tokens >= 1000000) {
    return (tokens / 1000000).toFixed(1) + 'M';
  } else if (tokens >= 1000) {
    return (tokens / 1000).toFixed(1) + 'K';
  }
  return tokens.toString();
}

// Update main display
function updateDisplay(data) {
  const session = data.currentSession;
  const settings = data.settings || { tokenLimit: 128000 };
  
  if (!session) {
    document.getElementById('todayCount').textContent = '0';
    document.getElementById('dailyLimit').textContent = formatTokens(settings.tokenLimit);
    document.getElementById('remainingCount').textContent = formatTokens(settings.tokenLimit);
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('percentage').textContent = '0%';
    document.getElementById('warningMessage').textContent = 'No active chat';
    document.getElementById('fileTokenCount').textContent = '0 tokens';
    return;
  }
  
  const tokens = session.totalTokens || 0;
  const limit = settings.tokenLimit || 128000;
  const remaining = Math.max(0, limit - tokens);
  const percent = Math.min(100, (tokens / limit) * 100);
  
  // Update main stats
  document.getElementById('todayCount').textContent = formatTokens(tokens);
  document.getElementById('dailyLimit').textContent = formatTokens(limit);
  document.getElementById('remainingCount').textContent = formatTokens(remaining);
  document.getElementById('progressFill').style.width = percent + '%';
  document.getElementById('percentage').textContent = Math.round(percent) + '%';
  
  // Color coding
  const progressFill = document.getElementById('progressFill');
  if (percent >= 90) {
    progressFill.style.background = '#ff4444';
    document.getElementById('warningMessage').innerHTML = 
      '<span class="critical">⚠️ CRITICAL: Context almost full!</span>';
  } else if (percent >= 70) {
    progressFill.style.background = '#ff9800';
    document.getElementById('warningMessage').innerHTML = 
      '<span class="warning">⚠️ Warning: High token usage</span>';
  } else {
    progressFill.style.background = '#4CAF50';
    document.getElementById('warningMessage').textContent = '';
  }
  
  // Update file display
  updateFileDisplay(session);
  
  // Update time
  document.getElementById('updateTime').textContent = 
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Update file display
function updateFileDisplay(session) {
  const container = document.getElementById('fileUploadsContainer');
  const tokenCount = document.getElementById('fileTokenCount');
  
  if (!session.fileUploads || session.fileUploads.length === 0) {
    container.innerHTML = '<div class="no-files">No files uploaded in this chat</div>';
    tokenCount.textContent = '0 tokens';
    return;
  }
  
  const totalFileTokens = session.fileUploads.reduce((sum, file) => sum + (file.tokens || 0), 0);
  tokenCount.textContent = formatTokens(totalFileTokens) + ' tokens';
  
  let html = '';
  session.fileUploads.forEach((file, index) => {
    const manualIcon = file.manual ? '✍️ ' : '📎 ';
    html += `
      <div class="file-item">
        <div class="file-name">
          ${manualIcon}${file.fileName}
          <span class="file-size">${file.sizeKB.toFixed(1)}KB</span>
        </div>
        <div class="file-info">
          ${file.description} • ~${formatTokens(file.tokens)} tokens
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

// Load data from background
function loadData() {
  browserAPI.runtime.sendMessage({ type: 'GET_STATS' })
    .then(response => {
      if (response) {
        updateDisplay(response);
      }
    })
    .catch(error => {
      console.error('Error loading data:', error);
    });
}

// Add file manually
function addFileManually() {
  const fileName = prompt('Enter filename with extension (e.g., document.pdf):', 'document.pdf');
  if (!fileName) return;
  
  const fileSize = prompt('Enter file size (e.g., 500 for 500KB, 2 for 2MB):', '500');
  if (!fileSize || isNaN(parseFloat(fileSize))) {
    alert('Please enter a valid number');
    return;
  }
  
  let sizeKB = parseFloat(fileSize);
  const unit = prompt('Unit (KB or MB):', 'KB').toLowerCase();
  
  if (unit === 'mb') {
    sizeKB = sizeKB * 1024;
  }
  
  // Estimate tokens based on file type
  const extension = fileName.split('.').pop().toLowerCase();
  let tokensPerKB = 150; // Default
  
  const tokenEstimates = {
    txt: 256, js: 333, py: 333, java: 333, cpp: 333, c: 333,
    html: 333, css: 333, json: 333, xml: 333, md: 256,
    pdf: 200, doc: 200, docx: 200,
    jpg: 100, jpeg: 100, png: 100, gif: 100,
    csv: 256, xls: 200, xlsx: 200
  };
  
  if (tokenEstimates[extension]) {
    tokensPerKB = tokenEstimates[extension];
  }
  
  const tokens = Math.ceil(sizeKB * tokensPerKB);
  const description = getFileDescription(extension);
  
  // Send to background
  browserAPI.runtime.sendMessage({
    type: 'MANUAL_FILE_ADDED',
    data: {
      fileName: fileName,
      sizeKB: sizeKB,
      tokens: tokens,
      description: description
    }
  }).then(response => {
    if (response.success) {
      alert(`Added ${fileName}\n${sizeKB.toFixed(1)}KB ≈ ${formatTokens(tokens)} tokens`);
      loadData();
    }
  });
}

// Get file description
function getFileDescription(extension) {
  const descriptions = {
    txt: 'Text file', js: 'JavaScript', py: 'Python', java: 'Java', cpp: 'C++', c: 'C',
    html: 'HTML', css: 'CSS', json: 'JSON', xml: 'XML', md: 'Markdown',
    pdf: 'PDF document', doc: 'Word document', docx: 'Word document',
    jpg: 'Image (JPG)', jpeg: 'Image (JPEG)', png: 'Image (PNG)', gif: 'Image (GIF)',
    csv: 'CSV file', xls: 'Excel file', xlsx: 'Excel file'
  };
  
  return descriptions[extension] || 'File';
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  console.log('Popup loaded');
  
  // Load initial data
  loadData();
  
  // Set up auto-refresh
  const refreshInterval = setInterval(loadData, 2000);
  
  // Button event listeners
  document.getElementById('refreshBtn').addEventListener('click', loadData);
  
  document.getElementById('resetBtn').addEventListener('click', () => {
    if (confirm('Reset current chat token count to zero?')) {
      browserAPI.runtime.sendMessage({ type: 'END_CURRENT_CHAT' })
        .then(() => loadData());
    }
  });
  
  document.getElementById('endChatBtn').addEventListener('click', () => {
    if (confirm('End current chat session?')) {
      browserAPI.runtime.sendMessage({ type: 'END_CURRENT_CHAT' })
        .then(() => loadData());
    }
  });
  
  document.getElementById('addFileBtn').addEventListener('click', addFileManually);
  
  // Clean up on close
  window.addEventListener('beforeunload', () => {
    clearInterval(refreshInterval);
  });
});
