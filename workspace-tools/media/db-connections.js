(function () {
  const vscode = window.__vscode;

  const FILE_TYPES = ['sqlite', 'csv', 'tsv', 'json'];
  const DEFAULT_PORTS = { postgres: 5432, mysql: 3306, mssql: 1433 };

  const els = {
    select: document.getElementById('db-connection-select'),
    btnNew: document.getElementById('db-btn-new-connection'),
    btnEdit: document.getElementById('db-btn-edit-connection'),
    btnRemove: document.getElementById('db-btn-remove-connection'),
    btnOpenFile: document.getElementById('db-btn-open-file'),
    form: document.getElementById('db-conn-form'),
    title: document.getElementById('dbf-title'),
    name: document.getElementById('dbf-name'),
    type: document.getElementById('dbf-type'),
    rowFile: document.getElementById('dbf-row-file'),
    file: document.getElementById('dbf-file'),
    browse: document.getElementById('dbf-browse'),
    network: document.getElementById('dbf-network'),
    host: document.getElementById('dbf-host'),
    port: document.getElementById('dbf-port'),
    database: document.getElementById('dbf-database'),
    user: document.getElementById('dbf-user'),
    password: document.getElementById('dbf-password'),
    rowSsl: document.getElementById('dbf-row-ssl'),
    ssl: document.getElementById('dbf-ssl'),
    sslLabel: document.getElementById('dbf-ssl-label'),
    error: document.getElementById('dbf-error'),
    cancel: document.getElementById('dbf-cancel'),
    save: document.getElementById('dbf-save'),
  };

  let connections = [];
  let currentId = null;
  let editing = null;
  let lastDefaultPort = '';
  let removeArmed = false;
  let removeTimer = null;

  function renderSelect() {
    els.select.innerHTML = '';
    if (!connections.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No connections';
      els.select.appendChild(option);
    }
    for (const connection of connections) {
      const option = document.createElement('option');
      option.value = connection.id;
      option.textContent = connection.name + ' (' + connection.type + ')';
      if (connection.id === currentId) {
        option.selected = true;
      }
      els.select.appendChild(option);
    }
    const has = connections.length > 0;
    els.select.disabled = !has;
    els.btnEdit.disabled = !has;
    els.btnRemove.disabled = !has;
    disarmRemove();
  }

  function disarmRemove() {
    removeArmed = false;
    if (removeTimer) {
      clearTimeout(removeTimer);
      removeTimer = null;
    }
    els.btnRemove.textContent = 'Remove';
  }

  function syncVisibility() {
    const type = els.type.value;
    const isFile = FILE_TYPES.includes(type);
    els.rowFile.classList.toggle('hidden', !isFile);
    els.network.classList.toggle('hidden', isFile);
    const sslRelevant = type === 'postgres' || type === 'mssql';
    els.rowSsl.classList.toggle('hidden', !sslRelevant);
    els.sslLabel.textContent = type === 'mssql' ? 'Encrypt connection' : 'Use SSL';
    if (!isFile) {
      if (!els.port.value || els.port.value === lastDefaultPort) {
        els.port.value = String(DEFAULT_PORTS[type] || '');
      }
      lastDefaultPort = String(DEFAULT_PORTS[type] || '');
    }
    els.password.placeholder = editing && editing.id ? 'unchanged' : '';
  }

  function openForm(config) {
    editing = config || null;
    els.title.textContent = editing && editing.id ? 'Edit connection' : 'Add connection';
    els.name.value = editing ? editing.name || '' : '';
    els.type.value = editing ? editing.type || 'sqlite' : 'sqlite';
    els.file.value = editing ? editing.file || '' : '';
    els.host.value = editing ? editing.host || 'localhost' : 'localhost';
    els.port.value = editing && editing.port ? String(editing.port) : '';
    els.database.value = editing ? editing.database || '' : '';
    els.user.value = editing ? editing.user || '' : '';
    els.ssl.checked = Boolean(editing && editing.ssl);
    els.password.value = '';
    els.error.classList.add('hidden');
    syncVisibility();
    els.form.classList.remove('hidden');
    els.name.focus();
  }

  function closeForm() {
    editing = null;
    els.form.classList.add('hidden');
  }

  els.select.addEventListener('change', () => {
    if (els.select.value) {
      vscode.postMessage({ type: 'db-selectConnection', id: els.select.value });
    }
  });

  els.btnNew.addEventListener('click', () => openForm(null));

  els.btnEdit.addEventListener('click', () => {
    const connection = connections.find(candidate => candidate.id === currentId);
    if (connection) {
      openForm(connection);
    }
  });

  els.btnRemove.addEventListener('click', () => {
    if (!currentId) {
      return;
    }
    if (!removeArmed) {
      removeArmed = true;
      els.btnRemove.textContent = 'Confirm';
      removeTimer = setTimeout(disarmRemove, 3000);
      return;
    }
    disarmRemove();
    vscode.postMessage({ type: 'db-removeConnection', id: currentId });
  });

  els.btnOpenFile.addEventListener('click', () => {
    vscode.postMessage({ type: 'db-openFile' });
  });

  els.type.addEventListener('change', syncVisibility);
  els.browse.addEventListener('click', () => {
    vscode.postMessage({ type: 'db-browse', kind: els.type.value });
  });
  els.cancel.addEventListener('click', closeForm);
  els.save.addEventListener('click', () => {
    const config = {
      id: editing && editing.id,
      name: els.name.value.trim(),
      type: els.type.value,
      file: els.file.value.trim(),
      host: els.host.value.trim(),
      port: els.port.value,
      database: els.database.value.trim(),
      user: els.user.value.trim(),
      ssl: els.ssl.checked,
    };
    if (!config.name) {
      els.error.textContent = 'Name is required.';
      els.error.classList.remove('hidden');
      return;
    }
    els.error.classList.add('hidden');
    vscode.postMessage({ type: 'db-saveConnection', config, password: els.password.value });
  });

  window.addEventListener('message', event => {
    const message = event.data;
    if (!message || typeof message !== 'object') {
      return;
    }
    if (message.type === 'db-state') {
      connections = message.connections || [];
      currentId = message.connectionId || null;
      renderSelect();
      if (editing && editing.id && !connections.some(candidate => candidate.id === editing.id)) {
        closeForm();
      }
    } else if (message.type === 'db-saved') {
      closeForm();
    } else if (message.type === 'db-formError') {
      els.error.textContent = message.message || 'Unknown error';
      els.error.classList.remove('hidden');
    } else if (message.type === 'db-browseResult') {
      els.file.value = message.path || '';
      if (!els.name.value) {
        els.name.value = message.name || '';
      }
    }
  });

  els.type.value = 'sqlite';
  syncVisibility();
})();
