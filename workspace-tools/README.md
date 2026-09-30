# Workspace Tools (local test build)

All four extensions in one, with a tab bar:

- **Boards** — kanban boards (`boards/boards.json`)
- **Notes** — markdown notes with image insert and preview (`notes/`)
- **Flow** — flow charts with labelled arrows and markdown-outline export (`flow/flow.json`)
- **Database** — SQLite, PostgreSQL, MySQL/MariaDB, SQL Server, CSV/TSV/JSON (`database/connections.json`)
- **Bookmarks** — bookmark a line or selection in the editor with a category and a comment;
  comments show inline, and the Bookmarks tab lists/filters them (`bookmarks/bookmarks.json`)

## Bookmarks

- Select code (or just put the cursor on a line) and either:
  - right-click → **Add Bookmark**, or
  - press **⌥⌘B** (`ctrl+alt+b` on Windows/Linux).
- Pick a **category** (Note, Bug, Todo, Question, Important or none), then type an optional **comment**.
- The line gets a gutter star, the comment shows **inline** after the code, and the comment
  appears on hover.
- `⌥⇧⌘B` removes the bookmark at the cursor.
- The **Bookmarks** tab lists everything — search, filter by category, sort by file/newest/oldest,
  edit comments, jump to the line (click the row) or delete.
- Bookmarks track the code: if lines move, the snippet is found again automatically.
- Everything saves to `bookmarks/bookmarks.json` in the workspace.

This build is **local only** — it is not packaged for the public repo. It reuses the same
storage folders as the individual extensions, so your existing data shows up as-is.

## Run it

1. Open this folder (`workspace-tools`) in VS Code.
2. `npm install --omit=dev` (already done if you cloned the built copy).
3. Run **Run → Run Without Debugging** (or `./run-workspace-tools.sh` from the parent folder).
4. In the Extension Development Host window, open any folder and click the **Workspace Tools** icon.

## What changed vs. the four extensions

- One activity bar icon and one webview with tabs; also **Workspace Tools: Open Workspace Tools**
  to get it as a full editor tab.
- Notes now live in the webview: note list, markdown editor with autosave, image insert and a
  simple preview (rendered inside the panel).
- Database connections are managed from the Database tab (connection dropdown + inline form)
  instead of a tree view; the data grid and SQL console are unchanged.
- Boards and Flow are the same UIs, scoped under their tabs.

## Known limitations of this test build

- The Notes preview is a small built-in renderer (headings, lists, quotes, code, links, images).
- No `[[wiki link]]` autocomplete in this build; linking to a note is just typing its path.
- Removing a database connection asks you to click Remove twice (no modal).
