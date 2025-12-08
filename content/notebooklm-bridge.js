/**
 * NotebookLM Bridge Content Script
 * Handles communication with NotebookLM page for source addition
 * Supports multiple sources (playlist videos)
 */

(function() {
  'use strict';
  
  // Prevent multiple injections
  if (window.__notebookLMBridge) return;
  window.__notebookLMBridge = true;
  
  // Processing state
  let isProcessing = false;
  
  /**
   * Wait for an element to appear in the DOM
   * @param {string} selector - CSS selector
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Element>} - Resolved element
   */
  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }
      
      const observer = new MutationObserver((mutations, obs) => {
        const el = document.querySelector(selector);
        if (el) {
          obs. disconnect();
          resolve(el);
        }
      });
      
      observer.observe(document. body, {
        childList: true,
        subtree: true
      });
      
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element ${selector} not found within ${timeout}ms`));
      }, timeout);
    });
  }
  
  /**
   * Wait for page to be ready (loaded and interactive)
   * @returns {Promise<void>}
   */
  async function waitForPageReady() {
    // Wait for main content area
    await waitForElement('[role="main"], main, .notebook-content', 15000);
    // Additional delay for dynamic content
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  /**
   * Simulate user click on an element
   * @param {Element} element - Element to click
   */
  function simulateClick(element) {
    if (! element) return;
    
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    const events = ['mousedown', 'mouseup', 'click'];
    events.forEach(eventType => {
      const event = new MouseEvent(eventType, {
        bubbles: true,
        cancelable: true,
        view: window
      });
      element.dispatchEvent(event);
    });
  }
  
  /**
   * Simulate typing in an input field
   * @param {Element} input - Input element
   * @param {string} text - Text to type
   */
  function simulateTyping(input, text) {
    if (!input) return;
    
    input.focus();
    input.value = '';
    
    // Type character by character for better compatibility
    for (const char of text) {
      input.value += char;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  
  /**
   * Get list of user's notebooks from the page
   * @returns {Array} - Array of notebook objects
   */
  function getNotebooks() {
    const notebooks = [];
    
    // Try multiple selectors for notebook list
    const selectors = [
      '[data-notebook-id]',
      '. notebook-item',
      '[role="listitem"][data-id]',
      'a[href*="/notebook/"]',
      '. notebook-card',
      '[class*="notebook"]'
    ];
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      
      elements.forEach(el => {
        // Extract ID from various sources
        let id = el.dataset.notebookId || 
                 el.dataset.id || 
                 el.getAttribute('href')?.match(/\/notebook\/([^\/\?]+)/)?.[1] ||
                 '';
        
        // Extract name
        const nameEl = el.querySelector('h2, h3, h4, [class*="title"], [class*="name"]') || el;
        const name = nameEl?. textContent?.trim() || 'Untitled Notebook';
        
        if (id && ! notebooks.find(n => n.id === id)) {
          notebooks. push({ id, name });
        }
      });
    }
    
    return notebooks;
  }
  
  /**
   * Add a single URL source to NotebookLM
   * @param {string} url - URL to add
   * @param {string} title - Title of the source
   * @returns {Promise<boolean>} - Success status
   */
  async function addUrlSource(url, title) {
    try {
      console.log(`Adding source: ${title} (${url})`);
      
      // Find and click "Add source" button
      const addSourceSelectors = [
        'button[aria-label*="Add source"]',
        'button[aria-label*="ソースを追加"]',
        'button[aria-label*="添加来源"]',
        '[data-action="add-source"]',
        'button:has([class*="add"])',
        '[class*="add-source"]',
        'button[class*="source"]'
      ];
      
      let addSourceBtn = null;
      for (const selector of addSourceSelectors) {
        try {
          addSourceBtn = await waitForElement(selector, 3000);
          if (addSourceBtn) break;
        } catch (e) {
          continue;
        }
      }
      
      if (!addSourceBtn) {
        // Try finding by text content
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          if (btn.textContent.includes('ソース') || 
              btn.textContent.includes('Add') ||
              btn.textContent. includes('追加')) {
            addSourceBtn = btn;
            break;
          }
        }
      }
      
      if (!addSourceBtn) {
        throw new Error('Add source button not found');
      }
      
      simulateClick(addSourceBtn);
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Find and click "Website" or "URL" option
      const urlOptionSelectors = [
        'button[aria-label*="Website"]',
        'button[aria-label*="URL"]',
        'button[aria-label*="ウェブサイト"]',
        'button[aria-label*="Link"]',
        'button[aria-label*="リンク"]',
        '[data-source-type="url"]',
        '[data-source-type="website"]',
        '[data-source-type="link"]'
      ];
      
      let urlOption = null;
      for (const selector of urlOptionSelectors) {
        try {
          urlOption = await waitForElement(selector, 3000);
          if (urlOption) break;
        } catch (e) {
          continue;
        }
      }
      
      if (!urlOption) {
        // Try finding by text/icon
        const options = document.querySelectorAll('[role="menuitem"], [role="option"], button');
        for (const opt of options) {
          if (opt.textContent.includes('ウェブ') || 
              opt.textContent.includes('Web') ||
              opt.textContent.includes('URL') ||
              opt.textContent. includes('リンク') ||
              opt.textContent. includes('Link')) {
            urlOption = opt;
            break;
          }
        }
      }
      
      if (urlOption) {
        simulateClick(urlOption);
        await new Promise(resolve => setTimeout(resolve, 800));
      }
      
      // Find URL input field and enter URL
      const urlInputSelectors = [
        'input[type="url"]',
        'input[placeholder*="URL"]',
        'input[placeholder*="http"]',
        'input[aria-label*="URL"]',
        'input[name*="url"]',
        'input[class*="url"]',
        'textarea[placeholder*="URL"]'
      ];
      
      let urlInput = null;
      for (const selector of urlInputSelectors) {
        try {
          urlInput = await waitForElement(selector, 3000);
          if (urlInput) break;
        } catch (e) {
          continue;
        }
      }
      
      if (!urlInput) {
        // Try any visible text input
        const inputs = document.querySelectorAll('input[type="text"], input:not([type])');
        for (const input of inputs) {
          if (input.offsetParent !== null) { // Check if visible
            urlInput = input;
            break;
          }
        }
      }
      
      if (! urlInput) {
        throw new Error('URL input field not found');
      }
      
      simulateTyping(urlInput, url);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Find and click submit/add button
      const submitSelectors = [
        'button[type="submit"]',
        'button[aria-label*="Add"]',
        'button[aria-label*="追加"]',
        'button[aria-label*="Insert"]',
        'button[aria-label*="挿入"]',
        '. submit-button',
        'button[class*="primary"]',
        'button[class*="submit"]'
      ];
      
      let submitBtn = null;
      for (const selector of submitSelectors) {
        try {
          submitBtn = await waitForElement(selector, 3000);
          if (submitBtn) break;
        } catch (e) {
          continue;
        }
      }
      
      if (!submitBtn) {
        // Try finding by text
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const text = btn.textContent.toLowerCase();
          if (text.includes('追加') || text.includes('add') || 
              text.includes('insert') || text.includes('挿入') ||
              text.includes('submit') || text.includes('ok')) {
            submitBtn = btn;
            break;
          }
        }
      }
      
      if (submitBtn) {
        simulateClick(submitBtn);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      console.log(`Successfully added source: ${title}`);
      return true;
      
    } catch (error) {
      console.error('Failed to add URL source:', error);
      return false;
    }
  }
  
  /**
   * Process all pending sources from extension storage
   */
  async function processPendingSources() {
    if (isProcessing) {
      console.log('Already processing sources, skipping.. .');
      return;
    }
    
    try {
      isProcessing = true;
      
      const result = await chrome.storage.local.get('pending_sources');
      const pendingSources = result.pending_sources;
      
      if (! pendingSources) {
        console.log('No pending sources found');
        return;
      }
      
      // Check if sources are recent (within last 60 seconds)
      const isRecent = (Date.now() - pendingSources.timestamp) < 60000;
      if (! isRecent) {
        console.log('Pending sources expired, clearing...');
        await chrome.storage.local.remove('pending_sources');
        return;
      }
      
      // Wait for page to be ready
      await waitForPageReady();
      
      const sources = pendingSources.sources || [];
      console.log(`Processing ${sources.length} pending sources... `);
      
      let successCount = 0;
      let failCount = 0;
      
      // Process each source
      for (let i = 0; i < sources.length; i++) {
        const source = sources[i];
        console.log(`Processing source ${i + 1}/${sources.length}: ${source. title}`);
        
        const success = await addUrlSource(source.url, source.title);
        
        if (success) {
          successCount++;
        } else {
          failCount++;
        }
        
        // Wait between additions to avoid rate limiting
        if (i < sources.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // Clear pending sources
      await chrome.storage.local.remove('pending_sources');
      
      // Notify extension of result
      chrome.runtime.sendMessage({
        action: 'SOURCES_ADDED',
        data: { 
          success: failCount === 0,
          successCount,
          failCount,
          total: sources.length
        }
      }). catch(() => {
        // Background might not be listening, ignore
      });
      
      console.log(`Completed: ${successCount} succeeded, ${failCount} failed out of ${sources.length}`);
      
    } catch (error) {
      console.error('Error processing pending sources:', error);
    } finally {
      isProcessing = false;
    }
  }
  
  /**
   * Listen for messages from popup/background
   */
  chrome. runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handleAsync = async () => {
      switch (message.action) {
        case 'ADD_PENDING_SOURCES':
          await processPendingSources();
          return { success: true };
        
        case 'GET_NOTEBOOKS':
          const notebooks = getNotebooks();
          return { success: true, data: notebooks };
        
        case 'ADD_URL_SOURCE':
          const success = await addUrlSource(message.data.url, message.data.title);
          return { success };
        
        default:
          return { success: false, error: 'Unknown action' };
      }
    };
    
    handleAsync()
      .then(sendResponse)
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    return true; // Keep channel open for async response
  });
  
  // Check for pending sources on page load
  const initBridge = async () => {
    console.log('NotebookLM Quick Add: Bridge loaded');
    
    // Small delay to ensure page is interactive
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check for pending sources
    await processPendingSources();
    
    // Fetch and cache notebooks
    const notebooks = getNotebooks();
    if (notebooks.length > 0) {
      chrome.runtime.sendMessage({
        action: 'SAVE_NOTEBOOKS',
        data: notebooks
      }).catch(() => {});
    }
  };
  
  if (document.readyState === 'complete') {
    initBridge();
  } else {
    window.addEventListener('load', initBridge);
  }
  
  // Also check when navigating within NotebookLM (SPA)
  let lastUrl = location.href;
  const urlObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(processPendingSources, 2000);
    }
  });
  
  urlObserver. observe(document.body, { childList: true, subtree: true });
  
})();