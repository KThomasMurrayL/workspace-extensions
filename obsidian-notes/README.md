# Obsidian Notes

Obsidian-style markdown note taking in VS Code. Notes and images live inside your
workspace (`notes/` and `notes/assets/` by default), so they are versioned with your project.

## Features

- **Notes tree** in the activity bar with folders, `.md` files and images.
- **New note / New folder / New note inside a folder** (right-click a folder).
- **Daily note** — `Notes: Open Today's Note` creates `notes/YYYY-MM-DD.md`.
- **Image upload** — `Notes: Insert Image` (command palette or the editor title icon) copies
  the picture into `notes/assets/` and inserts a link at the cursor.
- **`[[wiki links]]`** — typing `[[` suggests notes, `![[` suggests images; `[[Note]]`
  links in the editor are clickable.
- **Preview** — `Notes: Open Preview` opens the built-in markdown preview where image links render.
- Rename / delete / reveal notes from the tree context menu.

## How to use

1. Open a folder in VS Code.
2. Click the **Notes** icon in the activity bar (or run **Notes: New Note**).
3. Type markdown. To add a picture, place the cursor and run **Notes: Insert Image**.
4. Link between notes with `[[Other Note]]` — completion appears as you type.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `obsidianNotes.notesFolder` | `notes` | Where notes are stored. |
| `obsidianNotes.assetsFolder` | `notes/assets` | Where uploaded images are copied. |
| `obsidianNotes.imageSyntax` | `markdown` | Standard markdown image link, or `wiki` for an Obsidian-style `![[...]]` embed. |
| `obsidianNotes.linkCompletion` | `true` | Suggest notes/images after `[[`. |

## Run this extension (development)

> On this Mac `F5` hangs ("Extension host did not start in 10 seconds") because the
> debugger fails to attach. Use **Run menu → Run Without Debugging**, or run
> `../run-notes.sh` from a terminal instead.

1. Open this folder (`obsidian-notes`) in VS Code.
2. Run **Run → Run Without Debugging** (or `./run-notes.sh` from the parent folder).
3. In the new Extension Development Host window, open any folder — the Notes view appears in the activity bar.

## Install permanently

Download `obsidian-notes-0.1.0.vsix` from <https://kthomasmurrayl.github.io/boards-and-notes/>, or:

```bash
npx --yes @vscode/vsce package --allow-missing-repository
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --install-extension obsidian-notes-0.1.0.vsix
```
