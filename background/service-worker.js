/**
 * Background Service Worker
 * NotebookLM Quick Add 拡張機能のバックグラウンドスクリプト
 */

// Storage keys
var STORAGE_KEYS = {
  NOTEBOOKS: 'cached_notebooks',
  LAST_NOTEBOOK: 'last_used_notebook',
  SETTINGS: 'user_settings',
  URL_QUEUE: 'url_queue'
};

// Context menu IDs
var MENU_IDS = {
  ADD_TO_NOTEBOOKLM: 'add-to-notebooklm',
  ADD_TO_NOTEBOOK_PREFIX: 'add-to-notebook-'
};

/**
 * Initialize on install
 * @returns {Promise<void>}
 */
chrome.runtime.onInstalled.addListener(async function (details) {
  if (details.reason === 'install') {
    await chrome.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: {
        autoDetect: true,
        showNotifications: true
      }
    });
  }

  await createContextMenus();
  console.log('NotebookLM Quick Add: Initialized');
});

/**
 * Create context menus
 * @returns {Promise<void>}
 */
async function createContextMenus() {
  await chrome.contextMenus.removeAll();

  // 今すぐ追加メニュー
  chrome.contextMenus.create({
    id: MENU_IDS.ADD_TO_NOTEBOOKLM,
    title: 'NotebookLMに追加',
    contexts: ['page', 'link', 'video', 'selection']
  });

  chrome.contextMenus.create({
    id: 'separator-1',
    type: 'separator',
    parentId: MENU_IDS.ADD_TO_NOTEBOOKLM,
    contexts: ['page', 'link', 'video', 'selection']
  });

  chrome.contextMenus.create({
    id: MENU_IDS.ADD_TO_NOTEBOOK_PREFIX + 'new',
    title: '📓 新しいノートブックを作成',
    parentId: MENU_IDS.ADD_TO_NOTEBOOKLM,
    contexts: ['page', 'link', 'video', 'selection']
  });

  // キューに追加メニュー
  chrome.contextMenus.create({
    id: 'queue-parent',
    title: 'キューに追加',
    contexts: ['page', 'link', 'video', 'selection']
  });

  chrome.contextMenus.create({
    id: 'queue-add-new',
    title: '📓 新しいノートブック用',
    parentId: 'queue-parent',
    contexts: ['page', 'link', 'video', 'selection']
  });

  await updateNotebookMenuItems();
}

/**
 * Update notebook menu items
 * @returns {Promise<void>}
 */
async function updateNotebookMenuItems() {
  var result = await chrome.storage.local.get(STORAGE_KEYS.NOTEBOOKS);
  var notebooks = result[STORAGE_KEYS.NOTEBOOKS] || [];

  // Remove old items
  try { await chrome.contextMenus.remove('separator-notebooks'); } catch (e) { }
  try { await chrome.contextMenus.remove('queue-separator'); } catch (e) { }

  for (var i = 0; i < notebooks.length; i++) {
    try { await chrome.contextMenus.remove(MENU_IDS.ADD_TO_NOTEBOOK_PREFIX + notebooks[i].id); } catch (e) { }
    try { await chrome.contextMenus.remove('queue-add-' + notebooks[i].id); } catch (e) { }
  }

  // Add new items
  if (notebooks.length > 0) {
    // 今すぐ追加メニューにノートブック追加
    chrome.contextMenus.create({
      id: 'separator-notebooks',
      type: 'separator',
      parentId: MENU_IDS.ADD_TO_NOTEBOOKLM,
      contexts: ['page', 'link', 'video', 'selection']
    });

    // キューメニューにセパレータ追加
    chrome.contextMenus.create({
      id: 'queue-separator',
      type: 'separator',
      parentId: 'queue-parent',
      contexts: ['page', 'link', 'video', 'selection']
    });

    for (var j = 0; j < notebooks.length; j++) {
      // 今すぐ追加メニュー
      chrome.contextMenus.create({
        id: MENU_IDS.ADD_TO_NOTEBOOK_PREFIX + notebooks[j].id,
        title: '📒 ' + notebooks[j].name,
        parentId: MENU_IDS.ADD_TO_NOTEBOOKLM,
        contexts: ['page', 'link', 'video', 'selection']
      });

      // キューに追加メニュー
      chrome.contextMenus.create({
        id: 'queue-add-' + notebooks[j].id,
        title: '📒 ' + notebooks[j].name,
        parentId: 'queue-parent',
        contexts: ['page', 'link', 'video', 'selection']
      });
    }
  }
}

