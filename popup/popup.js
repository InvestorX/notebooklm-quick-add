/**
 * NotebookLM Quick Add - Popup Script
 */

(function() {
  'use strict';

  // State
  let currentPageData = null;
  let youtubeData = null;

  // DOM Elements (initialized after DOMContentLoaded)
  let els = {};

  /**
   * Initialize DOM element references
   */
  function initElements() {
    els = {
      stateLoading: document.getElementById('state-loading'),
      stateMain: document.getElementById('state-main'),
      stateError: document. getElementById('state-error'),
      stateSuccess: document.getElementById('state-success'),
      pageTypeBadge: document.getElementById('page-type-badge'),
      badgeIcon: document.getElementById('badge-icon'),
      badgeText: document.getElementById('badge-text'),
      pageTitle: document.getElementById('page-title'),
      pageUrl: document. getElementById('page-url'),
      playlistSection: document.getElementById('playlist-section'),
      playlistCount: document.getElementById('playlist-count'),
      notebookSelect: document.getElementById('notebook-select'),
      notebookHint: document.getElementById('notebook-hint'),
      refreshNotebooks: document.getElementById('refresh-notebooks'),
      addBtn: document.getElementById('add-btn'),
      retryBtn: document. getElementById('retry-btn'),
      openNotebookBtn: document. getElementById('open-notebook-btn'),
      errorMessage: document.getElementById('error-message'),
      successMessage: document.getElementById('success-message')
    };
  }

  /**
   * Show only the specified state, hide all others
   */
  function showState(stateName) {
    // Hide all states first
    els.stateLoading.className = 'loading hidden';
    els.stateMain.className = 'hidden';
    els.  stateError.className = 'state-container error-state hidden';
    els.stateSuccess.  className = 'state-container success-state hidden';

    // Show the requested state
    switch (stateName) {
      case 'loading':
        els. stateLoading.className = 'loading';
        break;
      case 'main':
        els.stateMain. className = '';
        break;
      case 'error':
        els.stateError.className = 'state-container error-state';
        break;
      case 'success':
        els.stateSuccess.className = 'state-container success-state';
        break;
    }
  }

  /**
   * Send message to background script
   */
  function sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime. sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Message error:', chrome.runtime.  lastError);
          resolve({ success: false, error: chrome. runtime.lastError.message });
        } else {
          resolve(response || { success: false, error: 'No response' });
        }
      });
    });
  }

  /**
   * Get badge configuration for page type
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
   */
  function updatePageInfo() {
    const title = youtubeData?.title || currentPageData?.title || 'タイトル不明';
    const url = currentPageData?.url || '';
    const type = currentPageData?.type || 'webpage';

    els.pageTitle.textContent = title;
    els.pageUrl.textContent = url;

    const badge = getBadgeConfig(type);
    els.badgeIcon.textContent = badge.  icon;
    els.badgeText.  textContent = badge.text;
    els.pageTypeBadge. className = 'page-type-badge ' + badge.cls;
  }

  /**
   * Show playlist information
   */
  function showPlaylistInfo(videos) {
    if (videos && videos.length > 0) {
      els.playlistSection.className = 'section';
      els.playlistCount. textContent = videos.length + '本の動画を追加';
    } else {
      els.playlistSection.  className = 'section hidden';
    }
  }

  /**
   * Load notebooks into dropdown
   */
  async function loadNotebooks() {
    const response = await sendMessage({ action: 'GET_NOTEBOOKS' });

    els.notebookSelect.innerHTML = '<option value="">新しいノートブックを作成</option>';

    if (response.success && response.data && response.data.length > 0) {
      response.data.forEach(function(notebook) {
        const option = document.createElement('option');
        option.value = notebook.id;
        option.textContent = '📒 ' + notebook.name;
        els.notebookSelect.appendChild(option);
      });
      els.notebookHint.className = 'hint hidden';
    } else {
      els.notebookHint.className = 'hint';
    }
  }

  /**
   * Handle YouTube content extraction
   */
  async function handleYouTubeContent(tabId) {
    try {
      // Inject content script
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content/youtube-detector.js']
      });

      // Wait for script to initialize
      await new Promise(function(resolve) { setTimeout(resolve, 500); });

      // Extract data
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
   * Handle add button click
   */
  async function handleAdd() {
    els.addBtn.disabled = true;
    els.addBtn.innerHTML = '<span class="spinner-small"></span>追加中... ';

    try {
      const sourceData = {
        url: currentPageData.url,
        title: currentPageData.title
      };

      if (youtubeData) {
        sourceData.youtubeData = youtubeData;
        if (youtubeData.playlistVideos) {
          sourceData.playlistVideos = youtubeData. playlistVideos;
        }
      }

      const response = await sendMessage({
        action: 'ADD_TO_NOTEBOOKLM',
        data: {
          sourceType: currentPageData.  type,
          sourceData: sourceData,
          notebookId: els.notebookSelect.value || null
        }
      });

      if (response.success) {
        const count = response.sourcesCount || 1;
        els.successMessage.textContent = count > 1 
          ? count + '件のソースを追加中...'
          : 'NotebookLMに追加中...';
        showState('success');
      } else {
        throw new Error(response.error || '追加に失敗しました');
      }
    } catch (error) {
      els.errorMessage.textContent = error.message;
      showState('error');
    }
  }

  /**
   * Handle refresh notebooks button
   */
  async function handleRefresh() {
    els.refreshNotebooks.disabled = true;
    els.  refreshNotebooks.textContent = '... ';

    try {
      const response = await sendMessage({ action: 'REFRESH_NOTEBOOKS' });
      if (response.success && response.data) {
        await loadNotebooks();
      }
    } catch (e) {
      console.error('Refresh failed:', e);
    } finally {
      els.refreshNotebooks. disabled = false;
      els. refreshNotebooks.textContent = '↻';
    }
  }

  /**
   * Setup event listeners
   */
  function setupEventListeners() {
    els.addBtn.addEventListener('click', handleAdd);
    els.refreshNotebooks.addEventListener('click', handleRefresh);
    els.retryBtn.addEventListener('click', function() {
      location.reload();
    });
    els.openNotebookBtn. addEventListener('click', function() {
      chrome.tabs.create({ url: 'https://notebooklm.google.com/' });
      window.close();
    });
  }

  /**
   * Main initialization
   */
  async function init() {
    initElements();
    showState('loading');

    try {
      // Get current tab
      const tabs = await chrome.tabs.  query({ active: true, currentWindow: true });
      const tab = tabs[0];

      if (! tab || !  tab.url) {
        throw new Error('タブ情報を取得できません');
      }

      // Get page info from background
      const response = await sendMessage({ action: 'GET_PAGE_INFO' });

      if (!  response.success) {
        throw new Error(response.error || 'ページ情報の取得に失敗');
      }

      currentPageData = response.data;

      // Handle YouTube pages
      if (currentPageData. type && currentPageData.type. indexOf('youtube') === 0) {
        await handleYouTubeContent(tab.id);
      }

      // Load notebooks
      await loadNotebooks();

      // Update UI
      updatePageInfo();
      setupEventListeners();

      // Show main content
      showState('main');

    } catch (error) {
      console.  error('Init error:', error);
      els.errorMessage.textContent = error.message;
      showState('error');
    }
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document. addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
