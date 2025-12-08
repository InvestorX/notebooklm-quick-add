/**
 * NotebookLM Bridge Content Script
 * Handles communication with NotebookLM page for source addition
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
   * @returns {Promise<Element|null>} - Resolved element or null
   */
  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve) => {
      // Validate selector first
      try {
        document.querySelector(selector);
      } catch (e) {
        console.warn(`Invalid selector: ${selector}`);
        resolve(null);
        return;
      }
      
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }
      
      const observer = new MutationObserver((mutations, obs) => {
        const el = document.querySelector(selector);
        if (el) {
          obs.disconnect();
          resolve(el);
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      setTimeout(() => {
        observer.disconnect();
        resolve(null); // Return null instead of throwing
      }, timeout);
    });
  }
  
  /**
   * Try multiple selectors and return the first match
   * @param {Array<string>} selectors - Array of CSS selectors
   * @param {number} timeout - Timeout per selector
   * @returns {Promise<Element|null>} - First matching element or null
   */
  async function findElementBySelectors(selectors, timeout = 2000) {
    for (const selector of selectors) {
      try {
        // Validate selector
        document.querySelector(selector);
        
        const element = await waitForElement(selector, timeout);
        if (element) {
          console.log(`Found element with selector: ${selector}`);
          return element;
        }
      } catch (e) {
        // Invalid selector, skip
        continue;
      }
    }
    return null;
  }
  
  /**
   * Find element by text content
   * @param {string} tagName - Tag to search
   * @param {Array<string>} textPatterns - Text patterns to match
   * @returns {Element|null} - Matching element or null
   */
  function findElementByText(tagName, textPatterns) {
    const elements = document.querySelectorAll(tagName);
    for (const el of elements) {
      const text = el.textContent?.toLowerCase() || '';
      for (const pattern of textPatterns) {
        if (text.includes(pattern.toLowerCase())) {
          return el;
        }
      }
    }
    return null;
  }
  
  /**
   * Wait for page to be ready
   * @returns {Promise<boolean>} - True if ready, false if timeout
   */
  async function waitForPageReady() {
    // Wait for any content to appear
    const selectors = [
      '[role="main"]',
      'main',
      '#app',
      '[data-testid]',
      'body > div'
    ];
    
    for (const selector of selectors) {
      try {
        const el = await waitForElement(selector, 3000);
        if (el) {
          await new Promise(resolve => setTimeout(resolve, 1500));
          return true;
        }
      } catch (e) {
        continue;
      }
    }
    
    // Fallback: just wait
    await new Promise(resolve => setTimeout(resolve, 3000));
    return true;
  }
  
  /**
   * Simulate user click on an element
   * @param {Element} element - Element to click
   */
  function simulateClick(element) {
    if (! element) return;
    
    try {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      // Ignore scroll errors
    }
    
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
    if (! input) return;
    
    input.focus();
    input.value = '';
    
    // Set value directly
    input.value = text;
    
    // Dispatch events
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  }
  
  /**
   * Get list of user's notebooks from the page
   * @returns {Array} - Array of notebook objects
   */
  function getNotebooks() {
    const notebooks = [];
    const seenIds = new Set();
    
    // Method 1: Find by href containing /notebook/
    const links = document.querySelectorAll('a[href*="/notebook/"]');
    links.forEach(el => {
      const href = el.getAttribute('href') || '';
      const match = href.match(/\/notebook\/([^\/\?]+)/);
      if (match && match[1]) {
        const id = match[1];
        if (!seenIds.has(id)) {
          seenIds. add(id);
          const name = el.textContent?.trim() || 'Untitled';
          notebooks.push({ id, name });
        }
      }
    });
    
    // Method 2: Find by data attributes
    const dataElements = document.querySelectorAll('[data-notebook-id], [data-id]');
    dataElements.forEach(el => {
      const id = el.dataset.notebookId || el. dataset.id;
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        const nameEl = el.querySelector('h2, h3, h4, span, div');
        const name = nameEl?.textContent?.trim() || el.textContent?.trim() || 'Untitled';
        notebooks.push({ id, name: name. substring(0, 50) });
      }
    });
    
    console.log(`Found ${notebooks.length} notebooks`);
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
      
      // Step 1: Find "Add source" button
      const addSourceBtn = await findElementBySelectors([
        'button[aria-label*="Add source"]',
        'button[aria-label*="Add"]',
        'button[aria-label*="ソース"]',
        'button[aria-label*="追加"]',
        '[data-action="add-source"]',
        'button[data-testid*="add"]',
        'button[data-testid*="source"]'
      ], 3000);
      
      // Fallback: find by text
      const addBtn = addSourceBtn || findElementByText('button', [
        'add source', 'ソースを追加', '追加', 'add', 'new source'
      ]);
      
      if (! addBtn) {
        console. error('Add source button not found');
        return false;
      }
      
      simulateClick(addBtn);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Step 2: Find "Website/URL/Link" option
      const urlOption = await findElementBySelectors([
        'button[aria-label*="Website"]',
        'button[aria-label*="URL"]',
        'button[aria-label*="Link"]',
        'button[aria-label*="ウェブ"]',
        'button[aria-label*="リンク"]',
        '[data-source-type="url"]',
        '[data-source-type="website"]',
        '[data-source-type="link"]',
        '[role="menuitem"]'
      ], 3000);
      
      // Fallback: find by text
      const urlBtn = urlOption || findElementByText('button, [role="menuitem"], div[role="button"]', [
        'website', 'web', 'url', 'link', 'ウェブ', 'リンク', 'サイト'
      ]);
      
      if (urlBtn) {
        simulateClick(urlBtn);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Step 3: Find URL input field
      const urlInput = await findElementBySelectors([
        'input[type="url"]',
        'input[type="text"]',
        'input[placeholder*="URL"]',
        'input[placeholder*="http"]',
        'input[placeholder*="url"]',
        'input[aria-label*="URL"]',
        'textarea'
      ], 3000);
      
      if (!urlInput) {
        console.error('URL input not found');
        return false;
      }
      
      simulateTyping(urlInput, url);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Step 4: Find submit button
      const submitBtn = await findElementBySelectors([
        'button[type="submit"]',
        'button[aria-label*="Add"]',
        'button[aria-label*="Insert"]',
        'button[aria-label*="追加"]',
        'button[aria-label*="挿入"]',
        'button[data-testid*="submit"]',
        'button[data-testid*="confirm"]'
      ], 2000);
      
      // Fallback: find by text
      const submitButton = submitBtn || findElementByText('button', [
        'add', 'insert', 'submit', 'ok', '追加', '挿入', '確定'
      ]);
      
      if (submitButton) {
        simulateClick(submitButton);
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      
      console.log(`Successfully initiated add for: ${title}`);
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
      console.log('Already processing, skipping.. .');
      return;
    }
    
    try {
      isProcessing = true;
      
      const result = await chrome.storage.local.get('pending_sources');
      const pendingSources = result.pending_sources;
      
      if (! pendingSources) {
        console.log('No pending sources');
        return;
      }
      
      // Check if recent (within 60 seconds)
      if (Date.now() - pendingSources.timestamp > 60000) {
        console.log('Pending sources expired');
        await chrome.storage.local.remove('pending_sources');
        return;
      }
      
      // Wait for page
      await waitForPageReady();
      
      const sources = pendingSources.sources || [];
      console.log(`Processing ${sources.length} sources... `);
      
      let successCount = 0;
      
      for (let i = 0; i < sources.length; i++) {
        const source = sources[i];
        console.log(`[${i + 1}/${sources.length}] ${source.title}`);
        
        const success = await addUrlSource(source.url, source.title);
        if (success) successCount++;
        
        // Wait between additions
        if (i < sources.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2500));
        }
      }
      
      // Clear pending
      await chrome.storage. local.remove('pending_sources');
      
      // Notify
      chrome.runtime.sendMessage({
        action: 'SOURCES_ADDED',
        data: { successCount, total: sources.length }
      }). catch(() => {});
      
      console.log(`Done: ${successCount}/${sources.length} succeeded`);
      
    } catch (error) {
      console. error('Error processing sources:', error);
    } finally {
      isProcessing = false;
    }
  }
  
  /**
   * Message listener
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handleAsync = async () => {
      switch (message.action) {
        case 'ADD_PENDING_SOURCES':
          await processPendingSources();
          return { success: true };
        
        case 'GET_NOTEBOOKS':
          return { success: true, data: getNotebooks() };
        
        case 'ADD_URL_SOURCE':
          const success = await addUrlSource(message. data.url, message.data.title);
          return { success };
        
        default:
          return { success: false, error: 'Unknown action' };
      }
    };
    
    handleAsync()
      .then(sendResponse)
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    return true;
  });
  
  // Initialize
  const initBridge = async () => {
    console.log('NotebookLM Quick Add: Bridge loaded');
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    await processPendingSources();
    
    // Cache notebooks
    const notebooks = getNotebooks();
    if (notebooks.length > 0) {
      chrome.runtime.sendMessage({
        action: 'SAVE_NOTEBOOKS',
        data: notebooks
      }). catch(() => {});
    }
  };
  
  if (document.readyState === 'complete') {
    initBridge();
  } else {
    window.addEventListener('load', initBridge);
  }
  
  // SPA navigation handling
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location. href;
      setTimeout(processPendingSources, 2000);
    }
  }). observe(document.body, { childList: true, subtree: true });
  
})();