/**
 * Context menu click handler
 * @param {Object} info - クリック情報
 * @param {Object} tab - タブ情報
 * @returns {Promise<void>}
 */
chrome.contextMenus.onClicked.addListener(async function (info, tab) {
  var menuItemId = String(info.menuItemId);
  var targetUrl = info.linkUrl || info.pageUrl || (tab && tab.url);
  var targetTitle = (tab && tab.title) || 'Untitled';

  if (!targetUrl) return;

  // キューに追加メニューの処理
  if (menuItemId === 'queue-add-new') {
    await handleQueueAdd(targetUrl, targetTitle, null, null);
    return;
  }
  if (menuItemId.indexOf('queue-add-') === 0) {
    var queueNotebookId = menuItemId.replace('queue-add-', '');
    var notebooks = (await chrome.storage.local.get(STORAGE_KEYS.NOTEBOOKS))[STORAGE_KEYS.NOTEBOOKS] || [];
    var notebook = notebooks.find(function (n) { return n.id === queueNotebookId; });
    await handleQueueAdd(targetUrl, targetTitle, queueNotebookId, notebook ? notebook.name : null);
    return;
  }

  // 今すぐ追加メニューの処理
  var notebookId = null;
  if (menuItemId === MENU_IDS.ADD_TO_NOTEBOOK_PREFIX + 'new') {
    notebookId = null;
  } else if (menuItemId.indexOf(MENU_IDS.ADD_TO_NOTEBOOK_PREFIX) === 0) {
    notebookId = menuItemId.replace(MENU_IDS.ADD_TO_NOTEBOOK_PREFIX, '');
  }

  await handleContextMenuAdd(targetUrl, targetTitle, notebookId, tab);
});

/**
 * Handle queue add from context menu
 * @param {string} url - URL
 * @param {string} title - タイトル
 * @param {string|null} notebookId - ノートブックID
 * @param {string|null} notebookName - ノートブック名
 * @returns {Promise<void>}
 */
async function handleQueueAdd(url, title, notebookId, notebookName) {
  try {
    var pageType = detectPageType(url);
    var result = await addToQueue({
      url: url,
      title: title,
      type: pageType,
      notebookId: notebookId,
      notebookName: notebookName || '新しいノートブック'
    });

    if (result.success) {
      await showBadgeNotification('+Q', '#ff6b9d');
    }
  } catch (error) {
    console.error('Queue add failed:', error);
    await showBadgeNotification('✗', '#ea4335');
  }
}

/**
 * Handle context menu add
 * @param {string} url - 追加するURL
 * @param {string} title - ページタイトル
 * @param {string|null} notebookId - ノートブックID
 * @param {Object} tab - タブオブジェクト
 * @returns {Promise<void>}
 */
async function handleContextMenuAdd(url, title, notebookId, tab) {
  try {
    var pageType = detectPageType(url);
    var sourceData = { url: url, title: title, type: pageType };

    // Get YouTube data if applicable
    if (pageType.indexOf('youtube') === 0 && tab && tab.id) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/youtube-detector.js']
        });

        await new Promise(function (r) { setTimeout(r, 300); });

        var response = await chrome.tabs.sendMessage(tab.id, {
          action: 'EXTRACT_YOUTUBE_DATA'
        });

        if (response && response.success && response.data) {
          sourceData.youtubeData = response.data;
          if (response.data.playlistVideos && response.data.playlistVideos.length > 0) {
            sourceData.playlistVideos = response.data.playlistVideos;
          }
        }
      } catch (e) {
        console.warn('YouTube extraction failed:', e);
      }
    }

    if (notebookId) {
      await chrome.storage.local.set({
        [STORAGE_KEYS.LAST_NOTEBOOK]: notebookId
      });
    }

    await addToNotebookLM({
      sourceType: pageType,
      sourceData: sourceData,
      notebookId: notebookId
    });

    await showBadgeNotification('✓', '#34a853');

  } catch (error) {
    console.error('Context menu add failed:', error);
    await showBadgeNotification('✗', '#ea4335');
  }
}

/**
 * Show badge notification
 * @param {string} text - バッジテキスト
 * @param {string} color - 背景色
 * @returns {Promise<void>}
 */
async function showBadgeNotification(text, color) {
  await chrome.action.setBadgeText({ text: text });
  await chrome.action.setBadgeBackgroundColor({ color: color });
  setTimeout(async function () {
    await chrome.action.setBadgeText({ text: '' });
  }, 3000);
}

