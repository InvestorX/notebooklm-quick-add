/**
 * Background Service Worker
 * Handles message passing, context menus, and NotebookLM interactions
 */

// Storage keys
const STORAGE_KEYS = {
  NOTEBOOKS: 'cached_notebooks',
  LAST_NOTEBOOK: 'last_used_notebook',
  SETTINGS: 'user_settings'
};

// Context menu IDs
const MENU_IDS = {
  ADD_TO_NOTEBOOKLM: 'add-to-notebooklm',
  ADD_TO_NOTEBOOK_PREFIX: 'add-to-notebook-'
};

/**
 * Initialize extension on install
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  // Set default settings
  if (details.reason === 'install') {
    await chrome.storage. local.set({
      [STORAGE_KEYS.SETTINGS]: {
        autoDetect: true,
        showNotifications: true,
        defaultAction: 'popup'
      }
    });
  }
  
  // Create context menus
  await createContextMenus();
  
  console.log('NotebookLM Quick Add: Initialized');
});

/**
 * Create right-click context menus
 */
async function createContextMenus() {
  // Remove existing menus first
  await chrome.contextMenus.removeAll();
  
  // Main menu item
  chrome.contextMenus.create({
    id: MENU_IDS.ADD_TO_NOTEBOOKLM,
    title: 'NotebookLMに追加',
    contexts: ['page', 'link', 'video', 'selection']
  });
  
  // Separator
  chrome.contextMenus. create({
    id: 'separator-1',
    type: 'separator',
    parentId: MENU_IDS. ADD_TO_NOTEBOOKLM,
    contexts: ['page', 'link', 'video', 'selection']
  });
  
  // "New Notebook" option
  chrome.contextMenus. create({
    id: `${MENU_IDS.ADD_TO_NOTEBOOK_PREFIX}new`,
    title: '📓 新しいノートブックを作成',
    parentId: MENU_IDS. ADD_TO_NOTEBOOKLM,
    contexts: ['page', 'link', 'video', 'selection']
  });
  
  // Load cached notebooks and add to menu
  await updateNotebookMenuItems();
}

/**
 * Update context menu with notebook list
 */
async function updateNotebookMenuItems() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.NOTEBOOKS);
  const notebooks = result[STORAGE_KEYS.NOTEBOOKS] || [];
  
  // Remove old notebook menu items (keep the parent and "new" option)
  const existingMenus = await getExistingNotebookMenuIds();
  for (const menuId of existingMenus) {
    try {
      await chrome.contextMenus.remove(menuId);
    } catch (e) {
      // Menu might not exist, ignore
    }
  }
  
  // Add notebook items
  if (notebooks.length > 0) {
    // Add separator before notebooks
    chrome.contextMenus.create({
      id: 'separator-notebooks',
      type: 'separator',
      parentId: MENU_IDS.ADD_TO_NOTEBOOKLM,
      contexts: ['page', 'link', 'video', 'selection']
    });
    
    // Add each notebook
    notebooks.forEach((notebook, index) => {
      chrome.contextMenus.create({
        id: `${MENU_IDS.ADD_TO_NOTEBOOK_PREFIX}${notebook. id}`,
        title: `📒 ${notebook.name}`,
        parentId: MENU_IDS.ADD_TO_NOTEBOOKLM,
        contexts: ['page', 'link', 'video', 'selection']
      });
    });
  }
}

/**
 * Get list of existing notebook menu IDs from storage
 * @returns {Promise<Array>} - Array of menu IDs
 */
async function getExistingNotebookMenuIds() {
  const result = await chrome.storage.local.get(STORAGE_KEYS. NOTEBOOKS);
  const notebooks = result[STORAGE_KEYS.NOTEBOOKS] || [];
  const ids = notebooks.map(n => `${MENU_IDS.ADD_TO_NOTEBOOK_PREFIX}${n.id}`);
  ids.push('separator-notebooks');
  return ids;
}

/**
 * Handle context menu clicks
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const menuItemId = info.menuItemId;
  
  // Determine which notebook was selected
  let notebookId = null;
  
  if (menuItemId === `${MENU_IDS.ADD_TO_NOTEBOOK_PREFIX}new`) {
    notebookId = null; // Create new notebook
  } else if (menuItemId.startsWith(MENU_IDS.ADD_TO_NOTEBOOK_PREFIX)) {
    notebookId = menuItemId. replace(MENU_IDS.ADD_TO_NOTEBOOK_PREFIX, '');
  } else if (menuItemId === MENU_IDS.ADD_TO_NOTEBOOKLM) {
    // Use last used notebook or create new
    const lastResult = await chrome.storage.local. get(STORAGE_KEYS. LAST_NOTEBOOK);
    notebookId = lastResult[STORAGE_KEYS.LAST_NOTEBOOK] || null;
  }
  
  // Get the URL to add
  let targetUrl = info.linkUrl || info.pageUrl || tab.url;
  let targetTitle = tab.title || 'Untitled';
  
  // Handle the add action
  await handleContextMenuAdd(targetUrl, targetTitle, notebookId, tab);
});

/**
 * Handle adding source from context menu
 * @param {string} url - URL to add
 * @param {string} title - Page title
 * @param {string|null} notebookId - Target notebook ID
 * @param {Object} tab - Current tab
 */
