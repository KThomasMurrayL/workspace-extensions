const { sanitize, quoteIdent, splitQualifiedName } = require('./util');

class PostgresSession {
  constructor(client) {
    this.type = 'postgres';
    this.client = client;
    this.canEdit = false;
    this.canRunSql = true;
  }

  static async open(config, password) {
    const { Client } = require('pg');
    const client = new Client({
      host: config.host || 'localhost',
      port: Number(config.port) || 5432,
      user: config.user || undefined,
      password: password || undefined,
      database: config.database || undefined,
      connectionTimeoutMillis: 8000,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    });
    await client.connect();
    return new PostgresSession(client);
  }

  async listTables() {
    const result = await this.client.query(
      "SELECT table_schema, table_name FROM information_schema.tables " +
        "WHERE table_schema NOT IN ('pg_catalog','information_schema') " +
        "AND table_type IN ('BASE TABLE','VIEW') ORDER BY table_schema, table_name"
    );
    return result.rows.map(row => `${row.table_schema}.${row.table_name}`);
  }

  async queryTable(table, limit, offset) {
    const { schema, name } = splitQualifiedName(table);
    const qualified = schema ? `${quoteIdent(schema)}.${quoteIdent(name)}` : quoteIdent(name);
    const result = await this.client.query(
      `SELECT * FROM ${qualified} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
    );
    const columns = result.fields.map(field => ({ name: field.name, editable: false }));
    return {
      columns,
      rows: result.rows.map(row => result.fields.map(field => sanitize(row[field.name]))),
      rowIds: null,
    };
  }

  async run(sql) {
    const result = await this.client.query(sql);
    const sets = Array.isArray(result) ? result : [result];
    return sets.map(set => ({
      columns: (set.fields || []).map(field => field.name),
      rows: (set.rows || []).map(row => (set.fields || []).map(field => sanitize(row[field.name]))),
      affected: set.rowCount,
    }));
  }

  async flush() {
    return null;
  }

  async close() {
    try {
      await this.client.end();
    } catch {
      // ignore close errors
    }
  }
}

module.exports = { PostgresSession };
