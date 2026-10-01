const vscode = require('vscode');
const path = require('path');
const crypto = require('crypto');

function uid() {
  return crypto.randomBytes(8).toString('hex');
}

function secretKey(id) {
  return `database.password.${id}`;
}

function config() {
  return vscode.workspace.getConfiguration('database');
}

function workspaceFolder() {
  const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (!folder) {
    throw new Error('Open a folder first \u2014 Workspace Tools saves everything in the workspace.');
  }
  return folder;
}

function utilitiesFolderName() {
  const folder = workspaceFolder();
  const name = folder.name || path.basename(folder.uri.fsPath);
  return `${name.replace(/[<>:"/\\|?*]/g, '-')}_utilities`;
}

function utilitiesUri(...parts) {
  return vscode.Uri.joinPath(workspaceFolder().uri, utilitiesFolderName(), ...parts);
}

function storedUri(configured, fallback) {
  const raw = String(configured || fallback).trim();
  if (path.isAbsolute(raw)) {
    return vscode.Uri.file(path.normalize(raw));
  }
  const segments = raw.split(/[\\/]+/).filter(segment => segment && segment !== '.');
  return utilitiesUri(...segments);
}

function connectionsFileUri() {
  return storedUri(config().get('connectionsFile'), 'database/connections.json');
}

async function load() {
  try {
    const bytes = await vscode.workspace.fs.readFile(connectionsFileUri());
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (data && Array.isArray(data.connections)) {
      return data;
    }
  } catch {
    // missing or invalid file: start fresh
  }
  return { version: 1, connections: [] };
}

async function save(data) {
  const uri = connectionsFileUri();
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(uri.fsPath)));
  await vscode.workspace.fs.writeFile(
    uri,
    Buffer.from(JSON.stringify(data, null, 2), 'utf8')
  );
}

function resolvePath(file) {
  if (!file) {
    return file;
  }
  if (path.isAbsolute(file)) {
    return path.normalize(file);
  }
  return path.join(workspaceFolder().uri.fsPath, file);
}

async function pathExists(uri) {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function migrateLegacyStorage(targets) {
  const legacy = [
    { from: ['boards', 'boards.json'], to: targets.boards },
    { from: ['flow', 'flow.json'], to: targets.flow },
    { from: ['notes'], to: targets.notes },
    { from: ['database', 'connections.json'], to: targets.connections },
    { from: ['bookmarks', 'bookmarks.json'], to: targets.bookmarks },
  ];
  let moved = 0;
  let failed = 0;
  for (const item of legacy) {
    if (!item.to) {
      continue;
    }
    const from = vscode.Uri.joinPath(workspaceFolder().uri, ...item.from);
    if (!(await pathExists(from)) || (await pathExists(item.to))) {
      continue;
    }
    try {
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(item.to.fsPath)));
      await vscode.workspace.fs.rename(from, item.to, { overwrite: false });
      moved += 1;
      try {
        const legacyDir = vscode.Uri.joinPath(workspaceFolder().uri, item.from[0]);
        const entries = await vscode.workspace.fs.readDirectory(legacyDir);
        if (!entries.length) {
          await vscode.workspace.fs.delete(legacyDir, { recursive: true });
        }
      } catch {
        // folder still holds other files; keep it
      }
    } catch {
      failed += 1;
    }
  }
  return { moved, failed };
}

class ConnectionStore {
  constructor() {
    this.data = null;
  }

  async list() {
    if (!this.data) {
      this.data = await load();
    }
    return this.data.connections;
  }

  async get(id) {
    return (await this.list()).find(connection => connection.id === id) || null;
  }

  async addOrUpdate(connection) {
    const list = await this.list();
    const index = list.findIndex(candidate => candidate.id === connection.id);
    if (index >= 0) {
      list[index] = connection;
    } else {
      list.push(connection);
    }
    await save(this.data);
    return connection;
  }

  async remove(id) {
    const list = await this.list();
    this.data.connections = list.filter(connection => connection.id !== id);
    await save(this.data);
  }

  invalidate() {
    this.data = null;
  }
}

module.exports = {
  ConnectionStore,
  uid,
  secretKey,
  resolvePath,
  workspaceFolder,
  utilitiesFolderName,
  utilitiesUri,
  storedUri,
  connectionsFileUri,
  migrateLegacyStorage,
};
