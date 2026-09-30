const { sanitize, quoteIdent, splitStatements, splitQualifiedName } = require('./util');

async function createSession(connection, password) {
  switch (connection.type) {
    case 'sqlite': {
      const { SqliteSession } = require('./sqlite');
      return SqliteSession.open(connection.file);
    }
    case 'csv':
    case 'tsv':
    case 'json': {
      const { FileSession } = require('./file');
      return new FileSession(connection.file);
    }
    case 'postgres': {
      const { PostgresSession } = require('./postgres');
      return PostgresSession.open(connection, password);
    }
    case 'mysql': {
      const { MysqlSession } = require('./mysql');
      return MysqlSession.open(connection, password);
    }
    case 'mssql': {
      const { MssqlSession } = require('./mssql');
      return MssqlSession.open(connection, password);
    }
    default:
      throw new Error(`Unsupported connection type: ${connection.type}`);
  }
}

module.exports = { createSession, sanitize, quoteIdent, splitStatements, splitQualifiedName };
