const vscode = require('vscode');
const path = require('path');
const crypto = require('crypto');
const { ConnectionStore, uid, secretKey, resolvePath } = require('./store');
const { createSession } = require('./drivers');
const { getHtml } = require('./webview');

const VIEW_ID = 'workspaceTools.view';
const NETWORK_TYPES = ['postgres', 'mysql', 'mssql'];
const FILE_TYPES = ['csv', 'tsv', 'json', 'sqlite'];
const SQLITE_EXTENSIONS = ['db', 'sqlite', 'sqlite3', 'db3'];
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];

let extensionUri;
let panel = null;
const webviews = new Set();

let boardsData = null;
let flowData = null;

let store = null;
let sessions = null;
let dbView = { connectionId: null, table: null, offset: 0 };
const tempConnections = new Map();

// ---------------------------------------------------------------- workspace

function workspaceFolder() {
  const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (!folder) {
    throw new Error('Open a folder first \u2014 Workspace Tools saves everything in the workspace.');
  }
  return folder;
}

function fileUri(...parts) {
  return vscode.Uri.joinPath(workspaceFolder().uri, ...parts);
}

async function exists(uri) {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function readJson(uri, fallback) {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return fallback();
  }
}

async function writeJson(uri, value) {
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(uri.fsPath)));
  await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(value, null, 2), 'utf8'));
}

// ---------------------------------------------------------------- boards

function createCard(title, description, checklist) {
  return {
    id: uid(),
    title,
    description: description || '',
    checklist: (checklist || []).map(text => ({ id: uid(), text, done: false })),
    createdAt: Date.now(),
  };
}

function defaultBoards() {
  const result = {
    version: 1,
    lastBoardId: null,
    boards: [
      {
        id: uid(),
        name: 'My Board',
        lists: [
          {
            id: uid(),
            name: 'To Do',
            cards: [createCard('Welcome to Boards', 'Click a card to open it. Drag cards between lists.', ['Explore the board'])],
          },
          { id: uid(), name: 'Doing', cards: [createCard('Try checklists', 'Checklist progress shows on the card.', ['Tick an item'])] },
          { id: uid(), name: 'Done', cards: [createCard('Plan something', '')] },
        ],
      },
    ],
  };
  result.lastBoardId = result.boards[0].id;
  return result;
}

function normalizeBoards(value) {
  if (!value || !Array.isArray(value.boards)) {
    return defaultBoards();
  }
  for (const board of value.boards) {
    if (!Array.isArray(board.lists)) {
      board.lists = [];
    }
    for (const list of board.lists) {
      if (!Array.isArray(list.cards)) {
        list.cards = [];
      }
      for (const card of list.cards) {
        if (!Array.isArray(card.checklist)) {
          card.checklist = [];
        }
      }
    }
  }
  return value;
}

async function loadBoards() {
  if (boardsData) {
    return boardsData;
  }
  const uri = fileUri('boards', 'boards.json');
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    boardsData = normalizeBoards(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    boardsData = defaultBoards();
    await writeJson(uri, boardsData);
  }
  return boardsData;
}

async function saveBoards() {
  await writeJson(fileUri('boards', 'boards.json'), boardsData);
}

// ---------------------------------------------------------------- flow

function defaultFlow() {
  const idea = { id: uid(), x: 80, y: 140, text: 'Idea' };
  const plan = { id: uid(), x: 340, y: 140, text: 'Plan' };
  const build = { id: uid(), x: 600, y: 140, text: 'Build' };
  const ship = { id: uid(), x: 860, y: 140, text: 'Ship' };
  const feedback = { id: uid(), x: 600, y: 360, text: 'Feedback' };
  const flow = {
    id: uid(),
    name: 'Product Flow',
    nodes: [idea, plan, build, ship, feedback],
    edges: [
      { id: uid(), from: idea.id, to: plan.id, label: 'research' },
      { id: uid(), from: plan.id, to: build.id, label: 'spec' },
      { id: uid(), from: build.id, to: ship.id, label: 'test' },
      { id: uid(), from: ship.id, to: feedback.id, label: 'collect' },
      { id: uid(), from: feedback.id, to: build.id, label: 'improve' },
    ],
  };
  return { version: 1, lastFlowId: flow.id, flows: [flow] };
}

