console.log('DeepSeek Chat Tracker content script loaded');

let messageCount = 0;
let observer;

// Function to count messages
function countMessages() {
  // Try various selectors for DeepSeek
  const selectors = [
    // DeepSeek specific
    '[data-message-author-role="user"]',
    '.prose',
    '.markdown-body',
    // General chat selectors
    '[class*="message"]',
    '[class*="Message"]',
    'div[class*="user"]',
    'div[class*="User"]'
  ];
  
  let maxCount = 0;
  
  for (const selector of selectors) {
    try {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        console.log(`Found ${elements.length} elements with selector: ${selector}`);
        maxCount = Math.max(maxCount, elements.length);
      }
    } catch (e) {
      // Ignore invalid selectors
    }
  }
  
  return maxCount;
}

// Send message to background
function sendMessageToBackground() {
  const runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
  
  runtime.sendMessage({ type: 'NEW_MESSAGE' }, (response) => {
    if (response && response.success) {
      console.log('Message count updated successfully');
    }
  });
}

// Check for new messages and send to background
function checkAndReportMessages() {
  const currentCount = countMessages();
  
  if (currentCount > messageCount) {
    const newMessages = currentCount - messageCount;
    console.log(`Detected ${newMessages} new messages. Total: ${currentCount}`);
    
    messageCount = currentCount;
    
    // Send each new message
    for (let i = 0; i < newMessages; i++) {
      sendMessageToBackground();
    }
  }
}

// Set up mutation observer
function initObserver() {
  observer = new MutationObserver((mutations) => {
    let shouldCheck = false;
    
    for (const mutation of mutations) {
      if (mutation.type === 'childList' || mutation.type === 'characterData') {
        shouldCheck = true;
        break;
      }
    }
    
    if (shouldCheck) {
      // Debounce checks
      clearTimeout(window.checkTimeout);
      window.checkTimeout = setTimeout(checkAndReportMessages, 1000);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
  
  console.log('Mutation observer started');
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initObserver, 2000);
    setTimeout(checkAndReportMessages, 3000);
  });
} else {
  setTimeout(initObserver, 2000);
  setTimeout(checkAndReportMessages, 3000);
}

// Also check on user interactions
document.addEventListener('click', (e) => {
  // If user clicks something that might send a message
  const tagName = e.target.tagName.toLowerCase();
  if (tagName === 'button' || e.target.closest('button')) {
    setTimeout(checkAndReportMessages, 1500);
  }
});

// Listen for Enter key in text areas
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    const target = e.target;
    if (target.tagName === 'TEXTAREA' || target.isContentEditable) {
      setTimeout(checkAndReportMessages, 1500);
    }
  }
});