/**
 * Message handler
 * @param {Object} message - メッセージオブジェクト
 * @param {Object} sender - 送信者情報
 * @param {Function} sendResponse - レスポンス関数
 * @returns {boolean}
 */
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(function (error) {
      console.error('Message handling error:', error);
      sendResponse({ success: false, error: error.message });
    });
  return true;
});

/**
 * Process messages
 * @param {Object} message - メッセージオブジェクト
 * @param {Object} sender - 送信者情報
 * @returns {Promise<Object>}
 */
async function handleMessage(message, sender) {
  var action = message.action;
  var data = message.data;

  switch (action) {
    case 'GET_PAGE_INFO':
      return await getPageInfoFromActiveTab();

    case 'ADD_TO_NOTEBOOKLM':
      return await addToNotebookLM(data);

    case 'GET_NOTEBOOKS':
      return await getCachedNotebooks();

    case 'SAVE_NOTEBOOKS':
      await saveNotebooks(data);
      await updateNotebookMenuItems();
      return { success: true };

    case 'REFRESH_NOTEBOOKS':
      return await refreshNotebooksFromPage();

    case 'GET_SETTINGS':
      return await getSettings();

    case 'SAVE_SETTINGS':
      return await saveSettings(data);

    case 'SOURCES_ADDED':
      console.log('Sources added:', data);
      if (data && data.successCount > 0) {
        await showBadgeNotification('✓', '#34a853');
      }
      return { success: true };

    case 'UPDATE_CONTEXT_MENU':
      await updateNotebookMenuItems();
      return { success: true };

    // キュー管理
    case 'ADD_TO_QUEUE':
      return await addToQueue(data);

    case 'GET_QUEUE':
      return await getQueue();

    case 'REMOVE_FROM_QUEUE':
      return await removeFromQueue(data);

    case 'CLEAR_QUEUE':
      return await clearQueue(data);

    case 'PROCESS_QUEUE':
      return await processQueue(data);

    default:
      console.log('Unknown action (ignored):', action);
      return { success: true };
  }
}

/**
 * Get active tab
 * @returns {Promise<Object>} - アクティブなタブ
 */
async function getActiveTab() {
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

/**
 * Get page info from active tab
 * @returns {Promise<Object>} - ページ情報
 */
async function getPageInfoFromActiveTab() {
  var tab = await getActiveTab();

  if (!tab || !tab.url) {
    throw new Error('アクティブなタブが見つかりません');
  }

  return {
    success: true,
    data: {
      url: tab.url,
      title: tab.title || 'Untitled',
      type: detectPageType(tab.url)
    }
  };
}

/**
 * Detect page type
 * @param {string} url - URL
 * @returns {string} - ページタイプ
 */
function detectPageType(url) {
  if (!url) return 'unknown';

  if (url.indexOf('youtube.com/playlist') !== -1) {
    return 'youtube_playlist';
  }
  if (url.indexOf('youtube.com/watch') !== -1 && url.indexOf('list=') !== -1) {
    return 'youtube_video_in_playlist';
  }
  if (url.indexOf('youtube.com/watch') !== -1) {
    return 'youtube_video';
  }
  if (url.indexOf('notebooklm.google.com') !== -1) {
    return 'notebooklm';
  }
  return 'webpage';
}

/**
 * Add to NotebookLM
 * バックグラウンドでソースを追加（画面遷移を最小化）
 * @param {Object} data - ソースデータ
 * @returns {Promise<Object>}
 */
async function addToNotebookLM(data) {
  var sourceType = data.sourceType;
  var sourceData = data.sourceData;
  var notebookId = data.notebookId;
  var backgroundMode = data.backgroundMode !== false; // デフォルトはバックグラウンドモード

  var sourcesToAdd = [];

  // Handle playlists
  if ((sourceType === 'youtube_playlist' || sourceType === 'youtube_video_in_playlist') &&
    sourceData.playlistVideos && sourceData.playlistVideos.length > 0) {
    for (var i = 0; i < sourceData.playlistVideos.length; i++) {
      var video = sourceData.playlistVideos[i];
      sourcesToAdd.push({
        type: 'youtube_video',
        url: video.url,
        title: video.title,
        videoId: video.id
      });
    }
  } else {
    sourcesToAdd.push({
      type: sourceType,
      url: sourceData.url,
      title: sourceData.title
    });
  }

  // Store pending sources
  await chrome.storage.local.set({
    pending_sources: {
      sources: sourcesToAdd,
      notebookId: notebookId,
      timestamp: Date.now()
    }
  });

  // Determine notebook URL
  var notebookUrl = notebookId
    ? 'https://notebooklm.google.com/notebook/' + notebookId
    : 'https://notebooklm.google.com/';

  var tabs = await chrome.tabs.query({ url: 'https://notebooklm.google.com/*' });

  if (tabs.length > 0) {
    var targetTab = tabs[0];

    // バックグラウンドモード: タブをアクティブにしない
    if (!backgroundMode) {
      await chrome.tabs.update(targetTab.id, { active: true });
    }

    // 必要に応じてURLを更新
    if (notebookId && targetTab.url.indexOf(notebookId) === -1) {
      await chrome.tabs.update(targetTab.id, { url: notebookUrl });
    }

    try {
      await chrome.tabs.sendMessage(targetTab.id, { action: 'ADD_PENDING_SOURCES' });
    } catch (e) {
      // Content script will check on load
    }
  } else {
    // 新規タブを作成（バックグラウンドモードでは非アクティブで作成）
    await chrome.tabs.create({
      url: notebookUrl,
      active: !backgroundMode // バックグラウンドモードでは非アクティブ
    });
  }

  return { success: true, sourcesCount: sourcesToAdd.length, backgroundMode: backgroundMode };
}

/**
 * Get cached notebooks
 * @returns {Promise<Object>}
 */
async function getCachedNotebooks() {
  var result = await chrome.storage.local.get([STORAGE_KEYS.NOTEBOOKS, 'notebooks_timestamp']);
  var notebooks = result[STORAGE_KEYS.NOTEBOOKS] || [];
  var timestamp = result.notebooks_timestamp || 0;
  var cacheAge = Date.now() - timestamp;

  return {
    success: true,
    data: notebooks,
    cacheAge: cacheAge // ミリ秒
  };
}

/**
 * Save notebooks
 * @param {Array} notebooks - ノートブック配列
 * @returns {Promise<void>}
 */
async function saveNotebooks(notebooks) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.NOTEBOOKS]: notebooks,
    notebooks_timestamp: Date.now()
  });
}

