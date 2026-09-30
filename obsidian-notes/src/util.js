const vscode = require('vscode');
const path = require('path');

const NOTE_EXTENSIONS = ['.md', '.markdown'];
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'];

function config() {
  return vscode.workspace.getConfiguration('obsidianNotes');
}

function workspaceFolder() {
  const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (!folder) {
    throw new Error('Open a folder to use Notes.');
  }
  return folder;
}

function notesFolderName() {
  return config().get('notesFolder') || 'notes';
}

function assetsFolderName() {
  return config().get('assetsFolder') || 'notes/assets';
}

function notesDirUri() {
  return vscode.Uri.joinPath(workspaceFolder().uri, notesFolderName());
}

function assetsDirUri() {
  return vscode.Uri.joinPath(workspaceFolder().uri, assetsFolderName());
}

function isNoteFile(name) {
  return NOTE_EXTENSIONS.includes(path.extname(name).toLowerCase());
}

function isImageFile(name) {
  return IMAGE_EXTENSIONS.includes(path.extname(name).toLowerCase());
}

async function exists(uri) {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function listNoteFiles() {
  const files = [];
  async function walk(dir) {
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
        await walk(uri);
      } else if (isNoteFile(name)) {
        files.push(uri);
      }
    }
  }
  try {
    await walk(notesDirUri());
  } catch {
    // no workspace folder open
  }
  files.sort((a, b) => a.fsPath.localeCompare(b.fsPath));
  return files;
}

module.exports = {
  config,
  workspaceFolder,
  notesFolderName,
  assetsFolderName,
  notesDirUri,
  assetsDirUri,
  isNoteFile,
  isImageFile,
  exists,
  listNoteFiles,
};
