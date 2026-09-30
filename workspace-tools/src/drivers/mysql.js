const { sanitize, splitStatements, splitQualifiedName } = require('./util');

class MysqlSession {
  constructor(connection) {
    this.type = 'mysql';
    this.connection = connection;
    this.canEdit = false;
    this.canRunSql = true;
  }

  static async open(config, password) {
    const mysql = require('mysql2/promise');
    const connection = await mysql.createConnection({
      host: config.host || 'localhost',
      port: Number(config.port) || 3306,
      user: config.user || undefined,
      password: password || undefined,
      database: config.database || undefined,
      connectTimeout: 8000,
      multipleStatements: false,
      dateStrings: true,
    });
    return new MysqlSession(connection);
  }

  async listTables() {
    const [rows] = await this.connection.query('SHOW TABLES');
    return rows.map(row => String(Object.values(row)[0]));
  }

  async queryTable(table, limit, offset) {
    const { name } = splitQualifiedName(table);
    const [rows, fields] = await this.connection.query({
      sql: `SELECT * FROM \`${String(name).replace(/`/g, '``')}\` LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      rowsAsArray: true,
    });
    const columns = (fields || []).map(field => ({ name: field.name, editable: false }));
    return { columns, rows: rows.map(row => row.map(sanitize)), rowIds: null };
  }

  async run(sql) {
    const results = [];
    for (const statement of splitStatements(sql)) {
      const [rows, fields] = await this.connection.query({ sql: statement, rowsAsArray: true });
      if (fields && fields.length) {
        results.push({
          columns: fields.map(field => field.name),
          rows: rows.map(row => row.map(sanitize)),
        });
      } else {
        results.push({
          columns: [],
          rows: [],
          affected: rows && rows.affectedRows !== undefined ? rows.affectedRows : undefined,
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
      await this.connection.end();
    } catch {
      // ignore close errors
    }
  }
}

module.exports = { MysqlSession };
