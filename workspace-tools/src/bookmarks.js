const vscode = require('vscode');
const path = require('path');
const crypto = require('crypto');
const { utilitiesFolderName } = require('./store');

const CATEGORIES = [
  { id: 'note', label: 'Note', color: '#4a9eff' },
  { id: 'bug', label: 'Bug', color: '#e5484d' },
  { id: 'todo', label: 'Todo', color: '#e2b93d' },
  { id: 'question', label: 'Question', color: '#a06ff5' },
  { id: 'important', label: 'Important', color: '#ff7b32' },
];

function uid() {
  return crypto.randomBytes(6).toString('hex');
}

function categoryLabel(id) {
  const found = CATEGORIES.find(category => category.id === id);
  return found ? found.label : 'Note';
}

function extractSnippet(text) {
  const first = String(text || '')
    .split(/\r?\n/)
    .find(line => line.trim()) || '';
  return first.trim().slice(0, 120);
}

function resolveLineIndex(lines, bookmark) {
  const total = lines.length;
  const at = index => (index >= 0 && index < total ? lines[index].trim() : null);
  if (at(bookmark.line) === (bookmark.text || '').trim()) {
    return Math.max(0, Math.min(bookmark.line, total - 1));
  }
  const wanted = (bookmark.text || '').trim();
  if (wanted) {
    for (let i = 0; i < total; i += 1) {
      if (lines[i].trim() === wanted) {
        return i;
      }
    }
  }
  return Math.max(0, Math.min(bookmark.line, total - 1));
}

class BookmarksManager {
  constructor(options) {
    this.workspaceFolder = options.workspaceFolder;
    this.extensionUri = options.extensionUri;
    this.onChange = options.onChange || (() => {});
    this.data = null;
    this.timers = new Map();
    this.lineType = null;
    this.commentType = null;
  }

  fileUri() {
    return vscode.Uri.joinPath(this.workspaceFolder().uri, utilitiesFolderName(), 'bookmarks', 'bookmarks.json');
  }

  uriFor(relative) {
    return vscode.Uri.joinPath(this.workspaceFolder().uri, relative);
  }

  relativePath(uri) {
    return vscode.workspace.asRelativePath(uri, false).split(path.sep).join('/');
  }

  invalidate() {
    this.data = null;
  }

  async ensure() {
    if (this.data) {
      return this.data;
    }
    try {
      const bytes = await vscode.workspace.fs.readFile(this.fileUri());
      const loaded = JSON.parse(new TextDecoder().decode(bytes));
      this.data = loaded && Array.isArray(loaded.bookmarks) ? loaded : { version: 1, bookmarks: [] };
    } catch {
      this.data = { version: 1, bookmarks: [] };
    }
    return this.data;
  }

