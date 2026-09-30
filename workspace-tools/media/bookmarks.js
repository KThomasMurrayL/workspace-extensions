(function () {
  const vscode = window.__vscode;

  const els = {
    search: document.getElementById('bm-search'),
    category: document.getElementById('bm-category'),
    sort: document.getElementById('bm-sort'),
    list: document.getElementById('bm-list'),
    empty: document.getElementById('bm-empty'),
    error: document.getElementById('bm-error'),
    editOverlay: document.getElementById('bm-edit-overlay'),
    editComment: document.getElementById('bm-edit-comment'),
    editCategory: document.getElementById('bm-edit-category'),
    editCancel: document.getElementById('bm-edit-cancel'),
    editSave: document.getElementById('bm-edit-save'),
    confirmOverlay: document.getElementById('bm-confirm-overlay'),
    confirmText: document.getElementById('bm-confirm-text'),
    confirmOk: document.getElementById('bm-confirm-ok'),
    confirmCancel: document.getElementById('bm-confirm-cancel'),
  };

  let bookmarks = [];
  let categories = [];
  let filterCategory = '';
  let sortMode = 'file';
  let editId = null;
  let pendingDeleteId = null;

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

  const saved = readSavedState();
  if (typeof saved.bmCategory === 'string') {
    filterCategory = saved.bmCategory;
  }
  if (typeof saved.bmSort === 'string') {
    sortMode = saved.bmSort;
  }

  function labelOf(id) {
    const found = categories.find(category => category.id === id);
    return found ? found.label : (id ? id : 'None');
  }

  function colorOf(id) {
    const found = categories.find(category => category.id === id);
    return found ? found.color : '#6e6e73';
  }

  function visibleBookmarks() {
    const query = els.search.value.trim().toLowerCase();
    let list = bookmarks.filter(bookmark => {
      if (filterCategory === '__none__') {
        if (bookmark.category) {
          return false;
        }
      } else if (filterCategory && bookmark.category !== filterCategory) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = [
        bookmark.file,
        String(bookmark.line + 1),
        bookmark.comment || '',
        bookmark.text || '',
        labelOf(bookmark.category),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
    list = list.slice();
    if (sortMode === 'newest') {
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else if (sortMode === 'oldest') {
      list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    } else {
      list.sort(
        (a, b) => a.file.localeCompare(b.file) || (a.line || 0) - (b.line || 0)
      );
    }
    return list;
  }

  function renderFilterBar() {
    const current = els.category.value;
    els.category.innerHTML = '';
    const all = document.createElement('option');
    all.value = '';
    all.textContent = 'All categories';
    els.category.appendChild(all);
    for (const category of categories) {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.label;
      els.category.appendChild(option);
    }
    const none = document.createElement('option');
    none.value = '__none__';
    none.textContent = 'No category';
    els.category.appendChild(none);
    els.category.value = filterCategory;
    if (els.category.value !== filterCategory) {
      els.category.value = '';
      filterCategory = '';
    }
    els.sort.value = sortMode;

    els.editCategory.innerHTML = '';
    const noneEdit = document.createElement('option');
    noneEdit.value = '';
    noneEdit.textContent = 'None';
    els.editCategory.appendChild(noneEdit);
    for (const category of categories) {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.label;
      els.editCategory.appendChild(option);
    }
  }

  function showError(message) {
    els.error.textContent = message;
    els.error.classList.remove('hidden');
  }

  function hideError() {
    els.error.classList.add('hidden');
  }

  function render() {
    renderFilterBar();
    const visible = visibleBookmarks();
    els.list.innerHTML = '';
    els.empty.classList.toggle('hidden', bookmarks.length > 0);
    if (bookmarks.length && !visible.length) {
      const none = document.createElement('div');
      none.className = 'bm-empty';
      none.textContent = 'No bookmarks match the filter';
      els.list.appendChild(none);
      return;
    }
    for (const bookmark of visible) {
      const row = document.createElement('div');
      row.className = 'bm-row';

      const chip = document.createElement('span');
      chip.className = 'bm-chip';
      chip.textContent = labelOf(bookmark.category);
      chip.style.background = colorOf(bookmark.category);

      const main = document.createElement('div');
      main.className = 'bm-main';

      const location = document.createElement('div');
      location.className = 'bm-loc';
      location.textContent = `${bookmark.file}:${bookmark.line + 1}`;

      const comment = document.createElement('div');
      comment.className = 'bm-comment';
      comment.textContent = bookmark.comment || '(no comment)';

      const snippet = document.createElement('div');
      snippet.className = 'bm-snippet';
      snippet.textContent = bookmark.text || '';

      main.appendChild(location);
      main.appendChild(comment);
      if (bookmark.text) {
        main.appendChild(snippet);
      }

      const actions = document.createElement('div');
      actions.className = 'bm-actions';
      const edit = document.createElement('button');
      edit.className = 'bm-btn';
      edit.textContent = '\u270e';
      edit.title = 'Edit comment and category';
      const remove = document.createElement('button');
      remove.className = 'bm-btn';
      remove.textContent = '\u2715';
      remove.title = 'Delete bookmark';
      actions.appendChild(edit);
      actions.appendChild(remove);

      row.appendChild(chip);
      row.appendChild(main);
      row.appendChild(actions);

      row.addEventListener('click', () => {
        vscode.postMessage({ type: 'bookmarks-open', id: bookmark.id });
      });
      edit.addEventListener('click', event => {
        event.stopPropagation();
        openEdit(bookmark);
      });
      remove.addEventListener('click', event => {
        event.stopPropagation();
        pendingDeleteId = bookmark.id;
        els.confirmText.textContent = `Delete the bookmark on ${bookmark.file}:${bookmark.line + 1}?`;
        els.confirmOverlay.classList.remove('hidden');
        els.confirmOk.focus();
      });

      els.list.appendChild(row);
    }
  }

  function openEdit(bookmark) {
    editId = bookmark.id;
    els.editComment.value = bookmark.comment || '';
    els.editCategory.value = bookmark.category || '';
    els.editOverlay.classList.remove('hidden');
    els.editComment.focus();
  }

  function closeEdit() {
    editId = null;
    els.editOverlay.classList.add('hidden');
  }

  els.search.addEventListener('input', render);
  els.category.addEventListener('change', () => {
    filterCategory = els.category.value;
    persistState({ bmCategory: filterCategory });
    render();
  });
  els.sort.addEventListener('change', () => {
    sortMode = els.sort.value;
    persistState({ bmSort: sortMode });
    render();
  });

  els.editCancel.addEventListener('click', closeEdit);
  els.editSave.addEventListener('click', () => {
    if (!editId) {
      closeEdit();
      return;
    }
    vscode.postMessage({
      type: 'bookmarks-update',
      id: editId,
      comment: els.editComment.value.trim(),
      category: els.editCategory.value,
    });
    closeEdit();
  });
  els.editComment.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      els.editSave.click();
    }
  });

  els.confirmCancel.addEventListener('click', () => {
    pendingDeleteId = null;
    els.confirmOverlay.classList.add('hidden');
  });
  els.confirmOk.addEventListener('click', () => {
    const id = pendingDeleteId;
    pendingDeleteId = null;
    els.confirmOverlay.classList.add('hidden');
    if (id) {
      vscode.postMessage({ type: 'bookmarks-delete', id });
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') {
      return;
    }
    if (!els.confirmOverlay.classList.contains('hidden')) {
      els.confirmCancel.click();
    } else if (!els.editOverlay.classList.contains('hidden')) {
      closeEdit();
    }
  });

  window.addEventListener('message', event => {
    const message = event.data;
    if (!message || typeof message !== 'object') {
      return;
    }
    if (message.type === 'bookmarks-state') {
      bookmarks = message.bookmarks || [];
      categories = message.categories || [];
      hideError();
      render();
    } else if (message.type === 'bookmarks-error') {
      showError(message.message || 'Unknown error');
    }
  });

  vscode.postMessage({ type: 'bookmarks-ready' });
})();