/**
 * Refresh notebooks from page
 * @returns {Promise<Object>}
 */
async function refreshNotebooksFromPage() {
  try {
    var tabs = await chrome.tabs.query({ url: 'https://notebooklm.google.com/*' });

    if (tabs.length === 0) {
      return { success: false, error: 'NotebookLMを開いてください' };
    }

    var response = await chrome.tabs.sendMessage(tabs[0].id, {
      action: 'GET_NOTEBOOKS'
    });

    if (response && response.success && response.data) {
      await saveNotebooks(response.data);
      await updateNotebookMenuItems();
      return { success: true, data: response.data };
    }

    return { success: false, error: 'ノートブックを取得できませんでした' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get settings
 * @returns {Promise<Object>}
 */
async function getSettings() {
  var result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return {
    success: true,
    data: result[STORAGE_KEYS.SETTINGS] || {}
  };
}

/**
 * Save settings
 * @param {Object} settings - 設定オブジェクト
 * @returns {Promise<Object>}
 */
async function saveSettings(settings) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: settings
  });
  return { success: true };
}

// ============================================
// キュー管理関数
// ============================================

/**
 * キューにURLを追加
 * @param {Object} data - {url, title, type, notebookId, notebookName}
 * @returns {Promise<Object>}
 */
async function addToQueue(data) {
  try {
    var result = await chrome.storage.local.get(STORAGE_KEYS.URL_QUEUE);
    var queue = result[STORAGE_KEYS.URL_QUEUE] || {};

    var notebookId = data.notebookId || '__new__';
    var notebookName = data.notebookName || '新しいノートブック';

    if (!queue[notebookId]) {
      queue[notebookId] = {
        notebookName: notebookName,
        items: []
      };
    }

    // 重複チェック
    var exists = queue[notebookId].items.some(function (item) {
      return item.url === data.url;
    });

    if (!exists) {
      queue[notebookId].items.push({
        url: data.url,
        title: data.title,
        type: data.type || 'webpage',
        addedAt: Date.now()
      });
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.URL_QUEUE]: queue });

    // バッジ表示（キュー内のアイテム数）
    var totalCount = Object.values(queue).reduce(function (sum, nb) {
      return sum + nb.items.length;
    }, 0);
    if (totalCount > 0) {
      await chrome.action.setBadgeText({ text: String(totalCount) });
      await chrome.action.setBadgeBackgroundColor({ color: '#ff6b9d' });
    }

    return { success: true, added: !exists, totalCount: totalCount };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * キューを取得
 * @returns {Promise<Object>}
 */