function normalizeFlow(value) {
  if (!value || !Array.isArray(value.flows)) {
    return defaultFlow();
  }
  for (const flow of value.flows) {
    if (!Array.isArray(flow.nodes)) {
      flow.nodes = [];
    }
    if (!Array.isArray(flow.edges)) {
      flow.edges = [];
    }
    for (const node of flow.nodes) {
      node.x = Number.isFinite(node.x) ? node.x : 0;
      node.y = Number.isFinite(node.y) ? node.y : 0;
      if (typeof node.text !== 'string') {
        node.text = String(node.text || 'Node');
      }
    }
  }
  return value;
}

async function loadFlow() {
  if (flowData) {
    return flowData;
  }
  const uri = fileUri('flow', 'flow.json');
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    flowData = normalizeFlow(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    flowData = defaultFlow();
    await writeJson(uri, flowData);
  }
  return flowData;
}

async function saveFlow() {
  await writeJson(fileUri('flow', 'flow.json'), flowData);
}

// ---------------------------------------------------------------- notes

function notesFolderName() {
  return vscode.workspace.getConfiguration('workspaceTools').get('notesFolder') || 'notes';
}

function assetsFolderName() {
  return vscode.workspace.getConfiguration('workspaceTools').get('assetsFolder') || 'notes/assets';
}

function notesDirUri() {
  return fileUri(notesFolderName());
}

function assetsDirUri() {
  return fileUri(assetsFolderName());
}

function resolveNote(relative) {
  const root = notesDirUri();
  const uri = vscode.Uri.joinPath(root, relative);
  if (uri.fsPath !== root.fsPath && !uri.fsPath.startsWith(root.fsPath + path.sep)) {
    throw new Error('Invalid note path.');
  }
  return uri;
}

async function listNotes() {
  const files = [];
  async function walk(dir, prefix) {
    let entries = [];
    try {
      entries = await vscode.workspace.fs.readDirectory(dir);
    } catch {
      return;
    }
    for (const [name, type] of entries) {
      if (name.startsWith('.')) {
        continue;
      }
      const uri = vscode.Uri.joinPath(dir, name);
      if (type === vscode.FileType.Directory) {
        await walk(uri, `${prefix}${name}/`);
      } else if (/\.(md|markdown)$/i.test(name)) {
        let mtime = 0;
        try {
          mtime = (await vscode.workspace.fs.stat(uri)).mtime;
        } catch {
          // keep 0 when the file disappears mid-scan
        }
        files.push({ path: `${prefix}${name}`, name: name.replace(/\.(md|markdown)$/i, ''), mtime });
      }
    }
  }
  await walk(notesDirUri(), '');
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

async function uniqueAssetTarget(dir, fileName) {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let candidate = vscode.Uri.joinPath(dir, fileName);
  let index = 1;
  while (await exists(candidate)) {
    candidate = vscode.Uri.joinPath(dir, `${base}-${index}${ext}`);
    index += 1;
  }
  return candidate;
}

async function resolveAsset(baseDir, target) {
  let clean = target.trim();
  try {
    clean = decodeURIComponent(clean);
  } catch {
    // keep raw
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(clean)) {
    return null;
  }
  const candidates = [
    path.isAbsolute(clean) ? clean : path.join(baseDir, clean),
    path.join(workspaceFolder().uri.fsPath, clean),
  ];
  for (const candidate of candidates) {
    const uri = vscode.Uri.file(candidate);
    if (await exists(uri)) {
      return uri;
    }
  }
  return null;
}

async function rewriteImages(text, baseDir, webview) {
  const parts = [];
  const re = /!\[\[([^\]]+)\]\]|!\[([^\]]*)\]\(([^)\s]+)\)/g;
  let last = 0;
  let match;
  while ((match = re.exec(text))) {
    parts.push(text.slice(last, match.index));
    const target = (match[1] || match[3] || '').trim();
    const alt = match[2] || target;
    const found = await resolveAsset(baseDir, target);
    parts.push(found ? `![${alt}](${webview.asWebviewUri(found)})` : match[0]);
    last = match.index + match[0].length;
  }
  parts.push(text.slice(last));
  return parts.join('');
}

