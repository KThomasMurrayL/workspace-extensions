const vscode = require('vscode');
const crypto = require('crypto');

const VIEW_ID = 'flow.flowView';
const STORAGE_FOLDER = 'flow';
const STORAGE_FILE = 'flow.json';

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
    throw new Error('Open a folder first \u2014 flows are saved to <folder>/flow/flow.json.');
  }
  return folder;
}

function storageFolderUri() {
  return vscode.Uri.joinPath(workspaceFolder().uri, STORAGE_FOLDER);
}

function storageFileUri() {
  return vscode.Uri.joinPath(storageFolderUri(), STORAGE_FILE);
}

function defaultData() {
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

function normalize(value) {
  if (!value || !Array.isArray(value.flows)) {
    return defaultData();
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

async function ensureData() {
  if (data) {
    return data;
  }
  try {
    const bytes = await vscode.workspace.fs.readFile(storageFileUri());
    data = normalize(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    data = defaultData();
    await persist();
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
    } else if (message.type === 'copy') {
      await vscode.env.clipboard.writeText(String(message.text || ''));
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
  const styles = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'flow.css'));
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'flow.js'));
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
  <title>Flow</title>
</head>
<body>
  <header class="toolbar">
    <select id="flow-select" title="Switch flow"></select>
    <button id="btn-new-flow" class="primary" title="Create a new flow">+ Flow</button>
    <button id="btn-rename-flow" title="Rename the current flow">Rename</button>
    <button id="btn-delete-flow" class="danger" title="Delete the current flow">Delete</button>
    <span class="grow"></span>
    <button id="btn-new-node" class="primary" title="Add a node to the current flow">+ Node</button>
    <button id="btn-outline" title="Copy this flow as a markdown outline">Copy outline</button>
    <span class="sep"></span>
    <button id="btn-zoom-out" class="icon-btn" title="Zoom out">\u2212</button>
    <span id="zoom-label" class="zoom-label">100%</span>
    <button id="btn-zoom-in" class="icon-btn" title="Zoom in">+</button>
    <button id="btn-fit" title="Fit all nodes in view">Fit</button>
  </header>

  <main id="canvas" class="canvas">
    <div id="empty" class="empty hidden">
      <p>No flows yet.</p>
      <button id="btn-create-flow" class="primary">Create a flow</button>
    </div>
    <div id="hint" class="hint hidden">
      <p>Double-click anywhere to add your first node</p>
    </div>
    <div id="world" class="world">
      <svg id="edges" class="edges" xmlns="http://www.w3.org/2000/svg"></svg>
      <div id="nodes" class="nodes"></div>
    </div>
  </main>

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

function openFlowPanel() {
  if (panel) {
    panel.reveal(vscode.ViewColumn.One);
    return;
  }
  panel = vscode.window.createWebviewPanel(
    'flow.panel',
    'Flow',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
    }
  );
  panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'flow.svg');
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

async function pickFlow() {
  await ensureData();
  if (!data.flows.length) {
    const name = await vscode.window.showInputBox({
      prompt: 'You have no flows yet. Name your first flow',
      placeHolder: 'Product Flow',
    });
    if (!name) {
      return null;
    }
    const flow = { id: uid(), name, nodes: [], edges: [] };
    data.flows.push(flow);
    data.lastFlowId = flow.id;
    await persist();
    broadcast();
    return flow;
  }
  if (data.flows.length === 1) {
    return data.flows[0];
  }
  const picked = await vscode.window.showQuickPick(
    data.flows.map(flow => ({ label: flow.name, flow })),
    { placeHolder: 'Select a flow' }
  );
  return picked ? picked.flow : null;
}

async function commandNewFlow() {
  const name = await vscode.window.showInputBox({ prompt: 'Name of the new flow', placeHolder: 'Product Flow' });
  if (!name) {
    return;
  }
  await ensureData();
  const flow = { id: uid(), name, nodes: [], edges: [] };
  data.flows.push(flow);
  data.lastFlowId = flow.id;
  await persist();
  broadcast();
  openFlowPanel();
}

async function commandNewNode() {
  const flow = await pickFlow();
  if (!flow) {
    return;
  }
  const count = flow.nodes.length;
  flow.nodes.push({
    id: uid(),
    x: 80 + (count % 4) * 240,
    y: 100 + Math.floor(count / 4) * 140,
    text: `Step ${count + 1}`,
  });
  data.lastFlowId = flow.id;
  await persist();
  broadcast();
  openFlowPanel();
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

  registerCommand(context, 'flow.openFlow', async () => {
    await ensureData();
    openFlowPanel();
  });
  registerCommand(context, 'flow.newFlow', commandNewFlow);
  registerCommand(context, 'flow.newNode', commandNewNode);
  registerCommand(context, 'flow.refresh', commandRefresh);
}

function deactivate() {
  if (panel) {
    panel.dispose();
    panel = null;
  }
}

module.exports = { activate, deactivate };
