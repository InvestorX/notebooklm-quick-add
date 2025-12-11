/**
 * NotebookLM Bridge Content Script
 * NotebookLMページでソース追加を自動化するスクリプト
 */

(function () {
  'use strict';

  if (window.__notebookLMBridge) return;
  window.__notebookLMBridge = true;

  var isProcessing = false;
  var DEBUG = true; // デバッグモード

  /**
   * デバッグログを出力
   * @param {...any} args - ログ引数
   * @returns {void}
   */
  function log(...args) {
    if (DEBUG) console.log('[NLM-Bridge]', ...args);
  }

  /**
   * スリープ関数
   * @param {number} ms - ミリ秒
   * @returns {Promise<void>}
   */
  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  /**
   * 条件が満たされるまでポーリング待機
   * @param {Function} condition - 条件関数（trueを返したら終了）
   * @param {number} maxMs - 最大待機時間（ミリ秒）
   * @param {number} intervalMs - ポーリング間隔（ミリ秒）
   * @returns {Promise<boolean>} - 条件が満たされたらtrue
   */
  async function waitForCondition(condition, maxMs, intervalMs) {
    maxMs = maxMs || 3000;
    intervalMs = intervalMs || 100;
    var elapsed = 0;
    while (elapsed < maxMs) {
      if (condition()) return true;
      await sleep(intervalMs);
      elapsed += intervalMs;
    }
    return condition(); // 最後にもう一度チェック
  }

  /**
   * 要素が出現するまで待機
   * @param {Function} finder - 要素を探す関数
   * @param {number} maxMs - 最大待機時間（ミリ秒）
   * @returns {Promise<Element|null>}
   */
  async function waitForElement(finder, maxMs) {
    maxMs = maxMs || 3000;
    var el = null;
    await waitForCondition(function () {
      el = finder();
      return !!el;
    }, maxMs, 100);
    return el;
  }

  /**
   * 要素が有効（disabled=false）になるまで待機
   * @param {Function} finder - 要素を探す関数
   * @param {number} maxMs - 最大待機時間（ミリ秒）
   * @returns {Promise<Element|null>}
   */
  async function waitForEnabled(finder, maxMs) {
    maxMs = maxMs || 5000;
    var el = null;
    await waitForCondition(function () {
      el = finder();
      if (!el) return false;
      return !el.disabled && el.getAttribute('aria-disabled') !== 'true';
    }, maxMs, 100);
    return el;
  }

  /**
   * 要素をクリック
   * @param {Element} el - 対象要素
   * @returns {boolean}
   */
  function simulateClick(el) {
    if (!el) return false;
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { }
    ['mousedown', 'mouseup', 'click'].forEach(function (t) {
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window, composed: true }));
    });
    return true;
  }

  /**
   * Shadow DOMを含む深い要素検索
   * @param {string} selector - CSSセレクター
   * @param {Element|Document} root - ルート要素
   * @returns {Array<Element>}
   */
  function querySelectorAllDeep(selector, root) {
    root = root || document;
    var results = [];

    try {
      var nodes = root.querySelectorAll(selector);
      for (var i = 0; i < nodes.length; i++) results.push(nodes[i]);
    } catch (e) { }

    if (document.createTreeWalker) {
      var walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT,
        { acceptNode: function (node) { return node.shadowRoot ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP; } }
      );

      while (walker.nextNode()) {
        results = results.concat(querySelectorAllDeep(selector, walker.currentNode.shadowRoot));
      }
    }

    return results;
  }

  /**
   * 全てのボタンを深く取得
   * @returns {Array<Element>}
   */
  function getAllButtonsDeep() {
    return querySelectorAllDeep('button, [role="button"], [role="menuitem"]');
  }

  /**
   * 全ての入力フィールドを深く取得
   * @returns {Array<Element>}
   */
  function getAllInputsDeep() {
    return querySelectorAllDeep('input, textarea');
  }

  /**
   * 入力フィールドにテキストを入力（execCommand対応版）
   * @param {Element} input - 入力要素
   * @param {string} text - 入力テキスト
   * @returns {Promise<boolean>}
   */
  async function simulateTyping(input, text) {
    if (!input) return false;

    try {
      input.focus();
      input.click();
    } catch (e) { }

    // 方法0: execCommand insertText（最も効果的）
    try {
      input.focus();
      input.select();

      // 既存のテキストをクリア
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);

      // テキストを挿入
      if (document.execCommand('insertText', false, text)) {
        log('simulateTyping: execCommand insertText succeeded');
        await sleep(100);
        if (input.value && input.value.length > 0) {
          log('Input value after execCommand:', input.value.substring(0, 50) + '...');
          return true;
        }
      }
    } catch (e) {
      log('execCommand failed:', e);
    }

    // 方法1: ネイティブセッター + イベント発火
    try {
      var proto = input.tagName.toLowerCase() === 'textarea'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      var nativeInputValueSetter = Object.getOwnPropertyDescriptor(proto, "value").set;

      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(input, text);
      } else {
        input.value = text;
      }

      // 複数のイベントを発火
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true }));
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: text }));

      await sleep(100);
      if (input.value && input.value.length > 0) {
        log('Input value after native setter:', input.value.substring(0, 50) + '...');
        // Angular/Reactが検知しているかチェック（UIに表示されているか）
        return true;
      }
    } catch (e) {
      log('Native setter failed:', e);
    }

    log('Final input value:', input.value ? input.value.substring(0, 50) + '...' : '(empty)');
    return input.value && input.value.length > 0;
  }

  /**
   * ノートブック内にいるかチェック
   * @returns {boolean}
   */
  function isInsideNotebook() {
    return location.href.indexOf('/notebook/') !== -1;
  }

  /**
   * プロジェクトカードを取得
   * @returns {HTMLCollection}
   */
  function getProjectCards() {
    return document.getElementsByClassName('project-button-card');
  }

  /**
   * カードからノートブックIDを抽出
   * @param {Element} card - カード要素
   * @returns {string|null}
   */
  function getNotebookIdFromCard(card) {
    // Method 1: aria-labelledby属性から取得
    var btn = card.querySelector('button[aria-labelledby]');
    if (btn) {
      var labelledBy = btn.getAttribute('aria-labelledby') || '';
      var match = labelledBy.match(/project-([a-f0-9-]+)-/i);
      if (match && match[1]) {
        log('Found notebook ID from aria-labelledby:', match[1]);
        return match[1];
      }
    }

    // Method 2: id属性から検索
    var allElements = card.querySelectorAll('[id*="project-"]');
    for (var i = 0; i < allElements.length; i++) {
      var id = allElements[i].getAttribute('id') || '';
      var match2 = id.match(/project-([a-f0-9-]+)/i);
      if (match2 && match2[1]) {
        log('Found notebook ID from id:', match2[1]);
        return match2[1];
      }
    }

    // Method 3: data属性からの検索
    var dataElements = card.querySelectorAll('[data-notebook-id], [data-project-id]');
    for (var j = 0; j < dataElements.length; j++) {
      var notebookId = dataElements[j].getAttribute('data-notebook-id') || dataElements[j].getAttribute('data-project-id');
      if (notebookId) {
        log('Found notebook ID from data attribute:', notebookId);
        return notebookId;
      }
    }

    // Method 4: href属性から検索
    var links = card.querySelectorAll('a[href*="/notebook/"]');
    for (var k = 0; k < links.length; k++) {
      var href = links[k].getAttribute('href') || '';
      var match3 = href.match(/\/notebook\/([a-f0-9-]+)/i);
      if (match3 && match3[1]) {
        log('Found notebook ID from href:', match3[1]);
        return match3[1];
      }
    }

    // Method 5: innerHTML検索
    var html = card.innerHTML;
    var match4 = html.match(/project-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    if (match4 && match4[1]) {
      log('Found notebook ID from innerHTML:', match4[1]);
      return match4[1];
    }

    // Method 6: notebook URLパターン検索
    var match5 = html.match(/notebook\/([a-f0-9-]{36})/i);
    if (match5 && match5[1]) {
      log('Found notebook ID from notebook URL pattern:', match5[1]);
      return match5[1];
    }

    return null;
  }

  /**
   * タイトルを抽出
   * @param {string} text - テキスト
   * @returns {string|null}
   */
  function extractTitle(text) {
    if (!text) return null;
    var t = text.trim().replace(/more_vert/g, '').trim();
    t = t.replace(/^(public|lock|person|group)\s*/i, '');
    var m = t.match(/^(. +?)\s+\d{4}\/\d{2}\/\d{2}/);
    if (m && m[1]) return m[1].trim();
    var p = t.split('·');
    if (p[0]) return p[0].replace(/\s*\d{4}\/\d{2}\/\d{2}\s*$/, '').trim();
    return t.substring(0, 80);
  }

  /**
   * マイノートブックタブをクリック
   * @returns {Promise<boolean>}
   */
  async function clickMyNotebooksTab() {
    var btns = document.getElementsByTagName('button');
    for (var i = 0; i < btns.length; i++) {
      var t = btns[i].textContent.trim();
      if (t === 'マイ ノートブック' || t === 'My notebooks' ||
        (t.indexOf('マイ') !== -1 && t.indexOf('ノートブック') !== -1)) {
        log('Clicking My Notebooks tab');
        simulateClick(btns[i]);
        await sleep(800);
        return true;
      }
    }
    return false;
  }

  /**
   * スキップすべきカードかチェック
   * @param {Element} card - カード要素
   * @returns {boolean}
   */
  function isSkipCard(card) {
    var t = card.textContent || '';
    var c = card.className || '';
    if (t.indexOf('新規作成') !== -1) return true;
    if (card.classList.contains('create-new-action-button')) return true;
    if (c.indexOf('featured') !== -1) return true;
    if ((t.indexOf('public') === 0 || t.indexOf('lock') === 0) && t.indexOf('more_vert') === -1) return true;
    return false;
  }

  /**
   * ノートブック一覧を取得
   * @returns {Promise<Array>}
   */
  async function getNotebooks() {
    var notebooks = [];
    var seen = {};
    log('getNotebooks: searching...');
    await clickMyNotebooksTab();
    await sleep(1000);
    var cards = getProjectCards();
    log('getNotebooks: found', cards.length, 'cards');

    for (var i = 0; i < cards.length; i++) {
      if (isSkipCard(cards[i])) continue;

      var title = extractTitle(cards[i].textContent);
      if (!title || title.length < 2 || seen[title]) continue;
      seen[title] = true;

      var notebookId = getNotebookIdFromCard(cards[i]);
      if (!notebookId) {
        log('Could not get ID for notebook:', title);
        notebookId = 'unknown-' + i;
      }

      notebooks.push({ id: notebookId, name: title, idx: i });
      log('Notebook', notebooks.length, ':', notebookId.substring(0, 8), '-', title.substring(0, 40));
    }
    log('getNotebooks: total', notebooks.length);
    return notebooks;
  }

  /**
   * ノートブックを開く
   * @param {string} notebookId - ノートブックID
   * @returns {Promise<boolean>}
   */
  async function openNotebook(notebookId) {
    if (!notebookId || notebookId.indexOf('unknown') === 0) {
      console.error('Invalid notebook ID:', notebookId);
      return false;
    }

    var url = 'https://notebooklm.google.com/notebook/' + notebookId;
    log('Navigating to:', url);
    window.location.href = url;

    await sleep(1500);
    return isInsideNotebook();
  }

  /**
   * 最初のノートブックを開く
   * @returns {Promise<boolean>}
   */
  async function openFirstNotebook() {
    log('openFirstNotebook: starting');
    await clickMyNotebooksTab();
    await sleep(1500);
    var cards = getProjectCards();
    log('openFirstNotebook: found', cards.length, 'cards');

    for (var i = 0; i < cards.length; i++) {
      if (isSkipCard(cards[i])) {
        log('Skipping card', i);
        continue;
      }

      var notebookId = getNotebookIdFromCard(cards[i]);
      if (notebookId) {
        log('Opening notebook:', notebookId);
        return await openNotebook(notebookId);
      }
    }

    log('openFirstNotebook: no valid notebook found');
    return false;
  }

  /**
   * 新規ノートブック作成ボタンを探す
   * @returns {Element|null}
   */
  function findCreateNewNotebookBtn() {
    // 様々なパターンで新規作成ボタンを探す
    var btns = getAllButtonsDeep();
    log('findCreateNewNotebookBtn: scanned', btns.length, 'buttons');

    // パターン1: テキストベース検索
    var patterns = [
      '新規作成', '新しいノートブック', 'create', 'new notebook', '作成'
    ];

    for (var i = 0; i < btns.length; i++) {
      var btn = btns[i];
      if (!btn) continue;

      var t = (btn.textContent || '').toLowerCase();
      var a = (btn.getAttribute('aria-label') || '').toLowerCase();

      for (var p = 0; p < patterns.length; p++) {
        var pattern = patterns[p].toLowerCase();
        if (t.indexOf(pattern) !== -1 || a.indexOf(pattern) !== -1) {
          log('Found create button by pattern:', patterns[p]);
          return btn;
        }
      }
    }

    // パターン2: 新規作成カードを探す
    var cards = document.querySelectorAll('.create-new-action-button, [class*="create"], [class*="new-notebook"]');
    for (var j = 0; j < cards.length; j++) {
      var card = cards[j];
      var clickable = card.querySelector('button') || card;
      if (clickable) {
        log('Found create card element');
        return clickable;
      }
    }

    // パターン3: project-button-card内の新規作成を探す
    var projectCards = getProjectCards();
    for (var k = 0; k < projectCards.length; k++) {
      var cardText = (projectCards[k].textContent || '').toLowerCase();
      if (cardText.indexOf('新規作成') !== -1 || cardText.indexOf('create') !== -1 || cardText.indexOf('new') !== -1) {
        var clickableBtn = projectCards[k].querySelector('button') || projectCards[k];
        log('Found create button in project card');
        return clickableBtn;
      }
    }

    // パターン4: FAB (Floating Action Button) を探す
    var fabs = document.querySelectorAll('[class*="fab"], [class*="floating"], button[class*="add"]');
    for (var m = 0; m < fabs.length; m++) {
      var fab = fabs[m];
      var fabText = (fab.textContent || '').trim();
      var fabAria = (fab.getAttribute('aria-label') || '').toLowerCase();
      if (fabText === 'add' || fabText === '+' || fabAria.indexOf('create') !== -1 || fabAria.indexOf('new') !== -1) {
        log('Found FAB button');
        return fab;
      }
    }

    return null;
  }

  /**
   * 新規ノートブックを作成
   * @returns {Promise<boolean>}
   */
  async function createNewNotebook() {
    log('=== createNewNotebook ===');

    // ホーム画面にいない場合は移動
    if (isInsideNotebook()) {
      log('Currently in a notebook, navigating to home...');
      window.location.href = 'https://notebooklm.google.com/';
      await sleep(1500);
    }

    // マイノートブックタブをクリック
    await clickMyNotebooksTab();
    await sleep(1500);

    // 新規作成ボタンを探す
    var createBtn = findCreateNewNotebookBtn();

    // リトライ
    for (var k = 0; k < 5 && !createBtn; k++) {
      log('Create button not found, retrying... attempt', k + 1);
      await sleep(1000);
      createBtn = findCreateNewNotebookBtn();
    }

    if (!createBtn) {
      log('Create new notebook button not found');
      // ボタンが見つからない場合、直接URLで新規作成を試みる
      log('Attempting direct navigation to create new notebook...');
      window.location.href = 'https://notebooklm.google.com/notebook/new';
      await sleep(1500);

      // newへのナビゲーションが新しいノートブックを作成する場合
      if (isInsideNotebook()) {
        log('New notebook created via direct URL');
        return true;
      }
      return false;
    }

    log('Clicking create new notebook button');
    simulateClick(createBtn);
    await sleep(1500);

    // 新しいノートブックが作成されてその中に入ったか確認
    if (isInsideNotebook()) {
      log('New notebook created successfully');
      return true;
    }

    // まだホーム画面の場合、もう少し待つ
    await sleep(2000);
    if (isInsideNotebook()) {
      log('New notebook created successfully (delayed)');
      return true;
    }

    log('Failed to create new notebook');
    return false;
  }

  /**
   * ソース追加ボタンを探す
   * @returns {Element|null}
   */
  function findAddSourceBtn() {
    var btns = getAllButtonsDeep();
    log('findAddSourceBtn: scanned ' + btns.length + ' buttons deep');

    // 優先順位付きの検索パターン
    var patterns = [
      // 日本語パターン
      { aria: 'ソースを追加', text: null },
      { aria: null, text: 'ソースを追加' },
      // 英語パターン
      { aria: 'add source', text: null },
      { aria: 'add new source', text: null },
      { aria: null, text: 'add source' }
    ];

    for (var p = 0; p < patterns.length; p++) {
      var pattern = patterns[p];
      for (var i = 0; i < btns.length; i++) {
        var btn = btns[i];
        if (!btn) continue;

        var a = (btn.getAttribute('aria-label') || '').toLowerCase();
        var t = (btn.textContent || '').toLowerCase().trim();

        // 削除/変更/編集系を除外（重要！）
        if (t.indexOf('削除') !== -1 || t.indexOf('delete') !== -1 ||
          t.indexOf('変更') !== -1 || t.indexOf('rename') !== -1 ||
          t.indexOf('編集') !== -1 || t.indexOf('edit') !== -1 ||
          t.indexOf('remove') !== -1) {
          continue;
        }

        if (pattern.aria && a === pattern.aria.toLowerCase()) {
          log('Found add source button by aria:', pattern.aria);
          return btn;
        }
        if (pattern.text && t.indexOf(pattern.text.toLowerCase()) !== -1) {
          log('Found add source button by text:', pattern.text);
          return btn;
        }
      }
    }

    // ソース追加エリア内の「+」ボタンを探す（より安全なアプローチ）
    var sourceHeaders = document.querySelectorAll('[class*="source-header"], [class*="sources-panel"]');
    for (var h = 0; h < sourceHeaders.length; h++) {
      var addBtnInHeader = sourceHeaders[h].querySelector('button[aria-label*="追加"], button[aria-label*="add"]');
      if (addBtnInHeader) {
        var btnText = (addBtnInHeader.textContent || '').toLowerCase();
        // 削除系を除外
        if (btnText.indexOf('削除') === -1 && btnText.indexOf('delete') === -1) {
          log('Found add button in source header');
          return addBtnInHeader;
        }
      }
    }

    return null;
  }

  /**
   * URL/ウェブサイトオプションを探す（ソース追加ダイアログ内のみ）
   * @returns {Element|null}
   */
  function findUrlOption() {
    var candidates = getAllButtonsDeep();
    log('findUrlOption: scanning', candidates.length, 'candidates');

    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];

      // 非表示要素をスキップ
      if (el.offsetParent === null && window.getComputedStyle(el).display === 'none') continue;

      var t = (el.textContent || '').toLowerCase().trim();
      var a = (el.getAttribute('aria-label') || '').toLowerCase();

      // 削除/変更/編集系のメニュー項目を除外（重要！）
      if (t.indexOf('削除') !== -1 || t.indexOf('delete') !== -1 ||
        t.indexOf('変更') !== -1 || t.indexOf('rename') !== -1 ||
        t.indexOf('編集') !== -1 || t.indexOf('edit') !== -1 ||
        t.indexOf('remove') !== -1) {
        log('Skipping menu item:', t.substring(0, 30));
        continue;
      }

      // ダイアログ/モーダル内の要素のみを対象（より安全）
      var isInDialog = el.closest('[role="dialog"]') ||
        el.closest('.cdk-overlay-pane') ||
        el.closest('[class*="modal"]') ||
        el.closest('[class*="drop-zone"]');

      // ウェブサイト/リンクオプションを探す（厳密なマッチ）
      // 「ウェブサイト」そのもの、または drop-zone 内のリンクアイコン
      if (t === 'ウェブサイト' || t === 'website' || t === 'link' || t === 'リンク') {
        log('Found URL option (exact match):', t);
        return el;
      }

      // ダイアログ内でのみ部分マッチを許可
      if (isInDialog) {
        if (t.indexOf('ウェブサイト') !== -1 || t.indexOf('website') !== -1) {
          log('Found URL option in dialog:', t);
          return el;
        }
      }

      // drop-zone-icon-button クラスを持つ場合
      if (el.classList.contains('drop-zone-icon-button')) {
        if (t.indexOf('site') !== -1 || t.indexOf('web') !== -1 || t.indexOf('link') !== -1) {
          log('Found URL option in drop-zone:', t);
          return el;
        }
      }

      // aria-label での厳密マッチ
      if (a === 'website' || a === 'link' || a === 'url' || a === 'ウェブサイト') {
        log('Found URL option by aria-label:', a);
        return el;
      }
    }

    log('findUrlOption: no suitable option found');
    return null;
  }

  /**
   * URL入力フィールドを探す
   * @returns {Element|null}
   */
  function findUrlInput() {
    var inputs = getAllInputsDeep();

    // ダイアログ内の入力フィールドを優先
    var dialogInputs = inputs.filter(function (i) {
      return i.closest('[role="dialog"]') || i.closest('.mat-dialog-container') || i.closest('.cdk-overlay-pane') || i.closest('[class*="modal"]');
    });

    var searchSet = dialogInputs.length > 0 ? dialogInputs : inputs;

    // リンク入力のtextareaを優先検索
    for (var x = 0; x < searchSet.length; x++) {
      var el = searchSet[x];
      var p = (el.placeholder || '').toLowerCase();
      if (el.tagName.toLowerCase() === 'textarea' && (p.indexOf('リンク') !== -1 || p.indexOf('link') !== -1 || p.indexOf('url') !== -1)) {
        log('Found URL input textarea with placeholder:', p);
        return el;
      }
    }

    // 可視フィルター
    var visibleInputs = searchSet.filter(function (i) { return i.offsetParent !== null || (i.getBoundingClientRect().width > 0); });
    if (visibleInputs.length > 0) searchSet = visibleInputs;

    for (var i = 0; i < searchSet.length; i++) {
      var inp = searchSet[i];
      var placeholder = (inp.placeholder || '').toLowerCase();
      var ariaLabel = (inp.getAttribute('aria-label') || '').toLowerCase();
      var type = (inp.type || '').toLowerCase();
      var tag = inp.tagName.toLowerCase();

      if (type === 'url') {
        log('Found URL input by type');
        return inp;
      }

      if (tag === 'textarea' && (placeholder.indexOf('url') !== -1 || ariaLabel.indexOf('url') !== -1)) {
        log('Found URL textarea');
        return inp;
      }

      if (placeholder.indexOf('url') !== -1 || placeholder.indexOf('http') !== -1 || placeholder.indexOf('link') !== -1 || placeholder.indexOf('リンク') !== -1) {
        log('Found input by placeholder:', placeholder);
        return inp;
      }
      if (ariaLabel.indexOf('url') !== -1 || ariaLabel.indexOf('link') !== -1 || ariaLabel.indexOf('website') !== -1) {
        log('Found input by aria-label:', ariaLabel);
        return inp;
      }
    }

    // フォールバック
    for (var j = 0; j < searchSet.length; j++) {
      if (searchSet[j].type === 'text' || searchSet[j].tagName.toLowerCase() === 'textarea') {
        log('Found fallback input');
        return searchSet[j];
      }
    }

    return null;
  }

  /**
   * ソースタブ/トグルを探す
   * @returns {Element|null}
   */
  function findSourcesToggle() {
    var tabs = querySelectorAllDeep('[role="tab"]');
    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      var t = (tab.textContent || '').trim();
      var aria = (tab.getAttribute('aria-label') || '').toLowerCase();

      if (t === 'ソース' || t === 'Sources' || t === 'リソース' ||
        aria === 'ソース' || aria === 'sources') {
        log('Found Sources tab:', t);
        return tab;
      }
    }

    var btns = getAllButtonsDeep();
    for (var j = 0; j < btns.length; j++) {
      var btn = btns[j];
      if (btn.offsetParent === null && window.getComputedStyle(btn).display === 'none') continue;

      var t2 = (btn.textContent || '').trim();
      var a2 = (btn.getAttribute('aria-label') || '').toLowerCase();

      if ((t2.indexOf('ソース') !== -1 || t2.toLowerCase().indexOf('source') !== -1) &&
        a2.indexOf('add') === -1 && t2.indexOf('追加') === -1) {
        return btn;
      }
    }
    return null;
  }

  /**
   * 送信ボタンを探す
   * @returns {Element|null}
   */
  function findSubmitBtn() {
    var btns = getAllButtonsDeep();
    for (var i = 0; i < btns.length; i++) {
      var btn = btns[i];
      if (btn.offsetParent === null && window.getComputedStyle(btn).display === 'none') continue;

      var t = (btn.textContent || '').trim();
      var tLower = t.toLowerCase();
      var a = (btn.getAttribute('aria-label') || '').toLowerCase();

      // ソース追加ボタン自体を除外
      if (a === 'ソースを追加' || a === 'add source') continue;
      if (tLower.indexOf('ソースを追加') !== -1 || tLower.indexOf('add source') !== -1) continue;

      if (t === '追加' || t === '挿入' || tLower === 'add' || tLower === 'insert' || tLower === 'submit' || t === 'Upload' || t === 'アップロード') {
        log('Found submit button:', t);
        return btn;
      }
    }
    return null;
  }

  /**
   * URLソースを追加
   * @param {string} url - 追加するURL
   * @param {string} title - タイトル
   * @returns {Promise<boolean>}
   */
  async function addUrlSource(url, title) {
    log('=== addUrlSource ===');
    log('URL:', url);
    log('Location:', location.href);
    log('Inside notebook:', isInsideNotebook());

    try {
      if (!isInsideNotebook()) {
        log('Opening notebook first...');
        if (!(await openFirstNotebook())) {
          console.error('Failed to open notebook');
          return false;
        }
        await sleep(1500);
        if (!isInsideNotebook()) {
          console.error('Still not in notebook');
          return false;
        }
      }

      log('Finding add source button...');
      var addBtn = findAddSourceBtn();

      if (window.self === window.top) {
        log('Main Frame: checking for Sources Tab logic');
        var toggle = findSourcesToggle();

        if (!addBtn && toggle) {
          log('Main Frame: Found sources toggle, clicking it...');
          simulateClick(toggle);
          await sleep(1500);
        }
      }

      // リトライループ
      for (var k = 0; k < 8 && !addBtn; k++) {
        log('Button not found, waiting... attempt ' + (k + 1));
        await sleep(1500);
        addBtn = findAddSourceBtn();
      }

      if (!addBtn) {
        console.error('Add source button not found after retries');
        var all = getAllButtonsDeep();
        log('Total buttons found deep:', all.length);
        log('Button texts:', all.slice(0, 20).map(b => (b.textContent || '').trim().substring(0, 30)));
        return false;
      }

      log('Clicking add source button');
      simulateClick(addBtn);
      await sleep(1500);

      log('Finding URL option...');
      var urlOpt = findUrlOption();
      if (urlOpt) {
        log('Clicking URL option');
        simulateClick(urlOpt);
        await sleep(1000);
      }

      log('Finding URL input...');
      var urlInput = findUrlInput();
      if (!urlInput) {
        await sleep(1500);
        urlInput = findUrlInput();
      }
      if (!urlInput) {
        console.error('URL input not found');
        return false;
      }

      log('Typing URL');
      simulateTyping(urlInput, url);
      await sleep(1000);

      // ダイアログをスクロール
      try {
        var dialogs = querySelectorAllDeep('[role="dialog"], .cdk-overlay-pane, mat-dialog-content');
        for (var d of dialogs) {
          if (d.scrollHeight > d.clientHeight) {
            log('Scrolling dialog to bottom...');
            d.scrollTop = d.scrollHeight;
          }
        }
      } catch (e) { log('Scroll attempt failed', e); }
      await sleep(500);

      log('Finding submit button...');
      var submitBtn = null;
      for (var m = 0; m < 10; m++) {
        submitBtn = findSubmitBtn();
        if (submitBtn && !submitBtn.disabled && submitBtn.getAttribute('aria-disabled') !== 'true') {
          break;
        }
        if (submitBtn) log('Submit button found but disabled, waiting...');
        await sleep(500);
      }

      if (submitBtn) {
        log('Clicking submit');
        simulateClick(submitBtn);
      } else {
        log('Pressing Enter (fallback)');
        urlInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      }
      await sleep(2500);

      log('=== addUrlSource done ===');
      return true;
    } catch (e) {
      console.error('addUrlSource error:', e);
      return false;
    }
  }

  /**
   * 現在のノートブックIDを取得
   * @returns {string|null}
   */
  function getCurrentNotebookId() {
    var match = location.href.match(/\/notebook\/([a-f0-9-]+)/i);
    return match ? match[1] : null;
  }

  /**
   * 指定されたノートブックに移動
   * @param {string} notebookId - ノートブックID
   * @returns {Promise<boolean>}
   */
  async function navigateToNotebook(notebookId) {
    if (!notebookId || notebookId.indexOf('unknown') === 0) {
      log('Invalid notebook ID for navigation:', notebookId);
      return false;
    }

    var currentId = getCurrentNotebookId();
    if (currentId === notebookId) {
      log('Already in the correct notebook:', notebookId);
      return true;
    }

    var url = 'https://notebooklm.google.com/notebook/' + notebookId;
    log('Navigating to specified notebook:', url);
    window.location.href = url;

    // ナビゲーション完了を待機
    await sleep(2000);

    // 正しいノートブックにいるか確認
    var newId = getCurrentNotebookId();
    if (newId === notebookId) {
      log('Successfully navigated to notebook:', notebookId);
      return true;
    } else {
      log('Navigation may have failed. Current:', newId, 'Expected:', notebookId);
      return false;
    }
  }

  /**
   * 保留中のソースを処理
   * @returns {Promise<void>}
   */
  async function processPending() {
    if (isProcessing) return;
    if (!chrome.runtime?.id) {
      log('Extension context invalidated. Please refresh the page.');
      return;
    }

    isProcessing = true;
    try {
      if (!chrome.storage || !chrome.storage.local) {
        log('chrome.storage not available');
        return;
      }

      var r = await chrome.storage.local.get('pending_sources');
      var p = r.pending_sources;
      if (!p) { log('No pending'); return; }
      if (Date.now() - p.timestamp > 120000) {
        log('Expired');
        await chrome.storage.local.remove('pending_sources');
        return;
      }

      var targetNotebookId = p.notebookId;
      log('Target notebook ID:', targetNotebookId || '(new notebook)');

      // notebookIdがnull/undefined = 新規ノートブック作成
      if (!targetNotebookId) {
        log('No notebook ID specified - creating new notebook');

        if (!isInsideNotebook()) {
          log('Creating new notebook...');
          var created = await createNewNotebook();
          if (!created) {
            log('Failed to create new notebook');
            return;
          }
          await sleep(2000);
          if (!isInsideNotebook()) {
            log('Still not in notebook after creation attempt');
            return;
          }
        }
      } else {
        var currentId = getCurrentNotebookId();

        if (currentId !== targetNotebookId) {
          log('Current notebook:', currentId, '-> Moving to:', targetNotebookId);
          await navigateToNotebook(targetNotebookId);
          return;
        }
      }

      if (!isInsideNotebook()) {
        log('Not inside a notebook, cannot add sources');
        return;
      }

      await sleep(2000);
      var src = p.sources || [];
      log('Processing', src.length, 'sources in notebook:', getCurrentNotebookId());

      // 複数URLを改行区切りで一括挿入（NotebookLMの機能を活用）
      var urls = src.map(function (s) { return s.url; });
      log('Using batch insert for', urls.length, 'URLs');

      var ok = await addBatchUrls(urls);

      await chrome.storage.local.remove('pending_sources');
      try {
        await chrome.runtime.sendMessage({ action: 'SOURCES_ADDED', data: { successCount: ok ? urls.length : 0, total: src.length } });
      } catch (e) {/* ignore msg error */ }

      log('Done:', ok ? urls.length : 0, '/', src.length);
    } catch (e) {
      if (e.message.includes('Extension context invalidated')) {
        log('Extension context invalidated during processing.');
      } else {
        console.error('processPending error:', e);
      }
    } finally {
      isProcessing = false;
    }
  }

  /**
   * 複数URLを一括で追加（改行区切り）
   * モーダル完全表示後に入力する方式
   * @param {Array<string>} urls - URLの配列
   * @returns {Promise<boolean>}
   */
  async function addBatchUrls(urls) {
    log('=== addBatchUrls (modal-based) ===');
    log('URLs count:', urls.length);

    try {
      if (!isInsideNotebook()) {
        log('Not in notebook');
        return false;
      }

      // ステップ1: ソース追加ボタンをクリック
      log('Step 1: Finding add source button...');
      var addBtn = await waitForElement(findAddSourceBtn, 2000);

      if (!addBtn) {
        var toggle = findSourcesToggle();
        if (toggle) {
          log('Clicking sources toggle...');
          simulateClick(toggle);
          addBtn = await waitForElement(findAddSourceBtn, 3000);
        }
      }

      if (!addBtn) {
        console.error('Add source button not found');
        return false;
      }

      simulateClick(addBtn);
      log('Clicked add source button');

      // ステップ2: URLオプションをクリック
      log('Step 2: Waiting for URL option...');
      await sleep(500);
      var urlOpt = await waitForElement(findUrlOption, 2000);
      if (urlOpt) {
        simulateClick(urlOpt);
        log('Clicked URL option');
      }

      // ステップ3: 「挿入」ボタンがモーダル内に表示されるまで待機
      log('Step 3: Waiting for modal with insert button...');
      var insertBtnFound = await waitForCondition(function () {
        var btn = findSubmitBtn();
        return !!btn;
      }, 3000, 100);

      if (!insertBtnFound) {
        console.error('Insert button not found in modal');
        return false;
      }
      log('Insert button found in modal');

      // ステップ4: テキストエリアを探して入力
      log('Step 4: Finding and filling textarea...');

      // ダイアログ内のtextareaを直接探す
      var textarea = null;
      var dialogs = querySelectorAllDeep('[role="dialog"], .cdk-overlay-pane');
      for (var d of dialogs) {
        var ta = d.querySelector('textarea');
        if (ta) {
          textarea = ta;
          log('Found textarea in dialog');
          break;
        }
      }

      if (!textarea) {
        // フォールバック: findUrlInputを使用
        textarea = findUrlInput();
        if (textarea) {
          log('Found textarea via findUrlInput');
        }
      }

      if (!textarea) {
        console.error('Textarea not found');
        return false;
      }

      // テキストを入力（Angular/React対応）
      var urlsText = urls.join('\n');
      log('Inserting', urls.length, 'URLs into textarea');

      // フォーカスとクリック
      textarea.focus();
      textarea.click();
      await sleep(100);

      // 方法1: Angularのngモデルを直接更新しようとする
      try {
        // Angularのプロパティを探す
        var angularKey = Object.keys(textarea).find(function (key) {
          return key.startsWith('__ngContext__') || key.startsWith('ng-');
        });
        if (angularKey) {
          log('Found Angular context, trying ngModel update');
        }
      } catch (e) { }

      // 方法2: valueを設定してinputイベントを発火
      try {
        // ReactのファイバーノードやAngularのコンテキストをトリガー
        var nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, "value"
        ).set;

        nativeInputValueSetter.call(textarea, urlsText);

        // Angularのzone.jsをトリガーするためのイベント
        textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        textarea.dispatchEvent(new Event('blur', { bubbles: true }));
        textarea.dispatchEvent(new Event('focus', { bubbles: true }));
        textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

        log('Dispatched input events');
      } catch (e) {
        log('Event dispatch failed:', e);
        textarea.value = urlsText;
      }

      // ステップ5: 少し待って挿入ボタンの状態を確認
      await sleep(500);
      log('Step 5: Checking submit button state...');

      var submitBtn = findSubmitBtn();
      var isDisabled = submitBtn && (submitBtn.disabled || submitBtn.getAttribute('aria-disabled') === 'true');
      log('Submit button disabled:', isDisabled);

      // もし無効なら、もう一度入力を試みる
      if (isDisabled) {
        log('Button still disabled, trying KeyboardEvent approach...');

        textarea.focus();
        textarea.select();

        // 一文字ずつ入力をシミュレート（最初の数文字だけ）
        textarea.value = '';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));

        for (var c = 0; c < Math.min(urlsText.length, 10); c++) {
          var char = urlsText[c];
          textarea.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true }));
          textarea.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true, cancelable: true }));

          var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
          nativeSetter.call(textarea, urlsText.substring(0, c + 1));

          textarea.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: 'insertText',
            data: char
          }));

          textarea.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true, cancelable: true }));
        }

        // 残りを一気に設定
        nativeInputValueSetter.call(textarea, urlsText);
        textarea.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          inputType: 'insertText',
          data: urlsText
        }));

        await sleep(300);
      }

      // ステップ6: 挿入ボタンをクリック
      log('Step 6: Clicking submit button...');
      submitBtn = await waitForEnabled(findSubmitBtn, 5000);

      if (submitBtn) {
        log('Submit button enabled, clicking...');
        simulateClick(submitBtn);
      } else {
        log('Submit button not enabled, trying Enter key...');
        textarea.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter',
          keyCode: 13,
          bubbles: true,
          cancelable: true
        }));
      }

      // ステップ7: 完了待機
      await sleep(2000);
      log('=== addBatchUrls done ===');
      return true;

    } catch (e) {
      console.error('addBatchUrls error:', e);
      return false;
    }
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, respond) {
    (async function () {
      try {
        if (msg.action === 'ADD_PENDING_SOURCES') {
          await processPending();
          respond({ success: true });
        } else if (msg.action === 'GET_NOTEBOOKS') {
          respond({ success: true, data: await getNotebooks() });
        } else if (msg.action === 'ADD_URL_SOURCE') {
          respond({ success: await addUrlSource(msg.data.url, msg.data.title) });
        } else {
          respond({ success: false, error: 'Unknown' });
        }
      } catch (e) {
        respond({ success: false, error: e.message });
      }
    })();
    return true;
  });

  /**
   * 初期化
   * @returns {Promise<void>}
   */
  async function init() {
    if (!chrome.runtime?.id) return;

    log('=== NotebookLM Bridge loaded ===');
    log('URL:', location.href, 'Inside:', isInsideNotebook());

    // 保留中のソースがある場合のみ処理を行う
    // ノートブック一覧の自動取得は、ユーザーの操作を妨げないよう削除
    try {
      var r = await chrome.storage.local.get('pending_sources');
      if (r.pending_sources) {
        log('Found pending sources, processing...');
        await sleep(3000);
        await processPending();
      } else {
        log('No pending sources, ready for manual operations');
      }
    } catch (e) {
      log('Init interrupted:', e.message);
    }
  }

  if (document.readyState === 'complete') init();
  else window.addEventListener('load', init);

  var lastUrl = location.href;
  new MutationObserver(function () {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      log('URL changed:', location.href);
      setTimeout(async function () {
        if (!chrome.runtime?.id) return;

        // 保留中のソースがある場合のみ処理
        try {
          var r = await chrome.storage.local.get('pending_sources');
          if (r.pending_sources) {
            log('Found pending sources after URL change, processing...');
            await processPending();
          }
        } catch (e) { }
      }, 3000);
    }
  }).observe(document.body, { childList: true, subtree: true });

})();