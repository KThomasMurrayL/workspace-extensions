const { sanitize, splitStatements, splitQualifiedName } = require('./util');

function bracket(name) {
  return '[' + String(name).replace(/]/g, ']]') + ']';
}

class MssqlSession {
  constructor(pool) {
    this.type = 'mssql';
    this.pool = pool;
    this.canEdit = false;
    this.canRunSql = true;
  }

  static async open(config, password) {
    const sql = require('mssql');
    const pool = new sql.ConnectionPool({
      server: config.host || 'localhost',
      port: Number(config.port) || 1433,
      user: config.user || undefined,
      password: password || undefined,
      database: config.database || undefined,
      connectionTimeout: 8000,
      requestTimeout: 30000,
      options: {
        encrypt: config.encrypt !== false,
        trustServerCertificate: true,
      },
    });
    await pool.connect();
    return new MssqlSession(pool);
  }

  async listTables() {
    const result = await this.pool
      .request()
      .query(
        "SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES " +
          "WHERE TABLE_TYPE IN ('BASE TABLE','VIEW') ORDER BY TABLE_SCHEMA, TABLE_NAME"
      );
    return result.recordset.map(row => `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`);
  }

  async queryTable(table, limit, offset) {
    const { schema, name } = splitQualifiedName(table);
    const qualified = schema ? `${bracket(schema)}.${bracket(name)}` : bracket(name);
    const result = await this.pool
      .request()
      .query(
        `SELECT * FROM ${qualified} ORDER BY (SELECT NULL) ` +
          `OFFSET ${Number(offset)} ROWS FETCH NEXT ${Number(limit)} ROWS ONLY`
      );
    const recordset = result.recordset || [];
    let columns = [];
    if (recordset.columns) {
      columns = Object.keys(recordset.columns).map(name => ({ name, editable: false }));
    } else if (recordset.length) {
      columns = Object.keys(recordset[0]).map(name => ({ name, editable: false }));
    }
    return {
      columns,
      rows: recordset.map(row => columns.map(column => sanitize(row[column.name]))),
      rowIds: null,
    };
  }

  async run(sql) {
    const results = [];
    for (const statement of splitStatements(sql)) {
      const result = await this.pool.request().query(statement);
      if (result.recordset && result.recordset.columns) {
        const columns = Object.keys(result.recordset.columns).map(name => ({
          name,
          editable: false,
        }));
        results.push({
          columns,
          rows: result.recordset.map(row => columns.map(column => sanitize(row[column.name]))),
        });
      } else {
        results.push({
          columns: [],
          rows: [],
          affected: Array.isArray(result.rowsAffected) ? result.rowsAffected[0] : undefined,
        });
      }
    }
    return results;
  }

  async flush() {
    return null;
  }

  async close() {
    try {
      await this.pool.close();
    } catch {
      // ignore close errors
    }
  }
}

module.exports = { MssqlSession };
