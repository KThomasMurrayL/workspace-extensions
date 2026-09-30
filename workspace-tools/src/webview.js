const vscode = require('vscode');
const crypto = require('crypto');

function getHtml(webview, extensionUri) {
  const nonce = crypto.randomBytes(16).toString('base64');
  const assets = name => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', name));
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
  <link rel="stylesheet" href="${assets('style.css')}">
  <title>Workspace Tools</title>
</head>
<body>
  <nav class="app-tabs">
    <button class="app-tab active" data-tab="boards">Boards</button>
    <button class="app-tab" data-tab="notes">Notes</button>
    <button class="app-tab" data-tab="flow">Flow</button>
    <button class="app-tab" data-tab="database">Database</button>
  </nav>

  <div id="views">

    <section id="tab-boards" class="tool-view">
      <header class="toolbar">
        <select id="boards-board-select" title="Switch board"></select>
        <button id="boards-btn-new-board" class="primary" title="Create a new board">+ Board</button>
        <button id="boards-btn-rename-board" title="Rename the current board">Rename</button>
        <button id="boards-btn-delete-board" class="danger" title="Delete the current board">Delete</button>
        <span class="grow"></span>
        <button id="boards-btn-new-list" title="Add a list to the current board">+ List</button>
      </header>
      <main id="boards-board" class="board"></main>
      <div id="boards-card-overlay" class="overlay hidden">
        <div class="dialog" role="dialog" aria-modal="true">
          <input id="boards-card-title" class="card-title-input" type="text" placeholder="Card title">
          <textarea id="boards-card-desc" class="card-desc-input" rows="4" placeholder="Add a description\u2026"></textarea>
          <div class="checklist-block">
            <div class="checklist-head">
              <strong>Checklist</strong>
              <span id="boards-checklist-progress" class="muted"></span>
            </div>
            <div id="boards-checklist-items" class="checklist-items"></div>
            <input id="boards-checklist-new" class="checklist-new" type="text" placeholder="Add an item and press Enter">
          </div>
          <div class="dialog-actions">
            <button id="boards-btn-card-delete" class="danger">Delete card</button>
            <span class="grow"></span>
            <button id="boards-btn-card-close" class="primary">Close</button>
          </div>
        </div>
      </div>
      <div id="boards-input-overlay" class="overlay hidden">
        <div class="dialog small" role="dialog" aria-modal="true">
          <h3 id="boards-input-title">Input</h3>
          <input id="boards-input-field" type="text">
          <div class="dialog-actions right">
            <button id="boards-btn-input-cancel">Cancel</button>
            <button id="boards-btn-input-ok" class="primary">OK</button>
          </div>
        </div>
      </div>
      <div id="boards-confirm-overlay" class="overlay hidden">
        <div class="dialog small" role="dialog" aria-modal="true">
          <p id="boards-confirm-text"></p>
          <div class="dialog-actions right">
            <button id="boards-btn-confirm-cancel">Cancel</button>
            <button id="boards-btn-confirm-ok" class="primary">Delete</button>
          </div>
        </div>
      </div>
    </section>

    <section id="tab-notes" class="tool-view hidden">
      <div class="notes-layout">
        <aside class="notes-sidebar">
          <div class="notes-side-toolbar">
            <input id="notes-search" class="notes-search" type="text" placeholder="Search notes">
            <button id="notes-btn-new" class="primary" title="New note">+</button>
          </div>
          <div class="notes-sortbar">
            <select id="notes-sort" title="Sort notes">
              <option value="oldest">Oldest first</option>
              <option value="newest">Newest first</option>
              <option value="name-asc">Name A\u2013Z</option>
              <option value="name-desc">Name Z\u2013A</option>
            </select>
          </div>
          <ul id="notes-list" class="notes-list"></ul>
        </aside>
        <div class="notes-main">
          <div class="notes-main-toolbar">
            <span id="notes-title" class="notes-title">No note open</span>
            <button id="notes-btn-image" title="Copy an image into notes/assets and insert it">Image</button>
            <button id="notes-btn-preview" title="Toggle preview">Preview</button>
          </div>
          <div id="notes-error" class="notes-error hidden"></div>
          <textarea id="notes-editor" class="notes-editor" spellcheck="false" placeholder="Select or create a note\u2026"></textarea>
          <div id="notes-preview" class="notes-preview"></div>
        </div>
      </div>
      <div id="notes-input-overlay" class="overlay hidden">
        <div class="dialog small" role="dialog" aria-modal="true">
          <h3 id="notes-input-title">Input</h3>
          <input id="notes-input-field" type="text">
          <div class="dialog-actions right">
            <button id="notes-btn-input-cancel">Cancel</button>
            <button id="notes-btn-input-ok" class="primary">OK</button>
          </div>
        </div>
      </div>
      <div id="notes-confirm-overlay" class="overlay hidden">
        <div class="dialog small" role="dialog" aria-modal="true">
          <p id="notes-confirm-text"></p>
          <div class="dialog-actions right">
            <button id="notes-btn-confirm-cancel">Cancel</button>
            <button id="notes-btn-confirm-ok" class="primary">Delete</button>
          </div>
        </div>
      </div>
    </section>

    <section id="tab-flow" class="tool-view hidden">
      <header class="toolbar">
        <select id="flow-flow-select" title="Switch flow"></select>
        <button id="flow-btn-new-flow" class="primary" title="Create a new flow">+ Flow</button>
        <button id="flow-btn-rename-flow" title="Rename the current flow">Rename</button>
        <button id="flow-btn-delete-flow" class="danger" title="Delete the current flow">Delete</button>
        <span class="grow"></span>
        <button id="flow-btn-new-node" class="primary" title="Add a node to the current flow">+ Node</button>
        <button id="flow-btn-outline" title="Copy this flow as a markdown outline">Copy outline</button>
        <button id="flow-btn-clear-flow" class="danger" title="Remove all nodes and edges from the current flow">Clear</button>
        <span class="sep"></span>
        <button id="flow-btn-zoom-out" class="icon-btn" title="Zoom out">\u2212</button>
        <span id="flow-zoom-label" class="zoom-label">100%</span>
        <button id="flow-btn-zoom-in" class="icon-btn" title="Zoom in">+</button>
        <button id="flow-btn-fit" title="Fit all nodes in view">Fit</button>
      </header>
      <main id="flow-canvas" class="canvas">
        <div id="flow-empty" class="empty hidden">
          <p>No flows yet.</p>
          <button id="flow-btn-create-flow" class="primary">Create a flow</button>
        </div>
        <div id="flow-hint" class="hint hidden">
          <p>Double-click anywhere to add your first node</p>
        </div>
        <div id="flow-world" class="world">
          <svg id="flow-edges" class="edges" xmlns="http://www.w3.org/2000/svg"></svg>
          <div id="flow-nodes" class="nodes"></div>
        </div>
      </main>
      <div id="flow-input-overlay" class="overlay hidden">
        <div class="dialog small" role="dialog" aria-modal="true">
          <h3 id="flow-input-title">Input</h3>
          <input id="flow-input-field" type="text">
          <div class="dialog-actions right">
            <button id="flow-btn-input-cancel">Cancel</button>
            <button id="flow-btn-input-ok" class="primary">OK</button>
          </div>
        </div>
      </div>
      <div id="flow-confirm-overlay" class="overlay hidden">
        <div class="dialog small" role="dialog" aria-modal="true">
          <p id="flow-confirm-text"></p>
          <div class="dialog-actions right">
            <button id="flow-btn-confirm-cancel">Cancel</button>
            <button id="flow-btn-confirm-ok" class="primary">Delete</button>
          </div>
        </div>
      </div>
    </section>

    <section id="tab-database" class="tool-view hidden">
      <div class="conn-bar">
        <select id="db-connection-select" title="Switch connection"></select>
        <button id="db-btn-new-connection" class="primary" title="Add a connection">+ Connection</button>
        <button id="db-btn-edit-connection" title="Edit the selected connection">Edit</button>
        <button id="db-btn-remove-connection" class="danger" title="Remove the selected connection">Remove</button>
        <button id="db-btn-open-file" title="Open a CSV, TSV, JSON or SQLite file">Open File\u2026</button>
      </div>
      <div id="db-conn-form" class="conn-form hidden">
        <div class="form-wrap">
          <h3 id="dbf-title">Add connection</h3>
          <label class="field">
            <span>Name</span>
            <input id="dbf-name" type="text" placeholder="My database">
          </label>
          <label class="field">
            <span>Type</span>
            <select id="dbf-type">
              <option value="sqlite">SQLite file (.db, .sqlite)</option>
              <option value="postgres">PostgreSQL</option>
              <option value="mysql">MySQL / MariaDB</option>
              <option value="mssql">SQL Server</option>
              <option value="csv">CSV file</option>
              <option value="tsv">TSV file</option>
              <option value="json">JSON file (array of objects)</option>
            </select>
          </label>
          <div id="dbf-row-file" class="field">
            <span>File</span>
            <div class="row">
              <input id="dbf-file" type="text" placeholder="path/to/data.csv">
              <button id="dbf-browse">Browse\u2026</button>
            </div>
          </div>
          <div id="dbf-network">
            <label class="field">
              <span>Host</span>
              <input id="dbf-host" type="text" placeholder="localhost">
            </label>
            <label class="field">
              <span>Port</span>
              <input id="dbf-port" type="number" placeholder="5432">
            </label>
            <label class="field">
              <span>Database</span>
              <input id="dbf-database" type="text" placeholder="postgres">
            </label>
            <label class="field">
              <span>User</span>
              <input id="dbf-user" type="text" placeholder="postgres">
            </label>
            <label class="field">
              <span>Password</span>
              <input id="dbf-password" type="password" placeholder="">
            </label>
            <label class="field checkbox hidden" id="dbf-row-ssl">
              <input id="dbf-ssl" type="checkbox">
              <span id="dbf-ssl-label">Use SSL</span>
            </label>
          </div>
          <p id="dbf-error" class="error hidden"></p>
          <div class="dialog-actions right">
            <button id="dbf-cancel">Cancel</button>
            <button id="dbf-save" class="primary">Save</button>
          </div>
        </div>
      </div>
      <header class="toolbar">
        <span id="db-conn-name" class="conn-name"></span>
        <span id="db-conn-type" class="badge"></span>
        <span class="grow"></span>
        <div class="tabs">
          <button id="db-tab-data" class="tab active">Data</button>
          <button id="db-tab-sql" class="tab">SQL</button>
        </div>
      </header>
      <div id="db-error" class="error hidden"></div>
      <section id="db-data-view" class="view">
        <div class="sub-toolbar">
          <select id="db-table-select" title="Choose a table"></select>
          <button id="db-btn-refresh" title="Reload">Refresh</button>
          <button id="db-btn-add-row" class="primary" title="Add an empty row">+ Row</button>
          <span class="grow"></span>
          <span id="db-readonly-note" class="muted hidden">Read-only \u2014 use the SQL tab to run statements</span>
          <button id="db-page-prev" title="Previous page">\u2039</button>
          <span id="db-page-label" class="muted"></span>
          <button id="db-page-next" title="Next page">\u203a</button>
        </div>
        <div class="grid-wrap" id="db-grid-host"></div>
      </section>
      <section id="db-sql-view" class="view hidden">
        <div class="sql-box">
          <textarea id="db-sql-input" spellcheck="false" placeholder="SELECT * FROM ..."></textarea>
          <div class="sql-actions">
            <button id="db-btn-run" class="primary">Run</button>
            <span class="muted">Ctrl/Cmd + Enter to run \u00b7 each statement runs separately</span>
          </div>
        </div>
        <div id="db-query-results" class="query-results"></div>
      </section>
      <div id="db-confirm-overlay" class="overlay hidden">
        <div class="dialog small" role="dialog" aria-modal="true">
          <p id="db-confirm-text"></p>
          <div class="dialog-actions right">
            <button id="db-btn-confirm-cancel">Cancel</button>
            <button id="db-btn-confirm-ok" class="primary">Delete</button>
          </div>
        </div>
      </div>
    </section>

  </div>

  <script nonce="${nonce}" src="${assets('app.js')}"></script>
  <script nonce="${nonce}" src="${assets('boards.js')}"></script>
  <script nonce="${nonce}" src="${assets('notes.js')}"></script>
  <script nonce="${nonce}" src="${assets('flow.js')}"></script>
  <script nonce="${nonce}" src="${assets('database.js')}"></script>
  <script nonce="${nonce}" src="${assets('db-connections.js')}"></script>
</body>
</html>`;
}

module.exports = { getHtml };
