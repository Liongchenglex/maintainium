export const OVERLAY_SCRIPT_CONTENT = `(function() {
  'use strict';

  // ── Config ──
  var scriptTag = document.currentScript;
  if (!scriptTag) return;

  var projectId = scriptTag.getAttribute('data-project');
  var apiKey = scriptTag.getAttribute('data-key');
  var apiBase = scriptTag.getAttribute('data-api');

  if (!projectId || !apiKey || !apiBase) {
    console.error('[Maintanium] Missing data-project, data-key, or data-api attributes');
    return;
  }

  // ── State ──
  var isAnnotateMode = false;
  var highlightedEl = null;
  var selectedEl = null;
  var changeCount = 0;

  // ── API Client ──
  function apiRequest(method, path, body) {
    return fetch(apiBase + path, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: body ? JSON.stringify(body) : undefined
    }).then(function(res) {
      if (!res.ok) {
        if (res.status === 401) {
          showToast('Invalid API key', 'error');
          deactivate();
        }
        throw new Error('API error: ' + res.status);
      }
      return res.json();
    });
  }

  // ── Shadow DOM Host ──
  var host = document.createElement('div');
  host.id = 'maintanium-overlay-host';
  host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
  document.body.appendChild(host);

  var shadow = host.attachShadow({ mode: 'closed' });

  // ── Styles ──
  var style = document.createElement('style');
  style.textContent = [
    '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',
    '.toolbar { position: fixed; bottom: 20px; right: 20px; display: flex; gap: 8px; pointer-events: auto; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 13px; }',
    '.btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-weight: 600; font-size: 13px; transition: opacity 0.15s; }',
    '.btn:hover { opacity: 0.85; }',
    '.btn-primary { background: #1565c0; color: #fff; }',
    '.btn-active { background: #c62828; color: #fff; }',
    '.btn-secondary { background: #f5f5f5; color: #333; border: 1px solid #ddd; }',
    '.btn-close { background: none; border: none; color: #999; cursor: pointer; font-size: 18px; padding: 4px 8px; }',
    '.panel { position: fixed; bottom: 70px; right: 20px; width: 380px; background: #fff; border-radius: 8px; box-shadow: 0 4px 24px rgba(0,0,0,0.15); pointer-events: auto; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 13px; overflow: hidden; }',
    '.panel-header { padding: 12px 16px; background: #f4f5f7; border-bottom: 1px solid #e0e0e0; font-weight: 600; color: #333; display: flex; justify-content: space-between; align-items: center; }',
    '.panel-body { padding: 16px; }',
    '.selected-info { padding: 8px 12px; background: #f0f6ff; border-radius: 4px; margin-bottom: 12px; font-size: 12px; color: #1565c0; word-break: break-word; }',
    '.input { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; font-family: inherit; resize: vertical; min-height: 60px; }',
    '.input:focus { outline: none; border-color: #1565c0; }',
    '.panel-actions { display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end; }',
    '.toast { position: fixed; top: 20px; right: 20px; padding: 10px 16px; border-radius: 6px; pointer-events: auto; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 13px; font-weight: 500; box-shadow: 0 2px 12px rgba(0,0,0,0.12); animation: slideIn 0.3s ease; }',
    '.toast-success { background: #e8f5e9; color: #2e7d32; border: 1px solid #a5d6a7; }',
    '.toast-error { background: #ffebee; color: #c62828; border: 1px solid #ef9a9a; }',
    '.toast-info { background: #e3f2fd; color: #1565c0; border: 1px solid #90caf9; }',
    '@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }'
  ].join('\\n');
  shadow.appendChild(style);

  // ── Toolbar ──
  var toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = '<button class="btn btn-primary" id="mt-annotate">Annotate</button><button class="btn btn-secondary" id="mt-changes">Changes (0)</button><button class="btn-close" id="mt-close">x</button>';
  shadow.appendChild(toolbar);

  var annotateBtn = shadow.getElementById('mt-annotate');
  var changesBtn = shadow.getElementById('mt-changes');
  var closeBtn = shadow.getElementById('mt-close');

  // ── Input Panel ──
  var panel = document.createElement('div');
  panel.className = 'panel';
  panel.style.display = 'none';
  panel.innerHTML = '<div class="panel-header"><span>Describe Change</span><button class="btn-close" id="mt-panel-close">x</button></div><div class="panel-body"><div class="selected-info" id="mt-selected-info"></div><textarea class="input" id="mt-change-input" placeholder="What should this change to?"></textarea><div class="panel-actions"><button class="btn btn-secondary" id="mt-cancel">Cancel</button><button class="btn btn-primary" id="mt-submit">Submit</button></div></div>';
  shadow.appendChild(panel);

  var selectedInfo = shadow.getElementById('mt-selected-info');
  var changeInput = shadow.getElementById('mt-change-input');
  var cancelBtn = shadow.getElementById('mt-cancel');
  var submitBtn = shadow.getElementById('mt-submit');
  var panelCloseBtn = shadow.getElementById('mt-panel-close');

  // ── Element Highlight ──
  var highlightOverlay = document.createElement('div');
  highlightOverlay.style.cssText = 'position:absolute;pointer-events:none;border:2px solid #1565c0;background:rgba(21,101,192,0.08);border-radius:2px;transition:all 0.1s ease;display:none;z-index:2147483646;';
  document.body.appendChild(highlightOverlay);

  // ── Element Normalization ──
  var MEANINGFUL_TAGS = ['H1','H2','H3','H4','H5','H6','P','BUTTON','A','LI','DIV','SECTION','SPAN','LABEL','TD','TH','HEADER','FOOTER','MAIN','NAV','ARTICLE'];

  function normalizeElement(el) {
    var current = el;
    var maxWalk = 5;
    while (current && current !== document.body && maxWalk > 0) {
      if (MEANINGFUL_TAGS.indexOf(current.tagName) !== -1 && current.textContent.trim().length > 0) {
        return current;
      }
      current = current.parentElement;
      maxWalk--;
    }
    return el;
  }

  function getElementText(el) {
    var text = el.textContent || '';
    return text.trim().substring(0, 500);
  }

  function getCssSelector(el) {
    var parts = [];
    var current = el;
    while (current && current !== document.body) {
      if (current.id) {
        parts.unshift('#' + current.id);
        break;
      }
      var tag = current.tagName.toLowerCase();
      var parent = current.parentElement;
      if (parent) {
        var siblings = Array.from(parent.children).filter(function(c) { return c.tagName === current.tagName; });
        if (siblings.length > 1) {
          var idx = siblings.indexOf(current) + 1;
          tag += ':nth-child(' + idx + ')';
        }
      }
      parts.unshift(tag);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  function getPageTitle() {
    return (document.title || '').substring(0, 500);
  }

  function getNearestHeading(el) {
    var headingTags = ['H1','H2','H3','H4','H5','H6'];
    var current = el;
    var maxWalk = 10;
    while (current && current !== document.body && maxWalk > 0) {
      if (headingTags.indexOf(current.tagName) !== -1) {
        return (current.textContent || '').trim().substring(0, 200);
      }
      // Check preceding siblings for a heading
      var prev = current.previousElementSibling;
      var siblingWalk = 3;
      while (prev && siblingWalk > 0) {
        if (headingTags.indexOf(prev.tagName) !== -1) {
          return (prev.textContent || '').trim().substring(0, 200);
        }
        prev = prev.previousElementSibling;
        siblingWalk--;
      }
      current = current.parentElement;
      maxWalk--;
    }
    return '';
  }

  function getParentContext(el) {
    var parts = [];
    var current = el.parentElement;
    var maxWalk = 5;
    while (current && current !== document.body && maxWalk > 0) {
      var desc = current.tagName.toLowerCase();
      if (current.id) {
        desc += '#' + current.id;
      }
      if (typeof current.className === 'string' && current.className.trim()) {
        desc += '.' + current.className.trim().split(/\\s+/).slice(0, 3).join('.');
      }
      parts.push(desc);
      current = current.parentElement;
      maxWalk--;
    }
    return parts.join(' > ').substring(0, 1000);
  }

  function getOuterHtml(el) {
    try {
      return (el.outerHTML || '').substring(0, 2000);
    } catch (e) {
      return '';
    }
  }

  // ── Event Handlers ──
  function onMouseOver(e) {
    if (!isAnnotateMode) return;
    var el = normalizeElement(e.target);
    if (el === highlightedEl) return;
    highlightedEl = el;

    var rect = el.getBoundingClientRect();
    highlightOverlay.style.display = 'block';
    highlightOverlay.style.left = (rect.left + window.scrollX) + 'px';
    highlightOverlay.style.top = (rect.top + window.scrollY) + 'px';
    highlightOverlay.style.width = rect.width + 'px';
    highlightOverlay.style.height = rect.height + 'px';
  }

  function onMouseOut() {
    highlightOverlay.style.display = 'none';
    highlightedEl = null;
  }

  function onClick(e) {
    if (!isAnnotateMode) return;
    e.preventDefault();
    e.stopPropagation();

    selectedEl = normalizeElement(e.target);
    exitAnnotateMode();
    showInputPanel();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape' && isAnnotateMode) {
      exitAnnotateMode();
    }
  }

  function enterAnnotateMode() {
    isAnnotateMode = true;
    annotateBtn.textContent = 'Cancel';
    annotateBtn.className = 'btn btn-active';
    document.body.style.cursor = 'crosshair';
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
  }

  function exitAnnotateMode() {
    isAnnotateMode = false;
    annotateBtn.textContent = 'Annotate';
    annotateBtn.className = 'btn btn-primary';
    document.body.style.cursor = '';
    highlightOverlay.style.display = 'none';
    highlightedEl = null;
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('mouseout', onMouseOut, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
  }

  function showInputPanel() {
    if (!selectedEl) return;
    var text = getElementText(selectedEl);
    var tag = selectedEl.tagName.toLowerCase();
    selectedInfo.textContent = 'Selected: <' + tag + '> "' + (text.length > 100 ? text.substring(0, 100) + '...' : text) + '"';
    changeInput.value = '';
    panel.style.display = 'block';
    changeInput.focus();
  }

  function hideInputPanel() {
    panel.style.display = 'none';
    selectedEl = null;
  }

  function submitChange() {
    if (!selectedEl) return;
    var text = getElementText(selectedEl);
    var changeText = changeInput.value.trim();
    if (!changeText) {
      showToast('Please describe the change', 'error');
      return;
    }

    var payload = {
      currentUrl: window.location.href,
      elementText: text,
      cssSelector: getCssSelector(selectedEl),
      tagName: selectedEl.tagName.toLowerCase(),
      requestedChange: changeText,
      pageTitle: getPageTitle(),
      nearestHeading: getNearestHeading(selectedEl),
      parentContext: getParentContext(selectedEl),
      outerHtml: getOuterHtml(selectedEl)
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    apiRequest('POST', '/projects/' + projectId + '/preview/changes', payload)
      .then(function() {
        changeCount++;
        changesBtn.textContent = 'Changes (' + changeCount + ')';
        hideInputPanel();
        showToast('Change submitted! AI is processing...', 'success');
      })
      .catch(function(err) {
        showToast('Failed to submit: ' + err.message, 'error');
      })
      .finally(function() {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
      });
  }

  // ── Toast ──
  function showToast(message, type) {
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + (type || 'info');
    toast.textContent = message;
    shadow.appendChild(toast);
    setTimeout(function() {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
  }

  // ── Deactivate ──
  function deactivate() {
    exitAnnotateMode();
    hideInputPanel();
    toolbar.style.display = 'none';
  }

  // ── Button Bindings ──
  annotateBtn.addEventListener('click', function() {
    if (isAnnotateMode) {
      exitAnnotateMode();
    } else {
      hideInputPanel();
      enterAnnotateMode();
    }
  });

  changesBtn.addEventListener('click', function() {
    showToast('View changes in the Maintanium dashboard', 'info');
  });

  closeBtn.addEventListener('click', function() {
    deactivate();
    host.style.display = 'none';
  });

  cancelBtn.addEventListener('click', hideInputPanel);
  panelCloseBtn.addEventListener('click', hideInputPanel);
  submitBtn.addEventListener('click', submitChange);

  // ── Init ──
  showToast('Maintanium Preview active', 'info');
})();`;
