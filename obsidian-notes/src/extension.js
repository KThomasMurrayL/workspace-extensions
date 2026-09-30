const vscode = require('vscode');
const path = require('path');
const { NotesTreeProvider } = require('./tree');
const links = require('./links');
const {
  config,
  notesDirUri,
  assetsDirUri,
  exists,
  isNoteFile,
  isImageFile,
  listNoteFiles,
} = require('./util');

let tree;

function activate(context) {
  tree = new NotesTreeProvider();
  context.subscriptions.push(vscode.window.registerTreeDataProvider('obsidianNotes.notesView', tree));

  const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (folder) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(folder, `${config().get('notesFolder') || 'notes'}/**`)
    );
    watcher.onDidCreate(() => tree.refresh());
    watcher.onDidChange(() => tree.refresh());
    watcher.onDidDelete(() => tree.refresh());
    context.subscriptions.push(watcher);
  }

  register(context, 'obsidianNotes.newNote', newNote);
  register(context, 'obsidianNotes.newFolder', newFolder);
  register(context, 'obsidianNotes.openDailyNote', openDailyNote);
  register(context, 'obsidianNotes.insertImage', insertImage);
  register(context, 'obsidianNotes.openPreview', openPreview);
  register(context, 'obsidianNotes.renameNote', renameNote);
  register(context, 'obsidianNotes.deleteNote', deleteNote);
  register(context, 'obsidianNotes.revealNote', revealNote);
  register(context, 'obsidianNotes.openNotesFolder', openNotesFolder);
  register(context, 'obsidianNotes.refresh', async () => tree.refresh());

  links.register(context);
}

function deactivate() {}

function register(context, id, handler) {
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

function safeFileName(input) {
  return input.replace(/[\\/:*?"<>|]/g, '-').trim();
}

async function openNote(uri) {
  await vscode.window.showTextDocument(uri, { preview: false });
}

async function newNote(node) {
  const dir = node && node.uri && node.contextValue === 'folder' ? node.uri : notesDirUri();
  const input = await vscode.window.showInputBox({ prompt: 'Note name', placeHolder: 'My Note' });
  if (!input) {
    return;
  }
  const name = safeFileName(input);
  if (!name) {
    return;
  }
  const fileName = isNoteFile(name) ? name : `${name}.md`;
  const uri = vscode.Uri.joinPath(dir, fileName);
  if (await exists(uri)) {
    vscode.window.showInformationMessage(`"${fileName}" already exists \u2014 opening it.`);
  } else {
    await vscode.workspace.fs.createDirectory(dir);
    await vscode.workspace.fs.writeFile(
      uri,
      Buffer.from(`# ${path.basename(fileName, path.extname(fileName))}\n\n`, 'utf8')
    );
    tree.refresh();
  }
  await openNote(uri);
}

async function newFolder() {
  const input = await vscode.window.showInputBox({ prompt: 'Folder name', placeHolder: 'Projects' });
  if (!input) {
    return;
  }
  const name = safeFileName(input);
  if (!name) {
    return;
  }
  const uri = vscode.Uri.joinPath(notesDirUri(), name);
  if (await exists(uri)) {
    vscode.window.showInformationMessage(`"${name}" already exists.`);
    return;
  }
  await vscode.workspace.fs.createDirectory(uri);
  tree.refresh();
}

async function openDailyNote() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  const name = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const dir = notesDirUri();
  const uri = vscode.Uri.joinPath(dir, `${name}.md`);
  if (!(await exists(uri))) {
    await vscode.workspace.fs.createDirectory(dir);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(`# ${name}\n\n`, 'utf8'));
    tree.refresh();
  }
  await openNote(uri);
}

async function insertImage() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isNoteFile(editor.document.fileName)) {
    vscode.window.showWarningMessage('Open a markdown note first, then insert an image.');
    return;
  }
  const picks = await vscode.window.showOpenDialog({
    canSelectMany: true,
    openLabel: 'Insert image(s)',
    filters: { Images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] },
  });
  if (!picks || !picks.length) {
    return;
  }

  const assets = assetsDirUri();
  await vscode.workspace.fs.createDirectory(assets);

  const snippets = [];
  for (const pick of picks) {
    const target = await uniqueTarget(assets, path.basename(pick.fsPath));
    await vscode.workspace.fs.copy(pick, target, { overwrite: false });
    snippets.push(formatImage(editor.document.uri, target));
  }
  tree.refresh();

  await editor.edit(builder => builder.insert(editor.selection.active, snippets.join('\n')));
}

function formatImage(noteUri, imageUri) {
  const relative = path.relative(path.dirname(noteUri.fsPath), imageUri.fsPath).split(path.sep).join('/');
  if ((config().get('imageSyntax') || 'markdown') === 'wiki') {
    return `![[${relative}]]`;
  }
  const encoded = relative.split('/').map(encodeURIComponent).join('/');
  return `![](${encoded})`;
}

async function uniqueTarget(dir, fileName) {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let candidate = vscode.Uri.joinPath(dir, fileName);
  let index = 1;
  while (await exists(candidate)) {
    candidate = vscode.Uri.joinPath(dir, `${base}-${index}${ext}`);
    index += 1;
  }
  return candidate;
}

async function openPreview(node) {
  const uri =
    (node && node.uri) ||
    (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri);
  if (!uri || !isNoteFile(uri.path)) {
    vscode.window.showWarningMessage('Open a markdown note first.');
    return;
  }
  await vscode.commands.executeCommand('markdown.showPreview', uri);
}

async function pickNote(placeHolder) {
  const files = await listNoteFiles();
  if (!files.length) {
    vscode.window.showInformationMessage('No notes found.');
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    files.map(file => ({
      label: path.basename(file.fsPath),
      description: vscode.workspace.asRelativePath(file),
      uri: file,
    })),
    { placeHolder }
  );
  return picked && picked.uri;
}

async function renameNote(node) {
  const uri = (node && node.uri) || (await pickNote('Rename which note?'));
  if (!uri) {
    return;
  }
  const oldName = path.basename(uri.fsPath);
  const ext = path.extname(oldName);
  const input = await vscode.window.showInputBox({
    prompt: 'New name',
    value: path.basename(oldName, ext),
  });
  if (!input) {
    return;
  }
  const name = safeFileName(input);
  if (!name || name === path.basename(oldName, ext)) {
    return;
  }
  const target = vscode.Uri.file(path.join(path.dirname(uri.fsPath), name + ext));
  if (await exists(target)) {
    vscode.window.showErrorMessage(`"${name + ext}" already exists.`);
    return;
  }
  await vscode.workspace.fs.rename(uri, target, { overwrite: false });
  tree.refresh();
}

async function deleteNote(node) {
  const uri = (node && node.uri) || (await pickNote('Delete which note?'));
  if (!uri) {
    return;
  }
  const answer = await vscode.window.showWarningMessage(
    `Delete "${path.basename(uri.fsPath)}"?`,
    { modal: true },
    'Delete'
  );
  if (answer !== 'Delete') {
    return;
  }
  await vscode.workspace.fs.delete(uri, { useTrash: true, recursive: true });
  tree.refresh();
}

async function revealNote(node) {
  const uri = (node && node.uri) || notesDirUri();
  await vscode.commands.executeCommand('revealFileInOS', uri);
}

async function openNotesFolder() {
  const dir = notesDirUri();
  await vscode.workspace.fs.createDirectory(dir);
  await vscode.commands.executeCommand('revealFileInOS', dir);
}

module.exports = { activate, deactivate };