  async save() {
    const uri = this.fileUri();
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(uri.fsPath)));
    await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(this.data, null, 2), 'utf8'));
  }

  list() {
    return this.data ? this.data.bookmarks : [];
  }

  init(context) {
    this.lineType = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.findMatchForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      gutterIconPath: vscode.Uri.joinPath(this.extensionUri, 'media', 'bookmark.svg'),
      gutterIconSize: 'contain',
    });
    this.commentType = vscode.window.createTextEditorDecorationType({
      after: {
        margin: '0 0 0 1.5em',
        color: new vscode.ThemeColor('editorCodeLens.foreground'),
        fontStyle: 'italic',
      },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    context.subscriptions.push(
      this.lineType,
      this.commentType,
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
          this.decorate(editor);
        }
      }),
      vscode.window.onDidChangeVisibleTextEditors(() => this.decorateAll()),
      vscode.workspace.onDidChangeTextDocument(event => this.scheduleDecorate(event.document))
    );

    this.ensure().then(() => this.decorateAll());
  }

  decorateAll() {
    for (const editor of vscode.window.visibleTextEditors) {
      this.decorate(editor);
    }
  }

  decorate(editor) {
    if (!this.lineType || !this.data) {
      return;
    }
    if (editor.document.uri.scheme !== 'file') {
      editor.setDecorations(this.lineType, []);
      editor.setDecorations(this.commentType, []);
      return;
    }
    const relative = this.relativePath(editor.document.uri);
    const marks = this.data.bookmarks.filter(bookmark => bookmark.file === relative);
    const lineRanges = [];
    const commentRanges = [];
    for (const bookmark of marks) {
      const line = Math.min(Math.max(0, bookmark.line), editor.document.lineCount - 1);
      const lineInfo = editor.document.lineAt(line);
      const hover = this.hoverFor(bookmark);
      lineRanges.push({ range: lineInfo.range, hoverMessage: hover });
      const parts = [];
      if (bookmark.category) {
        parts.push(`[${categoryLabel(bookmark.category)}]`);
      }
      if (bookmark.comment) {
        parts.push(bookmark.comment);
      }
      if (parts.length) {
        const end = lineInfo.range.end;
        commentRanges.push({
          range: new vscode.Range(end, end),
          renderOptions: { after: { contentText: `  \u2605 ${parts.join(' ')}` } },
          hoverMessage: hover,
        });
      }
    }
    editor.setDecorations(this.lineType, lineRanges);
    editor.setDecorations(this.commentType, commentRanges);
  }

  hoverFor(bookmark) {
    const markdown = new vscode.MarkdownString();
    const suffix = bookmark.category ? ` \u00b7 ${categoryLabel(bookmark.category)}` : '';
    markdown.appendMarkdown(`**Bookmark**${suffix}\n\n`);
    if (bookmark.comment) {
      markdown.appendMarkdown(`${bookmark.comment}\n\n`);
    }
    markdown.appendMarkdown(`\`${bookmark.file}:${bookmark.line + 1}\``);
    return markdown;
  }

  scheduleDecorate(document) {
    if (!this.data || document.uri.scheme !== 'file') {
      return;
    }
    const relative = this.relativePath(document.uri);
    if (!this.data.bookmarks.some(bookmark => bookmark.file === relative)) {
      return;
    }
    const key = document.uri.toString();
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }
    this.timers.set(
      key,
      setTimeout(async () => {
        this.timers.delete(key);
        const lines = [];
        for (let i = 0; i < document.lineCount; i += 1) {
          lines.push(document.lineAt(i).text);
        }
        let changed = false;
        for (const bookmark of this.data.bookmarks) {
          if (bookmark.file !== relative) {
            continue;
          }
          const resolved = resolveLineIndex(lines, bookmark);
          if (resolved !== bookmark.line) {
            bookmark.line = resolved;
            changed = true;
          }
        }
        if (changed) {
          await this.save();
          this.onChange();
        }
        for (const editor of vscode.window.visibleTextEditors) {
          if (editor.document.uri.toString() === key) {
            this.decorate(editor);
          }
        }
      }, 400)
    );
  }

  insideWorkspace(uri) {
    const root = this.workspaceFolder().uri.fsPath;
    return uri.fsPath === root || uri.fsPath.startsWith(root + path.sep);
  }

  async add(editor, category, comment) {
    await this.ensure();
    if (!this.insideWorkspace(editor.document.uri)) {
      throw new Error('Bookmarks only work for files inside the workspace.');
    }
    const document = editor.document;
    const selection = editor.selection;
    const snippet = extractSnippet(
      selection.isEmpty ? document.lineAt(selection.start.line).text : document.getText(selection)
    );
    const bookmark = {
      id: uid(),
      file: this.relativePath(document.uri),
      line: selection.start.line,
      column: selection.start.character,
      endLine: selection.end.line,
      endColumn: selection.end.character,
      text: snippet,
      comment: comment || '',
      category: category || '',
      createdAt: Date.now(),
    };
    this.data.bookmarks.push(bookmark);
    await this.save();
    this.decorate(editor);
    this.onChange();
    return bookmark;
  }

  async removeAtCursor(editor) {
    await this.ensure();
    const relative = this.relativePath(editor.document.uri);
    const cursorLine = editor.selection.active.line;
    const lines = [];
    for (let i = 0; i < editor.document.lineCount; i += 1) {
      lines.push(editor.document.lineAt(i).text);
    }
    const match = this.data.bookmarks.find(
      bookmark => bookmark.file === relative && resolveLineIndex(lines, bookmark) === cursorLine
    );
    if (!match) {
      vscode.window.showInformationMessage('No bookmark on this line.');
      return false;
    }
    this.data.bookmarks = this.data.bookmarks.filter(bookmark => bookmark.id !== match.id);
    await this.save();
    this.decorate(editor);
    this.onChange();
    return true;
  }

  async remove(id) {
    await this.ensure();
    this.data.bookmarks = this.data.bookmarks.filter(bookmark => bookmark.id !== id);
    await this.save();
    this.decorateAll();
    this.onChange();
  }

  async update(id, patch) {
    await this.ensure();
    const bookmark = this.data.bookmarks.find(candidate => candidate.id === id);
    if (!bookmark) {
      return;
    }
    if (typeof patch.comment === 'string') {
      bookmark.comment = patch.comment;
    }
    if (typeof patch.category === 'string') {
      bookmark.category = patch.category;
    }
    await this.save();
    this.decorateAll();
    this.onChange();
  }

  async clear() {
    await this.ensure();
    this.data.bookmarks = [];
    await this.save();
    this.decorateAll();
    this.onChange();
  }

  async navigate(id) {
    await this.ensure();
    const bookmark = this.data.bookmarks.find(candidate => candidate.id === id);
    if (!bookmark) {
      return;
    }
    let document;
    try {
      document = await vscode.workspace.openTextDocument(this.uriFor(bookmark.file));
    } catch {
      vscode.window.showWarningMessage(`Bookmark file not found: ${bookmark.file}`);
      return;
    }
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    const lines = [];
    for (let i = 0; i < document.lineCount; i += 1) {
      lines.push(document.lineAt(i).text);
    }
    const resolved = resolveLineIndex(lines, bookmark);
    if (resolved !== bookmark.line) {
      bookmark.line = resolved;
      await this.save();
      this.onChange();
    }
    const lineInfo = document.lineAt(bookmark.line);
    const position = new vscode.Position(bookmark.line, Math.min(bookmark.column || 0, lineInfo.text.length));
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    this.decorate(editor);
  }
}

module.exports = { BookmarksManager, CATEGORIES, categoryLabel, extractSnippet, resolveLineIndex };
