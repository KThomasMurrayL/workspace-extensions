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
    throw new Error('Open a folder first \u2014 connections are saved to database/connections.json.');
  }
  return folder;
}

function connectionsRelativePath() {
  return config().get('connectionsFile') || 'database/connections.json';
}

function connectionsFileUri() {
  return vscode.Uri.joinPath(workspaceFolder().uri, connectionsRelativePath());
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
  const relative = connectionsRelativePath();
  const dir = path.posix.dirname(relative.split(path.sep).join('/'));
  if (dir && dir !== '.') {
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(workspaceFolder().uri, dir));
  }
  await vscode.workspace.fs.writeFile(
    connectionsFileUri(),
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
};
