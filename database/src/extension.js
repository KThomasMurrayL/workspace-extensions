const vscode = require('vscode');
const path = require('path');
const { ConnectionStore, uid, secretKey, resolvePath } = require('./store');
const { createSession } = require('./drivers');
const { ConnectionTreeProvider } = require('./tree');
const { DataPanel } = require('./panels/dataPanel');
const { ConnectionFormPanel } = require('./panels/connectionForm');

const FILE_TYPES = ['csv', 'tsv', 'json', 'sqlite'];
const NETWORK_TYPES = ['postgres', 'mysql', 'mssql'];
const SQLITE_EXTENSIONS = ['db', 'sqlite', 'sqlite3', 'db3'];

let sessions;

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
        .catch(() => {
          // ignore
        });
      this.pending.delete(id);
    }
  }

  closeAll() {
    for (const id of [...this.pending.keys()]) {
      this.close(id);
    }
  }
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
  const store = new ConnectionStore();
  sessions = new SessionManager(context);
  const tree = new ConnectionTreeProvider(store, sessions);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('database.connectionsView', tree)
  );
  context.subscriptions.push({
    dispose: () => sessions && sessions.closeAll(),
  });

  registerCommand(context, 'database.addConnection', async () => {
    ConnectionFormPanel.show(context, store, null, () => {
      store.invalidate();
      tree.refresh();
    });
  });

  registerCommand(context, 'database.editConnection', async node => {
    const connection = node && node.connection;
    if (!connection) {
      vscode.window.showInformationMessage('Use the Database view context menu to edit a connection.');
      return;
    }
    ConnectionFormPanel.show(context, store, connection, () => {
      sessions.close(connection.id);
      store.invalidate();
      tree.refresh();
    });
  });

  registerCommand(context, 'database.removeConnection', async node => {
    const connection = node && node.connection;
    if (!connection) {
      return;
    }
    const answer = await vscode.window.showWarningMessage(
      `Remove connection \u201c${connection.name}\u201d?`,
      { modal: true },
      'Remove'
    );
    if (answer !== 'Remove') {
      return;
    }
    sessions.close(connection.id);
    await store.remove(connection.id);
    tree.refresh();
  });

  registerCommand(context, 'database.openTable', async arg => {
    if (!arg || !arg.connection || !arg.table) {
      return;
    }
    DataPanel.show(context, sessions, arg.connection, { table: arg.table });
  });

  registerCommand(context, 'database.openQuery', async node => {
    const connection = node && node.connection;
    if (!connection) {
      return;
    }
    DataPanel.show(context, sessions, connection, { mode: 'sql' });
  });

  registerCommand(context, 'database.openDataFile', async () => {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Open',
      filters: {
        'Data files': ['csv', 'tsv', 'json', 'jsonl', 'sqlite', 'db', 'sqlite3', 'db3'],
      },
    });
    if (!picked || !picked.length) {
      return;
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
      vscode.window.showWarningMessage(
        'Unsupported file type. Choose a CSV, TSV, JSON or SQLite file.'
      );
      return;
    }
    const connection = {
      id: `file-${uid()}`,
      name: path.basename(filePath),
      type: ext,
      file: filePath,
    };
    DataPanel.show(context, sessions, connection, {});
  });

  registerCommand(context, 'database.refresh', async () => {
    store.invalidate();
    tree.refresh();
    DataPanel.invalidateTableList();
  });
}

function deactivate() {
  if (sessions) {
    sessions.closeAll();
    sessions = null;
  }
}

module.exports = { activate, deactivate };
