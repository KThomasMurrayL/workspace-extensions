const vscode = require('vscode');
const path = require('path');
const { config, exists, isImageFile, isNoteFile, notesDirUri } = require('./util');

const LINK_RE = /(!?)\[\[([^\[\]|#]+)(?:#[^\[\]|]*)?(?:\|[^\[\]]*)?\]\]/g;
let cache = { at: 0, files: [] };

async function getFiles() {
  const now = Date.now();
  if (cache.files.length && now - cache.at < 2000) {
    return cache.files;
  }
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
      } else if (isNoteFile(name) || isImageFile(name)) {
        files.push(uri);
      }
    }
  }
  try {
    await walk(notesDirUri());
  } catch {
    // no workspace folder open
  }
  cache = { at: now, files };
  return files;
}

async function resolveTarget(documentUri, target) {
  const clean = target.trim().replace(/^\.\//, '');
  if (!clean) {
    return null;
  }
  const extension = path.extname(clean);
  const candidates = [];
  const add = value => {
    if (value) {
      candidates.push(value);
    }
  };

  const dir = path.dirname(documentUri.fsPath);
  add(path.resolve(dir, clean));
  if (!extension) {
    add(path.resolve(dir, `${clean}.md`));
  }
  const folder = vscode.workspace.getWorkspaceFolder(documentUri);
  if (folder) {
    add(path.join(folder.uri.fsPath, clean));
    if (!extension) {
      add(path.join(folder.uri.fsPath, `${clean}.md`));
    }
  }
  try {
    const notesDir = notesDirUri().fsPath;
    add(path.join(notesDir, clean));
    if (!extension) {
      add(path.join(notesDir, `${clean}.md`));
    }
  } catch {
    // no workspace folder open
  }

  for (const candidate of candidates) {
    const uri = vscode.Uri.file(candidate);
    if (await exists(uri)) {
      return uri;
    }
  }

  if (!extension) {
    const wanted = path.basename(clean).toLowerCase();
    const files = await getFiles();
    const match = files.find(
      file => path.basename(file.fsPath, path.extname(file.fsPath)).toLowerCase() === wanted
    );
    if (match) {
      return match;
    }
  }
  return null;
}

class WikiLinkProvider {
  async provideDocumentLinks(document) {
    const links = [];
    const text = document.getText();
    LINK_RE.lastIndex = 0;
    let match;
    while ((match = LINK_RE.exec(text))) {
      const target = match[2].trim();
      const uri = await resolveTarget(document.uri, target);
      if (!uri) {
        continue;
      }
      const range = new vscode.Range(
        document.positionAt(match.index),
        document.positionAt(match.index + match[0].length)
      );
      const link = new vscode.DocumentLink(range, uri);
      link.tooltip = `${match[1] === '!' ? 'Open embed' : 'Open'}: ${target}`;
      links.push(link);
    }
    return links;
  }
}

class WikiCompletionProvider {
  async provideCompletionItems(document, position) {
    if (config().get('linkCompletion') === false) {
      return undefined;
    }
    const before = document.lineAt(position.line).text.slice(0, position.character);
    const match = /(!?)\[\[([^\[\]]*)$/.exec(before);
    if (!match) {
      return undefined;
    }
    const embedding = match[1] === '!';
    const typed = match[2];
    const files = await getFiles();
    const range = new vscode.Range(
      position.line,
      position.character - typed.length,
      position.line,
      position.character
    );
    const noteDir = path.dirname(document.uri.fsPath);
    const items = [];
    for (const file of files) {
      const image = isImageFile(file.fsPath);
      if (embedding && !image) {
        continue;
      }
      const base = path.basename(file.fsPath, path.extname(file.fsPath));
      const relative = path.relative(noteDir, file.fsPath).split(path.sep).join('/');
      const item = new vscode.CompletionItem(
        { label: base, description: relative },
        image ? vscode.CompletionItemKind.File : vscode.CompletionItemKind.Reference
      );
      item.insertText = `${image ? relative : base}]]`;
      item.range = range;
      item.filterText = `${base} ${relative}`;
      item.detail = relative;
      items.push(item);
    }
    return items;
  }
}

function register(context) {
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider({ language: 'markdown' }, new WikiLinkProvider())
  );
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: 'markdown' },
      new WikiCompletionProvider(),
      '['
    )
  );
}

module.exports = { register };
