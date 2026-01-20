// DeepSeek Chat Tracker with File Upload Detection
console.log('DeepSeek Token Tracker loaded');

// Token estimation functions
const tokenEstimator = {
  charsPerToken: 4,
  currentChatTokens: 0,
  chatHistory: [],
  
  estimateTokens(text) {
    if (!text || text.length === 0) return 0;
    
    const cleanText = text.trim().replace(/\s+/g, ' ');
    let estimatedTokens = Math.ceil(cleanText.length / this.charsPerToken);
    
    if (this.containsCode(text)) {
      estimatedTokens = Math.ceil(estimatedTokens * 1.3);
    }
    
    const urlCount = (text.match(/https?:\/\/[^\s]+/g) || []).length;
    estimatedTokens += urlCount * 10;
    
    return estimatedTokens;
  },
  
  containsCode(text) {
    const codeIndicators = [
      /```[\s\S]*?```/,
      /`[^`]+`/,
      /\[.*\]\(.*\)/,
      /#{1,6}\s+/,
      /\*\*.*\*\*/,
      /\*.*\*/,
      /^\s*\d+\.\s+/,
      /^\s*[-*+]\s+/,
      />\s+/,
      /\b(function|def|class|import|export|var|let|const|return|if|else|for|while)\b/
    ];
    
    return codeIndicators.some(pattern => pattern.test(text));
  },
  
  resetChat() {
    this.currentChatTokens = 0;
    this.chatHistory = [];
    console.log('Token tracker reset');
  },
  
  addMessage(text, isUser = true) {
    const tokens = this.estimateTokens(text);
    this.currentChatTokens += tokens;
    
    this.chatHistory.push({
      text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      tokens: tokens,
      isUser: isUser,
      timestamp: new Date().toISOString(),
      cumulativeTokens: this.currentChatTokens
    });
    
    if (this.chatHistory.length > 50) {
      this.chatHistory.shift();
    }
    
    return {
      tokens: tokens,
      cumulativeTokens: this.currentChatTokens
    };
  },
  
  getUsagePercentage(limit = 128000) {
    return Math.min(100, (this.currentChatTokens / limit) * 100);
  },
  
  getRemainingTokens(limit = 128000) {
    return Math.max(0, limit - this.currentChatTokens);
  }
};

// File upload tracker
const fileUploadTracker = {
  uploadedFiles: [],
  
  fileTokenEstimates: {
    txt: { tokensPerKB: 256, description: 'Text file' },
    js: { tokensPerKB: 333, description: 'JavaScript' },
    py: { tokensPerKB: 333, description: 'Python' },
    java: { tokensPerKB: 333, description: 'Java' },
    cpp: { tokensPerKB: 333, description: 'C++' },
    c: { tokensPerKB: 333, description: 'C' },
    html: { tokensPerKB: 333, description: 'HTML' },
    css: { tokensPerKB: 333, description: 'CSS' },
    json: { tokensPerKB: 333, description: 'JSON' },
    xml: { tokensPerKB: 333, description: 'XML' },
    md: { tokensPerKB: 256, description: 'Markdown' },
    pdf: { tokensPerKB: 200, description: 'PDF' },
    doc: { tokensPerKB: 200, description: 'Word' },
    docx: { tokensPerKB: 200, description: 'Word' },
    jpg: { tokensPerKB: 100, description: 'Image' },
    jpeg: { tokensPerKB: 100, description: 'Image' },
    png: { tokensPerKB: 100, description: 'Image' },
    gif: { tokensPerKB: 100, description: 'Image' },
    csv: { tokensPerKB: 256, description: 'CSV' },
    xls: { tokensPerKB: 200, description: 'Excel' },
    xlsx: { tokensPerKB: 200, description: 'Excel' }
  },
  
  defaultEstimate: { tokensPerKB: 150, description: 'File' },
  
  detectFileUploads() {
    const fileSelectors = [
      'input[type="file"]',
      'button[aria-label*="file"]',
      'button[aria-label*="upload"]',
      '[class*="file"]',
      '[class*="upload"]',
      '[class*="attachment"]',
      '[data-file]',
      'img[src*="upload"]',
      '[class*="preview"]',
      'a[href*="."]',
      'span[class*="filename"]'
    ];
    
    const detectedFiles = [];
    
    fileSelectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(element => {
          const fileInfo = this.extractFileInfo(element);
          if (fileInfo && !this.isFileAlreadyTracked(fileInfo)) {
            detectedFiles.push(fileInfo);
          }
        });
      } catch (e) {}
    });
    
    return detectedFiles;
  },
  
  extractFileInfo(element) {
    let fileName = element.getAttribute('title') || 
                   element.getAttribute('alt') || 
                   element.textContent || 
                   element.getAttribute('href');
    
    if (!fileName || fileName.length < 3) return null;
    
    const match = fileName.match(/([^\/\\]+\.\w{1,10})$/i);
    if (!match) return null;
    
    fileName = match[1];
    const extension = fileName.split('.').pop().toLowerCase();
    
    let fileSize = 0;
    const parent = element.parentElement;
    const siblings = Array.from(parent?.children || []);
    
    siblings.forEach(sibling => {
      const text = sibling.textContent || '';
      const sizeMatch = text.match(/(\d+(\.\d+)?)\s*(KB|MB|GB|bytes?)/i);
      if (sizeMatch) {
        const size = parseFloat(sizeMatch[1]);
        const unit = sizeMatch[3].toLowerCase();
        
        if (unit.includes('mb')) {
          fileSize = size * 1024;
        } else if (unit.includes('gb')) {
          fileSize = size * 1024 * 1024;
        } else if (unit.includes('bytes')) {
          fileSize = size / 1024;
        } else {
          fileSize = size;
        }
      }
    });
    
    if (fileSize === 0) {
      fileSize = this.estimateFileSize(fileName, extension);
    }
    
    return {
      fileName: fileName,
      extension: extension,
      sizeKB: fileSize,
      detectedAt: new Date().toISOString()
    };
  },
  
  estimateFileSize(fileName, extension) {
    const sizeEstimates = {
      txt: 50, pdf: 500, doc: 300, docx: 300,
      jpg: 800, jpeg: 800, png: 1000, gif: 500,
      js: 100, py: 80, java: 120, csv: 200, xlsx: 400
    };
    
    return sizeEstimates[extension] || 100;
  },
  
  isFileAlreadyTracked(fileInfo) {
    return this.uploadedFiles.some(file => 
      file.fileName === fileInfo.fileName && 
      Math.abs(new Date(file.detectedAt) - new Date(fileInfo.detectedAt)) < 60000
    );
  },
  
  estimateFileTokens(fileInfo) {
    const extension = fileInfo.extension;
    const estimate = this.fileTokenEstimates[extension] || this.defaultEstimate;
    const tokens = Math.ceil(fileInfo.sizeKB * estimate.tokensPerKB);
    
    return {
      tokens: tokens,
      description: estimate.description,
      fileInfo: fileInfo
    };
  },
  
  processUploadedFiles() {
    const detectedFiles = this.detectFileUploads();
    const newFiles = [];
    let totalNewTokens = 0;
    
    detectedFiles.forEach(fileInfo => {
      if (!this.isFileAlreadyTracked(fileInfo)) {
        const tokenEstimate = this.estimateFileTokens(fileInfo);
        
        this.uploadedFiles.push({
          ...fileInfo,
          estimatedTokens: tokenEstimate.tokens,
          description: tokenEstimate.description,
          processed: true
        });
        
        newFiles.push({
          fileName: fileInfo.fileName,
          extension: fileInfo.extension,
          sizeKB: fileInfo.sizeKB,
          tokens: tokenEstimate.tokens,
          description: tokenEstimate.description
        });
        
        totalNewTokens += tokenEstimate.tokens;
      }
    });
    
    if (newFiles.length > 0) {
      console.log(`Detected ${newFiles.length} file(s): ${totalNewTokens} tokens`);
    }
    
    return {
      newFiles: newFiles,
      totalTokens: totalNewTokens,
      allFiles: this.uploadedFiles
    };
  },
  
  reset() {
    this.uploadedFiles = [];
  },
  
  getTotalFileTokens() {
    return this.uploadedFiles.reduce((total, file) => total + (file.estimatedTokens || 0), 0);
  }
};

// Main tracker variables
let observer = null;
let lastProcessedText = '';
let currentChatId = null;

// Detect chat ID
function detectChatId() {
  const url = window.location.href;
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('session') || 
           urlObj.pathname.split('/').pop() ||
           'chat_' + Date.now();
  } catch (e) {
    return 'unknown';
  }
}

// Extract messages
function extractAllMessages() {
  const messages = [];
  const selectors = [
    '[data-message-author-role="user"]',
    '[data-message-author-role="assistant"]',
    '.prose',
    '.markdown-body',
    '[class*="message"]'
  ];
  
  selectors.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(element => {
        const text = element.textContent?.trim() || '';
        if (text && text.length > 5) {
          const isUser = selector.includes('user') || 
                        element.getAttribute('data-message-author-role') === 'user';
          
          messages.push({
            text: text,
            element: element,
            isUser: isUser
          });
        }
      });
    } catch (e) {}
  });
  
  return messages;
}

// Process messages
function processMessages() {
  const messages = extractAllMessages();
  const currentText = messages.map(m => m.text).join('|||');
  
  if (currentText === lastProcessedText) {
    return null;
  }
  
  lastProcessedText = currentText;
  
  // Check for new chat
  const newChatId = detectChatId();
  if (newChatId !== currentChatId) {
    console.log(`New chat: ${currentChatId} -> ${newChatId}`);
    currentChatId = newChatId;
    tokenEstimator.resetChat();
    fileUploadTracker.reset();
    
    chrome.runtime.sendMessage({
      type: 'NEW_CHAT_STARTED',
      data: {
        chatId: newChatId,
        url: window.location.href,
        title: document.title
      }
    });
  }
  
  // Process each message
  let totalTokens = 0;
  const processedMessages = [];
  
  messages.forEach((msg, index) => {
    const existingMsg = tokenEstimator.chatHistory.find(
      h => h.text.startsWith(msg.text.substring(0, 50))
    );
    
    if (!existingMsg) {
      const result = tokenEstimator.addMessage(msg.text, msg.isUser);
      totalTokens = result.cumulativeTokens;
      
      processedMessages.push({
        text: msg.text.substring(0, 100) + (msg.text.length > 100 ? '...' : ''),
        tokens: result.tokens,
        isUser: msg.isUser,
        cumulativeTokens: result.cumulativeTokens
      });
    }
  });
  
  if (processedMessages.length > 0) {
    chrome.runtime.sendMessage({
      type: 'TOKENS_UPDATED',
      data: {
        chatId: currentChatId,
        newTokens: processedMessages.reduce((sum, msg) => sum + msg.tokens, 0),
        totalTokens: totalTokens,
        usagePercent: tokenEstimator.getUsagePercentage(),
        remainingTokens: tokenEstimator.getRemainingTokens(),
        messageCount: processedMessages.length,
        isUserMessage: processedMessages.some(m => m.isUser)
      }
    });
    
    return {
      processedMessages: processedMessages,
      totalTokens: totalTokens
    };
  }
  
  return null;
}

// File upload detection
function setupFileUploadDetection() {
  // Monitor file inputs
  document.addEventListener('change', (e) => {
    if (e.target.type === 'file') {
      setTimeout(() => {
        const files = fileUploadTracker.processUploadedFiles();
        if (files.newFiles.length > 0) {
          chrome.runtime.sendMessage({
            type: 'FILE_UPLOAD_DETECTED',
            data: {
              files: files.newFiles,
              totalTokens: files.totalTokens,
              chatId: currentChatId
            }
          });
        }
      }, 2000);
    }
  });
  
  // Monitor for upload UI
  const uploadObserver = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            const className = node.className || '';
            const text = node.textContent || '';
            
            if (className.includes('upload') || 
                className.includes('file') ||
                text.includes('Upload') ||
                (node.tagName === 'IMG' && node.src.includes('upload'))) {
              
              setTimeout(() => {
                const files = fileUploadTracker.processUploadedFiles();
                if (files.newFiles.length > 0) {
                  chrome.runtime.sendMessage({
                    type: 'FILE_UPLOAD_DETECTED',
                    data: {
                      files: files.newFiles,
                      totalTokens: files.totalTokens,
                      chatId: currentChatId
                    }
                  });
                }
              }, 3000);
            }
          }
        });
      }
    });
  });
  
  uploadObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'src', 'alt', 'title']
  });
  
  // Periodic check
  setInterval(() => {
    const files = fileUploadTracker.processUploadedFiles();
    if (files.newFiles.length > 0) {
      chrome.runtime.sendMessage({
        type: 'FILE_UPLOAD_DETECTED',
        data: {
          files: files.newFiles,
          totalTokens: files.totalTokens,
          chatId: currentChatId
        }
      });
    }
  }, 10000);
}

// Set up observer
function initObserver() {
  let timeoutId = null;
  
  observer = new MutationObserver((mutations) => {
    let shouldCheck = false;
    
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            const className = node.className || '';
            const text = node.textContent || '';
            
            if ((className.includes('message') || 
                 className.includes('Message') ||
                 className.includes('prose')) &&
                text.length > 10) {
              shouldCheck = true;
              break;
            }
          }
        }
      }
      if (shouldCheck) break;
    }
    
    if (shouldCheck && !timeoutId) {
      timeoutId = setTimeout(() => {
        processMessages();
        timeoutId = null;
      }, 1000);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
  
  console.log('Tracker observer started');
}

// Initialize everything
function initializeTracker() {
  // Initial chat detection
  currentChatId = detectChatId();
  console.log(`Initial chat ID: ${currentChatId}`);
  
  // Set up observers
  initObserver();
  setupFileUploadDetection();
  
  // Process existing content
  setTimeout(() => {
    processMessages();
    
    // Check for existing files
    const files = fileUploadTracker.processUploadedFiles();
    if (files.newFiles.length > 0) {
      chrome.runtime.sendMessage({
        type: 'FILE_UPLOAD_DETECTED',
        data: {
          files: files.newFiles,
          totalTokens: files.totalTokens,
          chatId: currentChatId
        }
      });
    }
  }, 3000);
}

// Start when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initializeTracker, 2000);
  });
} else {
  setTimeout(initializeTracker, 2000);
}

// Clean up
window.addEventListener('beforeunload', () => {
  if (observer) {
    observer.disconnect();
  }
});
