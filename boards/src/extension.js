const vscode = require('vscode');
const crypto = require('crypto');

const VIEW_ID = 'boards.boardView';
const STORAGE_FOLDER = 'boards';
const LEGACY_STORAGE_FOLDER = 'trello';
const STORAGE_FILE = 'boards.json';

let extensionUri;
let data = null;
let panel = null;
const webviews = new Set();

function uid() {
  return crypto.randomBytes(8).toString('hex');
}

function workspaceFolder() {
  const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (!folder) {
    throw new Error('Open a folder first \u2014 boards are saved to <folder>/boards/boards.json.');
  }
  return folder;
}

function storageFolderUri() {
  return vscode.Uri.joinPath(workspaceFolder().uri, STORAGE_FOLDER);
}

function storageFileUri() {
  return vscode.Uri.joinPath(storageFolderUri(), STORAGE_FILE);
}

function legacyStorageFileUri() {
  return vscode.Uri.joinPath(workspaceFolder().uri, LEGACY_STORAGE_FOLDER, STORAGE_FILE);
}

function createCard(title, description, checklist) {
  return {
    id: uid(),
    title,
    description: description || '',
    checklist: (checklist || []).map(text => ({ id: uid(), text, done: false })),
    createdAt: Date.now(),
  };
}

function defaultData() {
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
            cards: [
              createCard(
                'Welcome to Boards',
                'Click a card to open it. Drag cards between lists to change their status.',
                ['Explore the board', 'Create your own card']
              ),
            ],
          },
          {
            id: uid(),
            name: 'Doing',
            cards: [
              createCard(
                'Try checklists',
                'Add checklist items in a card \u2014 progress shows on the card.',
                ['Tick an item']
              ),
            ],
          },
          {
            id: uid(),
            name: 'Done',
            cards: [createCard('Plan something', '')],
          },
        ],
      },
    ],
  };
  result.lastBoardId = result.boards[0].id;
  return result;
}

function normalize(value) {
  if (!value || !Array.isArray(value.boards)) {
    return defaultData();
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

async function ensureData() {
  if (data) {
    return data;
  }
  try {
    const bytes = await vscode.workspace.fs.readFile(storageFileUri());
    data = normalize(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    let migrated = false;
    try {
      const bytes = await vscode.workspace.fs.readFile(legacyStorageFileUri());
      data = normalize(JSON.parse(new TextDecoder().decode(bytes)));
      await persist();
      migrated = true;
    } catch {
      data = defaultData();
      await persist();
    }
    if (migrated) {
      vscode.window.showInformationMessage('Boards: moved trello/boards.json to boards/boards.json.');
    }
  }
  return data;
}

async function persist() {
  await vscode.workspace.fs.createDirectory(storageFolderUri());
  await vscode.workspace.fs.writeFile(
    storageFileUri(),
    Buffer.from(JSON.stringify(data, null, 2), 'utf8')
  );
}

function broadcast(skip) {
  for (const webview of webviews) {
    if (webview === skip) {
      continue;
    }
    try {
      webview.postMessage({ type: 'state', data });
    } catch {
      // webview already disposed
    }
  }
}

async function handleMessage(message, webview) {
  try {
    if (!message || typeof message !== 'object') {
      return;
    }
    if (message.type === 'ready') {
      await ensureData();
      webview.postMessage({ type: 'state', data });
    } else if (message.type === 'save') {
      data = normalize(message.data);
      await persist();
      broadcast(webview);
    }
  } catch (error) {
    const text = error && error.message ? error.message : String(error);
    try {
      webview.postMessage({ type: 'error', message: text });
    } catch {
      // webview already disposed
    }
  }
}

function getHtml(webview) {
  const nonce = crypto.randomBytes(16).toString('base64');
  const styles = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'board.css'));
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'board.js'));
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource}`,
    `font-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styles}">
  <title>Boards</title>
</head>
<body>
  <header class="toolbar">
    <select id="board-select" title="Switch board"></select>
    <button id="btn-new-board" class="primary" title="Create a new board">+ Board</button>
    <button id="btn-rename-board" title="Rename the current board">Rename</button>
    <button id="btn-delete-board" class="danger" title="Delete the current board">Delete</button>
    <span class="grow"></span>
    <button id="btn-new-list" title="Add a list to the current board">+ List</button>
  </header>

  <main id="board" class="board"></main>

  <div id="card-overlay" class="overlay hidden">
    <div class="dialog" role="dialog" aria-modal="true">
      <input id="card-title" class="card-title-input" type="text" placeholder="Card title">
      <textarea id="card-desc" class="card-desc-input" rows="4" placeholder="Add a description\u2026"></textarea>
      <div class="checklist-block">
        <div class="checklist-head">
          <strong>Checklist</strong>
          <span id="checklist-progress" class="muted"></span>
        </div>
        <div id="checklist-items" class="checklist-items"></div>
        <input id="checklist-new" class="checklist-new" type="text" placeholder="Add an item and press Enter">
      </div>
      <div class="dialog-actions">
        <button id="btn-card-delete" class="danger">Delete card</button>
        <span class="grow"></span>
        <button id="btn-card-close" class="primary">Close</button>
      </div>
    </div>
  </div>

  <div id="input-overlay" class="overlay hidden">
    <div class="dialog small" role="dialog" aria-modal="true">
      <h3 id="input-title">Input</h3>
      <input id="input-field" type="text">
      <div class="dialog-actions right">
        <button id="btn-input-cancel">Cancel</button>
        <button id="btn-input-ok" class="primary">OK</button>
      </div>
    </div>
  </div>

  <div id="confirm-overlay" class="overlay hidden">
    <div class="dialog small" role="dialog" aria-modal="true">
      <p id="confirm-text"></p>
      <div class="dialog-actions right">
        <button id="btn-confirm-cancel">Cancel</button>
        <button id="btn-confirm-ok" class="primary">Delete</button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}