async function handleContextMenuAdd(url, title, notebookId, tab) {
  try {
    const pageType = detectPageType(url);
    let sourceData = { url, title, type: pageType };
    
    // If YouTube, extract additional data
    if (pageType. startsWith('youtube')) {
      try {
        // Ensure content script is injected
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/youtube-detector. js']
        });
        
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'EXTRACT_YOUTUBE_DATA'
        });
        
        if (response && response.success) {
          sourceData.youtubeData = response.data;
          
          // プレイリストの場合、全動画を取得
          if (response.data.playlistVideos && response.data.playlistVideos.length > 0) {
            sourceData.playlistVideos = response.data.playlistVideos;
          }
        }
      } catch (e) {
        console.warn('Could not extract YouTube data:', e);
      }
    }
    
    // Save last used notebook
    if (notebookId) {
      await chrome.storage.local. set({
        [STORAGE_KEYS.LAST_NOTEBOOK]: notebookId
      });
    }
    
    // Add to NotebookLM
    await addToNotebookLM({
      sourceType: pageType,
      sourceData: sourceData,
      notebookId: notebookId
    });
    
    // Show notification
    await showNotification('追加中... ', `"${title}" をNotebookLMに追加しています`);
    
  } catch (error) {
    console.error('Context menu add failed:', error);
    await showNotification('エラー', `追加に失敗しました: ${error.message}`);
  }
}

/**
 * Show browser notification
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 */
async function showNotification(title, message) {
  // Use badge text as simple notification (notifications permission not required)
  await chrome.action.setBadgeText({ text: '✓' });
  await chrome. action.setBadgeBackgroundColor({ color: '#34a853' });
  
  // Clear badge after 3 seconds
  setTimeout(async () => {
    await chrome.action.setBadgeText({ text: '' });
  }, 3000);
}

/**
 * Message handler for communication between extension components
 */
chrome.runtime. onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      console. error('Message handling error:', error);
      sendResponse({ success: false, error: error.message });
    });
  
  return true;
});

/**
 * Process incoming messages based on action type
 * @param {Object} message - Message containing action and payload
 * @param {Object} sender - Information about message sender
 * @returns {Promise<Object>} - Response object
 */
