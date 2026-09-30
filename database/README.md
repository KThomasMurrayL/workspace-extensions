# Database

View and edit databases from VS Code. Supports SQLite, PostgreSQL, MySQL/MariaDB,
SQL Server and CSV/TSV/JSON files. Connection settings are stored in your workspace at
`database/connections.json`; passwords go to VS Code's encrypted secret storage.

## Features

- **Connections view** in the activity bar — add, edit and remove connections.
- **Data grid** — browse any table with paging; double-click a cell to edit.
- **Editing** — for SQLite and CSV/TSV/JSON the grid is fully editable (add/change/delete
  rows, saved automatically). SQL servers are read-only in the grid.
- **SQL console** — the SQL tab runs arbitrary statements (Ctrl/Cmd + Enter) and shows the
  result sets; use it to edit PostgreSQL, MySQL and SQL Server data.
- **Open Data File** — open a CSV, TSV, JSON or SQLite file from disk without saving a connection.

## Supported connections

| Type | Browse | Edit in grid | SQL console |
| --- | --- | --- | --- |
| SQLite (`.db`, `.sqlite`) | ✅ | ✅ | ✅ |
| CSV / TSV | ✅ | ✅ | – |
| JSON (array of objects) | ✅ | ✅ | – |
| PostgreSQL | ✅ | read-only | ✅ |
| MySQL / MariaDB | ✅ | read-only | ✅ |
| SQL Server | ✅ | read-only | ✅ |

## How to use

1. Click the **Database** icon in the activity bar.
2. Press **+** to add a connection (or **Open Data File** for a CSV/SQLite file).
3. Expand the connection and click a table to open the data grid.
4. Switch to the **SQL** tab to run statements.

Notes:

- Passwords are stored with VS Code SecretStorage, never in the JSON file.
- SQLite files are written back on every change; CSV/TSV/JSON files are written after each
  edit in the grid.
- SQLite grids use `rowid` for edits; tables without a rowid are read-only.

## Run this extension (development)

> On this Mac `F5` hangs ("Extension host did not start in 10 seconds") because the
> debugger fails to attach. Use **Run menu → Run Without Debugging**, or run
> `../run-database.sh` from a terminal instead.

1. Open this folder (`database`) in VS Code.
2. `npm install --omit=dev` (dependencies are bundled in the packaged VSIX).
3. Run **Run → Run Without Debugging** (or `./run-database.sh` from the parent folder).
4. In the new Extension Development Host window, open any folder — the Database view appears in the activity bar.

## Install permanently

Download `database-0.1.0.vsix` from <https://kthomasmurrayl.github.io/workspace-extensions/>, or:

```bash
npx --yes @vscode/vsce package --allow-missing-repository
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --install-extension database-0.1.0.vsix
```

## Implementation notes

- SQLite runs on [`sql.js`](https://sql.js.org) (WebAssembly) — no native builds required.
- PostgreSQL, MySQL and SQL Server use the `pg`, `mysql2` and `mssql` drivers.
- CSV/TSV parsing and JSON handling are built in (RFC 4180-style quoting).
