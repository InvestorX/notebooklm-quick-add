/**
 * NotebookLM Quick Add - Popup Script
 * ポップアップUIの制御スクリプト（キュー機能対応）
 */

(function () {
  'use strict';

  // State
  let currentPageData = null;
  let youtubeData = null;
  let currentTab = 'add';

  // DOM Elements
  let els = {};

  /**
   * Initialize DOM element references
   * @returns {void}
   */
  function initElements() {
    els = {
      // States
      stateLoading: document.getElementById('state-loading'),
      stateError: document.getElementById('state-error'),
      stateSuccess: document.getElementById('state-success'),

      // Tabs
      tabAdd: document.getElementById('tab-add'),
      tabQueue: document.getElementById('tab-queue'),
      queueBadge: document.getElementById('queue-badge'),

      // Panels
      panelAdd: document.getElementById('panel-add'),
      panelQueue: document.getElementById('panel-queue'),

      // Add panel elements
      pageTypeBadge: document.getElementById('page-type-badge'),
      badgeIcon: document.getElementById('badge-icon'),
      badgeText: document.getElementById('badge-text'),
      pageTitle: document.getElementById('page-title'),
      pageUrl: document.getElementById('page-url'),
      playlistSection: document.getElementById('playlist-section'),
      playlistCount: document.getElementById('playlist-count'),
      notebookSelect: document.getElementById('notebook-select'),
      notebookHint: document.getElementById('notebook-hint'),
      refreshNotebooks: document.getElementById('refresh-notebooks'),
      addToQueueBtn: document.getElementById('add-to-queue-btn'),
      addNowBtn: document.getElementById('add-now-btn'),

      // Queue panel elements
      queueEmpty: document.getElementById('queue-empty'),
      queueList: document.getElementById('queue-list'),
      queueActions: document.getElementById('queue-actions'),
      processQueueBtn: document.getElementById('process-queue-btn'),
      clearQueueBtn: document.getElementById('clear-queue-btn'),

      // State elements
      errorMessage: document.getElementById('error-message'),
      successMessage: document.getElementById('success-message'),
      retryBtn: document.getElementById('retry-btn'),
      continueBtn: document.getElementById('continue-btn')
    };
  }

  /**
   * Show only the specified state/panel
   * @param {string} stateName - 表示する状態名
   * @returns {void}
   */
  function showState(stateName) {
    els.stateLoading.classList.add('hidden');
    els.stateError.classList.add('hidden');
    els.stateSuccess.classList.add('hidden');
    els.panelAdd.classList.add('hidden');
    els.panelQueue.classList.add('hidden');

    switch (stateName) {
      case 'loading':
        els.stateLoading.classList.remove('hidden');
        break;
      case 'add':
        els.panelAdd.classList.remove('hidden');
        break;
      case 'queue':
        els.panelQueue.classList.remove('hidden');
        break;
      case 'error':
        els.stateError.classList.remove('hidden');
        break;
      case 'success':
        els.stateSuccess.classList.remove('hidden');
        break;
    }
  }

  /**
   * Switch tab
   * @param {string} tabName - タブ名
   * @returns {void}
   */
  function switchTab(tabName) {
    currentTab = tabName;

    els.tabAdd.classList.toggle('active', tabName === 'add');
    els.tabQueue.classList.toggle('active', tabName === 'queue');

    if (tabName === 'add') {
      showState('add');
    } else {
      showState('queue');
      loadQueue();
    }
  }

  /**
   * Send message to background script
   * @param {Object} message - 送信するメッセージ
   * @returns {Promise<Object>}
   */
  function sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Message error:', chrome.runtime.lastError);
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { success: false, error: 'No response' });
        }
      });
    });
  }

  /**
   * Get badge configuration for page type
   * @param {string} type - ページタイプ
   * @returns {Object}
   */
  function getBadgeConfig(type) {
    const configs = {
      youtube_video: { icon: '▶️', text: 'YouTube動画', cls: 'youtube' },
      youtube_playlist: { icon: '📋', text: 'プレイリスト', cls: 'playlist' },
      youtube_video_in_playlist: { icon: '▶️', text: 'プレイリスト内動画', cls: 'playlist' },
      webpage: { icon: '🌐', text: 'ウェブページ', cls: 'webpage' },
      notebooklm: { icon: '📓', text: 'NotebookLM', cls: 'webpage' }
    };
    return configs[type] || configs.webpage;
  }

  /**
   * Update page information display
   * @returns {void}
   */
  function updatePageInfo() {
    const title = youtubeData?.title || currentPageData?.title || 'タイトル不明';
    const url = currentPageData?.url || '';
    const type = currentPageData?.type || 'webpage';

    els.pageTitle.textContent = title;
    els.pageUrl.textContent = url;

    const badge = getBadgeConfig(type);
    els.badgeIcon.textContent = badge.icon;
    els.badgeText.textContent = badge.text;
    els.pageTypeBadge.className = 'page-type-badge ' + badge.cls;
  }

  /**
   * Show playlist information
   * @param {Array} videos - 動画リスト
   * @returns {void}
   */
  function showPlaylistInfo(videos) {
    if (videos && videos.length > 0) {
      els.playlistSection.classList.remove('hidden');
      els.playlistCount.textContent = videos.length + '本の動画を追加';
    } else {
      els.playlistSection.classList.add('hidden');
    }
  }

  /**
   * Load notebooks into dropdown
   * キャッシュが新しければ再取得をスキップ
   * @returns {Promise<void>}
   */
  async function loadNotebooks() {
    const cachedResponse = await sendMessage({ action: 'GET_NOTEBOOKS' });

    els.notebookSelect.innerHTML = '<option value="">新しいノートブックを作成</option>';

    let hasCache = false;
    let cacheAge = Infinity;

    if (cachedResponse.success && cachedResponse.data && cachedResponse.data.length > 0) {
      hasCache = true;
      cacheAge = cachedResponse.cacheAge || 0; // ミリ秒

      cachedResponse.data.forEach(function (notebook) {
        const option = document.createElement('option');
        option.value = notebook.id;
        option.textContent = '📒 ' + notebook.name;
        els.notebookSelect.appendChild(option);
      });
      els.notebookHint.classList.add('hidden');
    } else {
      els.notebookHint.classList.remove('hidden');
    }

    // キャッシュが5分以内なら再取得をスキップ
    const CACHE_TTL = 5 * 60 * 1000; // 5分
    if (hasCache && cacheAge < CACHE_TTL) {
      console.log('Notebooks cache is fresh, skipping refresh');
      return;
    }

    // キャッシュが古い、または存在しない場合のみバックグラウンドで取得
    try {
      const refreshResponse = await sendMessage({ action: 'REFRESH_NOTEBOOKS' });
      if (refreshResponse.success && refreshResponse.data && refreshResponse.data.length > 0) {
        const currentValue = els.notebookSelect.value;
        els.notebookSelect.innerHTML = '<option value="">新しいノートブックを作成</option>';

        refreshResponse.data.forEach(function (notebook) {
          const option = document.createElement('option');
          option.value = notebook.id;
          option.textContent = '📒 ' + notebook.name;
          els.notebookSelect.appendChild(option);
        });

        if (currentValue) {
          els.notebookSelect.value = currentValue;
        }
        els.notebookHint.classList.add('hidden');
      }
    } catch (e) {
      console.warn('Failed to refresh notebooks:', e);
    }
  }

  /**
   * Load queue and display
   * @returns {Promise<void>}
   */
  async function loadQueue() {
    const response = await sendMessage({ action: 'GET_QUEUE' });

    if (!response.success) {
      console.error('Failed to get queue:', response.error);
      return;
    }

    const queue = response.data;
    const notebooks = Object.keys(queue);

    // Update badge
    if (response.totalCount > 0) {
      els.queueBadge.textContent = response.totalCount;
      els.queueBadge.classList.remove('hidden');
    } else {
      els.queueBadge.classList.add('hidden');
    }

    // Show empty or list
    if (notebooks.length === 0) {
      els.queueEmpty.classList.remove('hidden');
      els.queueList.classList.add('hidden');
      els.queueActions.classList.add('hidden');
      return;
    }

    els.queueEmpty.classList.add('hidden');
    els.queueList.classList.remove('hidden');
    els.queueActions.classList.remove('hidden');

    // Render queue
    let html = '';
    notebooks.forEach(function (notebookId) {
      const nb = queue[notebookId];
      const displayName = notebookId === '__new__' ? '📓 新しいノートブック' : '📒 ' + nb.notebookName;

      html += '<div class="queue-notebook" data-notebook-id="' + notebookId + '">';
      html += '<div class="queue-notebook-header">';
      html += '<span class="queue-notebook-name">' + displayName + '</span>';
      html += '<span class="queue-notebook-count">' + nb.items.length + '件</span>';
      html += '</div>';

      nb.items.forEach(function (item, index) {
        html += '<div class="queue-item" data-index="' + index + '">';
        html += '<div class="queue-item-info">';
        html += '<div class="queue-item-title">' + escapeHtml(item.title) + '</div>';
        html += '<div class="queue-item-url">' + escapeHtml(item.url) + '</div>';
        html += '</div>';
        html += '<button class="queue-item-remove" data-notebook-id="' + notebookId + '" data-url="' + escapeHtml(item.url) + '">×</button>';
        html += '</div>';
      });

      html += '</div>';
    });

    els.queueList.innerHTML = html;

    // Add remove button handlers
    els.queueList.querySelectorAll('.queue-item-remove').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const notebookId = this.getAttribute('data-notebook-id');
        const url = this.getAttribute('data-url');
        await sendMessage({ action: 'REMOVE_FROM_QUEUE', data: { notebookId, url } });
        await loadQueue();
      });
    });
  }

  /**
   * Escape HTML
   * @param {string} str - 文字列
   * @returns {string}
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Handle add to queue button click
   * プレイリストの場合は個別動画をすべて追加
   * @returns {Promise<void>}
   */
  async function handleAddToQueue() {
    els.addToQueueBtn.disabled = true;

    try {
      const selectedOption = els.notebookSelect.options[els.notebookSelect.selectedIndex];
      const notebookId = els.notebookSelect.value || null;
      const notebookName = selectedOption ? selectedOption.textContent.replace('📒 ', '') : '新しいノートブック';

      // プレイリストの場合は個別動画をすべて追加
      let itemsToAdd = [];
      if (youtubeData && youtubeData.playlistVideos && youtubeData.playlistVideos.length > 0) {
        youtubeData.playlistVideos.forEach(function (video) {
          itemsToAdd.push({
            url: video.url,
            title: video.title,
            type: 'youtube-video',
            notebookId: notebookId,
            notebookName: notebookName
          });
        });
      } else {
        itemsToAdd.push({
          url: currentPageData.url,
          title: currentPageData.title,
          type: currentPageData.type,
          notebookId: notebookId,
          notebookName: notebookName
        });
      }

      let addedCount = 0;
      let totalCount = 0;

      for (const item of itemsToAdd) {
        const response = await sendMessage({
          action: 'ADD_TO_QUEUE',
          data: item
        });
        if (response.success && response.added) {
          addedCount++;
        }
        totalCount = response.totalCount || totalCount;
      }

      if (addedCount > 0) {
        els.successMessage.textContent = itemsToAdd.length > 1
          ? addedCount + '本の動画をキューに追加しました！'
          : 'キューに追加しました！';
      } else {
        els.successMessage.textContent = '既にキューに追加されています';
      }
      showState('success');

      // Update badge
      if (totalCount > 0) {
        els.queueBadge.textContent = totalCount;
        els.queueBadge.classList.remove('hidden');
      }
    } catch (error) {
      els.errorMessage.textContent = error.message;
      showState('error');
    } finally {
      els.addToQueueBtn.disabled = false;
    }
  }

  /**
   * Handle add now button click (immediate add)
   * @returns {Promise<void>}
   */
  async function handleAddNow() {
    els.addNowBtn.disabled = true;
    els.addNowBtn.innerHTML = '<span class="spinner-small"></span>追加中...';

    try {
      const sourceData = {
        url: currentPageData.url,
        title: currentPageData.title
      };

      if (youtubeData) {
        sourceData.youtubeData = youtubeData;
        if (youtubeData.playlistVideos) {
          sourceData.playlistVideos = youtubeData.playlistVideos;
        }
      }

      const response = await sendMessage({
        action: 'ADD_TO_NOTEBOOKLM',
        data: {
          sourceType: currentPageData.type,
          sourceData: sourceData,
          notebookId: els.notebookSelect.value || null,
          backgroundMode: false
        }
      });

      if (response.success) {
        els.successMessage.textContent = 'NotebookLMに追加中...';
        showState('success');
        setTimeout(() => window.close(), 1500);
      } else {
        throw new Error(response.error || '追加に失敗しました');
      }
    } catch (error) {
      els.errorMessage.textContent = error.message;
      showState('error');
    }
  }

  /**
   * Handle process queue button click
   * @returns {Promise<void>}
   */
  async function handleProcessQueue() {
    els.processQueueBtn.disabled = true;
    els.processQueueBtn.innerHTML = '<span class="spinner-small"></span>処理中...';

    try {
      const response = await sendMessage({ action: 'PROCESS_QUEUE' });

      if (response.success) {
        els.successMessage.textContent = response.processedCount + '件を追加中...';
        showState('success');
        setTimeout(() => window.close(), 1500);
      } else {
        throw new Error(response.error || '処理に失敗しました');
      }
    } catch (error) {
      els.errorMessage.textContent = error.message;
      showState('error');
    }
  }

  /**
   * Handle clear queue button click
   * @returns {Promise<void>}
   */
  async function handleClearQueue() {
    if (!confirm('キューをすべてクリアしますか？')) return;

    await sendMessage({ action: 'CLEAR_QUEUE' });
    await loadQueue();
  }

  /**
   * Handle refresh notebooks button
   * 手動更新なのでキャッシュを無視して強制更新
   * @returns {Promise<void>}
   */
  async function handleRefresh() {
    els.refreshNotebooks.disabled = true;
    els.refreshNotebooks.textContent = '更新中...';

    try {
      const response = await sendMessage({ action: 'REFRESH_NOTEBOOKS' });

      if (response.success && response.data) {
        const currentValue = els.notebookSelect.value;
        els.notebookSelect.innerHTML = '<option value="">新しいノートブックを作成</option>';

        response.data.forEach(function (notebook) {
          const option = document.createElement('option');
          option.value = notebook.id;
          option.textContent = '📒 ' + notebook.name;
          els.notebookSelect.appendChild(option);
        });

        if (currentValue) {
          els.notebookSelect.value = currentValue;
        }

        els.notebookHint.classList.add('hidden');
        console.log('Notebooks refreshed:', response.data.length, 'items');
      } else {
        els.notebookHint.classList.remove('hidden');
      }
    } catch (e) {
      console.error('Refresh failed:', e);
    } finally {
      els.refreshNotebooks.disabled = false;
      els.refreshNotebooks.textContent = '↻ 更新';
    }
  }

  /**
   * Handle YouTube content extraction
   * @param {number} tabId - タブID
   * @returns {Promise<void>}
   */
  async function handleYouTubeContent(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content/youtube-detector.js']
      });

      await new Promise(function (resolve) { setTimeout(resolve, 500); });

      const response = await chrome.tabs.sendMessage(tabId, {
        action: 'EXTRACT_YOUTUBE_DATA'
      });

      if (response && response.success && response.data) {
        youtubeData = response.data;

        if (youtubeData.playlistVideos && youtubeData.playlistVideos.length > 0) {
          showPlaylistInfo(youtubeData.playlistVideos);
        }
      }
    } catch (error) {
      console.warn('YouTube extraction failed:', error);
    }
  }

  /**
   * Setup event listeners
   * @returns {void}
   */
  function setupEventListeners() {
    // Tabs
    els.tabAdd.addEventListener('click', () => switchTab('add'));
    els.tabQueue.addEventListener('click', () => switchTab('queue'));

    // Add panel buttons
    els.addToQueueBtn.addEventListener('click', handleAddToQueue);
    els.addNowBtn.addEventListener('click', handleAddNow);
    els.refreshNotebooks.addEventListener('click', handleRefresh);

    // Queue panel buttons
    els.processQueueBtn.addEventListener('click', handleProcessQueue);
    els.clearQueueBtn.addEventListener('click', handleClearQueue);

    // State buttons
    els.retryBtn.addEventListener('click', () => location.reload());
    els.continueBtn.addEventListener('click', () => switchTab('add'));
  }

  /**
   * Update queue badge on init
   * @returns {Promise<void>}
   */
  async function updateQueueBadge() {
    const response = await sendMessage({ action: 'GET_QUEUE' });
    if (response.success && response.totalCount > 0) {
      els.queueBadge.textContent = response.totalCount;
      els.queueBadge.classList.remove('hidden');
    }
  }

  /**
   * Main initialization
   * @returns {Promise<void>}
   */
  async function init() {
    initElements();
    showState('loading');

    try {
      // Get current tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];

      if (!tab || !tab.url) {
        throw new Error('タブ情報を取得できません');
      }

      // Get page info
      const response = await sendMessage({ action: 'GET_PAGE_INFO' });

      if (!response.success) {
        throw new Error(response.error || 'ページ情報の取得に失敗');
      }

      currentPageData = response.data;

      // Handle YouTube pages
      if (currentPageData.type && currentPageData.type.indexOf('youtube') === 0) {
        await handleYouTubeContent(tab.id);
      }

      // Load data
      await loadNotebooks();
      await updateQueueBadge();

      // Update UI
      updatePageInfo();
      setupEventListeners();

      // Show main content
      showState('add');

    } catch (error) {
      console.error('Init error:', error);
      els.errorMessage.textContent = error.message;
      showState('error');
    }
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();