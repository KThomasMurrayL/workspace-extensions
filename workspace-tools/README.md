# Workspace Tools (local test build)

All four extensions in one, with a tab bar:

- **Boards** — kanban boards (`boards/boards.json`)
- **Notes** — markdown notes with image insert and preview (`notes/`)
- **Flow** — flow charts with labelled arrows and markdown-outline export (`flow/flow.json`)
- **Database** — SQLite, PostgreSQL, MySQL/MariaDB, SQL Server, CSV/TSV/JSON (`database/connections.json`)

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