async function getQueue() {
  try {
    var result = await chrome.storage.local.get(STORAGE_KEYS.URL_QUEUE);
    var queue = result[STORAGE_KEYS.URL_QUEUE] || {};

    var totalCount = Object.values(queue).reduce(function (sum, nb) {
      return sum + nb.items.length;
    }, 0);

    return { success: true, data: queue, totalCount: totalCount };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * キューからURLを削除
 * @param {Object} data - {notebookId, url} または {notebookId, index}
 * @returns {Promise<Object>}
 */
async function removeFromQueue(data) {
  try {
    var result = await chrome.storage.local.get(STORAGE_KEYS.URL_QUEUE);
    var queue = result[STORAGE_KEYS.URL_QUEUE] || {};
    var notebookId = data.notebookId || '__new__';

    if (queue[notebookId]) {
      if (data.url) {
        queue[notebookId].items = queue[notebookId].items.filter(function (item) {
          return item.url !== data.url;
        });
      } else if (typeof data.index === 'number') {
        queue[notebookId].items.splice(data.index, 1);
      }

      // アイテムがなくなったらノートブックエントリも削除
      if (queue[notebookId].items.length === 0) {
        delete queue[notebookId];
      }
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.URL_QUEUE]: queue });

    // バッジ更新
    var totalCount = Object.values(queue).reduce(function (sum, nb) {
      return sum + nb.items.length;
    }, 0);
    if (totalCount > 0) {
      await chrome.action.setBadgeText({ text: String(totalCount) });
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }

    return { success: true, totalCount: totalCount };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * キューをクリア
 * @param {Object} data - {notebookId} (省略時は全クリア)
 * @returns {Promise<Object>}
 */
async function clearQueue(data) {
  try {
    if (data && data.notebookId) {
      var result = await chrome.storage.local.get(STORAGE_KEYS.URL_QUEUE);
      var queue = result[STORAGE_KEYS.URL_QUEUE] || {};
      delete queue[data.notebookId];
      await chrome.storage.local.set({ [STORAGE_KEYS.URL_QUEUE]: queue });
    } else {
      await chrome.storage.local.set({ [STORAGE_KEYS.URL_QUEUE]: {} });
    }

    await chrome.action.setBadgeText({ text: '' });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * キューを処理（NotebookLMに追加）
 * @param {Object} data - {notebookId} (省略時は全処理)
 * @returns {Promise<Object>}
 */
async function processQueue(data) {
  try {
    var result = await chrome.storage.local.get(STORAGE_KEYS.URL_QUEUE);
    var queue = result[STORAGE_KEYS.URL_QUEUE] || {};

    var notebookIds = data && data.notebookId
      ? [data.notebookId]
      : Object.keys(queue);

    if (notebookIds.length === 0) {
      return { success: false, error: 'キューが空です' };
    }

    // 最初のノートブックから処理開始
    var firstNotebookId = notebookIds[0];
    var items = queue[firstNotebookId] ? queue[firstNotebookId].items : [];

    if (items.length === 0) {
      return { success: false, error: 'キューが空です' };
    }

    // pending_sourcesにセット
    var sourcesToAdd = items.map(function (item) {
      return {
        type: item.type,
        url: item.url,
        title: item.title
      };
    });

    await chrome.storage.local.set({
      pending_sources: {
        sources: sourcesToAdd,
        notebookId: firstNotebookId === '__new__' ? null : firstNotebookId,
        timestamp: Date.now()
      }
    });

    // キューから削除
    delete queue[firstNotebookId];
    await chrome.storage.local.set({ [STORAGE_KEYS.URL_QUEUE]: queue });

    // バッジ更新
    var remainingCount = Object.values(queue).reduce(function (sum, nb) {
      return sum + nb.items.length;
    }, 0);
    if (remainingCount > 0) {
      await chrome.action.setBadgeText({ text: String(remainingCount) });
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }

    // NotebookLMを開く/フォーカス
    var notebookUrl = firstNotebookId === '__new__'
      ? 'https://notebooklm.google.com/'
      : 'https://notebooklm.google.com/notebook/' + firstNotebookId;

    var tabs = await chrome.tabs.query({ url: 'https://notebooklm.google.com/*' });

    if (tabs.length > 0) {
      await chrome.tabs.update(tabs[0].id, { active: true, url: notebookUrl });
      try {
        await chrome.tabs.sendMessage(tabs[0].id, { action: 'ADD_PENDING_SOURCES' });
      } catch (e) { }
    } else {
      await chrome.tabs.create({ url: notebookUrl, active: true });
    }

    return {
      success: true,
      processedCount: sourcesToAdd.length,
      remainingNotebooks: Object.keys(queue).length,
      remainingItems: remainingCount
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}