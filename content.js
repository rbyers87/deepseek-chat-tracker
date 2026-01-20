// File upload detection and token estimation
const fileUploadTracker = {
  // Track uploaded files in current chat
  uploadedFiles: [],
  
  // Token estimates for different file types (approximate)
  fileTokenEstimates: {
    // Text files: ~1 token per 4 characters
    txt: { tokensPerKB: 256, description: 'Text file' },
    // Code files: ~1.3 tokens per 4 characters (more punctuation)
    js: { tokensPerKB: 333, description: 'JavaScript file' },
    py: { tokensPerKB: 333, description: 'Python file' },
    java: { tokensPerKB: 333, description: 'Java file' },
    cpp: { tokensPerKB: 333, description: 'C++ file' },
    c: { tokensPerKB: 333, description: 'C file' },
    html: { tokensPerKB: 333, description: 'HTML file' },
    css: { tokensPerKB: 333, description: 'CSS file' },
    json: { tokensPerKB: 333, description: 'JSON file' },
    xml: { tokensPerKB: 333, description: 'XML file' },
    md: { tokensPerKB: 256, description: 'Markdown file' },
    // Documents: Rough estimates
    pdf: { tokensPerKB: 200, description: 'PDF document' },
    doc: { tokensPerKB: 200, description: 'Word document' },
    docx: { tokensPerKB: 200, description: 'Word document' },
    // Images: OCR text extraction (varies widely)
    jpg: { tokensPerKB: 100, description: 'Image (JPG)' },
    jpeg: { tokensPerKB: 100, description: 'Image (JPEG)' },
    png: { tokensPerKB: 100, description: 'Image (PNG)' },
    gif: { tokensPerKB: 100, description: 'Image (GIF)' },
    // Spreadsheets
    csv: { tokensPerKB: 256, description: 'CSV file' },
    xls: { tokensPerKB: 200, description: 'Excel file' },
    xlsx: { tokensPerKB: 200, description: 'Excel file' }
  },
  
  // Default estimate for unknown file types
  defaultEstimate: { tokensPerKB: 150, description: 'Unknown file type' },
  
  // Detect file uploads in the chat
  detectFileUploads() {
    console.log('Scanning for file uploads...');
    
    // DeepSeek specific selectors for file uploads
    const fileSelectors = [
      // File upload buttons/inputs
      'input[type="file"]',
      'button[aria-label*="file"]',
      'button[aria-label*="upload"]',
      '[class*="file"]',
      '[class*="upload"]',
      
      // File attachments in chat
      '[class*="attachment"]',
      '[class*="file-attachment"]',
      '[data-file]',
      '[data-attachment]',
      
      // File previews
      'img[src*="upload"]',
      '[class*="preview"]',
      '[class*="thumbnail"]',
      
      // File names in chat
      'a[href*="."]', // Links with file extensions
      'span[class*="filename"]',
      'div[class*="filename"]'
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
      } catch (e) {
        // Ignore invalid selectors
      }
    });
    
    return detectedFiles;
  },
  
  // Extract file information from DOM element
  extractFileInfo(element) {
    // Try to get filename
    let fileName = '';
    let fileSize = 0;
    
    // Check element attributes
    fileName = element.getAttribute('title') || 
               element.getAttribute('alt') || 
               element.textContent || 
               element.getAttribute('href');
    
    // Filter out non-file elements
    if (!fileName || fileName.length < 3) return null;
    
    // Extract just the filename
    const match = fileName.match(/([^\/\\]+\.\w{1,10})$/i);
    if (match) {
      fileName = match[1];
    } else {
      // Not a valid filename with extension
      return null;
    }
    
    // Get file extension
    const extension = fileName.split('.').pop().toLowerCase();
    
    // Try to get file size from nearby elements
    const parent = element.parentElement;
    const siblings = Array.from(parent?.children || []);
    
    siblings.forEach(sibling => {
      const text = sibling.textContent || '';
      const sizeMatch = text.match(/(\d+(\.\d+)?)\s*(KB|MB|GB|bytes?)/i);
      if (sizeMatch) {
        const size = parseFloat(sizeMatch[1]);
        const unit = sizeMatch[3].toLowerCase();
        
        // Convert to KB
        if (unit.includes('mb')) {
          fileSize = size * 1024;
        } else if (unit.includes('gb')) {
          fileSize = size * 1024 * 1024;
        } else if (unit.includes('bytes')) {
          fileSize = size / 1024;
        } else {
          fileSize = size; // Already in KB
        }
      }
    });
    
    // Default size if not found
    if (fileSize === 0) {
      fileSize = this.estimateFileSize(fileName, extension);
    }
    
    return {
      fileName: fileName,
      extension: extension,
      sizeKB: fileSize,
      detectedAt: new Date().toISOString(),
      element: element
    };
  },
  
  // Estimate file size based on type
  estimateFileSize(fileName, extension) {
    // Rough estimates based on file type
    const sizeEstimates = {
      txt: 50,       // 50KB average text file
      pdf: 500,      // 500KB average PDF
      doc: 300,      // 300KB average Word doc
      docx: 300,
      jpg: 800,      // 800KB average image
      jpeg: 800,
      png: 1000,     // 1MB average PNG
      gif: 500,
      js: 100,       // 100KB average JS file
      py: 80,        // 80KB average Python file
      java: 120,     // 120KB average Java file
      csv: 200,      // 200KB average CSV
      xlsx: 400      // 400KB average Excel
    };
    
    return sizeEstimates[extension] || 100; // Default 100KB
  },
  
  // Check if file is already tracked
  isFileAlreadyTracked(fileInfo) {
    return this.uploadedFiles.some(file => 
      file.fileName === fileInfo.fileName && 
      Math.abs(new Date(file.detectedAt) - new Date(fileInfo.detectedAt)) < 60000 // Within 1 minute
    );
  },
  
  // Estimate tokens for a file
  estimateFileTokens(fileInfo) {
    const extension = fileInfo.extension;
    const estimate = this.fileTokenEstimates[extension] || this.defaultEstimate;
    
    // Calculate tokens: size in KB * tokens per KB
    const tokens = Math.ceil(fileInfo.sizeKB * estimate.tokensPerKB);
    
    return {
      tokens: tokens,
      description: estimate.description,
      fileInfo: fileInfo
    };
  },
  
  // Process all detected files and estimate total tokens
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
      console.log(`Detected ${newFiles.length} new file(s), estimated ${totalNewTokens} tokens`);
      newFiles.forEach(file => {
        console.log(`  - ${file.fileName}: ${file.sizeKB.toFixed(1)}KB → ~${file.tokens} tokens`);
      });
    }
    
    return {
      newFiles: newFiles,
      totalTokens: totalNewTokens,
      allFiles: this.uploadedFiles
    };
  },
  
  // Reset for new chat
  reset() {
    this.uploadedFiles = [];
    console.log('File upload tracker reset');
  },
  
  // Get total tokens from all uploaded files in current chat
  getTotalFileTokens() {
    return this.uploadedFiles.reduce((total, file) => total + (file.estimatedTokens || 0), 0);
  }
};

