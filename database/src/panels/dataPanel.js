const vscode = require('vscode');
const crypto = require('crypto');

const panels = new Map();

function getHtml(webview, extensionUri) {
  const nonce = crypto.randomBytes(16).toString('base64');
  const styles = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'data.css'));
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'data.js'));
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
  <title>Database</title>
</head>
<body>
  <header class="toolbar">
    <span id="conn-name" class="conn-name"></span>
    <span id="conn-type" class="badge"></span>
    <span class="grow"></span>
    <div class="tabs">
      <button id="tab-data" class="tab active">Data</button>
      <button id="tab-sql" class="tab">SQL</button>
    </div>
  </header>

  <div id="error" class="error hidden"></div>

  <section id="data-view" class="view">
    <div class="sub-toolbar">
      <select id="table-select" title="Choose a table"></select>
      <button id="btn-refresh" title="Reload">Refresh</button>
      <button id="btn-add-row" class="primary" title="Add an empty row">+ Row</button>
      <span class="grow"></span>
      <span id="readonly-note" class="muted hidden">Read-only \u2014 use the SQL tab to run statements</span>
      <button id="page-prev" title="Previous page">\u2039</button>
      <span id="page-label" class="muted"></span>
      <button id="page-next" title="Next page">\u203a</button>
    </div>
    <div class="grid-wrap" id="grid-host"></div>
  </section>

  <section id="sql-view" class="view hidden">
    <div class="sql-box">
      <textarea id="sql-input" spellcheck="false" placeholder="SELECT * FROM ..."></textarea>
      <div class="sql-actions">
        <button id="btn-run" class="primary">Run</button>
        <span class="muted">Ctrl/Cmd + Enter to run \u00b7 each statement runs separately</span>
      </div>
    </div>
    <div id="query-results" class="query-results"></div>
  </section>

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

class DataPanel {
  constructor(context, sessions, connection, options) {
    this.context = context;
    this.sessions = sessions;
    this.connection = connection;
    this.table = options.table || null;
    this.mode = options.mode || 'data';
    this.offset = 0;
    this.panel = vscode.window.createWebviewPanel(
      'database.dataPanel',
      connection.name || 'Database',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
      }
    );
    this.panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'database.svg');
    this.panel.webview.html = getHtml(this.panel.webview, context.extensionUri);
    this.panel.webview.onDidReceiveMessage(message => this.handleMessage(message));
    this.panel.onDidDispose(() => {
      panels.delete(this.connection.id);
    });
  }

  static show(context, sessions, connection, options = {}) {
    const existing = panels.get(connection.id);
    if (existing) {
      if (options.table) {
        existing.table = options.table;
        existing.offset = 0;
      }
      if (options.mode) {
        existing.mode = options.mode;
      }
      existing.panel.reveal();
      existing.sendState();
      return existing;
    }
    const created = new DataPanel(context, sessions, connection, options);
    panels.set(connection.id, created);
    return created;
  }

  static invalidateTableList() {
    for (const panel of panels.values()) {
      panel.sendState().catch(() => {
        // panel may be disposed
      });
    }
  }

  post(message) {
    try {
      this.panel.webview.postMessage(message);
    } catch {
      // disposed
    }
  }

  pageSize() {
    const configured = Number(vscode.workspace.getConfiguration('database').get('pageSize'));
    return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 500;
  }

  async session() {
    return this.sessions.get(this.connection);
  }

  async sendState() {
    const session = await this.session();
    const tables = await session.listTables();
    if (!this.table && tables.length) {
      this.table = tables[0];
    }
    if (this.table && !tables.includes(this.table)) {
      this.table = tables[0] || null;
      this.offset = 0;
    }
    const pageSize = this.pageSize();
    let data = { columns: [], rows: [], rowIds: null };
    if (this.table) {
      data = await session.queryTable(this.table, pageSize, this.offset);
    }
    this.panel.title = this.table
      ? `${this.connection.name} \u2014 ${this.table}`
      : this.connection.name;
    this.post({
      type: 'state',
      connection: {
        id: this.connection.id,
        name: this.connection.name,
        type: this.connection.type,
      },
      tables,
      table: this.table,
      mode: this.mode,
      canEdit: Boolean(session.canEdit && data.rowIds),
      canRunSql: Boolean(session.canRunSql),
      pageSize,
      offset: this.offset,
      columns: data.columns,
      rows: data.rows,
      rowIds: data.rowIds,
      hasPrev: this.offset > 0,
      hasNext: data.rows.length === pageSize,
    });
  }

  async persist(session) {
    if (typeof session.flush === 'function') {
      await session.flush();
    }
  }

  async handleMessage(message) {
    if (!message || typeof message !== 'object') {
      return;
    }
    try {
      switch (message.type) {
        case 'ready':
          await this.sendState();
          break;
        case 'selectTable':
          this.table = message.table;
          this.offset = 0;
          await this.sendState();
          break;
        case 'page':
          this.offset = Math.max(0, this.offset + Number(message.delta || 0));
          await this.sendState();
          break;
        case 'refresh':
          await this.sendState();
          break;
        case 'setMode':
          this.mode = message.mode === 'sql' ? 'sql' : 'data';
          break;
        case 'updateCell': {
          const session = await this.session();
          await session.updateCell(this.table, message.rowId, message.column, message.value);
          await this.persist(session);
          await this.sendState();
          break;
        }
        case 'insertRow': {
          const session = await this.session();
          await session.insertRow(this.table);
          await this.persist(session);
          await this.sendState();
          break;
        }
        case 'deleteRow': {
          const session = await this.session();
          await session.deleteRow(this.table, message.rowId);
          await this.persist(session);
          await this.sendState();
          break;
        }
        case 'runQuery': {
          const session = await this.session();
          if (!session.canRunSql) {
            throw new Error('This connection does not support SQL.');
          }
          const started = Date.now();
          const results = await session.run(String(message.sql || ''));
          this.post({ type: 'queryResult', results, elapsed: Date.now() - started });
          break;
        }
        default:
          break;
      }
    } catch (error) {
      this.post({
        type: 'error',
        message: error && error.message ? error.message : String(error),
      });
    }
  }
}

module.exports = { DataPanel };
