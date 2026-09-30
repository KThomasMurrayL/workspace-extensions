const vscode = require('vscode');
const path = require('path');
const { notesDirUri, isNoteFile, isImageFile } = require('./util');

class NotesTreeProvider {
  constructor() {
    this._emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._emitter.event;
  }

  refresh() {
    this._emitter.fire();
  }

  getTreeItem(element) {
    return element;
  }

  async getChildren(element) {
    const dir = element ? element.uri : notesDirUri();
    let entries;
    try {
      entries = await vscode.workspace.fs.readDirectory(dir);
    } catch {
      return [];
    }
    const visible = entries.filter(
      ([name, type]) =>
        !name.startsWith('.') &&
        (type === vscode.FileType.Directory || isNoteFile(name) || isImageFile(name))
    );
    visible.sort(([nameA, typeA], [nameB, typeB]) => {
      const dirA = typeA === vscode.FileType.Directory ? 0 : 1;
      const dirB = typeB === vscode.FileType.Directory ? 0 : 1;
      if (dirA !== dirB) {
        return dirA - dirB;
      }
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
    return visible.map(([name, type]) => this.createItem(dir, name, type));
  }

  createItem(dir, name, type) {
    const uri = vscode.Uri.joinPath(dir, name);
    if (type === vscode.FileType.Directory) {
      const item = new vscode.TreeItem(name, vscode.TreeItemCollapsibleState.Collapsed);
      item.uri = uri;
      item.resourceUri = uri;
      item.contextValue = 'folder';
      item.iconPath = vscode.ThemeIcon.Folder;
      return item;
    }
    const image = isImageFile(name);
    const item = new vscode.TreeItem(name, vscode.TreeItemCollapsibleState.None);
    item.uri = uri;
    item.resourceUri = uri;
    item.contextValue = image ? 'image' : 'note';
    item.iconPath = new vscode.ThemeIcon(image ? 'file-media' : 'markdown');
    item.command = { command: 'vscode.open', title: 'Open', arguments: [uri] };
    return item;
  }
}

module.exports = { NotesTreeProvider };
