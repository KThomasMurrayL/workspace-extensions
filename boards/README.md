# Boards

Kanban-style boards inside VS Code. Everything is stored in your workspace at
`boards/boards.json`.

## Features

- **Multiple boards** with a switcher, rename and delete.
- **Lists (categories)** — add, rename (double-click the title), reorder (‹ ›) and delete.
- **Cards** — add inline, rename, delete, drag & drop between lists and within a list.
- **Card details** — description and a **checklist** ("list inside a card") with progress shown on the card front.
- Data is saved automatically on every change.
- Upgrading from v0.1 ("Trello Boards")? Your existing `trello/boards.json` is migrated automatically.

## How to use

- Click the **Boards** icon in the activity bar to see the board in the sidebar, or
- Run **Boards: Open Board** from the command palette to open it as a full editor tab.
- Other commands: **Boards: New Board**, **Boards: New List**, **Boards: New Card**, **Boards: Refresh**.

## Run this extension (development)

> On this Mac `F5` hangs ("Extension host did not start in 10 seconds") because the
> debugger fails to attach. Use **Run menu → Run Without Debugging**, or run
> `../run-boards.sh` from a terminal instead.

1. Open this folder (`boards`) in VS Code.
2. Run **Run → Run Without Debugging** (or `./run-boards.sh` from the parent folder).
3. In the new Extension Development Host window, open any folder — the board appears in the activity bar.
4. First open creates `boards/boards.json` with a sample board.

## Install permanently

Download `boards-0.2.0.vsix` from <https://kthomasmurrayl.github.io/workspace-extensions/>, or:

```bash
npx --yes @vscode/vsce package --allow-missing-repository
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --install-extension boards-0.2.0.vsix
```

## Storage format

`boards/boards.json` is plain JSON — commit it to git to share boards with your team.

```json
{
  "version": 1,
  "lastBoardId": "…",
  "boards": [
    {
      "id": "…",
      "name": "My Board",
      "lists": [
        {
          "id": "…",
          "name": "To Do",
          "cards": [
            { "id": "…", "title": "Card", "description": "", "checklist": [{ "id": "…", "text": "Item", "done": false }] }
          ]
        }
      ]
    }
  ]
}
```
