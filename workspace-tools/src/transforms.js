const CHECKLIST_RE = /^\s*[-*+]\s+\[( |x|X)\]\s+(.*)$/;

function parseChecklistItems(text) {
  const items = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = CHECKLIST_RE.exec(line);
    if (match) {
      items.push({ text: match[2].trim(), done: match[1].toLowerCase() === 'x' });
    }
  }
  return items;
}

function noteFromCard(card) {
  const lines = [`# ${card.title || 'Card'}`, ''];
  if (card.description && card.description.trim()) {
    lines.push(card.description.trim(), '');
  }
  const checklist = Array.isArray(card.checklist) ? card.checklist : [];
  if (checklist.length) {
    lines.push('## Checklist', '');
    for (const item of checklist) {
      lines.push(`- [${item.done ? 'x' : ' '}] ${item.text}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function sanitizeFileName(name) {
  return String(name || 'Untitled').replace(/[\\/:*?"<>|]/g, '-').trim() || 'Untitled';
}

module.exports = { parseChecklistItems, noteFromCard, sanitizeFileName };
