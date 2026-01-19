// DeepSeek Chat Tracker - Content Script
// Detects messages on DeepSeek chat pages

console.log('DeepSeek Chat Tracker content script loaded');

let messageCount = 0;
let observer = null;
let lastMessageTime = 0;
const MESSAGE_DELAY = 1000; // 1 second between messages

// Function to count user messages in the chat
function countUserMessages() {
  // Try various selectors that might match DeepSeek chat messages
  const selectors = [
    // DeepSeek specific selectors
    '[data-message-author-role="user"]',
    '.prose',
    '.markdown-body',
    
    // General chat message selectors
    '[class*="message"]',
    '[class*="Message"]',
    'div[class*="user"]',
    'div[class*="User"]',
    
    // Look for message containers
    'div[class*="chat-message"]',
    'div[class*="ChatMessage"]',
    
    // Look for user avatars or indicators
    'img[src*="user"]',
    'div[class*="avatar"]',
    
    // Look for send timestamps
    'time',
    '[class*="timestamp"]',
    '[class*="Timestamp"]'
  ];
  
  let maxCount = 0;
  
  for (const selector of selectors) {
    try {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        // Filter to likely user messages
        const userMessages = Array.from(elements).filter(el => {
          const text = el.textContent || '';
          const html = el.innerHTML || '';
          const classNames = el.className || '';
          
          // Check for user indicators
          return (
            text.length > 5 && text.length < 5000 && // Reasonable message length
            (text.includes('You:') || 
             text.includes('User:') ||
             classNames.includes('user') ||
             classNames.includes('User') ||
             html.includes('user-message') ||
             html.includes('message-user'))
          );
        });
        
        maxCount = Math.max(maxCount, userMessages.length);
      }
    } catch (e) {
      // Ignore invalid selectors
    }
  }
  
  // Fallback: Count all text nodes that look like messages
  if (maxCount === 0) {
    const allText = document.body.innerText || '';
    const lines = allText.split('\n').filter(line => {
      return line.length > 10 && line.length < 500 && !line.includes('DeepSeek');
    });
    maxCount = lines.length;
  }
  
  return maxCount;
}

// Send message to background script
function sendMessageToBackground() {
  const now = Date.now();
  
  // Rate limiting: don't send messages too frequently
  if (now - lastMessageTime < MESSAGE_DELAY) {
    console.log('Rate limited: skipping duplicate message detection');
    return;
  }
  
  lastMessageTime = now;
  
  const runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
  
  console.log('Sending NEW_MESSAGE to background');
  
  runtime.sendMessage({ type: 'NEW_MESSAGE' }, function(response) {
    if (runtime.lastError) {
      console.log('Background error:', runtime.lastError.message);
    } else if (response && response.success) {
      console.log(`Message count updated: ${response.count}/${response.limit} (${response.remaining} remaining)`);
    }
  });
}

// Check for new messages and report to background
function checkAndReportMessages() {
  const currentCount = countUserMessages();
  
  console.log(`Message check: current=${currentCount}, previous=${messageCount}`);
  
  if (currentCount > messageCount) {
    const newMessages = currentCount - messageCount;
    console.log(`Detected ${newMessages} new message(s). Total: ${currentCount}`);
    
    messageCount = currentCount;
    
    // Send one message per detection (not per new message)
    sendMessageToBackground();
  }
}

// Set up mutation observer to detect DOM changes
function initObserver() {
  let timeoutId = null;
  
  observer = new MutationObserver(function(mutations) {
    let shouldCheck = false;
    
    // Check if any mutation might be a new message
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        // New nodes added
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) { // Element node
            const tag = node.tagName.toLowerCase();
            const className = node.className || '';
            const text = node.textContent || '';
            
            // Check if this looks like a chat message
            if (tag === 'div' || tag === 'p' || tag === 'span') {
              if (text.length > 5 && text.length < 5000) {
                shouldCheck = true;
                break;
              }
            }
          }
        }
      }
      
      if (shouldCheck) break;
    }
    
    if (shouldCheck && !timeoutId) {
      // Debounce checks to avoid spamming
      timeoutId = setTimeout(function() {
        checkAndReportMessages();
        timeoutId = null;
      }, 800); // Wait 800ms after changes
    }
  });
  
  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
  
  console.log('Mutation observer started - watching for chat messages');
}

// Also detect messages via user interactions
function setupInteractionDetection() {
  // Listen for send button clicks
  document.addEventListener('click', function(e) {
    const target = e.target;
    const tagName = target.tagName.toLowerCase();
    const text = target.textContent || '';
    const parentText = target.parentElement?.textContent || '';
    
    // Check if this looks like a send button
    if (tagName === 'button' || target.getAttribute('role') === 'button') {
      if (text.toLowerCase().includes('send') ||
          text.includes('发送') || // Chinese
          parentText.toLowerCase().includes('send') ||
          target.getAttribute('aria-label')?.toLowerCase().includes('send')) {
        
        console.log('Send button clicked detected');
        setTimeout(checkAndReportMessages, 1500);
      }
    }
  });
  
  // Listen for Enter key in text areas
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      const target = e.target;
      const tagName = target.tagName.toLowerCase();
      
      if (tagName === 'textarea' || target.isContentEditable) {
        console.log('Enter key detected in text input');
        setTimeout(checkAndReportMessages, 1500);
      }
    }
  });
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    console.log('DeepSeek page loaded, initializing tracker...');
    setTimeout(function() {
      initObserver();
      setupInteractionDetection();
      messageCount = countUserMessages();
      console.log('Initial message count:', messageCount);
    }, 2000);
  });
} else {
  setTimeout(function() {
    console.log('DeepSeek page already loaded, initializing tracker...');
    initObserver();
    setupInteractionDetection();
    messageCount = countUserMessages();
    console.log('Initial message count:', messageCount);
  }, 2000);
}

// Clean up on page unload
window.addEventListener('beforeunload', function() {
  if (observer) {
    observer.disconnect();
    console.log('Observer disconnected');
  }
});

console.log('DeepSeek Chat Tracker content script initialization complete');