function openBoardPanel() {
  if (panel) {
    panel.reveal(vscode.ViewColumn.One);
    return;
  }
  panel = vscode.window.createWebviewPanel(
    'boards.panel',
    'Boards',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
    }
  );
  panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'boards.svg');
  panel.webview.html = getHtml(panel.webview);
  webviews.add(panel.webview);
  panel.webview.onDidReceiveMessage(message => handleMessage(message, panel.webview));
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

async function pickBoard() {
  await ensureData();
  if (!data.boards.length) {
    const name = await vscode.window.showInputBox({
      prompt: 'You have no boards yet. Name your first board',
      placeHolder: 'My Board',
    });
    if (!name) {
      return null;
    }
    const board = { id: uid(), name, lists: [] };
    data.boards.push(board);
    data.lastBoardId = board.id;
    await persist();
    broadcast();
    return board;
  }
  if (data.boards.length === 1) {
    return data.boards[0];
  }
  const picked = await vscode.window.showQuickPick(
    data.boards.map(board => ({ label: board.name, board })),
    { placeHolder: 'Select a board' }
  );
  return picked ? picked.board : null;
}

async function commandNewBoard() {
  const name = await vscode.window.showInputBox({ prompt: 'Name of the new board', placeHolder: 'My Board' });
  if (!name) {
    return;
  }
  await ensureData();
  const board = { id: uid(), name, lists: [] };
  data.boards.push(board);
  data.lastBoardId = board.id;
  await persist();
  broadcast();
  openBoardPanel();
}

async function commandNewList() {
  const board = await pickBoard();
  if (!board) {
    return;
  }
  const name = await vscode.window.showInputBox({ prompt: 'Name of the new list', placeHolder: 'To Do' });
  if (!name) {
    return;
  }
  board.lists.push({ id: uid(), name, cards: [] });
  data.lastBoardId = board.id;
  await persist();
  broadcast();
  openBoardPanel();
}

async function commandNewCard() {
  const board = await pickBoard();
  if (!board) {
    return;
  }
  let list;
  if (!board.lists.length) {
    const listName = await vscode.window.showInputBox({
      prompt: 'This board has no lists yet. Name the first list',
      placeHolder: 'To Do',
    });
    if (!listName) {
      return;
    }
    list = { id: uid(), name: listName, cards: [] };
    board.lists.push(list);
  } else if (board.lists.length === 1) {
    list = board.lists[0];
  } else {
    const picked = await vscode.window.showQuickPick(
      board.lists.map(candidate => ({ label: candidate.name, list: candidate })),
      { placeHolder: 'Add the card to which list?' }
    );
    if (!picked) {
      return;
    }
    list = picked.list;
  }
  const title = await vscode.window.showInputBox({ prompt: 'Card title', placeHolder: 'What needs to be done?' });
  if (!title) {
    return;
  }
  list.cards.push(createCard(title, ''));
  data.lastBoardId = board.id;
  await persist();
  broadcast();
  openBoardPanel();
}

async function commandRefresh() {
  data = null;
  await ensureData();
  broadcast();
}

function activate(context) {
  extensionUri = context.extensionUri;

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, {
      resolveWebviewView(view) {
        view.webview.options = {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
        };
        view.webview.html = getHtml(view.webview);
        webviews.add(view.webview);
        view.webview.onDidReceiveMessage(message => handleMessage(message, view.webview));
        view.onDidDispose(() => webviews.delete(view.webview));
      },
    })
  );

  registerCommand(context, 'boards.openBoard', async () => {
    await ensureData();
    openBoardPanel();
  });
  registerCommand(context, 'boards.newBoard', commandNewBoard);
  registerCommand(context, 'boards.newList', commandNewList);
  registerCommand(context, 'boards.newCard', commandNewCard);
  registerCommand(context, 'boards.refresh', commandRefresh);
}

function deactivate() {
  if (panel) {
    panel.dispose();
    panel = null;
  }
}

module.exports = { activate, deactivate };
