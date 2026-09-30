(function () {
  const vscode = acquireVsCodeApi();

  const els = {
    formTitle: document.getElementById('form-title'),
    name: document.getElementById('field-name'),
    type: document.getElementById('field-type'),
    rowFile: document.getElementById('row-file'),
    file: document.getElementById('field-file'),
    btnBrowse: document.getElementById('btn-browse'),
    networkFields: document.getElementById('network-fields'),
    host: document.getElementById('field-host'),
    port: document.getElementById('field-port'),
    database: document.getElementById('field-database'),
    user: document.getElementById('field-user'),
    password: document.getElementById('field-password'),
    rowSsl: document.getElementById('row-ssl'),
    ssl: document.getElementById('field-ssl'),
    sslLabel: document.getElementById('ssl-label'),
    formError: document.getElementById('form-error'),
    btnCancel: document.getElementById('btn-cancel'),
    btnSave: document.getElementById('btn-save'),
  };

  const DEFAULT_PORTS = { postgres: 5432, mysql: 3306, mssql: 1433 };
  const FILE_TYPES = ['sqlite', 'csv', 'tsv', 'json'];

  let current = null;
  let lastDefaultPort = '';

  function syncVisibility() {
    const type = els.type.value;
    const isFile = FILE_TYPES.includes(type);
    els.rowFile.classList.toggle('hidden', !isFile);
    els.networkFields.classList.toggle('hidden', isFile);
    const sslRelevant = type === 'postgres' || type === 'mssql';
    els.rowSsl.classList.toggle('hidden', !sslRelevant);
    els.sslLabel.textContent = type === 'mssql' ? 'Encrypt connection' : 'Use SSL';
    if (!isFile) {
      if (!els.port.value || els.port.value === lastDefaultPort) {
        els.port.value = String(DEFAULT_PORTS[type] || '');
      }
      lastDefaultPort = String(DEFAULT_PORTS[type] || '');
    }
    els.password.placeholder = current ? 'unchanged' : '';
  }

  function collect() {
    return {
      id: current && current.id,
      name: els.name.value,
      type: els.type.value,
      file: els.file.value,
      host: els.host.value,
      port: els.port.value,
      database: els.database.value,
      user: els.user.value,
      ssl: els.ssl.checked,
    };
  }

  els.type.addEventListener('change', syncVisibility);
  els.btnBrowse.addEventListener('click', () => {
    vscode.postMessage({ type: 'browse', kind: els.type.value });
  });
  els.btnCancel.addEventListener('click', () => {
    vscode.postMessage({ type: 'cancel' });
  });
  els.btnSave.addEventListener('click', () => {
    els.formError.classList.add('hidden');
    vscode.postMessage({ type: 'save', config: collect(), password: els.password.value });
  });
  els.name.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      els.btnSave.click();
    }
  });

  window.addEventListener('message', event => {
    const message = event.data;
    if (!message || typeof message !== 'object') {
      return;
    }
    if (message.type === 'init') {
      current = message.config;
      if (current) {
        els.formTitle.textContent = 'Edit connection';
        els.name.value = current.name || '';
        els.type.value = current.type || 'sqlite';
        els.file.value = current.file || '';
        els.host.value = current.host || 'localhost';
        els.port.value = current.port ? String(current.port) : '';
        els.database.value = current.database || '';
        els.user.value = current.user || '';
        els.ssl.checked = Boolean(current.ssl);
      }
      syncVisibility();
    } else if (message.type === 'browseResult') {
      els.file.value = message.path;
      if (!els.name.value) {
        els.name.value = message.name;
      }
    } else if (message.type === 'formError') {
      els.formError.textContent = message.message;
      els.formError.classList.remove('hidden');
    }
  });

  els.type.value = 'sqlite';
  syncVisibility();
  vscode.postMessage({ type: 'ready' });
})();
