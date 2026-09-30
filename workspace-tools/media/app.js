(function () {
  if (!window.__vscode) {
    window.__vscode = acquireVsCodeApi();
  }
  const vscode = window.__vscode;

  const tabs = Array.from(document.querySelectorAll('.app-tab'));
  const views = Array.from(document.querySelectorAll('.tool-view'));

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

  let saved = null;
  try {
    saved = vscode.getState();
  } catch {
    saved = null;
  }
  show(saved && saved.tab ? saved.tab : 'boards');
})();