// Integrate with token estimator
tokenEstimator.estimateFileTokens = function(fileInfo) {
  return fileUploadTracker.estimateFileTokens(fileInfo);
};

tokenEstimator.addFileUpload = function(fileInfo) {
  const tokenEstimate = fileUploadTracker.estimateFileTokens(fileInfo);
  const result = this.addMessage(
    `[FILE UPLOAD: ${fileInfo.fileName} (${fileInfo.sizeKB.toFixed(1)}KB)]`,
    true // User uploaded
  );
  
  // Add extra tokens for the file content
  this.currentChatTokens += tokenEstimate.tokens;
  
  return {
    ...result,
    fileTokens: tokenEstimate.tokens,
    fileInfo: fileInfo
  };
};

// Monitor for file uploads
function setupFileUploadDetection() {
  console.log('Setting up file upload detection...');
  
  // Monitor file input changes
  document.addEventListener('change', (e) => {
    if (e.target.type === 'file') {
      console.log('File input detected');
      setTimeout(() => {
        const files = fileUploadTracker.processUploadedFiles();
        if (files.newFiles.length > 0) {
          // Report file upload tokens
          chrome.runtime.sendMessage({
            type: 'FILE_UPLOAD_DETECTED',
            data: {
              files: files.newFiles,
              totalTokens: files.totalTokens,
              chatId: currentChatId
            }
          });
        }
      }, 2000); // Wait for upload to complete
    }
  });
  
  // Monitor for file upload UI
  const uploadObserver = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            const className = node.className || '';
            const text = node.textContent || '';
            
            // Look for file upload indicators
            if (className.includes('upload') || 
                className.includes('file') ||
                text.includes('Upload') ||
                text.includes('uploading') ||
                (node.tagName === 'IMG' && (node.src.includes('upload') || node.alt.includes('file')))) {
              
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
  
  // Start observing for file uploads
  uploadObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'src', 'alt', 'title']
  });
  
  // Also check periodically
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
  }, 10000); // Check every 10 seconds
  
  // Reset on new chat
  window.addEventListener('newchat', () => {
    fileUploadTracker.reset();
  });
}

// Update the initialization to include file tracking
function initializeTracker() {
  // ... existing initialization code ...
  
  // Add file upload detection
  setTimeout(() => {
    setupFileUploadDetection();
    
    // Initial scan for existing files
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
  }, 5000);
}

// Call initializeTracker instead of separate init functions
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initializeTracker, 2000);
  });
} else {
  setTimeout(initializeTracker, 2000);
}
