// Generated from flow/media/flow.js — do not edit directly
(function () {
  const vscode = window.__vscode;
  const NS = 'http://www.w3.org/2000/svg';

  const els = {
    canvas: document.getElementById('flow-canvas'),
    world: document.getElementById('flow-world'),
    edges: document.getElementById('flow-edges'),
    nodes: document.getElementById('flow-nodes'),
    empty: document.getElementById('flow-empty'),
    hint: document.getElementById('flow-hint'),
    btnCreateFlow: document.getElementById('flow-btn-create-flow'),
    flowSelect: document.getElementById('flow-flow-select'),
    btnNewFlow: document.getElementById('flow-btn-new-flow'),
    btnRenameFlow: document.getElementById('flow-btn-rename-flow'),
    btnDeleteFlow: document.getElementById('flow-btn-delete-flow'),
    btnNewNode: document.getElementById('flow-btn-new-node'),
    btnOutline: document.getElementById('flow-btn-outline'),
    btnToBoard: document.getElementById('flow-btn-to-board'),
    btnToNote: document.getElementById('flow-btn-to-note'),
    btnClearFlow: document.getElementById('flow-btn-clear-flow'),
    btnZoomOut: document.getElementById('flow-btn-zoom-out'),
    btnZoomIn: document.getElementById('flow-btn-zoom-in'),
    zoomLabel: document.getElementById('flow-zoom-label'),
    btnFit: document.getElementById('flow-btn-fit'),
    inputOverlay: document.getElementById('flow-input-overlay'),
    inputTitle: document.getElementById('flow-input-title'),
    inputField: document.getElementById('flow-input-field'),
    btnInputOk: document.getElementById('flow-btn-input-ok'),
    btnInputCancel: document.getElementById('flow-btn-input-cancel'),
    confirmOverlay: document.getElementById('flow-confirm-overlay'),
    confirmText: document.getElementById('flow-confirm-text'),
    btnConfirmOk: document.getElementById('flow-btn-confirm-ok'),
    btnConfirmCancel: document.getElementById('flow-btn-confirm-cancel'),
  };

  const NODE_WIDTH = 170;
  const NODE_MIN_HEIGHT = 70;

  let state = { version: 1, flows: [], lastFlowId: null };
  let view = { x: 40, y: 40, scale: 1 };
  let rects = new Map();
  let saveTimer = null;
  let inputSubmit = null;
  let confirmSubmit = null;
  let initialFitDone = false;
  let pendingFit = false;
  let hasState = false;

  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function currentFlow() {
    if (!state.flows.length) {
      return null;
    }
    let flow = state.flows.find(candidate => candidate.id === state.lastFlowId);
    if (!flow) {
      flow = state.flows[0];
      state.lastFlowId = flow.id;
    }
    return flow;
  }

  function findNode(flow, id) {
    return flow.nodes.find(node => node.id === id) || null;
  }

  function getRect(node) {
    return rects.get(node.id) || { w: NODE_WIDTH, h: NODE_MIN_HEIGHT };
  }

  function nodeCenter(node) {
    const rect = getRect(node);
    return { x: node.x + rect.w / 2, y: node.y + rect.h / 2 };
  }

  function queueSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      saveTimer = null;
      vscode.postMessage({ type: 'flow-save', data: state });
    }, 250);
  }

  function esc(value) {
    return String(value).replace(/[&<>"']/g, ch => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  function clientToWorld(clientX, clientY) {
    const rect = els.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.x) / view.scale,
      y: (clientY - rect.top - view.y) / view.scale,
    };
  }

  function updateView() {
    els.world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    els.zoomLabel.textContent = Math.round(view.scale * 100) + '%';
    const size = 24 * view.scale;
    els.canvas.style.backgroundSize = `${size}px ${size}px`;
    els.canvas.style.backgroundPosition = `${view.x}px ${view.y}px`;
  }

  function zoomAt(factor, clientX, clientY) {
    const rect = els.canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const worldX = (px - view.x) / view.scale;
    const worldY = (py - view.y) / view.scale;
    const scale = Math.min(2.5, Math.max(0.25, view.scale * factor));
    view.x = px - worldX * scale;
    view.y = py - worldY * scale;
    view.scale = scale;
    updateView();
  }

  function zoomBy(factor) {
    const rect = els.canvas.getBoundingClientRect();
    zoomAt(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function fitView() {
    const flow = currentFlow();
    if (!flow || !flow.nodes.length) {
      view = { x: 40, y: 40, scale: 1 };
      updateView();
      return;
    }
    const rect = els.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      pendingFit = true;
      return;
    }
    pendingFit = false;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of flow.nodes) {
      const size = getRect(node);
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + size.w);
      maxY = Math.max(maxY, node.y + size.h);
    }
    const pad = 80;
    const width = maxX - minX + pad * 2;
    const height = maxY - minY + pad * 2;
    const scale = Math.min(1.5, Math.max(0.25, Math.min(rect.width / width, rect.height / height)));
    view.scale = scale;
    view.x = (rect.width - width * scale) / 2 - (minX - pad) * scale;
    view.y = (rect.height - height * scale) / 2 - (minY - pad) * scale;
    updateView();
  }

  function render() {
    renderToolbar();
    renderCanvas();
  }

  function renderToolbar() {
    const flow = currentFlow();
    els.flowSelect.innerHTML = '';
    for (const candidate of state.flows) {
      const option = document.createElement('option');
      option.value = candidate.id;
      option.textContent = candidate.name;
      if (flow && candidate.id === flow.id) {
        option.selected = true;
      }
      els.flowSelect.appendChild(option);
    }
    const hasFlow = Boolean(flow);
    els.flowSelect.disabled = !hasFlow;
    els.btnRenameFlow.disabled = !hasFlow;
    els.btnDeleteFlow.disabled = !hasFlow;
    els.btnNewNode.disabled = false;
    els.btnOutline.disabled = !hasFlow;
    els.btnClearFlow.disabled = !hasFlow;
    els.btnFit.disabled = !hasFlow;
  }

  function renderCanvas() {
    const flow = currentFlow();
    els.empty.classList.toggle('hidden', Boolean(flow));
    els.world.classList.toggle('hidden', !flow);
    els.hint.classList.toggle('hidden', !flow || flow.nodes.length > 0);
    if (!flow) {
      els.edges.innerHTML = '';
      els.nodes.innerHTML = '';
      rects = new Map();
      return;
    }

    els.nodes.innerHTML = '';
    for (const node of flow.nodes) {
      els.nodes.appendChild(renderNode(node));
    }

    measureNodes(flow);

    drawEdges();
    updateView();
  }

  function measureNodes(flow) {
    rects = new Map();
    for (const node of flow.nodes) {
      const el = els.nodes.querySelector(`.node[data-node-id="${node.id}"]`);
      if (el) {
        rects.set(node.id, {
          w: el.offsetWidth || NODE_WIDTH,
          h: el.offsetHeight || NODE_MIN_HEIGHT,
        });
      }
    }
  }

  function renderNode(node) {
    const el = document.createElement('div');
    el.className = 'node';
    el.style.left = node.x + 'px';
    el.style.top = node.y + 'px';
    el.dataset.nodeId = node.id;

    const text = document.createElement('div');
    text.className = 'node-text';
    text.textContent = node.text || 'Node';

    const port = document.createElement('div');
    port.className = 'node-port';
    port.title = 'Drag to another node to connect';

    const remove = document.createElement('button');
    remove.className = 'node-delete';
    remove.textContent = '\u2715';
    remove.title = 'Delete node';

    el.appendChild(text);
    el.appendChild(port);
    el.appendChild(remove);

    el.addEventListener('pointerdown', event => onNodePointerDown(event, node, el));
    el.addEventListener('dblclick', event => {
      if (event.target.closest('.node-port, .node-delete')) {
        return;
      }
      startEditNode(node, el, false);
    });
    port.addEventListener('pointerdown', event => startConnect(event, node));
    remove.addEventListener('pointerdown', event => event.stopPropagation());
    remove.addEventListener('click', event => {
      event.stopPropagation();
      confirmDeleteNode(node);
    });
    return el;
  }

  function onNodePointerDown(event, node, el) {
    if (event.button !== 0) {
      return;
    }
    if (event.target.closest('.node-port, .node-delete')) {
      return;
    }
    if (el.querySelector('textarea')) {
      return;
    }
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = node.x;
    const originY = node.y;
    let moved = false;
    const onMove = moveEvent => {
      const dx = (moveEvent.clientX - startX) / view.scale;
      const dy = (moveEvent.clientY - startY) / view.scale;
      if (Math.abs(dx) + Math.abs(dy) > 2) {
        moved = true;
      }
      node.x = Math.round(originX + dx);
      node.y = Math.round(originY + dy);
      el.style.left = node.x + 'px';
      el.style.top = node.y + 'px';
      drawEdges();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (moved) {
        queueSave();
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startEditNode(node, el, fresh) {
    if (el.querySelector('textarea')) {
      return;
    }
    const textEl = el.querySelector('.node-text');
    const editor = document.createElement('textarea');
    editor.className = 'node-edit';
    editor.value = node.text || '';
    el.appendChild(editor);
    textEl.style.visibility = 'hidden';
    editor.focus();
    editor.select();

    let finished = false;
    const finish = save => {
      if (finished) {
        return;
      }
      finished = true;
      const value = editor.value.replace(/\s+$/g, '').trim();
      if (save && value) {
        node.text = value;
      }
      editor.remove();
      textEl.style.visibility = '';
      textEl.textContent = node.text || 'Node';
      rects.set(node.id, { w: el.offsetWidth, h: el.offsetHeight });
      drawEdges();
      if (save) {
        queueSave();
      }
    };
    editor.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    });
    editor.addEventListener('blur', () => finish(true));
    editor.addEventListener('pointerdown', event => event.stopPropagation());
    if (fresh) {
      editor.select();
    }
  }

  function confirmDeleteNode(node) {
    askConfirm(`Delete node \u201c${node.text}\u201d?`, 'Delete', () => {
      const flow = currentFlow();
      if (!flow) {
        return;
      }
      flow.nodes = flow.nodes.filter(candidate => candidate.id !== node.id);
      flow.edges = flow.edges.filter(edge => edge.from !== node.id && edge.to !== node.id);
      queueSave();
      renderCanvas();
    });
  }

  function anchorFor(node, towards) {
    const rect = getRect(node);
    const center = nodeCenter(node);
    const dx = towards.x - center.x;
    const dy = towards.y - center.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return {
        x: dx >= 0 ? node.x + rect.w : node.x,
        y: center.y,
        dir: 'h',
        sign: dx >= 0 ? 1 : -1,
      };
    }
    return {
      x: center.x,
      y: dy >= 0 ? node.y + rect.h : node.y,
      dir: 'v',
      sign: dy >= 0 ? 1 : -1,
    };
  }

  function bezierPoint(p0, c1, c2, p1, t) {
    const mt = 1 - t;
    return {
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * p1.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * p1.y,
    };
  }

  function computeEdge(edge, flow) {
    const from = findNode(flow, edge.from);
    const to = findNode(flow, edge.to);
    if (!from || !to) {
      return null;
    }
    const a = anchorFor(from, nodeCenter(to));
    const b = anchorFor(to, nodeCenter(from));
    const span = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const offset = Math.max(40, Math.min(120, span * 0.35));
    let c1;
    let c2;
    if (a.dir === 'h') {
      c1 = { x: a.x + offset * a.sign, y: a.y };
      c2 = { x: b.x + offset * b.sign, y: b.y };
    } else {
      c1 = { x: a.x, y: a.y + offset * a.sign };
      c2 = { x: b.x, y: b.y + offset * b.sign };
    }
    const d = `M ${a.x} ${a.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`;
    const mid = bezierPoint(a, c1, c2, b, 0.5);
    return { d, mid };
  }

  function drawEdges() {
    const flow = currentFlow();
    if (!flow || !flow.nodes.length) {
      els.edges.innerHTML = '';
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of flow.nodes) {
      const size = getRect(node);
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + size.w);
      maxY = Math.max(maxY, node.y + size.h);
    }
    const pad = 300;
    const width = maxX - minX + pad * 2;
    const height = maxY - minY + pad * 2;
    els.edges.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${width} ${height}`);
    els.edges.style.left = (minX - pad) + 'px';
    els.edges.style.top = (minY - pad) + 'px';
    els.edges.style.width = width + 'px';
    els.edges.style.height = height + 'px';

    const defs =
      '<defs><marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
      '<path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"></path></marker></defs>';

    const parts = [defs];
    for (const edge of flow.edges) {
      const geometry = computeEdge(edge, flow);
      if (!geometry) {
        continue;
      }
      const label = edge.label
        ? `<text class="edge-label" x="${geometry.mid.x}" y="${geometry.mid.y - 10}">${esc(edge.label)}</text>`
        : '';
      parts.push(
        `<g class="edge" data-edge-id="${edge.id}">` +
          `<path class="edge-hit" d="${geometry.d}"></path>` +
          `<path class="edge-path" d="${geometry.d}" marker-end="url(#flow-arrow)"></path>` +
          label +
          `<g class="edge-delete" data-edge-del="${edge.id}" transform="translate(${geometry.mid.x}, ${geometry.mid.y})">` +
            '<circle r="9"></circle>' +
            '<path d="M -3.2 -3.2 L 3.2 3.2 M 3.2 -3.2 L -3.2 3.2"></path>' +
          '</g>' +
        '</g>'
      );
    }
    els.edges.innerHTML = parts.join('');
  }

  function deleteEdge(edgeId) {
    const flow = currentFlow();
    if (!flow) {
      return;
    }
    flow.edges = flow.edges.filter(edge => edge.id !== edgeId);
    queueSave();
    renderCanvas();
  }

  function editEdgeLabel(edgeId) {
    const flow = currentFlow();
    if (!flow) {
      return;
    }
    const edge = flow.edges.find(candidate => candidate.id === edgeId);
    if (!edge) {
      return;
    }
    askInput('Edge label', 'e.g. spec, approve, test', edge.label || '', label => {
      edge.label = label;
      queueSave();
      renderCanvas();
    });
  }

  function startConnect(event, node) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const temp = document.createElementNS(NS, 'path');
    temp.setAttribute('class', 'edge-path temp');
    els.edges.appendChild(temp);

    const onMove = moveEvent => {
      const point = clientToWorld(moveEvent.clientX, moveEvent.clientY);
      const anchor = anchorFor(node, point);
      const offset = 60;
      let c1;
      let c2;
      if (anchor.dir === 'h') {
        c1 = { x: anchor.x + offset * anchor.sign, y: anchor.y };
        c2 = { x: point.x - offset, y: point.y };
      } else {
        c1 = { x: anchor.x, y: anchor.y + offset * anchor.sign };
        c2 = { x: point.x, y: point.y - offset };
      }
      temp.setAttribute('d', `M ${anchor.x} ${anchor.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${point.x} ${point.y}`);
    };

    const onUp = upEvent => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      temp.remove();
      const target = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
      const targetEl = target && target.closest ? target.closest('.node') : null;
      const flow = currentFlow();
      if (!flow || !targetEl) {
        return;
      }
      const toId = targetEl.dataset.nodeId;
      if (!toId || toId === node.id) {
        return;
      }
      if (flow.edges.some(edge => edge.from === node.id && edge.to === toId)) {
        return;
      }
      flow.edges.push({ id: uid(), from: node.id, to: toId, label: '' });
      queueSave();
      renderCanvas();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function rectsOverlap(flow, x, y) {
    const gap = 14;
    return flow.nodes.some(node => {
      const size = getRect(node);
      return (
        x < node.x + size.w + gap &&
        x + NODE_WIDTH + gap > node.x &&
        y < node.y + size.h + gap &&
        y + NODE_MIN_HEIGHT + gap > node.y
      );
    });
  }

  function findFreeSpot(flow, x, y) {
    if (!rectsOverlap(flow, x, y)) {
      return { x, y };
    }
    for (let step = 1; step <= 60; step += 1) {
      const candidates = [
        { x: x + step * 40, y: y + step * 40 },
        { x: x + step * 40, y },
        { x, y: y + step * 40 },
      ];
      for (const candidate of candidates) {
        if (!rectsOverlap(flow, candidate.x, candidate.y)) {
          return candidate;
        }
      }
    }
    return { x: x + 400, y: y + 400 };
  }

  function addNodeAt(x, y, edit) {
    const flow = currentFlow();
    if (!flow) {
      return;
    }
    const spot = findFreeSpot(flow, Math.round(x), Math.round(y));
    const node = { id: uid(), x: spot.x, y: spot.y, text: 'New node' };
    flow.nodes.push(node);
    queueSave();
    renderCanvas();
    if (edit) {
      const el = els.nodes.querySelector(`.node[data-node-id="${node.id}"]`);
      if (el) {
        startEditNode(node, el, true);
      }
    }
  }

  function addNodeCentered() {
    let flow = currentFlow();
    if (!flow) {
      flow = { id: uid(), name: 'My Flow', nodes: [], edges: [] };
      state.flows.push(flow);
      state.lastFlowId = flow.id;
      render();
    }
    const rect = els.canvas.getBoundingClientRect();
    const point = clientToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
    addNodeAt(point.x - NODE_WIDTH / 2, point.y - NODE_MIN_HEIGHT / 2, true);
  }

  function buildOutline(flow) {
    const incoming = new Set(flow.edges.map(edge => edge.to));
    const roots = flow.nodes.filter(node => !incoming.has(node.id));
    const lines = [`# ${flow.name}`, ''];
    const visited = new Set();
    const walk = (node, depth, suffix) => {
      lines.push('  '.repeat(depth) + '- ' + node.text + (suffix || ''));
      visited.add(node.id);
      for (const edge of flow.edges) {
        if (edge.from !== node.id) {
          continue;
        }
        const next = findNode(flow, edge.to);
        if (!next || visited.has(next.id)) {
          continue;
        }
        walk(next, depth + 1, edge.label ? ` \u2014 ${edge.label}` : '');
      }
    };
    for (const root of roots) {
      if (!visited.has(root.id)) {
        walk(root, 0, '');
      }
    }
    const remaining = flow.nodes.filter(node => !visited.has(node.id));
    if (remaining.length) {
      lines.push('', '## Other');
      for (const node of remaining) {
        lines.push('- ' + node.text);
        visited.add(node.id);
      }
    }
    return lines.join('\n') + '\n';
  }

  function flowItemsForBoard(flow) {
    const incoming = new Set(flow.edges.map(edge => edge.to));
    const roots = flow.nodes.filter(node => !incoming.has(node.id));
    const items = [];
    const visited = new Set();
    const walk = node => {
      const next = flow.edges
        .filter(edge => edge.from === node.id)
        .map(edge => {
          const target = findNode(flow, edge.to);
          if (!target) {
            return null;
          }
          return `${target.text}${edge.label ? ` (${edge.label})` : ''}`;
        })
        .filter(Boolean);
      items.push({ title: node.text, next: next.join(', ') });
      visited.add(node.id);
      for (const edge of flow.edges) {
        if (edge.from !== node.id) {
          continue;
        }
        const target = findNode(flow, edge.to);
        if (target && !visited.has(target.id)) {
          walk(target);
        }
      }
    };
    for (const root of roots) {
      if (!visited.has(root.id)) {
        walk(root);
      }
    }
    for (const node of flow.nodes) {
      if (!visited.has(node.id)) {
        visited.add(node.id);
        items.push({ title: node.text, next: '' });
      }
    }
    return items;
  }

  function sendToBoard() {
    const flow = currentFlow();
    if (!flow || !flow.nodes.length) {
      return;
    }
    vscode.postMessage({
      type: 'flow-to-board',
      name: flow.name,
      items: flowItemsForBoard(flow),
    });
  }

  function sendToNote() {
    const flow = currentFlow();
    if (!flow || !flow.nodes.length) {
      return;
    }
    vscode.postMessage({
      type: 'flow-to-note',
      name: flow.name,
      text: buildOutline(flow),
    });
  }

  function copyOutline() {
    const flow = currentFlow();
    if (!flow) {
      return;
    }
    vscode.postMessage({ type: 'flow-copy', text: buildOutline(flow) });
    const original = els.btnOutline.textContent;
    els.btnOutline.textContent = 'Copied \u2713';
    setTimeout(() => {
      els.btnOutline.textContent = original;
    }, 1200);
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

  function newFlowFlow() {
    askInput('New flow', 'Flow name', '', name => {
      const flow = { id: uid(), name, nodes: [], edges: [] };
      state.flows.push(flow);
      state.lastFlowId = flow.id;
      queueSave();
      render();
      view = { x: 40, y: 40, scale: 1 };
      updateView();
    });
  }

  els.btnCreateFlow.addEventListener('click', newFlowFlow);
  els.btnNewFlow.addEventListener('click', newFlowFlow);
  els.btnNewNode.addEventListener('click', addNodeCentered);
  els.btnOutline.addEventListener('click', copyOutline);
  els.btnToBoard.addEventListener('click', sendToBoard);
  els.btnToNote.addEventListener('click', sendToNote);

  els.btnClearFlow.addEventListener('click', () => {
    const flow = currentFlow();
    if (!flow || (!flow.nodes.length && !flow.edges.length)) {
      return;
    }
    askConfirm(
      `Clear flow \u201c${flow.name}\u201d? This removes all ${flow.nodes.length} node(s) and ${flow.edges.length} edge(s).`,
      'Clear',
      () => {
        flow.nodes = [];
        flow.edges = [];
        queueSave();
        renderCanvas();
      }
    );
  });
  els.btnZoomIn.addEventListener('click', () => zoomBy(1.2));
  els.btnZoomOut.addEventListener('click', () => zoomBy(1 / 1.2));
  els.btnFit.addEventListener('click', fitView);

  els.btnRenameFlow.addEventListener('click', () => {
    const flow = currentFlow();
    if (!flow) {
      return;
    }
    askInput('Rename flow', 'Flow name', flow.name, name => {
      flow.name = name;
      queueSave();
      render();
    });
  });

  els.btnDeleteFlow.addEventListener('click', () => {
    const flow = currentFlow();
    if (!flow) {
      return;
    }
    askConfirm(`Delete flow \u201c${flow.name}\u201d?`, 'Delete', () => {
      state.flows = state.flows.filter(candidate => candidate.id !== flow.id);
      state.lastFlowId = state.flows[0] ? state.flows[0].id : null;
      queueSave();
      render();
      initialFitDone = false;
    });
  });

  els.flowSelect.addEventListener('change', () => {
    state.lastFlowId = els.flowSelect.value;
    queueSave();
    render();
    fitView();
  });

  els.canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) {
      return;
    }
    if (event.target.closest('.node') || event.target.closest('button')) {
      return;
    }
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = view.x;
    const originY = view.y;
    const onMove = moveEvent => {
      view.x = originX + (moveEvent.clientX - startX);
      view.y = originY + (moveEvent.clientY - startY);
      updateView();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  els.canvas.addEventListener('dblclick', event => {
    const flow = currentFlow();
    if (!flow) {
      return;
    }
    if (event.target.closest('.node') || event.target.closest('.edge') || event.target.closest('button')) {
      return;
    }
    const point = clientToWorld(event.clientX, event.clientY);
    addNodeAt(point.x - NODE_WIDTH / 2, point.y - NODE_MIN_HEIGHT / 2, true);
  });

  els.canvas.addEventListener('wheel', event => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      zoomAt(Math.exp(-event.deltaY * 0.002), event.clientX, event.clientY);
    } else {
      event.preventDefault();
      view.x -= event.deltaX;
      view.y -= event.deltaY;
      updateView();
    }
  }, { passive: false });

  els.edges.addEventListener('click', event => {
    const remove = event.target.closest('.edge-delete');
    if (remove) {
      event.stopPropagation();
      deleteEdge(remove.dataset.edgeDel);
      return;
    }
    const hit = event.target.closest('.edge');
    if (hit) {
      event.stopPropagation();
    }
  });

  els.edges.addEventListener('dblclick', event => {
    if (event.target.closest('.edge-delete')) {
      return;
    }
    const hit = event.target.closest('.edge');
    if (hit) {
      event.stopPropagation();
      editEdgeLabel(hit.dataset.edgeId);
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
    }
  });

  document.addEventListener('tab-shown', event => {
    if (!event.detail || event.detail.tab !== 'flow') {
      return;
    }
    if (!hasState) {
      vscode.postMessage({ type: 'flow-ready' });
      return;
    }
    const flow = currentFlow();
    if (!flow) {
      return;
    }
    measureNodes(flow);
    drawEdges();
    if (pendingFit) {
      fitView();
    }
  });

  window.addEventListener('message', event => {
    const message = event.data;
    if (!message || typeof message !== 'object') {
      return;
    }
    if (message.type === 'flow-state') {
      hasState = true;
      state = message.data || { version: 1, flows: [], lastFlowId: null };
      if (!Array.isArray(state.flows)) {
        state.flows = [];
      }
      if (!state.lastFlowId && state.flows[0]) {
        state.lastFlowId = state.flows[0].id;
      }
      render();
      if (!initialFitDone && currentFlow()) {
        initialFitDone = true;
        fitView();
      }
    } else if (message.type === 'flow-error') {
      els.empty.classList.remove('hidden');
      els.empty.querySelector('p').textContent = message.message || 'Unknown error';
      els.world.classList.add('hidden');
    }
  });

  render();
  vscode.postMessage({ type: 'flow-ready' });
})();
