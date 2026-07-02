// DeepSeek Token Tracker Popup
console.log('Token Tracker popup loading...');

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

let selectedSessionId = null; // null = live session

// Format tokens for display
function formatTokens(tokens) {
  if (tokens >= 1000000) {
    return (tokens / 1000000).toFixed(1) + 'M';
  } else if (tokens >= 1000) {
    return (tokens / 1000).toFixed(1) + 'K';
  }
  return tokens.toString();
}

// Core rendering function – used for both live and historical sessions
function renderStats(session, settings, isHistorical = false) {
  const titleEl = document.getElementById('chatTitle');
  if (!session) {
    document.getElementById('todayCount').textContent = '0';
    document.getElementById('dailyLimit').textContent = formatTokens(settings.tokenLimit);
    document.getElementById('remainingCount').textContent = formatTokens(settings.tokenLimit);
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('percentage').textContent = '0%';
    document.getElementById('warningMessage').textContent = 'No active chat';
    document.getElementById('fileTokenCount').textContent = '0 tokens';
    document.getElementById('fileUploadsContainer').innerHTML = '<div class="no-files">No files uploaded in this chat</div>';
    document.getElementById('historicalNote').style.display = 'none';
    titleEl.textContent = 'No active chat';
    return;
  }
  
  const tokens = session.totalTokens || 0;
  const limit = settings.tokenLimit || 128000;
  const remaining = Math.max(0, limit - tokens);
  const percent = Math.min(100, (tokens / limit) * 100);
  
  // Update chat title
  titleEl.textContent = session.title || 'DeepSeek Chat';
  
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
  
  // Show/hide historical note
  document.getElementById('historicalNote').style.display = isHistorical ? 'block' : 'none';
  
  // Update time
  document.getElementById('updateTime').textContent = 
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Update file display (unchanged)
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

// Load live data from background (for current session)
function loadData() {
  browserAPI.runtime.sendMessage({ type: 'GET_STATS' })
    .then(response => {
      if (response) {
        // If we are in "live" mode (no selected session), render live
        if (selectedSessionId === null) {
          renderStats(response.currentSession, response.settings, false);
        }
        // Always refresh the session list (to update current indicator)
        loadSessions(document.getElementById('filterSelect').value);
      }
    })
    .catch(error => {
      console.error('Error loading data:', error);
    });
}

// Load and render the list of sessions based on filter
function loadSessions(filter) {
  browserAPI.runtime.sendMessage({ type: 'GET_SESSIONS', filter: filter })
    .then(response => {
      if (response) {
        renderSessionList(response.sessions, response.currentSessionId);
      }
    })
    .catch(err => console.error('Error loading sessions:', err));
}

// Render the session list in the popup
function renderSessionList(sessions, currentId) {
  const container = document.getElementById('sessionList');
  if (!sessions || sessions.length === 0) {
    container.innerHTML = '<div style="color:rgba(255,255,255,0.5); font-size:11px; text-align:center; padding:8px;">No sessions in this period</div>';
    return;
  }

  // Sort by start time descending (newest first)
  const sorted = sessions.slice().sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

  let html = '';
  sorted.forEach(session => {
    const isCurrent = session.id === currentId;
    const start = new Date(session.startTime).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    const tokens = session.totalTokens || 0;
    const files = session.fileUploads?.length || 0;
    const label = session.title || 'DeepSeek Chat';
    const activeClass = isCurrent ? ' current' : '';
    const selectedClass = (selectedSessionId === session.id) ? ' current' : '';
    html += `
      <div class="session-item${activeClass}${selectedClass}" data-id="${session.id}" style="padding:6px 8px; border-radius:4px; margin-bottom:4px; cursor:pointer; display:flex; justify-content:space-between; font-size:11px; transition:0.2s;">
        <span>${isCurrent ? '● ' : ''}${label}</span>
        <span>${start} • ${formatTokens(tokens)} tokens • ${files} files</span>
      </div>
    `;
  });

  container.innerHTML = html;

  // Add click listeners to each session item
  container.querySelectorAll('.session-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      selectSession(id);
    });
  });
}

// Select a historical session by ID and display its stats
function selectSession(sessionId) {
  browserAPI.runtime.sendMessage({ type: 'GET_SESSION', id: sessionId })
    .then(response => {
      if (response && response.session) {
        selectedSessionId = sessionId;
        renderStats(response.session, response.settings, true);
        // Update the session list to highlight the selected one
        loadSessions(document.getElementById('filterSelect').value);
      }
    })
    .catch(err => console.error('Error loading session:', err));
}

// Switch back to the live (current) session
function goBackToCurrent() {
  selectedSessionId = null;
  loadData(); // reloads live stats
  // Also refresh the session list to remove highlights
  loadSessions(document.getElementById('filterSelect').value);
}

// Add file manually (unchanged)
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
  
  // Load initial data and session list
  loadData(); // this also calls loadSessions internally
  
  // Set up auto-refresh for live data
  const refreshInterval = setInterval(() => {
    // Only auto-refresh if we are viewing live
    if (selectedSessionId === null) {
      loadData();
    }
  }, 2000);
  
  // Button event listeners
  document.getElementById('refreshBtn').addEventListener('click', () => {
    if (selectedSessionId === null) {
      loadData();
    } else {
      // If viewing historical, reload that session
      selectSession(selectedSessionId);
    }
  });
  
  document.getElementById('resetBtn').addEventListener('click', () => {
    if (confirm('Reset current chat token count to zero?')) {
      browserAPI.runtime.sendMessage({ type: 'END_CURRENT_CHAT' })
        .then(() => {
          selectedSessionId = null;
          loadData();
        });
    }
  });
  
  document.getElementById('endChatBtn').addEventListener('click', () => {
    if (confirm('End current chat session?')) {
      browserAPI.runtime.sendMessage({ type: 'END_CURRENT_CHAT' })
        .then(() => {
          selectedSessionId = null;
          loadData();
        });
    }
  });
  
  document.getElementById('addFileBtn').addEventListener('click', addFileManually);
  
  // Session selector events
  document.getElementById('filterSelect').addEventListener('change', (e) => {
    loadSessions(e.target.value);
  });
  
  document.getElementById('refreshSessionsBtn').addEventListener('click', () => {
    loadSessions(document.getElementById('filterSelect').value);
  });
  
  document.getElementById('backToCurrentBtn').addEventListener('click', goBackToCurrent);
  
  // Clean up on close
  window.addEventListener('beforeunload', () => {
    clearInterval(refreshInterval);
  });
});
