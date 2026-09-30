function sanitize(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(value))) {
    return '[blob]';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return value;
}

function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

function splitStatements(sql) {
  const statements = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (quote) {
      current += ch;
      if (ch === quote) {
        if (sql[i + 1] === quote) {
          current += sql[i + 1];
          i += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') {
        i += 1;
      }
      current += '\n';
      continue;
    }
    if (ch === ';') {
      statements.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  statements.push(current);
  return statements.map(statement => statement.trim()).filter(Boolean);
}

function splitQualifiedName(name) {
  const parts = String(name).split('.');
  if (parts.length >= 2) {
    return { schema: parts[parts.length - 2], name: parts[parts.length - 1] };
  }
  return { schema: null, name };
}

module.exports = { sanitize, quoteIdent, splitStatements, splitQualifiedName };