// ---------------------------------------------------------------- database

class SessionManager {
  constructor(context) {
    this.context = context;
    this.pending = new Map();
  }

  get(connection) {
    const key = connection.id;
    if (!this.pending.has(key)) {
      const promise = this.open(connection).catch(error => {
        this.pending.delete(key);
        throw error;
      });
      this.pending.set(key, promise);
    }
    return this.pending.get(key);
  }

  async open(connection) {
    let password;
    if (NETWORK_TYPES.includes(connection.type)) {
      password = await this.context.secrets.get(secretKey(connection.id));
    }
    const resolved = Object.assign({}, connection);
    if (resolved.file) {
      resolved.file = resolvePath(resolved.file);
    }
    return createSession(resolved, password);
  }

  close(id) {
    const pending = this.pending.get(id);
    if (pending) {
      pending
        .then(session => session.close())
        .catch(() => {});
      this.pending.delete(id);
    }
  }

  closeAll() {
    for (const id of [...this.pending.keys()]) {
      this.close(id);
    }
  }
}

function pageSizeSetting() {
  const configured = Number(vscode.workspace.getConfiguration('workspaceTools').get('pageSize'));
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 500;
}

async function allConnections() {
  const saved = await store.list();
  return [...saved, ...tempConnections.values()];
}

async function sendDbState(webview) {
  const connections = await allConnections();
  if (!dbView.connectionId || !connections.some(candidate => candidate.id === dbView.connectionId)) {
    dbView.connectionId = connections[0] ? connections[0].id : null;
    dbView.table = null;
    dbView.offset = 0;
  }
  const connection = connections.find(candidate => candidate.id === dbView.connectionId) || null;
  const pageSize = pageSizeSetting();
  const state = {
    type: 'db-state',
    connections: connections.map(candidate => ({
      id: candidate.id,
      name: candidate.name,
      type: candidate.type,
    })),
    connectionId: dbView.connectionId,
    connection: connection
      ? { id: connection.id, name: connection.name, type: connection.type }
      : null,
    tables: [],
    table: null,
    canEdit: false,
    canRunSql: false,
    pageSize,
    offset: 0,
    columns: [],
    rows: [],
    rowIds: null,
    hasPrev: false,
    hasNext: false,
  };
  if (connection) {
    try {
      const session = await sessions.get(connection);
      const tables = await session.listTables();
      if (!dbView.table && tables.length) {
        dbView.table = tables[0];
      }
      if (dbView.table && !tables.includes(dbView.table)) {
        dbView.table = tables[0] || null;
        dbView.offset = 0;
      }
      let data = { columns: [], rows: [], rowIds: null };
      if (dbView.table) {
        data = await session.queryTable(dbView.table, pageSize, dbView.offset);
      }
      Object.assign(state, {
        tables,
        table: dbView.table,
        offset: dbView.offset,
        canEdit: Boolean(session.canEdit && data.rowIds),
        canRunSql: Boolean(session.canRunSql),
        columns: data.columns,
        rows: data.rows,
        rowIds: data.rowIds,
        hasPrev: dbView.offset > 0,
        hasNext: data.rows.length === pageSize,
      });
    } catch (error) {
      webview.postMessage({
        type: 'db-error',
        message: error && error.message ? error.message : String(error),
      });
    }
  }
  webview.postMessage(state);
}

async function dbSession() {
  const connections = await allConnections();
  const connection = connections.find(candidate => candidate.id === dbView.connectionId);
  if (!connection) {
    throw new Error('No connection selected.');
  }
  return sessions.get(connection);
}

// ---------------------------------------------------------------- messaging

