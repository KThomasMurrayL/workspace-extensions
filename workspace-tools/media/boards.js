// Generated from boards/media/board.js — do not edit directly
(function () {
  const vscode = window.__vscode;

  const els = {
    board: document.getElementById('boards-board'),
    boardSelect: document.getElementById('boards-board-select'),
    btnNewBoard: document.getElementById('boards-btn-new-board'),
    btnRenameBoard: document.getElementById('boards-btn-rename-board'),
    btnDeleteBoard: document.getElementById('boards-btn-delete-board'),
    btnNewList: document.getElementById('boards-btn-new-list'),
    cardOverlay: document.getElementById('boards-card-overlay'),
    cardTitle: document.getElementById('boards-card-title'),
    cardDesc: document.getElementById('boards-card-desc'),
    checklistProgress: document.getElementById('boards-checklist-progress'),
    checklistItems: document.getElementById('boards-checklist-items'),
    checklistNew: document.getElementById('boards-checklist-new'),
    btnCardDelete: document.getElementById('boards-btn-card-delete'),
    btnCardNote: document.getElementById('boards-btn-card-note'),
    btnCardClose: document.getElementById('boards-btn-card-close'),
    inputOverlay: document.getElementById('boards-input-overlay'),
    inputTitle: document.getElementById('boards-input-title'),
    inputField: document.getElementById('boards-input-field'),
    btnInputOk: document.getElementById('boards-btn-input-ok'),
    btnInputCancel: document.getElementById('boards-btn-input-cancel'),
    confirmOverlay: document.getElementById('boards-confirm-overlay'),
    confirmText: document.getElementById('boards-confirm-text'),
    btnConfirmOk: document.getElementById('boards-btn-confirm-ok'),
    btnConfirmCancel: document.getElementById('boards-btn-confirm-cancel'),
  };

  let state = { version: 1, boards: [], lastBoardId: null };
  let activeCardId = null;
  let saveTimer = null;
  let dragCardId = null;
  let suppressClick = false;
  let inputSubmit = null;
  let confirmSubmit = null;

  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function currentBoard() {
    if (!state.boards.length) {
      return null;
    }
    let board = state.boards.find(candidate => candidate.id === state.lastBoardId);
    if (!board) {
      board = state.boards[0];
      state.lastBoardId = board.id;
    }
    return board;
  }

  function findCard(id) {
    for (const board of state.boards) {
      for (const list of board.lists) {
        const card = list.cards.find(candidate => candidate.id === id);
        if (card) {
          return card;
        }
      }
    }
    return null;
  }

  function findListOfCard(id) {
    for (const board of state.boards) {
      for (const list of board.lists) {
        if (list.cards.some(card => card.id === id)) {
          return list;
        }
      }
    }
    return null;
  }

  function queueSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      saveTimer = null;
      vscode.postMessage({ type: 'boards-save', data: state });
    }, 250);
  }

  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (value === undefined || value === null) {
          continue;
        }
        if (key === 'class') {
          node.className = value;
        } else if (key === 'text') {
          node.textContent = value;
        } else if (key === 'value') {
          node.value = value;
        } else if (key === 'dataset') {
          Object.assign(node.dataset, value);
        } else if (key.startsWith('on') && typeof value === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else {
          node.setAttribute(key, value);
        }
      }
    }
    for (const child of [].concat(children || [])) {
      if (!child) {
        continue;
      }
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function iconButton(label, title, onClick) {
    const button = el('button', { class: 'icon-btn', text: label, title });
    button.addEventListener('click', event => {
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  function render() {
    renderToolbar();
    renderBoardArea();
  }

  function renderToolbar() {
    const board = currentBoard();
    els.boardSelect.innerHTML = '';
    for (const candidate of state.boards) {
      const option = document.createElement('option');
      option.value = candidate.id;
      option.textContent = candidate.name;
      if (board && candidate.id === board.id) {
        option.selected = true;
      }
      els.boardSelect.appendChild(option);
    }
    const hasBoard = Boolean(board);
    els.boardSelect.disabled = !hasBoard;
    els.btnRenameBoard.disabled = !hasBoard;
    els.btnDeleteBoard.disabled = !hasBoard;
    els.btnNewList.disabled = !hasBoard;
  }

  function renderBoardArea() {
    const board = currentBoard();
    els.board.innerHTML = '';
    if (!board) {
      const empty = el('div', { class: 'empty' });
      empty.appendChild(el('p', { text: 'No boards yet.' }));
      const create = el('button', { class: 'primary', text: 'Create a board' });
      create.addEventListener('click', newBoardFlow);
      empty.appendChild(create);
      els.board.appendChild(empty);
      return;
    }
    for (const list of board.lists) {
      els.board.appendChild(renderList(board, list));
    }
    const addList = el('button', { class: 'add-list', text: '+ Add list' });
    addList.addEventListener('click', newListFlow);
    els.board.appendChild(addList);
  }

  function renderList(board, list) {
    const listEl = el('section', { class: 'list', dataset: { listId: list.id } });

    const title = el('div', { class: 'list-title', text: list.name, title: 'Double-click to rename' });
    title.addEventListener('dblclick', () => {
      renameInline(title, list.name, name => {
        list.name = name;
        queueSave();
        render();
      });
    });

    const header = el('header', { class: 'list-header' }, [
      title,
      el('span', { class: 'list-count', text: String(list.cards.length) }),
      iconButton('\u2039', 'Move list left', () => moveList(board, list, -1)),
      iconButton('\u203a', 'Move list right', () => moveList(board, list, 1)),
      iconButton('\u2715', 'Delete list', () => {
        askConfirm(
          `Delete list \u201c${list.name}\u201d and its ${list.cards.length} card(s)?`,
          'Delete',
          () => {
            board.lists = board.lists.filter(candidate => candidate.id !== list.id);
            queueSave();
            render();
          }
        );
      }),
    ]);

    const cards = el('div', { class: 'cards', dataset: { listId: list.id } });
    for (const card of list.cards) {
      cards.appendChild(renderCard(card));
    }

    const addCard = el('button', { class: 'add-card', text: '+ Add a card' });
    addCard.addEventListener('click', () => showComposer(list, addCard));

    listEl.appendChild(header);
    listEl.appendChild(cards);
    listEl.appendChild(addCard);
    return listEl;
  }

  function renderCard(card) {
    const node = el('article', { class: 'card', draggable: 'true', dataset: { cardId: card.id } });
    node.appendChild(el('div', { class: 'card-title', text: card.title }));

    const meta = el('div', { class: 'card-meta' });
    if (card.description && card.description.trim()) {
      meta.appendChild(el('span', { class: 'badge', title: card.description, text: '\u2261' }));
    }
    const items = card.checklist || [];
    if (items.length) {
      const done = items.filter(item => item.done).length;
      meta.appendChild(
        el('span', {
          class: done === items.length ? 'badge badge-done' : 'badge',
          title: 'Checklist',
          text: `\u2713 ${done}/${items.length}`,
        })
      );
    }
    if (meta.childNodes.length) {
      node.appendChild(meta);
    }

    node.addEventListener('click', () => {
      if (!suppressClick) {
        openCard(card.id);
      }
    });
    return node;
  }

  function renderChecklist() {
    const card = activeCardId ? findCard(activeCardId) : null;
    els.checklistItems.innerHTML = '';
    if (!card) {
      els.checklistProgress.textContent = '';
      return;
    }
    const items = card.checklist || (card.checklist = []);
    const done = items.filter(item => item.done).length;
    els.checklistProgress.textContent = items.length ? `${done}/${items.length}` : 'empty';
    for (const item of items) {
      const row = el('div', { class: item.done ? 'checklist-item done' : 'checklist-item' });
      const checkbox = el('input', { type: 'checkbox' });
      checkbox.checked = Boolean(item.done);
      checkbox.addEventListener('change', () => {
        item.done = checkbox.checked;
        queueSave();
        renderChecklist();
      });
      row.appendChild(checkbox);
      row.appendChild(el('span', { class: 'checklist-text', text: item.text }));
      row.appendChild(
        iconButton('\u2715', 'Remove item', () => {
          card.checklist = card.checklist.filter(candidate => candidate.id !== item.id);
          queueSave();
          renderChecklist();
        })
      );
      els.checklistItems.appendChild(row);
    }
  }

  function showComposer(list, addButton) {
    const existing = addButton.previousElementSibling;
    if (existing && existing.classList.contains('composer')) {
      existing.querySelector('textarea').focus();
      return;
    }
    const wrap = el('div', { class: 'composer' });
    const textarea = el('textarea', { class: 'composer-input', placeholder: 'Enter a title\u2026', rows: '2' });
    const actions = el('div', { class: 'composer-actions' });
    const add = el('button', { class: 'primary', text: 'Add card' });
    const cancel = el('button', { text: 'Cancel' });
    actions.appendChild(add);
    actions.appendChild(cancel);
    wrap.appendChild(textarea);
    wrap.appendChild(actions);
    addButton.style.display = 'none';
    addButton.parentElement.insertBefore(wrap, addButton);
    textarea.focus();

    const close = () => {
      wrap.remove();
      addButton.style.display = '';
    };
    const commit = () => {
      const title = textarea.value.trim();
      if (!title) {
        close();
        return;
      }
      list.cards.push({ id: uid(), title, description: '', checklist: [], createdAt: Date.now() });
      queueSave();
      render();
    };
    add.addEventListener('click', commit);
    cancel.addEventListener('click', close);
    textarea.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        commit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    });
  }

  function renameInline(node, value, commit) {
    const input = el('input', { class: 'inline-edit', type: 'text' });
    input.value = value;
    node.replaceWith(input);
    input.focus();
    input.select();
    let finished = false;
    const finish = save => {
      if (finished) {
        return;
      }
      finished = true;
      const next = input.value.trim();
      input.replaceWith(node);
      if (save && next && next !== value) {
        commit(next);
      } else {
        render();
      }
    };
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        finish(true);
      } else if (event.key === 'Escape') {
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
  }

  function openCard(cardId) {
    const card = findCard(cardId);
    if (!card) {
      return;
    }
    activeCardId = cardId;
    els.cardTitle.value = card.title;
    els.cardDesc.value = card.description || '';
    renderChecklist();
    els.cardOverlay.classList.remove('hidden');
    els.cardTitle.focus();
  }

  function closeCard() {
    activeCardId = null;
    els.cardOverlay.classList.add('hidden');
    render();
  }

  function askInput(title, placeholder, initial, onSubmit) {
    els.inputTitle.textContent = title;
    els.inputField.placeholder = placeholder || '';
    els.inputField.value = initial || '';
    inputSubmit = onSubmit;
    els.inputOverlay.classList.remove('hidden');
    els.inputField.focus();
    els.inputField.select();
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

  function askConfirm(text, okLabel, onOk) {
    els.confirmText.textContent = text;
    els.btnConfirmOk.textContent = okLabel || 'Delete';
    confirmSubmit = onOk;
    els.confirmOverlay.classList.remove('hidden');
    els.btnConfirmOk.focus();
  }

  function hideConfirm() {
    confirmSubmit = null;
    els.confirmOverlay.classList.add('hidden');
  }

  function newBoardFlow() {
    askInput('New board', 'Board name', '', name => {
      const board = { id: uid(), name, lists: [] };
      state.boards.push(board);
      state.lastBoardId = board.id;
      queueSave();
      render();
    });
  }

  function newListFlow() {
    const board = currentBoard();
    if (!board) {
      return;
    }
    askInput('New list', 'List name', '', name => {
      board.lists.push({ id: uid(), name, cards: [] });
      queueSave();
      render();
    });
  }

  function moveList(board, list, delta) {
    const index = board.lists.indexOf(list);
    const target = index + delta;
    if (target < 0 || target >= board.lists.length) {
      return;
    }
    board.lists.splice(index, 1);
    board.lists.splice(target, 0, list);
    queueSave();
    render();
  }

  function dragAfterElement(container, y) {
    const cards = Array.from(container.querySelectorAll('.card:not(.dragging)'));
    let closest = { offset: -Infinity, element: null };
    for (const child of cards) {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        closest = { offset, element: child };
      }
    }
    return closest.element;
  }

  function syncFromDom() {
    const board = currentBoard();
    if (!board) {
      return;
    }
    const allCards = new Map();
    for (const list of board.lists) {
      for (const card of list.cards) {
        allCards.set(card.id, card);
      }
    }
    for (const listEl of els.board.querySelectorAll('.list')) {
      const list = board.lists.find(candidate => candidate.id === listEl.dataset.listId);
      if (!list) {
        continue;
      }
      const ids = Array.from(listEl.querySelectorAll('.card')).map(node => node.dataset.cardId);
      list.cards = ids.map(id => allCards.get(id)).filter(Boolean);
    }
  }

  els.board.addEventListener('dragstart', event => {
    const cardEl = event.target.closest('.card');
    if (!cardEl) {
      return;
    }
    dragCardId = cardEl.dataset.cardId;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', dragCardId);
    requestAnimationFrame(() => cardEl.classList.add('dragging'));
  });

  els.board.addEventListener('dragover', event => {
    if (!dragCardId) {
      return;
    }
    const cards = event.target.closest('.cards');
    if (!cards) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const dragging = els.board.querySelector('.card.dragging');
    if (!dragging) {
      return;
    }
    const after = dragAfterElement(cards, event.clientY);
    if (after == null) {
      cards.appendChild(dragging);
    } else {
      cards.insertBefore(dragging, after);
    }
    const listEl = cards.closest('.list');
    els.board.querySelectorAll('.list.drag-over').forEach(candidate => {
      if (candidate !== listEl) {
        candidate.classList.remove('drag-over');
      }
    });
    if (listEl) {
      listEl.classList.add('drag-over');
    }
  });

  els.board.addEventListener('dragend', () => {
    if (!dragCardId) {
      return;
    }
    dragCardId = null;
    els.board.querySelectorAll('.card.dragging').forEach(node => node.classList.remove('dragging'));
    els.board.querySelectorAll('.list.drag-over').forEach(node => node.classList.remove('drag-over'));
    syncFromDom();
    suppressClick = true;
    setTimeout(() => {
      suppressClick = false;
    }, 150);
    render();
    queueSave();
  });

  els.boardSelect.addEventListener('change', () => {
    state.lastBoardId = els.boardSelect.value;
    queueSave();
    render();
  });

  els.btnNewBoard.addEventListener('click', newBoardFlow);
  els.btnNewList.addEventListener('click', newListFlow);
  els.btnRenameBoard.addEventListener('click', () => {
    const board = currentBoard();
    if (!board) {
      return;
    }
    askInput('Rename board', 'Board name', board.name, name => {
      board.name = name;
      queueSave();
      render();
    });
  });
  els.btnDeleteBoard.addEventListener('click', () => {
    const board = currentBoard();
    if (!board) {
      return;
    }
    askConfirm(`Delete board \u201c${board.name}\u201d?`, 'Delete', () => {
      state.boards = state.boards.filter(candidate => candidate.id !== board.id);
      state.lastBoardId = state.boards[0] ? state.boards[0].id : null;
      queueSave();
      render();
    });
  });

  els.cardTitle.addEventListener('input', () => {
    const card = activeCardId ? findCard(activeCardId) : null;
    if (card) {
      card.title = els.cardTitle.value;
      queueSave();
    }
  });
  els.cardDesc.addEventListener('input', () => {
    const card = activeCardId ? findCard(activeCardId) : null;
    if (card) {
      card.description = els.cardDesc.value;
      queueSave();
    }
  });
  els.checklistNew.addEventListener('keydown', event => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    const card = activeCardId ? findCard(activeCardId) : null;
    const text = els.checklistNew.value.trim();
    if (!card || !text) {
      return;
    }
    if (!Array.isArray(card.checklist)) {
      card.checklist = [];
    }
    card.checklist.push({ id: uid(), text, done: false });
    els.checklistNew.value = '';
    queueSave();
    renderChecklist();
  });
  els.btnCardClose.addEventListener('click', closeCard);
  els.btnCardNote.addEventListener('click', () => {
    const card = activeCardId ? findCard(activeCardId) : null;
    if (!card) {
      return;
    }
    vscode.postMessage({
      type: 'card-to-note',
      title: card.title || 'Card',
      description: card.description || '',
      checklist: card.checklist || [],
    });
  });
  els.btnCardDelete.addEventListener('click', () => {
    const card = activeCardId ? findCard(activeCardId) : null;
    if (!card) {
      return;
    }
    askConfirm(`Delete card \u201c${card.title}\u201d?`, 'Delete', () => {
      const list = findListOfCard(card.id);
      if (list) {
        list.cards = list.cards.filter(candidate => candidate.id !== card.id);
      }
      activeCardId = null;
      els.cardOverlay.classList.add('hidden');
      queueSave();
      render();
    });
  });
  els.cardOverlay.addEventListener('mousedown', event => {
    if (event.target === els.cardOverlay) {
      closeCard();
    }
  });

  els.btnInputOk.addEventListener('click', submitInput);
  els.btnInputCancel.addEventListener('click', hideInput);
  els.inputField.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitInput();
    }
  });

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
    } else if (!els.cardOverlay.classList.contains('hidden')) {
      closeCard();
    }
  });

  window.addEventListener('message', event => {
    const message = event.data;
    if (!message || typeof message !== 'object') {
      return;
    }
    if (message.type === 'boards-state') {
      state = message.data || { version: 1, boards: [], lastBoardId: null };
      if (!Array.isArray(state.boards)) {
        state.boards = [];
      }
      if (!state.lastBoardId && state.boards[0]) {
        state.lastBoardId = state.boards[0].id;
      }
      render();
      if (activeCardId && !findCard(activeCardId)) {
        activeCardId = null;
        els.cardOverlay.classList.add('hidden');
      }
      if (activeCardId) {
        renderChecklist();
      }
    } else if (message.type === 'boards-error') {
      els.board.innerHTML = '';
      els.board.appendChild(el('div', { class: 'empty error', text: message.message || 'Unknown error' }));
    }
  });

  vscode.postMessage({ type: 'boards-ready' });
})();
