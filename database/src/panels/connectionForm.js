const vscode = require('vscode');
const path = require('path');
const crypto = require('crypto');
const { uid, secretKey } = require('../store');

const FILE_TYPES = ['sqlite', 'csv', 'tsv', 'json'];
const NETWORK_TYPES = ['postgres', 'mysql', 'mssql'];

function getHtml(webview, extensionUri) {
  const nonce = crypto.randomBytes(16).toString('base64');
  const styles = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'data.css'));
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'form.js'));
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
  <title>Connection</title>
</head>
<body class="form-body">
  <main class="form-wrap">
    <h2 id="form-title">Add connection</h2>

    <label class="field">
      <span>Name</span>
      <input id="field-name" type="text" placeholder="My database">
    </label>

    <label class="field">
      <span>Type</span>
      <select id="field-type">
        <option value="sqlite">SQLite file (.db, .sqlite)</option>
        <option value="postgres">PostgreSQL</option>
        <option value="mysql">MySQL / MariaDB</option>
        <option value="mssql">SQL Server</option>
        <option value="csv">CSV file</option>
        <option value="tsv">TSV file</option>
        <option value="json">JSON file (array of objects)</option>
      </select>
    </label>

    <div id="row-file" class="field">
      <span>File</span>
      <div class="row">
        <input id="field-file" type="text" placeholder="path/to/data.csv">
        <button id="btn-browse">Browse\u2026</button>
      </div>
    </div>

    <div id="network-fields">
      <label class="field">
        <span>Host</span>
        <input id="field-host" type="text" placeholder="localhost">
      </label>
      <label class="field">
        <span>Port</span>
        <input id="field-port" type="number" placeholder="5432">
      </label>
      <label class="field">
        <span>Database</span>
        <input id="field-database" type="text" placeholder="postgres">
      </label>
      <label class="field">
        <span>User</span>
        <input id="field-user" type="text" placeholder="postgres">
      </label>
      <label class="field">
        <span>Password</span>
        <input id="field-password" type="password" placeholder="">
      </label>
      <label class="field checkbox hidden" id="row-ssl">
        <input id="field-ssl" type="checkbox">
        <span id="ssl-label">Use SSL</span>
      </label>
    </div>

    <p id="form-error" class="error hidden"></p>

    <div class="dialog-actions right">
      <button id="btn-cancel">Cancel</button>
      <button id="btn-save" class="primary">Save</button>
    </div>
  </main>

  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}

class ConnectionFormPanel {
  static show(context, store, existing, onSaved) {
    const panel = vscode.window.createWebviewPanel(
      'database.connectionForm',
      existing ? `Edit ${existing.name}` : 'Add Connection',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
      }
    );
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'database.svg');
    panel.webview.html = getHtml(panel.webview, context.extensionUri);

    panel.webview.onDidReceiveMessage(async message => {
      if (!message || typeof message !== 'object') {
        return;
      }
      try {
        if (message.type === 'ready') {
          panel.webview.postMessage({
            type: 'init',
            config: existing || null,
          });
        } else if (message.type === 'browse') {
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
            panel.webview.postMessage({
              type: 'browseResult',
              path: picked[0].fsPath,
              name: path.basename(picked[0].fsPath),
            });
          }
        } else if (message.type === 'save') {
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
          const password = typeof message.password === 'string' ? message.password : '';
          if (password) {
            await context.secrets.store(secretKey(connection.id), password);
          }
          await store.addOrUpdate(connection);
          panel.dispose();
          if (onSaved) {
            onSaved(connection);
          }
          vscode.window.showInformationMessage(`Saved connection \u201c${name}\u201d.`);
        } else if (message.type === 'cancel') {
          panel.dispose();
        }
      } catch (error) {
        panel.webview.postMessage({
          type: 'formError',
          message: error && error.message ? error.message : String(error),
        });
      }
    });
    return panel;
  }
}

module.exports = { ConnectionFormPanel, FILE_TYPES, NETWORK_TYPES };
