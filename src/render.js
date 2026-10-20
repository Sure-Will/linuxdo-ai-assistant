import { marked } from '../vendor/marked.esm.js';

export function element(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== false && value != null) node.setAttribute(key, value === true ? '' : String(value));
  }
  node.append(...children);
  return node;
}

export function aiIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'linuxdo-ai-icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M10 3 12.4 9.6 19 12l-6.6 2.4L10 21l-2.4-6.6L1 12l6.6-2.4L10 3ZM20 2v5m-2.5-2.5h5');
  svg.append(path);
  return svg;
}

export function uiIcon(name) {
  const paths = {
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    close: 'm6 6 12 12M6 18 18 6',
    back: 'm14 6-6 6 6 6',
    down: 'm7 10 5 5 5-5',
    latest: 'M12 5v14m-6-6 6 6 6-6',
    send: 'M12 19V5m-6 6 6-6 6 6',
    stop: 'M6 6h12v12H6Z',
    plus: 'M12 5v14M5 12h14',
    history: 'M3 11a9 9 0 1 1 2.4 7M3 4v7h7m2-4v5l3 2',
    settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
    refresh: 'M20 10a8 8 0 0 0-13.7-4L3 9m0-6v6h6m-5 5a8 8 0 0 0 13.7 4L21 15m0 6v-6h-6',
    copy: 'M9 9h11v12H9Zm-4 6H3V3h11v2',
    check: 'm5 12 4 4L19 6',
    image: 'M4 5h16v14H4Zm0 11 4.5-4.5L12 15l2.5-2.5L20 18M15 9h.01',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
    link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `ui-icon ui-icon-${name}`);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', paths[name] || paths.more);
  svg.append(path);
  return svg;
}

export function safeHref(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, 'https://linux.do');
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

function decodeEntities(text) {
  const names = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(text || '').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, code) => {
    if (!code.startsWith('#')) return names[code.toLowerCase()] ?? all;
    const value = parseInt(code.slice(code[1].toLowerCase() === 'x' ? 2 : 1), code[1].toLowerCase() === 'x' ? 16 : 10);
    return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : all;
  });
}

function renderInline(tokens = []) {
  const fragment = document.createDocumentFragment();
  for (const token of tokens) {
    const nested = () => renderInline(token.tokens || marked.Lexer.lexInline(token.text || ''));
    if (token.type === 'strong' || token.type === 'em' || token.type === 'del') fragment.append(element(token.type, {}, [nested()]));
    else if (token.type === 'codespan') fragment.append(element('code', { text: decodeEntities(token.text) }));
    else if (token.type === 'br') fragment.append(element('br'));
    else if (token.type === 'link' || token.type === 'image') {
      const href = safeHref(token.href);
      const content = token.type === 'image' ? document.createTextNode(`[图片：${decodeEntities(token.text) || '链接'}]`) : nested();
      fragment.append(href ? element('a', { href, target: '_blank', rel: 'noopener noreferrer' }, [content]) : content);
    } else if (token.type === 'text' && token.tokens) fragment.append(nested());
    else fragment.append(document.createTextNode(decodeEntities(token.text || token.raw || '')));
  }
  return fragment;
}

function renderBlocks(tokens) {
  const fragment = document.createDocumentFragment();
  for (const token of tokens) {
    if (token.type === 'space') continue;
    if (token.type === 'code') fragment.append(element('pre', {}, [element('code', { text: token.text })]));
    else if (token.type === 'heading') fragment.append(element(`h${Math.min(4, token.depth + 1)}`, {}, [renderInline(token.tokens)]));
    else if (token.type === 'paragraph' || token.type === 'text') fragment.append(element('p', {}, [renderInline(token.tokens || marked.Lexer.lexInline(token.text))]));
    else if (token.type === 'blockquote') fragment.append(element('blockquote', {}, [renderBlocks(token.tokens)]));
    else if (token.type === 'hr') fragment.append(element('hr'));
    else if (token.type === 'list') {
      const list = element(token.ordered ? 'ol' : 'ul', token.ordered ? { start: token.start || 1 } : {});
      for (const item of token.items) {
        const li = element('li', {}, [renderBlocks(item.tokens)]);
        if (item.task) li.prepend(document.createTextNode(item.checked ? '☑ ' : '☐ '));
        list.append(li);
      }
      fragment.append(list);
    } else if (token.type === 'table') {
      const table = element('table', {}, [element('thead', {}, [element('tr', {}, token.header.map(cell => element('th', {}, [renderInline(cell.tokens)])))])]);
      table.append(element('tbody', {}, token.rows.map(row => element('tr', {}, row.map(cell => element('td', {}, [renderInline(cell.tokens)]))))));
      fragment.append(element('div', { class: 'table-scroll' }, [table]));
    } else fragment.append(element('p', { text: token.text || token.raw || '' }));
  }
  return fragment;
}

// Markdown 只经白名单 token 创建 DOM；模型输出的 HTML、事件和图片不会被执行或加载。
export function renderMarkdown(text) {
  try { return renderBlocks(marked.lexer(String(text || ''), { gfm: true, breaks: true })); }
  catch { return document.createTextNode(String(text || '')); }
}

export function htmlToText(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('script,style,noscript,iframe,object,form,button,.quote-controls').forEach(node => node.remove());
  template.content.querySelectorAll('img').forEach(node => node.replaceWith(document.createTextNode(node.alt ? `[图片：${node.alt}]` : '[图片]')));
  const blockTags = new Set(['P', 'DIV', 'PRE', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'TR']);
  function read(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return '';
    if (node.nodeName === 'BR') return '\n';
    let text = [...node.childNodes].map(read).join('');
    if (node.nodeName === 'LI') text = `• ${text}`;
    if (node.nodeName === 'TD' || node.nodeName === 'TH') text += '\t';
    if (node.nodeName === 'A') {
      const href = safeHref(node.getAttribute('href'));
      if (href && text.trim() !== href) text += ` (${href})`;
    }
    return blockTags.has(node.nodeName) ? `\n${text}\n` : text;
  }
  return read(template.content).replace(/\n[\t ]*\n(?:[\t ]*\n)+/g, '\n\n').trim();
}
