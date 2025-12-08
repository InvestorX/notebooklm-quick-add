/**
 * NotebookLM Bridge Content Script
 */

(function() {
  'use strict';

  if (window.__notebookLMBridge) return;
  window.__notebookLMBridge = true;

  let isProcessing = false;

  /**
   * Wait for element
   */
  function waitForElement(selector, timeout) {
    timeout = timeout || 10000;
    return new Promise(function(resolve) {
      try {
        document.querySelector(selector);
      } catch (e) {
        resolve(null);
        return;
      }

      var element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      var observer = new MutationObserver(function(mutations, obs) {
        var el = document.querySelector(selector);
        if (el) {
          obs.disconnect();
          resolve(el);
        }
      });

      observer. observe(document.body, { childList: true, subtree: true });

      setTimeout(function() {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  /**
   * Find element by multiple selectors
   */
  async function findElementBySelectors(selectors, timeout) {
    timeout = timeout || 2000;
    for (var i = 0; i < selectors. length; i++) {
      try {
        var el = await waitForElement(selectors[i], timeout);
        if (el) return el;
      } catch (e) {
        continue;
      }
    }
    return null;
  }

  /**
   * Simulate click
   */
  function simulateClick(element) {
    if (! element) return;
    try {
      element. scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {}

    ['mousedown', 'mouseup', 'click'].forEach(function(type) {
      element. dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window
      }));
    });
  }

  /**
   * Simulate typing
   */
  function simulateTyping(input, text) {
    if (!input) return;
    input.focus();
    input. value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Extract notebook title from card text
   */
  function extractNotebookTitle(cardText) {
    if (!cardText) return null;
    
    var text = cardText.trim();
    
    // Remove leading Material icons (public, lock, etc.)
    text = text.replace(/^(public|lock|group|share|visibility|people|person)\s*/i, ''). trim();
    
    // Pattern: "Title YYYY/MM/DD·N 個のソース"
    var datePattern = /^(. +?)\s*\d{4}\/\d{2}\/\d{2}/;
    var dateMatch = text.match(datePattern);
    if (dateMatch && dateMatch[1]) {
      return dateMatch[1]. trim();
    }
    
    // Pattern with dot separator
    var dotParts = text.split('·');
    if (dotParts.length > 0) {
      var firstPart = dotParts[0].trim();
      firstPart = firstPart.replace(/\s*\d{4}\/\d{2}\/\d{2}\s*$/, ''). trim();
      if (firstPart && firstPart.length > 1) {
        return firstPart;
      }
    }
    
    // Fallback
    var lines = text.split('\n');
    if (lines[0]) {
      return lines[0].trim(). substring(0, 80);
    }
    
    return text. substring(0, 80);
  }

  /**
   * Get notebooks from NotebookLM page
   */
  function getNotebooks() {
    var notebooks = [];
    var seenNames = {};

    console.log('Searching for notebooks.. .');

    // FIXED: No space after dot in class selector
    var cards = document.querySelectorAll('.project-button-card');
    console.log('Found', cards.length, 'project-button-cards');

    if (cards.length === 0) {
      cards = document.querySelectorAll('mat-card');
      console.log('Fallback: Found', cards.length, 'mat-cards');
    }

    cards.forEach(function(card, index) {
      var cardText = card.textContent || '';
      
      // Skip create-new cards
      if (cardText.indexOf('新規作成') !== -1 || 
          cardText. indexOf('ノートブックを新規作成') !== -1 ||
          card.classList.contains('create-new-action-button')) {
        console.log('Skipping create-new card');
        return;
      }

      // Extract title
      var title = extractNotebookTitle(cardText);
      
      if (!title || title. length < 2) {
        console.log('Skipping card with no title');
        return;
      }

      // Skip duplicates
      if (seenNames[title]) {
        return;
      }
      seenNames[title] = true;

      // Generate ID (index-based since NotebookLM doesn't expose real IDs easily)
      var id = 'notebook-' + index;

      // Try to find actual ID
      var link = card.querySelector('a[href*="notebook"]');
      if (link) {
        var href = link.getAttribute('href') || '';
        var match = href.match(/notebook\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
          id = match[1];
        }
      }

      // Check data attributes
      var dataId = card.getAttribute('data-notebook-id') || 
                   card.getAttribute('data-id') ||
                   card.getAttribute('data-project-id');
      if (dataId) {
        id = dataId;
      }

      notebooks.push({ id: id, name: title });
      console.log('Notebook', notebooks.length, ':', title. substring(0, 40));
    });

    console.log('Total notebooks found:', notebooks. length);
    return notebooks;
  }

  /**
   * Add URL source to NotebookLM
   */
  async function addUrlSource(url, title) {
    try {
      console.log('Adding source:', title, url);

      // Find "Add source" button
      var addBtn = null;
      var btns = document.querySelectorAll('button');
      
      for (var i = 0; i < btns.length; i++) {
        var btnText = btns[i].textContent || '';
        var ariaLabel = btns[i].getAttribute('aria-label') || '';
        
        if (btnText.indexOf('ソースを追加') !== -1 ||
            btnText.indexOf('ソースの追加') !== -1 ||
            btnText.indexOf('Add source') !== -1 ||
            ariaLabel.indexOf('ソースを追加') !== -1 ||
            ariaLabel.indexOf('Add source') !== -1) {
          addBtn = btns[i];
          break;
        }
      }

      if (!addBtn) {
        console.error('Add source button not found');
        return false;
      }

      console.log('Clicking add source button');
      simulateClick(addBtn);
      await new Promise(function(r) { setTimeout(r, 1200); });

      // Find URL/Website option
      var menuItems = document.querySelectorAll('button, [role="menuitem"], mat-menu-item');
      var urlOption = null;
      
      for (var j = 0; j < menuItems.length; j++) {
        var itemText = (menuItems[j]. textContent || ''). toLowerCase();
        if (itemText.indexOf('ウェブサイト') !== -1 || 
            itemText.indexOf('website') !== -1 ||
            itemText.indexOf('url') !== -1 ||
            itemText.indexOf('リンク') !== -1) {
          urlOption = menuItems[j];
          break;
        }
      }

      if (urlOption) {
        console.log('Clicking URL option');
        simulateClick(urlOption);
        await new Promise(function(r) { setTimeout(r, 1000); });
      }

      // Find URL input
      var urlInput = null;
      var inputs = document.querySelectorAll('input, textarea');
      
      for (var k = 0; k < inputs.length; k++) {
        var inp = inputs[k];
        if (inp.offsetParent === null) continue;
        
        var placeholder = (inp.placeholder || '').toLowerCase();
        var ariaLbl = (inp.getAttribute('aria-label') || '').toLowerCase();
        var type = inp.type || '';
        
        if (type === 'url' ||
            placeholder.indexOf('url') !== -1 || 
            placeholder. indexOf('http') !== -1 ||
            ariaLbl.indexOf('url') !== -1) {
          urlInput = inp;
          break;
        }
      }

      if (! urlInput) {
        for (var m = 0; m < inputs.length; m++) {
          if (inputs[m]. offsetParent !== null && 
              (inputs[m].type === 'text' || inputs[m].type === 'url' || inputs[m].tagName === 'TEXTAREA')) {
            urlInput = inputs[m];
            break;
          }
        }
      }

      if (!urlInput) {
        console.error('URL input not found');
        return false;
      }

      console.log('Typing URL');
      simulateTyping(urlInput, url);
      await new Promise(function(r) { setTimeout(r, 600); });

      // Find submit button
      var submitBtn = null;
      var allBtns = document. querySelectorAll('button');
      
      for (var n = 0; n < allBtns.length; n++) {
        var bt = allBtns[n];
        if (bt.offsetParent === null) continue;
        
        var btText = (bt.textContent || '').toLowerCase();
        var btType = bt.getAttribute('type');
        
        if (btType === 'submit' ||
            (btText.indexOf('追加') !== -1 && btText. indexOf('ソース') === -1) ||
            btText.indexOf('挿入') !== -1 ||
            (btText.indexOf('add') !== -1 && btText.indexOf('source') === -1) ||
            btText.indexOf('insert') !== -1) {
          submitBtn = bt;
          break;
        }
      }

      if (submitBtn) {
        console.log('Clicking submit button');
        simulateClick(submitBtn);
        await new Promise(function(r) { setTimeout(r, 1500); });
      }

      console.log('Source add completed for:', title);
      return true;

    } catch (error) {
      console.error('Failed to add source:', error);
      return false;
    }
  }

  /**
   * Process pending sources
   */
  async function processPendingSources() {
    if (isProcessing) return;

    try {
      isProcessing = true;

      var result = await chrome.storage.local.get('pending_sources');
      var pending = result.pending_sources;

      if (! pending) {
        console.log('No pending sources');
        return;
      }

      if (Date.now() - pending.timestamp > 60000) {
        console.log('Pending sources expired');
        await chrome.storage.local.remove('pending_sources');
        return;
      }

      await new Promise(function(r) { setTimeout(r, 2000); });

      var sources = pending.sources || [];
      console.log('Processing', sources.length, 'sources');

      var successCount = 0;
      for (var i = 0; i < sources.length; i++) {
        console.log('[' + (i + 1) + '/' + sources.length + ']', sources[i]. title);
        var success = await addUrlSource(sources[i]. url, sources[i].title);
        if (success) successCount++;
        if (i < sources.length - 1) {
          await new Promise(function(r) { setTimeout(r, 2500); });
        }
      }

      await chrome.storage.local. remove('pending_sources');

      chrome.runtime.sendMessage({
        action: 'SOURCES_ADDED',
        data: { successCount: successCount, total: sources.length }
      }). catch(function() {});

      console.log('Done:', successCount + '/' + sources.length);

    } catch (error) {
      console.error('Error processing sources:', error);
    } finally {
      isProcessing = false;
    }
  }

  /**
   * Message listener
   */
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    var handleAsync = async function() {
      switch (message.action) {
        case 'ADD_PENDING_SOURCES':
          await processPendingSources();
          return { success: true };

        case 'GET_NOTEBOOKS':
          var notebooks = getNotebooks();
          return { success: true, data: notebooks };

        case 'ADD_URL_SOURCE':
          var success = await addUrlSource(message.data. url, message.data.title);
          return { success: success };

        default:
          return { success: false, error: 'Unknown action' };
      }
    };

    handleAsync()
      .then(sendResponse)
      . catch(function(e) { sendResponse({ success: false, error: e.message }); });

    return true;
  });

  /**
   * Initialize
   */
  async function initBridge() {
    console.log('NotebookLM Quick Add: Bridge loaded');

    await new Promise(function(r) { setTimeout(r, 2500); });
    await processPendingSources();

    var notebooks = getNotebooks();
    if (notebooks.length > 0) {
      chrome.runtime.sendMessage({
        action: 'SAVE_NOTEBOOKS',
        data: notebooks
      }). catch(function() {});
    }
  }

  if (document.readyState === 'complete') {
    initBridge();
  } else {
    window.addEventListener('load', initBridge);
  }

  // SPA navigation
  var lastUrl = location.href;
  new MutationObserver(function() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(function() {
        var notebooks = getNotebooks();
        if (notebooks.length > 0) {
          chrome.runtime.sendMessage({
            action: 'SAVE_NOTEBOOKS',
            data: notebooks
          }).catch(function() {});
        }
        processPendingSources();
      }, 2500);
    }
  }).observe(document.body, { childList: true, subtree: true });

})();
