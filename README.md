# Workspace Extensions

A small collection of VS Code extensions for planning, tracking and writing. All data is
stored inside the folder you open, so it travels with the project and can be committed to git.

| Extension | What it does | Where data is stored |
| --- | --- | --- |
| [`boards/`](boards) | Kanban boards: lists (categories), cards, checklists, drag & drop | `boards/boards.json` |
| [`notes/`](notes) | Note taking: notes tree, daily notes, `[[wiki links]]`, image upload | `notes/`, `notes/assets/` |
| [`flow/`](flow) | Flow charts and project planning: nodes, arrows, outlines | `flow/flow.json` |

## Repo layout

- `boards/` — **Boards** extension source (kanban)
- `notes/` — **Notes** extension source
- `flow/` — **Flow** extension source (flow charts & planning)
- `docs/` — GitHub Pages download page (Pages serves from the `/docs` folder)

## Download

**Web page:** <https://kthomasmurrayl.github.io/workspace-extensions/> · **Repo:** <https://github.com/KThomasMurrayL/workspace-extensions>

Direct downloads:

- <https://kthomasmurrayl.github.io/workspace-extensions/downloads/boards-0.2.0.vsix>
- <https://kthomasmurrayl.github.io/workspace-extensions/downloads/notes-0.2.0.vsix>
- <https://kthomasmurrayl.github.io/workspace-extensions/downloads/flow-0.1.1.vsix>

Or from GitHub Releases: <https://github.com/KThomasMurrayL/workspace-extensions/releases>

Install a file via the Extensions view → `…` → **Install from VSIX…**, or:

```bash
CODE="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
"$CODE" --install-extension ~/Downloads/boards-0.2.0.vsix
"$CODE" --install-extension ~/Downloads/notes-0.2.0.vsix
"$CODE" --install-extension ~/Downloads/flow-0.1.1.vsix
```

## Status: installed ✅

All three extensions are installed in this Mac's VS Code:

- `local.boards@0.2.0`
- `local.notes@0.2.0`
- `local.flow@0.1.1`

Reload VS Code (`Cmd+Shift+P` → **Developer: Reload Window**), open any folder, and look
for the **Boards**, **Notes** and **Flow** icons in the activity bar.

## Run in development (without the debugger)

`F5` on this Mac fails because the extension host waits for the debugger to attach
("Extension host did not start in 10 seconds"). Use one of these instead:

- **Run menu → Run Without Debugging** (pick **Run Boards**, **Run Notes**, **Run Flow**, or **Run All Extensions**).
- **Terminal scripts**: `./run-boards.sh`, `./run-notes.sh` or `./run-flow.sh`
  (uses `code --extensionDevelopmentPath`, no debugger).
- Or fix `F5` by disabling the macOS dictation shortcut for F5
  (System Settings → Keyboard → Keyboard Shortcuts → Dictation).

## Repackage after changes

```bash
cd boards && npx --yes @vscode/vsce package --allow-missing-repository
cd ../notes && npx --yes @vscode/vsce package --allow-missing-repository
cd ../flow && npx --yes @vscode/vsce package --allow-missing-repository
# then copy the new .vsix files into docs/downloads/ and push
```

No `npm install` or build step is needed — the extensions are plain JavaScript.