async function handleMessage(message, sender) {
  const { action, data } = message;
  
  switch (action) {
    case 'GET_PAGE_INFO':
      return await getPageInfo(sender.tab);
    
    case 'GET_YOUTUBE_DATA':
      return await getYouTubeData(sender.tab);
    
    case 'ADD_TO_NOTEBOOKLM':
      return await addToNotebookLM(data);
    
    case 'GET_NOTEBOOKS':
      return await getCachedNotebooks();
    
    case 'SAVE_NOTEBOOKS':
      await saveNotebooks(data);
      await updateNotebookMenuItems(); // Update context menu
      return { success: true };
    
    case 'REFRESH_NOTEBOOKS':
      return await refreshNotebooksFromPage();
    
    case 'GET_SETTINGS':
      return await getSettings();
    
    case 'SAVE_SETTINGS':
      return await saveSettings(data);
    
    case 'UPDATE_CONTEXT_MENU':
      await updateNotebookMenuItems();
      return { success: true };
    
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Get information about the current page
 * @param {Object} tab - Chrome tab object
 * @returns {Promise<Object>} - Page information
 */
async function getPageInfo(tab) {
  if (!tab) {
    throw new Error('No active tab found');
  }
  
  return {
    success: true,
    data: {
      url: tab. url,
      title: tab. title,
      type: detectPageType(tab.url)
    }
  };
}

/**
 * Detect the type of page based on URL
 * @param {string} url - Page URL
 * @returns {string} - Page type identifier
 */
function detectPageType(url) {
  if (! url) return 'unknown';
  
  // YouTube playlist page
  if (url.includes('youtube.com/playlist')) {
    return 'youtube_playlist';
  }
  
  // YouTube video in playlist context
  if (url.includes('youtube.com/watch') && url.includes('list=')) {
    return 'youtube_video_in_playlist';
  }
  
  // YouTube video
  if (url.includes('youtube.com/watch')) {
    return 'youtube_video';
  }
  
  // NotebookLM
  if (url.includes('notebooklm.google.com')) {
    return 'notebooklm';
  }
  
  // Regular web page
  return 'webpage';
}

/**
 * Get YouTube specific data from content script
 * @param {Object} tab - Chrome tab object
 * @returns {Promise<Object>} - YouTube data
 */
async function getYouTubeData(tab) {
  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'EXTRACT_YOUTUBE_DATA'
    });
    return { success: true, data: response };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Add source to NotebookLM
 * @param {Object} data - Source data to add
 * @returns {Promise<Object>} - Result of operation
 */
async function addToNotebookLM(data) {
  const { sourceType, sourceData, notebookId } = data;
  
  // Prepare sources to add (handle playlist)
  let sourcesToAdd = [];
  
  if (sourceType === 'youtube_playlist' || sourceType === 'youtube_video_in_playlist') {
    // プレイリストの場合、全動画を追加
    if (sourceData. playlistVideos && sourceData. playlistVideos.length > 0) {
      sourcesToAdd = sourceData.playlistVideos. map(video => ({
        type: 'youtube_video',
        url: video.url,
        title: video.title,
        videoId: video.id
      }));
    } else {
      // プレイリスト動画が取得できない場合は現在の動画だけ
      sourcesToAdd = [{
        type: sourceType,
        url: sourceData.url,
        title: sourceData.title
      }];
    }
  } else {
    sourcesToAdd = [{
      type: sourceType,
      url: sourceData.url,
      title: sourceData.title,
      youtubeData: sourceData.youtubeData
    }];
  }
  
  // Store the source data for NotebookLM page to pick up
  await chrome.storage. local.set({
    pending_sources: {
      sources: sourcesToAdd,
      notebookId: notebookId,
      timestamp: Date.now()
    }
  });
  
  // Open NotebookLM in a new tab or focus existing
  const notebookUrl = notebookId 
    ? `https://notebooklm.google.com/notebook/${notebookId}`
    : 'https://notebooklm.google.com/';
  
  // Find existing NotebookLM tab or create new one
  const tabs = await chrome.tabs.query({ url: 'https://notebooklm.google.com/*' });
  
  if (tabs.length > 0) {
    // Focus existing tab
    await chrome.tabs.update(tabs[0].id, { active: true });
    
    // If different notebook, navigate to it
    if (notebookId && ! tabs[0].url.includes(notebookId)) {
      await chrome.tabs.update(tabs[0].id, { url: notebookUrl });
    }
    
    // Trigger source addition
    await chrome.tabs.sendMessage(tabs[0]. id, {
      action: 'ADD_PENDING_SOURCES'
    }). catch(() => {
      // Content script might not be ready, it will check on load
    });
  } else {
    // Create new tab
    await chrome.tabs.create({ url: notebookUrl });
  }
  
  return { success: true, sourcesCount: sourcesToAdd.length };
}

/**
 * Get cached notebooks from storage
 * @returns {Promise<Object>} - Cached notebooks
 */
async function getCachedNotebooks() {
  const result = await chrome.storage.local.get(STORAGE_KEYS. NOTEBOOKS);
  return {
    success: true,
    data: result[STORAGE_KEYS.NOTEBOOKS] || []
  };
}

/**
 * Save notebooks to cache
 * @param {Array} notebooks - Notebooks to cache
 */
async function saveNotebooks(notebooks) {
  await chrome.storage.local.set({
    [STORAGE_KEYS. NOTEBOOKS]: notebooks
  });
}

/**
 * Refresh notebooks from NotebookLM page
 * @returns {Promise<Object>} - Refreshed notebooks
 */
async function refreshNotebooksFromPage() {
  try {
    // Find NotebookLM tab
    const tabs = await chrome.tabs.query({ url: 'https://notebooklm.google.com/*' });
    
    if (tabs.length === 0) {
      // Open NotebookLM to fetch notebooks
      const tab = await chrome.tabs.create({ 
        url: 'https://notebooklm.google. com/',
        active: false 
      });
      
      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Get notebooks
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'GET_NOTEBOOKS'
      });
      
      if (response && response.success) {
        await saveNotebooks(response.data);
        await updateNotebookMenuItems();
        return { success: true, data: response.data };
      }
    } else {
      // Use existing tab
      const response = await chrome.tabs.sendMessage(tabs[0].id, {
        action: 'GET_NOTEBOOKS'
      });
      
      if (response && response.success) {
        await saveNotebooks(response.data);
        await updateNotebookMenuItems();
        return { success: true, data: response.data };
      }
    }
    
    return { success: false, error: 'Could not fetch notebooks' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get user settings
 * @returns {Promise<Object>} - User settings
 */
async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return {
    success: true,
    data: result[STORAGE_KEYS.SETTINGS] || {}
  };
}

/**
 * Save user settings
 * @param {Object} settings - Settings to save
 * @returns {Promise<Object>} - Save result
 */
async function saveSettings(settings) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: settings
  });
  return { success: true };
}