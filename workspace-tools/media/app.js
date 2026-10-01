(function () {
  if (!window.__vscode) {
    window.__vscode = acquireVsCodeApi();
  }
  const vscode = window.__vscode;

  const tabs = Array.from(document.querySelectorAll('.app-tab'));
  const views = Array.from(document.querySelectorAll('.tool-view'));
  const migrateButton = document.getElementById('app-btn-migrate');
  const migrateLabel = migrateButton ? migrateButton.textContent : '';
  const migrateTitle = migrateButton ? migrateButton.title : '';
  let migrateTimer = null;

  function showMigrateResult(message) {
    if (!migrateButton) {
      return;
    }
    migrateButton.disabled = false;
    if (message.error) {
      migrateButton.textContent = 'Migrate failed';
      migrateButton.title = message.error;
    } else if (message.moved > 0) {
      migrateButton.textContent = `Moved ${message.moved}`;
    } else if (message.failed > 0) {
      migrateButton.textContent = 'Nothing moved';
    } else {
      migrateButton.textContent = 'Nothing to move';
    }
    clearTimeout(migrateTimer);
    migrateTimer = setTimeout(() => {
      migrateButton.textContent = migrateLabel;
      migrateButton.title = migrateTitle;
    }, 4000);
  }

  if (migrateButton) {
    migrateButton.addEventListener('click', () => {
      migrateButton.disabled = true;
      migrateButton.textContent = 'Migrating\u2026';
      vscode.postMessage({ type: 'migrate-legacy' });
    });
  }

  function show(name) {
    tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.tab === name));
    views.forEach(view => view.classList.toggle('hidden', view.id !== 'tab-' + name));
    document.dispatchEvent(new CustomEvent('tab-shown', { detail: { tab: name } }));
    try {
      const state = vscode.getState() || {};
      vscode.setState(Object.assign({}, state, { tab: name }));
    } catch {
      // ignore
    }
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => show(tab.dataset.tab));
  });

  window.addEventListener('message', event => {
    const message = event.data;
    if (message && message.type === 'switch-tab' && message.tab) {
      show(message.tab);
    } else if (message && message.type === 'migrate-result') {
      showMigrateResult(message);
    }
  });

  let saved = null;
  try {
    saved = vscode.getState();
  } catch {
    saved = null;
  }
  show(saved && saved.tab ? saved.tab : 'boards');
})();
