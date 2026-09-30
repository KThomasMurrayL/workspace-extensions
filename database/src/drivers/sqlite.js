const fs = require('fs');
const path = require('path');
const { sanitize, quoteIdent } = require('./util');

let sqlPromise = null;

function loadSqlJs() {
  if (!sqlPromise) {
    const distDir = path.dirname(require.resolve('sql.js'));
    const initSqlJs = require('sql.js');
    sqlPromise = initSqlJs({ locateFile: file => path.join(distDir, file) });
  }
  return sqlPromise;
}

class SqliteSession {
  constructor(filePath, db) {
    this.type = 'sqlite';
    this.filePath = filePath;
    this.db = db;
    this.canEdit = true;
    this.canRunSql = true;
  }

  static async open(filePath) {
    const SQL = await loadSqlJs();
    const exists = fs.existsSync(filePath);
    const db = exists ? new SQL.Database(fs.readFileSync(filePath)) : new SQL.Database();
    const session = new SqliteSession(filePath, db);
    if (!exists) {
      session.save();
    }
    return session;
  }

  async listTables() {
    const result = this.db.exec(
      "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    if (!result.length) {
      return [];
    }
    return result[0].values.map(row => String(row[0]));
  }

  columnNames(table) {
    const result = this.db.exec(`PRAGMA table_info(${quoteIdent(table)})`);
    if (!result.length) {
      return [];
    }
    return result[0].values.map(row => String(row[1]));
  }

  async queryTable(table, limit, offset) {
    const quoted = quoteIdent(table);
    let result = null;
    let rowidMode = false;
    try {
      result = this.db.exec(`SELECT rowid AS __rowid__, * FROM ${quoted} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`);
      rowidMode = true;
    } catch {
      result = this.db.exec(`SELECT * FROM ${quoted} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`);
    }
    if (!result.length) {
      return {
        columns: this.columnNames(table).map(name => ({ name, editable: rowidMode })),
        rows: [],
        rowIds: [],
      };
    }
    const allColumns = result[0].columns;
    const columns = (rowidMode ? allColumns.slice(1) : allColumns).map(name => ({
      name,
      editable: rowidMode,
    }));
    const rowIds = rowidMode ? [] : null;
    const rows = result[0].values.map(row => {
      const values = row.slice();
      if (rowidMode) {
        rowIds.push(values.shift());
      }
      return values.map(sanitize);
    });
    return { columns, rows, rowIds };
  }

  async updateCell(table, rowId, column, value) {
    const statement = this.db.prepare(
      `UPDATE ${quoteIdent(table)} SET ${quoteIdent(column)} = ? WHERE rowid = ?`
    );
    statement.bind([value === undefined ? null : value, rowId]);
    statement.step();
    statement.free();
  }

  async insertRow(table) {
    this.db.run(`INSERT INTO ${quoteIdent(table)} DEFAULT VALUES`);
  }

  async deleteRow(table, rowId) {
    const statement = this.db.prepare(`DELETE FROM ${quoteIdent(table)} WHERE rowid = ?`);
    statement.bind([rowId]);
    statement.step();
    statement.free();
  }

  async run(sql) {
    const sets = this.db.exec(sql);
    const results = sets.map(set => ({
      columns: set.columns,
      rows: set.values.map(row => row.map(sanitize)),
    }));
    if (!results.length) {
      results.push({ columns: [], rows: [], affected: this.db.getRowsModified() });
    }
    if (/\b(insert|update|delete|create|drop|alter|replace|vacuum|reindex)\b/i.test(sql)) {
      this.save();
    }
    return results;
  }

  save() {
    fs.writeFileSync(this.filePath, Buffer.from(this.db.export()));
  }

  async flush() {
    this.save();
    return this.filePath;
  }

  async close() {
    try {
      this.save();
      this.db.close();
    } catch {
      // ignore close errors
    }
  }
}

module.exports = { SqliteSession };
