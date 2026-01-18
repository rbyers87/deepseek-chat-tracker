// Content script for DeepSeek website
(function() {
  console.log('DeepSeek Chat Tracker loaded');
  
  let messageCount = 0;
  let observer;
  
  // Detect messages in the chat
  function detectMessages() {
    // DeepSeek specific selectors (may need adjustment)
    const selectors = [
      '[data-message-author-role="user"]',
      '.message', 
      '.chat-message',
      '[class*="message"]',
      '[class*="Message"]'
    ];
    
    for (const selector of selectors) {
      const messages = document.querySelectorAll(selector);
      if (messages.length > 0) {
        return messages.length;
      }
    }
    
    return 0;
  }
  
  // Send message count to background script
  function updateMessageCount() {
    const count = detectMessages();
    if (count > messageCount) {
      messageCount = count;
      chrome.runtime.sendMessage({
        type: 'NEW_MESSAGE'
      });
    }
  }
  
  // Initialize observer
  function initObserver() {
    // Observe DOM changes
    observer = new MutationObserver(() => {
      updateMessageCount();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
    
    // Initial count
    setTimeout(updateMessageCount, 2000);
  }
  
  // Manual message detection for DeepSeek
  function setupManualDetection() {
    // Listen for send button clicks
    document.addEventListener('click', (e) => {
      const target = e.target;
      const buttonText = target.textContent?.toLowerCase() || '';
      const parentText = target.parentElement?.textContent?.toLowerCase() || '';
      
      // Check if this looks like a send button
      if (buttonText.includes('send') || 
          buttonText.includes('发送') || // Chinese
          parentText.includes('send') ||
          target.getAttribute('aria-label')?.toLowerCase().includes('send') ||
          target.closest('button[class*="send"], button[class*="Send"]')) {
        
        setTimeout(() => {
          chrome.runtime.sendMessage({
            type: 'NEW_MESSAGE'
          });
        }, 1000);
      }
    });
    
    // Listen for Enter key in text areas
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        const target = e.target;
        if (target.tagName === 'TEXTAREA' || 
            target.getAttribute('contenteditable') === 'true' ||
            target.classList.contains('prose')) {
          
          setTimeout(() => {
            chrome.runtime.sendMessage({
              type: 'NEW_MESSAGE'
            });
          }, 1000);
        }
      }
    });
  }
  
  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initObserver();
      setupManualDetection();
    });
  } else {
    initObserver();
    setupManualDetection();
  }
})();
