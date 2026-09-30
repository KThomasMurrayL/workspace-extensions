const fs = require('fs');
const path = require('path');

const DELIMITERS = { csv: ',', tsv: '\t' };

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    if (ch === '\r') {
      continue;
    }
    field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function toDelimited(rows, delimiter) {
  return rows
    .map(row =>
      row
        .map(value => {
          const text = value === null || value === undefined ? '' : String(value);
          if (
            text.includes(delimiter) ||
            text.includes('"') ||
            text.includes('\n') ||
            text.includes('\r')
          ) {
            return '"' + text.replace(/"/g, '""') + '"';
          }
          return text;
        })
        .join(delimiter)
    )
    .join('\n') + '\n';
}

function coerceJson(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return '';
  }
  if (trimmed === 'null') {
    return null;
  }
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

class FileSession {
  constructor(filePath) {
    this.type = path.extname(filePath).slice(1).toLowerCase();
    this.filePath = filePath;
    this.tableName = path.basename(filePath);
    this.canEdit = true;
    this.canRunSql = false;
    this.columns = [];
    this.rows = [];
    this.load();
  }

  load() {
    const text = fs.readFileSync(this.filePath, 'utf8');
    if (this.type === 'json') {
      let parsed;
      try {
        parsed = JSON.parse(text || '[]');
      } catch (error) {
        throw new Error(`Invalid JSON: ${error.message}`);
      }
      if (!Array.isArray(parsed)) {
        parsed = parsed && typeof parsed === 'object' ? [parsed] : [];
      }
      const keys = [];
      for (const item of parsed) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          for (const key of Object.keys(item)) {
            if (!keys.includes(key)) {
              keys.push(key);
            }
          }
        }
      }
      this.columns = keys.map(name => ({ name, editable: true }));
      this.rows = parsed.map(item =>
        keys.map(key => {
          const value = item && typeof item === 'object' ? item[key] : item;
          if (value === undefined || value === null) {
            return null;
          }
          if (typeof value === 'object') {
            return JSON.stringify(value);
          }
          return value;
        })
      );
    } else {
      const delimiter = DELIMITERS[this.type] || ',';
      const raw = parseDelimited(text, delimiter);
      const header = raw.length ? raw[0] : [];
      this.columns = header.map(name => ({ name, editable: true }));
      this.rows = raw
        .slice(1)
        .map(row => header.map((_, index) => (index < row.length ? row[index] : '')));
    }
  }

  async listTables() {
    return [this.tableName];
  }

  async queryTable() {
    return {
      columns: this.columns,
      rows: this.rows,
      rowIds: this.rows.map((_, index) => index),
    };
  }

  async updateCell(table, rowId, column, value) {
    const index = Number(rowId);
    const columnIndex = this.columns.findIndex(candidate => candidate.name === column);
    if (this.rows[index] && columnIndex >= 0) {
      this.rows[index][columnIndex] = value;
    }
  }

  async insertRow() {
    this.rows.push(this.columns.map(() => ''));
  }

  async deleteRow(table, rowId) {
    this.rows.splice(Number(rowId), 1);
  }

  async run() {
    throw new Error('This file type does not support SQL.');
  }

  save() {
    if (this.type === 'json') {
      const data = this.rows.map(row => {
        const item = {};
        this.columns.forEach((column, index) => {
          item[column.name] = coerceJson(row[index]);
        });
        return item;
      });
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
    } else {
      const delimiter = DELIMITERS[this.type] || ',';
      fs.writeFileSync(
        this.filePath,
        toDelimited([this.columns.map(column => column.name), ...this.rows], delimiter)
      );
    }
  }

  async flush() {
    this.save();
    return this.filePath;
  }

  async close() {}
}

module.exports = { FileSession, parseDelimited, toDelimited, coerceJson };
