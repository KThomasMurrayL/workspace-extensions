(function () {
  const vscode = window.__vscode;

  const els = {
    search: document.getElementById('notes-search'),
    sort: document.getElementById('notes-sort'),
    btnNew: document.getElementById('notes-btn-new'),
    list: document.getElementById('notes-list'),
    title: document.getElementById('notes-title'),
    btnImage: document.getElementById('notes-btn-image'),
    btnPreview: document.getElementById('notes-btn-preview'),
    error: document.getElementById('notes-error'),
    editor: document.getElementById('notes-editor'),
    preview: document.getElementById('notes-preview'),
    inputOverlay: document.getElementById('notes-input-overlay'),
    inputTitle: document.getElementById('notes-input-title'),
    inputField: document.getElementById('notes-input-field'),
    btnInputOk: document.getElementById('notes-btn-input-ok'),
    btnInputCancel: document.getElementById('notes-btn-input-cancel'),
    confirmOverlay: document.getElementById('notes-confirm-overlay'),
    confirmText: document.getElementById('notes-confirm-text'),
    btnConfirmOk: document.getElementById('notes-btn-confirm-ok'),
    btnConfirmCancel: document.getElementById('notes-btn-confirm-cancel'),
  };

  let notes = [];
  let current = null;
  let dirty = false;
  let saveTimer = null;
  let previewing = false;
  let inputSubmit = null;
  let confirmSubmit = null;
  let sortMode = 'oldest';

  function readSavedState() {
    try {
      return vscode.getState() || {};
    } catch {
      return {};
    }
  }

  function persistState(patch) {
    try {
      vscode.setState(Object.assign({}, readSavedState(), patch));
    } catch {
      // ignore
    }
  }

  const savedState = readSavedState();
  if (savedState.noteSort) {
    sortMode = savedState.noteSort;
  }
  els.sort.value = sortMode;

  function showError(message) {
    els.error.textContent = message;
    els.error.classList.remove('hidden');
  }

  function hideError() {
    els.error.classList.add('hidden');
  }

  function sortedNotes() {
    const filter = els.search.value.trim().toLowerCase();
    const visible = notes.filter(
      note =>
        !filter ||
        note.name.toLowerCase().includes(filter) ||
        note.path.toLowerCase().includes(filter)
    );
    const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
    const sorted = visible.slice();
    switch (sortMode) {
      case 'newest':
        sorted.sort((a, b) => (b.mtime || 0) - (a.mtime || 0) || collator.compare(a.name, b.name));
        break;
      case 'name-asc':
        sorted.sort((a, b) => collator.compare(a.name, b.name));
        break;
      case 'name-desc':
        sorted.sort((a, b) => collator.compare(b.name, a.name));
        break;
      case 'oldest':
      default:
        sorted.sort((a, b) => (a.mtime || 0) - (b.mtime || 0) || collator.compare(a.name, b.name));
        break;
    }
    return sorted;
  }

  function renderList() {
    const visible = sortedNotes();
    els.list.innerHTML = '';
    if (!visible.length) {
      const empty = document.createElement('li');
      empty.className = 'notes-empty';
      empty.textContent = notes.length ? 'No matches' : 'No notes yet \u2014 press +';
      els.list.appendChild(empty);
      return;
    }
    for (const note of visible) {
      const item = document.createElement('li');
      item.className = 'note-item' + (current && current.path === note.path ? ' active' : '');
      const name = document.createElement('span');
      name.className = 'note-name';
      name.textContent = note.name;
      name.title = note.path;
      const remove = document.createElement('button');
      remove.className = 'note-delete';
      remove.textContent = '\u2715';
      remove.title = 'Delete note';
      remove.addEventListener('click', event => {
        event.stopPropagation();
        askConfirm(`Delete \u201c${note.name}\u201d?`, () => {
          vscode.postMessage({ type: 'notes-delete', path: note.path });
        });
      });
      item.appendChild(name);
      item.appendChild(remove);
      item.addEventListener('click', () => openNote(note));
      els.list.appendChild(item);
    }
  }

  function flushSave() {
    if (!current || !dirty) {
      return;
    }
    dirty = false;
    vscode.postMessage({ type: 'notes-save', path: current.path, text: els.editor.value });
  }

  function setPreviewMode(on) {
    previewing = on;
    els.preview.classList.toggle('visible', on);
    els.editor.style.display = on ? 'none' : '';
    els.btnPreview.textContent = on ? 'Edit' : 'Preview';
  }

  function openNote(note) {
    if (current && current.path === note.path && els.editor.value) {
      return;
    }
    flushSave();
    current = note;
    els.title.textContent = note.name;
    els.editor.placeholder = 'Loading\u2026';
    hideError();
    if (previewing) {
      setPreviewMode(false);
    }
    vscode.postMessage({ type: 'notes-open', path: note.path });
    renderList();
  }

  els.search.addEventListener('input', renderList);

  els.sort.addEventListener('change', () => {
    sortMode = els.sort.value;
    persistState({ noteSort: sortMode });
    renderList();
  });

  els.btnNew.addEventListener('click', () => {
    askInput('New note', 'Note name', name => {
      vscode.postMessage({ type: 'notes-create', name });
    });
  });

  els.btnImage.addEventListener('click', () => {
    if (!current) {
      showError('Open a note first.');
      return;
    }
    vscode.postMessage({ type: 'notes-insert-image', notePath: current.path });
  });

  els.btnPreview.addEventListener('click', () => {
    if (!current) {
      return;
    }
    if (previewing) {
      setPreviewMode(false);
      return;
    }
    flushSave();
    vscode.postMessage({ type: 'notes-preview', path: current.path });
    setPreviewMode(true);
  });

  els.editor.addEventListener('input', () => {
    dirty = true;
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      saveTimer = null;
      flushSave();
    }, 700);
  });
  els.editor.addEventListener('blur', flushSave);
  els.editor.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      flushSave();
    }
  });

  function askInput(title, placeholder, onSubmit) {
    els.inputTitle.textContent = title;
    els.inputField.placeholder = placeholder || '';
    els.inputField.value = '';
    inputSubmit = onSubmit;
    els.inputOverlay.classList.remove('hidden');
    els.inputField.focus();
  }

  function hideInput() {
    inputSubmit = null;
    els.inputOverlay.classList.add('hidden');
  }

  function submitInput() {
    const value = els.inputField.value.trim();
    const callback = inputSubmit;
    hideInput();
    if (callback && value) {
      callback(value);
    }
  }

  els.btnInputOk.addEventListener('click', submitInput);
  els.btnInputCancel.addEventListener('click', hideInput);
  els.inputField.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitInput();
    }
  });

  function askConfirm(text, onOk) {
    els.confirmText.textContent = text;
    confirmSubmit = onOk;
    els.confirmOverlay.classList.remove('hidden');
    els.btnConfirmOk.focus();
  }

  function hideConfirm() {
    confirmSubmit = null;
    els.confirmOverlay.classList.add('hidden');
  }

  els.btnConfirmOk.addEventListener('click', () => {
    const callback = confirmSubmit;
    hideConfirm();
    if (callback) {
      callback();
    }
  });
  els.btnConfirmCancel.addEventListener('click', hideConfirm);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') {
      return;
    }
    if (!els.confirmOverlay.classList.contains('hidden')) {
      hideConfirm();
    } else if (!els.inputOverlay.classList.contains('hidden')) {
      hideInput();
    }
  });

  function escapeHtml(text) {
    return text.replace(/[&<>"']/g, ch => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  function inline(text) {
    let out = escapeHtml(text);
    out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">');
    out = out.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    return out;
  }

  function renderMarkdown(text) {
    const lines = text.split(/\r?\n/);
    const html = [];
    let listOpen = false;
    let inCode = false;
    const closeList = () => {
      if (listOpen) {
        html.push('</ul>');
        listOpen = false;
      }
    };
    for (const line of lines) {
      if (line.trim().startsWith('```')) {
        closeList();
        html.push(inCode ? '</code></pre>' : '<pre><code>');
        inCode = !inCode;
        continue;
      }
      if (inCode) {
        html.push(escapeHtml(line));
        continue;
      }
      const heading = /^(#{1,3})\s+(.*)$/.exec(line);
      if (heading) {
        closeList();
        const level = heading[1].length;
        html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
        continue;
      }
      const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
      if (bullet) {
        if (!listOpen) {
          html.push('<ul>');
          listOpen = true;
        }
        html.push(`<li>${inline(bullet[1])}</li>`);
        continue;
      }
      const quote = /^>\s?(.*)$/.exec(line);
      if (quote) {
        closeList();
        html.push(`<blockquote>${inline(quote[1])}</blockquote>`);
        continue;
      }
      if (!line.trim()) {
        closeList();
        continue;
      }
      closeList();
      html.push(`<p>${inline(line)}</p>`);
    }
    closeList();
    if (inCode) {
      html.push('</code></pre>');
    }
    return html.join('\n');
  }

  function insertAtCursor(text) {
    const start = els.editor.selectionStart || 0;
    const end = els.editor.selectionEnd || 0;
    const value = els.editor.value;
    els.editor.value = value.slice(0, start) + text + value.slice(end);
    els.editor.selectionStart = els.editor.selectionEnd = start + text.length;
    els.editor.focus();
    dirty = true;
    flushSave();
  }

  window.addEventListener('message', event => {
    const message = event.data;
    if (!message || typeof message !== 'object') {
      return;
    }
    if (message.type === 'notes-list') {
      notes = message.notes || [];
      if (current && !notes.some(note => note.path === current.path)) {
        current = null;
        els.title.textContent = 'No note open';
        els.editor.value = '';
      }
      renderList();
    } else if (message.type === 'notes-content') {
      if (current && current.path === message.path) {
        els.editor.value = message.text || '';
        els.editor.placeholder = 'Start typing\u2026';
        dirty = false;
      }
    } else if (message.type === 'notes-opened') {
      const note = notes.find(candidate => candidate.path === message.path);
      if (note) {
        current = note;
        els.title.textContent = note.name;
        renderList();
      }
    } else if (message.type === 'notes-image') {
      insertAtCursor(message.markdown || '');
    } else if (message.type === 'notes-previewResult') {
      els.preview.innerHTML = renderMarkdown(message.text || '');
    } else if (message.type === 'notes-error') {
      showError(message.message || 'Unknown error');
    }
  });

  vscode.postMessage({ type: 'notes-ready' });
})();
