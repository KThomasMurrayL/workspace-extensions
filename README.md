# Workspace Extensions

Two VS Code extensions that bring kanban boards and markdown notes into any workspace.
All data is stored inside the folder you open, so it travels with the project and can be
committed to git.

| Extension | What it does | Where data is stored |
| --- | --- | --- |
| [`boards/`](boards) | Kanban boards: lists (categories), cards, checklists, drag & drop | `boards/boards.json` |
| [`notes/`](notes) | Note taking: notes tree, daily notes, `[[wiki links]]`, image upload | `notes/`, `notes/assets/` |

## Repo layout

- `boards/` — **Boards** extension source (kanban)
- `notes/` — **Notes** extension source
- `docs/` — GitHub Pages download page (Pages serves from the `/docs` folder)

## Download

**Web page:** <https://kthomasmurrayl.github.io/boards-and-notes/> · **Repo:** <https://github.com/KThomasMurrayL/boards-and-notes>

Direct downloads:

- <https://kthomasmurrayl.github.io/boards-and-notes/downloads/boards-0.2.0.vsix>
- <https://kthomasmurrayl.github.io/boards-and-notes/downloads/notes-0.2.0.vsix>

Install either file via the Extensions view → `…` → **Install from VSIX…**, or:

```bash
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" \
  --install-extension ~/Downloads/boards-0.2.0.vsix
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" \
  --install-extension ~/Downloads/notes-0.2.0.vsix
```

## Status: installed ✅

Both extensions are installed in this Mac's VS Code:

- `local.boards@0.2.0`
- `local.notes@0.2.0` (renamed from `local.obsidian-notes`, which was uninstalled)

Reload VS Code (`Cmd+Shift+P` → **Developer: Reload Window**), open any folder, and look
for the **Boards** and **Notes** icons in the activity bar.

## Run in development (without the debugger)

`F5` on this Mac fails because the extension host waits for the debugger to attach
("Extension host did not start in 10 seconds"). Use one of these instead:

- **Run menu → Run Without Debugging** (pick **Run Boards**, **Run Notes**, or **Run Both Extensions**).
- **Terminal scripts**: `./run-boards.sh` or `./run-notes.sh` (uses `code --extensionDevelopmentPath`, no debugger).
- Or fix `F5` by disabling the macOS dictation shortcut for F5
  (System Settings → Keyboard → Keyboard Shortcuts → Dictation).

## Repackage after changes

```bash
cd boards && npx --yes @vscode/vsce package --allow-missing-repository
cd ../notes && npx --yes @vscode/vsce package --allow-missing-repository
# then copy the new .vsix files into docs/downloads/ and push
```

No `npm install` or build step is needed — both extensions are plain JavaScript.