function broadcast(message, skip) {
  for (const webview of webviews) {
    if (webview === skip) {
      continue;
    }
    try {
      webview.postMessage(message);
    } catch {
      // disposed
    }
  }
}

async function sendBoardsState(webview) {
  const data = await loadBoards();
  webview.postMessage({ type: 'boards-state', data });
}

async function sendFlowState(webview) {
  const data = await loadFlow();
  webview.postMessage({ type: 'flow-state', data });
}

async function handleMessage(message, webview, context) {
  if (!message || typeof message !== 'object') {
    return;
  }
  try {
    switch (message.type) {
      // ---- boards
      case 'boards-ready':
        await sendBoardsState(webview);
        break;
      case 'boards-save':
        boardsData = normalizeBoards(message.data);
        await saveBoards();
        broadcast({ type: 'boards-state', data: boardsData }, webview);
        break;

      // ---- flow
      case 'flow-ready':
        await sendFlowState(webview);
        break;
      case 'flow-save':
        flowData = normalizeFlow(message.data);
        await saveFlow();
        broadcast({ type: 'flow-state', data: flowData }, webview);
        break;
      case 'flow-copy':
        await vscode.env.clipboard.writeText(String(message.text || ''));
        break;

      // ---- notes
      case 'notes-ready':
        await vscode.workspace.fs.createDirectory(notesDirUri());
        webview.postMessage({ type: 'notes-list', notes: await listNotes() });
        break;
      case 'notes-open': {
        const uri = resolveNote(String(message.path || ''));
        const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
        webview.postMessage({ type: 'notes-content', path: message.path, text });
        break;
      }
      case 'notes-save': {
        const uri = resolveNote(String(message.path || ''));
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(uri.fsPath)));
        await vscode.workspace.fs.writeFile(uri, Buffer.from(String(message.text || ''), 'utf8'));
        break;
      }
      case 'notes-create': {
        const safe = String(message.name || '').replace(/[\\/:*?"<>|]/g, '-').trim();
        if (!safe) {
          throw new Error('Note name is required.');
        }
        const fileName = /\.(md|markdown)$/i.test(safe) ? safe : `${safe}.md`;
        const uri = vscode.Uri.joinPath(notesDirUri(), fileName);
        const title = path.basename(fileName, path.extname(fileName));
        if (!(await exists(uri))) {
          await vscode.workspace.fs.createDirectory(notesDirUri());
          await vscode.workspace.fs.writeFile(uri, Buffer.from(`# ${title}\n\n`, 'utf8'));
        }
        webview.postMessage({ type: 'notes-list', notes: await listNotes() });
        webview.postMessage({ type: 'notes-opened', path: fileName });
        webview.postMessage({ type: 'notes-content', path: fileName, text: `# ${title}\n\n` });
        break;
      }
      case 'notes-delete': {
        const uri = resolveNote(String(message.path || ''));
        await vscode.workspace.fs.delete(uri, { useTrash: true, recursive: false });
        webview.postMessage({ type: 'notes-list', notes: await listNotes() });
        break;
      }
      case 'notes-insert-image': {
        const picks = await vscode.window.showOpenDialog({
          canSelectMany: false,
          openLabel: 'Insert image',
          filters: { Images: IMAGE_EXTENSIONS },
        });
        if (!picks || !picks.length) {
          break;
        }
        const assets = assetsDirUri();
        await vscode.workspace.fs.createDirectory(assets);
        const target = await uniqueAssetTarget(assets, path.basename(picks[0].fsPath));
        await vscode.workspace.fs.copy(picks[0], target, { overwrite: false });
        let baseDir = workspaceFolder().uri.fsPath;
        if (message.notePath) {
          baseDir = path.dirname(resolveNote(String(message.notePath)).fsPath);
        }
        const relative = path.relative(baseDir, target.fsPath).split(path.sep).join('/');
        const encoded = relative.split('/').map(encodeURIComponent).join('/');
        webview.postMessage({ type: 'notes-image', markdown: `![](${encoded})` });
        break;
      }
      case 'notes-preview': {
        const uri = resolveNote(String(message.path || ''));
        const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
        const rewritten = await rewriteImages(text, path.dirname(uri.fsPath), webview);
        webview.postMessage({ type: 'notes-previewResult', path: message.path, text: rewritten });
        break;
      }

      // ---- database
      case 'db-ready':
        await sendDbState(webview);
        break;
      case 'db-selectConnection':
        dbView = { connectionId: String(message.id || ''), table: null, offset: 0 };
        await sendDbState(webview);
        break;
      case 'db-selectTable':
        dbView.table = String(message.table || '');
        dbView.offset = 0;
        await sendDbState(webview);
        break;
      case 'db-page':
        dbView.offset = Math.max(0, dbView.offset + Number(message.delta || 0));
        await sendDbState(webview);
        break;
      case 'db-refresh': {
        const connections = await allConnections();
        const connection = connections.find(candidate => candidate.id === dbView.connectionId);
        if (connection && FILE_TYPES.includes(connection.type)) {
          sessions.close(connection.id);
        }
        await sendDbState(webview);
        break;
      }
      case 'db-setMode':
        break;
      case 'db-updateCell': {
        const session = await dbSession();
        await session.updateCell(dbView.table, message.rowId, message.column, message.value);
        await session.flush();
        await sendDbState(webview);
        break;
      }
      case 'db-insertRow': {
        const session = await dbSession();
        await session.insertRow(dbView.table);
        await session.flush();
        await sendDbState(webview);
        break;
      }
      case 'db-deleteRow': {
        const session = await dbSession();
        await session.deleteRow(dbView.table, message.rowId);
        await session.flush();
        await sendDbState(webview);
        break;
      }
      case 'db-runQuery': {
        const session = await dbSession();
        if (!session.canRunSql) {
          throw new Error('This connection does not support SQL.');
        }
        const started = Date.now();
        const results = await session.run(String(message.sql || ''));
        webview.postMessage({ type: 'db-queryResult', results, elapsed: Date.now() - started });
        break;
      }
      case 'db-saveConnection': {
        const config = message.config || {};
        const name = String(config.name || '').trim();
        if (!name) {
          throw new Error('Name is required.');
        }
        const type = String(config.type || '');
        const connection = { id: config.id || uid(), name, type };
        if (FILE_TYPES.includes(type)) {
          const file = String(config.file || '').trim();
          if (!file) {
            throw new Error('Choose a file.');
          }
          connection.file = file;
        } else if (NETWORK_TYPES.includes(type)) {
          connection.host = String(config.host || 'localhost').trim() || 'localhost';
          connection.port = Number(config.port) || undefined;
          connection.database = String(config.database || '').trim() || undefined;
          connection.user = String(config.user || '').trim() || undefined;
          if (type !== 'mysql') {
            connection.ssl = Boolean(config.ssl);
          }
        } else {
          throw new Error(`Unknown connection type: ${type}`);
        }
        if (typeof message.password === 'string' && message.password) {
          await context.secrets.store(secretKey(connection.id), message.password);
        }
        await store.addOrUpdate(connection);
        dbView = { connectionId: connection.id, table: null, offset: 0 };
        webview.postMessage({ type: 'db-saved' });
        await sendDbState(webview);
        break;
      }
      case 'db-removeConnection': {
        const id = String(message.id || '');
        sessions.close(id);
        if (tempConnections.has(id)) {
          tempConnections.delete(id);
        } else {
          await store.remove(id);
        }
        if (dbView.connectionId === id) {
          dbView = { connectionId: null, table: null, offset: 0 };
        }
        await sendDbState(webview);
        break;
      }
      case 'db-browse': {
        const filters = {
          sqlite: { 'SQLite databases': ['db', 'sqlite', 'sqlite3', 'db3'] },
          csv: { 'CSV files': ['csv'] },
          tsv: { 'TSV files': ['tsv', 'tab'] },
          json: { 'JSON files': ['json', 'jsonl', 'ndjson'] },
        };
        const picked = await vscode.window.showOpenDialog({
          canSelectMany: false,
          openLabel: 'Choose',
          filters: filters[message.kind] || { 'All files': ['*'] },
        });
        if (picked && picked.length) {
          webview.postMessage({
            type: 'db-browseResult',
            path: picked[0].fsPath,
            name: path.basename(picked[0].fsPath),
          });
        }
        break;
      }
      case 'db-openFile': {
        const picked = await vscode.window.showOpenDialog({
          canSelectMany: false,
          openLabel: 'Open',
          filters: {
            'Data files': ['csv', 'tsv', 'json', 'jsonl', 'sqlite', 'db', 'sqlite3', 'db3'],
          },
        });
        if (!picked || !picked.length) {
          break;
        }
        const filePath = picked[0].fsPath;
        let ext = path.extname(filePath).slice(1).toLowerCase();
        if (SQLITE_EXTENSIONS.includes(ext)) {
          ext = 'sqlite';
        }
        if (ext === 'jsonl' || ext === 'ndjson') {
          ext = 'json';
        }
        if (!FILE_TYPES.includes(ext)) {
          throw new Error('Unsupported file type. Choose a CSV, TSV, JSON or SQLite file.');
        }
        const connection = {
          id: `file-${uid()}`,
          name: path.basename(filePath),
          type: ext,
          file: filePath,
        };
        tempConnections.set(connection.id, connection);
        dbView = { connectionId: connection.id, table: null, offset: 0 };
        await sendDbState(webview);
        break;
      }
      default:
        break;
    }
  } catch (error) {
    const text = error && error.message ? error.message : String(error);
    const formTypes = ['db-saveConnection', 'db-browse', 'db-openFile'];
    let type = 'db-error';
    if (String(message.type || '').startsWith('notes-')) {
      type = 'notes-error';
    } else if (formTypes.includes(message.type)) {
      type = 'db-formError';
    }
    webview.postMessage({ type, message: text });
  }
}

