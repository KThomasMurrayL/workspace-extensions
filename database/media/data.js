(function () {
  const vscode = acquireVsCodeApi();

  const els = {
    connName: document.getElementById('conn-name'),
    connType: document.getElementById('conn-type'),
    tabData: document.getElementById('tab-data'),
    tabSql: document.getElementById('tab-sql'),
    error: document.getElementById('error'),
    dataView: document.getElementById('data-view'),
    sqlView: document.getElementById('sql-view'),
    tableSelect: document.getElementById('table-select'),
    btnRefresh: document.getElementById('btn-refresh'),
    btnAddRow: document.getElementById('btn-add-row'),
    readonlyNote: document.getElementById('readonly-note'),
    pagePrev: document.getElementById('page-prev'),
    pageLabel: document.getElementById('page-label'),
    pageNext: document.getElementById('page-next'),
    gridHost: document.getElementById('grid-host'),
    sqlInput: document.getElementById('sql-input'),
    btnRun: document.getElementById('btn-run'),
    queryResults: document.getElementById('query-results'),
    confirmOverlay: document.getElementById('confirm-overlay'),
    confirmText: document.getElementById('confirm-text'),
    btnConfirmOk: document.getElementById('btn-confirm-ok'),
    btnConfirmCancel: document.getElementById('btn-confirm-cancel'),
  };

  const TYPE_LABELS = {
    sqlite: 'SQLite',
    postgres: 'PostgreSQL',
    mysql: 'MySQL / MariaDB',
    mssql: 'SQL Server',
    csv: 'CSV',
    tsv: 'TSV',
    json: 'JSON',
  };

  let model = {
    connection: null,
    tables: [],
    table: null,
    mode: 'data',
    canEdit: false,
    canRunSql: false,
    pageSize: 500,
    offset: 0,
    columns: [],
    rows: [],
    rowIds: null,
    hasPrev: false,
    hasNext: false,
  };
  let confirmSubmit = null;

  function showError(message) {
    els.error.textContent = message;
    els.error.classList.remove('hidden');
  }

  function hideError() {
    els.error.classList.add('hidden');
  }

  function askConfirm(text, okLabel, onOk) {
    els.confirmText.textContent = text;
    els.btnConfirmOk.textContent = okLabel || 'Delete';
    confirmSubmit = onOk;
    els.confirmOverlay.classList.remove('hidden');
    els.btnConfirmOk.focus();
  }

  function hideConfirm() {
    confirmSubmit = null;
    els.confirmOverlay.classList.add('hidden');
  }

  function buildGrid(columns, rows, options) {
    const settings = options || {};
    const table = document.createElement('table');
    table.className = 'grid';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    if (settings.onDelete) {
      const th = document.createElement('th');
      th.className = 'actions';
      headRow.appendChild(th);
    }
    for (const column of columns) {
      const th = document.createElement('th');
      th.textContent = column.name;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rows.forEach((row, rowIndex) => {
      const tr = document.createElement('tr');
      if (settings.onDelete) {
        const td = document.createElement('td');
        td.className = 'actions';
        const button = document.createElement('button');
        button.className = 'row-delete';
        button.textContent = '\u2715';
        button.title = 'Delete row';
        button.addEventListener('click', () => settings.onDelete(rowIndex));
        td.appendChild(button);
        tr.appendChild(td);
      }
      columns.forEach((column, columnIndex) => {
        const td = document.createElement('td');
        const value = row[columnIndex];
        const cell = document.createElement('div');
        cell.className = 'cell';
        if (value === null || value === undefined) {
          cell.classList.add('null');
          cell.textContent = 'NULL';
        } else {
          const text = String(value);
          cell.textContent = text;
          cell.title = text;
        }
        const editable =
          settings.editable && column.editable && Array.isArray(model.rowIds) && settings.rowIds;
        if (editable) {
          cell.addEventListener('dblclick', () => beginEdit(td, cell, rowIndex, columnIndex, column.name));
        } else {
          cell.classList.add('readonly');
        }
        td.appendChild(cell);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  function beginEdit(td, cell, rowIndex, columnIndex, columnName) {
    if (td.querySelector('input')) {
      return;
    }
    const current = model.rows[rowIndex][columnIndex];
    const input = document.createElement('input');
    input.className = 'cell-input';
    input.value = current === null || current === undefined ? '' : String(current);
    td.replaceChild(input, cell);
    input.focus();
    input.select();

    let done = false;
    const finish = commit => {
      if (done) {
        return;
      }
      done = true;
      const value = input.value;
      const previous = current === null || current === undefined ? '' : String(current);
      if (commit && value !== previous) {
        vscode.postMessage({
          type: 'updateCell',
          rowId: model.rowIds[rowIndex],
          column: columnName,
          value,
        });
      }
      renderGridArea();
    };
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
  }

  function renderGridArea() {
    els.gridHost.innerHTML = '';
    if (!model.table) {
      const empty = document.createElement('div');
      empty.className = 'grid-empty';
      empty.textContent = model.tables.length ? 'Select a table' : 'No tables found';
      els.gridHost.appendChild(empty);
      return;
    }
    if (!model.rows.length) {
      const empty = document.createElement('div');
      empty.className = 'grid-empty';
      empty.textContent = 'No rows';
      els.gridHost.appendChild(empty);
      return;
    }
    const onDelete = model.canEdit
      ? rowIndex => {
          const rowId = model.rowIds[rowIndex];
          askConfirm('Delete this row?', 'Delete', () => {
            vscode.postMessage({ type: 'deleteRow', rowId });
          });
        }
      : null;
    els.gridHost.appendChild(
      buildGrid(model.columns, model.rows, {
        editable: model.canEdit,
        rowIds: true,
        onDelete,
      })
    );
  }

  function renderToolbar() {
    els.connName.textContent = model.connection ? model.connection.name : '';
    els.connType.textContent = model.connection
      ? TYPE_LABELS[model.connection.type] || model.connection.type
      : '';
    els.tabSql.classList.toggle('hidden', !model.canRunSql);
    els.tabData.classList.toggle('active', model.mode === 'data');
    els.tabSql.classList.toggle('active', model.mode === 'sql');
    els.dataView.classList.toggle('hidden', model.mode !== 'data');
    els.sqlView.classList.toggle('hidden', model.mode !== 'sql');

    els.tableSelect.innerHTML = '';
    for (const name of model.tables) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      if (name === model.table) {
        option.selected = true;
      }
      els.tableSelect.appendChild(option);
    }
    els.tableSelect.disabled = !model.tables.length;

    els.btnAddRow.disabled = !model.canEdit;
    els.readonlyNote.classList.toggle('hidden', model.canEdit);
    els.btnRefresh.disabled = false;

    const hasTable = Boolean(model.table);
    els.pagePrev.disabled = !model.hasPrev;
    els.pageNext.disabled = !model.hasNext;
    if (hasTable && model.rows.length) {
      els.pageLabel.textContent = `${model.offset + 1}\u2013${model.offset + model.rows.length}`;
    } else if (hasTable) {
      els.pageLabel.textContent = '0 rows';
    } else {
      els.pageLabel.textContent = '';
    }
  }

  function renderAll() {
    renderToolbar();
    renderGridArea();
  }

  function renderResults(results, elapsed) {
    els.queryResults.innerHTML = '';
    results.forEach((result, index) => {
      const block = document.createElement('div');
      block.className = 'result-block';
      const head = document.createElement('div');
      head.className = 'result-head';
      const hasColumns = result.columns && result.columns.length;
      if (hasColumns) {
        head.textContent = `Result ${index + 1} \u2014 ${result.rows.length} row${result.rows.length === 1 ? '' : 's'}`;
      } else {
        head.textContent = `Result ${index + 1} \u2014 ${
          result.affected === undefined ? 'OK' : `${result.affected} row(s) affected`
        }`;
      }
      block.appendChild(head);
      if (hasColumns) {
        const wrap = document.createElement('div');
        wrap.className = 'grid-wrap';
        wrap.appendChild(
          buildGrid(
            result.columns.map(name => ({ name, editable: false })),
            result.rows,
            {}
          )
        );
        block.appendChild(wrap);
      }
      els.queryResults.appendChild(block);
    });
    if (typeof elapsed === 'number') {
      const note = document.createElement('div');
      note.className = 'elapsed';
      note.textContent = `Completed in ${elapsed} ms`;
      els.queryResults.appendChild(note);
    }
  }

  function runQuery() {
    const sql = els.sqlInput.value.trim();
    if (!sql) {
      return;
    }
    hideError();
    els.btnRun.disabled = true;
    els.btnRun.textContent = 'Running\u2026';
    vscode.postMessage({ type: 'runQuery', sql });
  }

  function finishRun() {
    els.btnRun.disabled = false;
    els.btnRun.textContent = 'Run';
  }

  els.tabData.addEventListener('click', () => {
    model.mode = 'data';
    vscode.postMessage({ type: 'setMode', mode: 'data' });
    renderAll();
  });
  els.tabSql.addEventListener('click', () => {
    model.mode = 'sql';
    vscode.postMessage({ type: 'setMode', mode: 'sql' });
    renderAll();
    els.sqlInput.focus();
  });

  els.tableSelect.addEventListener('change', () => {
    vscode.postMessage({ type: 'selectTable', table: els.tableSelect.value });
  });
  els.btnRefresh.addEventListener('click', () => {
    vscode.postMessage({ type: 'refresh' });
  });
  els.btnAddRow.addEventListener('click', () => {
    vscode.postMessage({ type: 'insertRow' });
  });
  els.pagePrev.addEventListener('click', () => {
    vscode.postMessage({ type: 'page', delta: -1 });
  });
  els.pageNext.addEventListener('click', () => {
    vscode.postMessage({ type: 'page', delta: 1 });
  });

  els.btnRun.addEventListener('click', runQuery);
  els.sqlInput.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      runQuery();
    }
  });

  els.btnConfirmOk.addEventListener('click', () => {
    const callback = confirmSubmit;
    hideConfirm();
    if (callback) {
      callback();
    }
  });
  els.btnConfirmCancel.addEventListener('click', hideConfirm);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !els.confirmOverlay.classList.contains('hidden')) {
      hideConfirm();
    }
  });

  window.addEventListener('message', event => {
    const message = event.data;
    if (!message || typeof message !== 'object') {
      return;
    }
    if (message.type === 'state') {
      model = Object.assign({}, model, message);
      hideError();
      renderAll();
    } else if (message.type === 'queryResult') {
      finishRun();
      hideError();
      renderResults(message.results || [], message.elapsed);
    } else if (message.type === 'error') {
      finishRun();
      showError(message.message || 'Unknown error');
    }
  });

  vscode.postMessage({ type: 'ready' });
})();
