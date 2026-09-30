const vscode = require('vscode');

const TYPE_LABELS = {
  sqlite: 'SQLite',
  postgres: 'PostgreSQL',
  mysql: 'MySQL / MariaDB',
  mssql: 'SQL Server',
  csv: 'CSV',
  tsv: 'TSV',
  json: 'JSON',
};

class ConnectionTreeProvider {
  constructor(store, sessions) {
    this.store = store;
    this.sessions = sessions;
    this._emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._emitter.event;
  }

  refresh() {
    this._emitter.fire();
  }

  getTreeItem(element) {
    return element;
  }

  async getChildren(element) {
    if (!element) {
      let connections = [];
      try {
        connections = await this.store.list();
      } catch {
        return [];
      }
      if (!connections.length) {
        const item = new vscode.TreeItem('No connections yet \u2014 click + to add one');
        item.iconPath = new vscode.ThemeIcon('info');
        return [item];
      }
      return connections.map(connection => this.connectionItem(connection));
    }

    if (element.kind === 'connection') {
      try {
        const session = await this.sessions.get(element.connection);
        const tables = await session.listTables();
        if (!tables.length) {
          const item = new vscode.TreeItem('No tables');
          item.iconPath = new vscode.ThemeIcon('info');
          return [item];
        }
        return tables.map(name => this.tableItem(element.connection, name));
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        const item = new vscode.TreeItem(message, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('warning');
        item.tooltip = message;
        return [item];
      }
    }

    return [];
  }

  connectionItem(connection) {
    const item = new vscode.TreeItem(
      connection.name || connection.id,
      vscode.TreeItemCollapsibleState.Collapsed
    );
    item.kind = 'connection';
    item.connection = connection;
    item.contextValue = 'connection';
    item.description = TYPE_LABELS[connection.type] || connection.type;
    item.iconPath = new vscode.ThemeIcon('database');
    item.tooltip = [
      connection.name,
      TYPE_LABELS[connection.type] || connection.type,
      connection.file || [connection.host, connection.port].filter(Boolean).join(':'),
      connection.database || '',
    ]
      .filter(Boolean)
      .join('\n');
    return item;
  }

  tableItem(connection, name) {
    const item = new vscode.TreeItem(name, vscode.TreeItemCollapsibleState.None);
    item.contextValue = 'table';
    item.iconPath = new vscode.ThemeIcon('table');
    item.command = {
      command: 'database.openTable',
      title: 'Open',
      arguments: [{ connection, table: name }],
    };
    return item;
  }
}

module.exports = { ConnectionTreeProvider, TYPE_LABELS };