// ---------------------------------------------------------------- webviews

function openPanel(context) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.One);
    return;
  }
  panel = vscode.window.createWebviewPanel(
    'workspaceTools.panel',
    'Workspace Tools',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
    }
  );
  panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'workspace-tools.svg');
  panel.webview.html = getHtml(panel.webview, extensionUri);
  webviews.add(panel.webview);
  panel.webview.onDidReceiveMessage(message => handleMessage(message, panel.webview, context));
  panel.onDidDispose(() => {
    webviews.delete(panel.webview);
    panel = null;
  });
}

function registerCommand(context, id, handler) {
  context.subscriptions.push(
    vscode.commands.registerCommand(id, async (...args) => {
      try {
        return await handler(...args);
      } catch (error) {
        vscode.window.showErrorMessage(error && error.message ? error.message : String(error));
      }
    })
  );
}

function activate(context) {
  extensionUri = context.extensionUri;
  store = new ConnectionStore();
  sessions = new SessionManager(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, {
      resolveWebviewView(view) {
        view.webview.options = {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
        };
        view.webview.html = getHtml(view.webview, extensionUri);
        webviews.add(view.webview);
        view.webview.onDidReceiveMessage(message => handleMessage(message, view.webview, context));
        view.onDidDispose(() => webviews.delete(view.webview));
      },
    })
  );

  context.subscriptions.push({
    dispose: () => sessions && sessions.closeAll(),
  });

  registerCommand(context, 'workspaceTools.open', async () => {
    openPanel(context);
  });
  registerCommand(context, 'workspaceTools.refresh', async () => {
    boardsData = null;
    flowData = null;
    store.invalidate();
    for (const id of [...tempConnections.keys()]) {
      sessions.close(id);
    }
    for (const webview of webviews) {
      try {
        await sendBoardsState(webview);
        await sendFlowState(webview);
        webview.postMessage({ type: 'notes-list', notes: await listNotes() });
        await sendDbState(webview);
      } catch {
        // webview disposed
      }
    }
  });
}

function deactivate() {
  if (sessions) {
    sessions.closeAll();
    sessions = null;
  }
  if (panel) {
    panel.dispose();
    panel = null;
  }
}

module.exports = { activate, deactivate };
