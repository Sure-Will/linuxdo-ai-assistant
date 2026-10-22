import { SCOPES, EFFORTS, SUMMARY_PROMPT, topicIdFromUrl, validateConfig, isDeepSeek, selectedEffort, measureModel, collectTopic, buildMessages, streamChat, checkAbort, abortError } from './core.js';
import { element, aiIcon, uiIcon, renderMarkdown, htmlToText } from './render.js';
import { SHARE_THEMES, shareCard, shareTime, renderShareImage, preparePost, postCard } from './share.js';
import styles from './style.css';

const PREFIX = 'linuxdo-ai:v1:';
const CONFIG_KEY = `${PREFIX}config`;
const LAYOUT_KEY = `${PREFIX}layout`;
const SIZE = { minHeight: 320, minWidth: 360, maxWidth: 900, step: 24 };
const DEEPSEEK = { endpoint: 'https://api.deepseek.com/chat/completions', models: ['deepseek-flash', 'deepseek-v4-pro'] };
const uuid = () => crypto.randomUUID();
const clone = value => JSON.parse(JSON.stringify(value));
const labels = { first: '仅首帖', '5': '前 5 帖', '10': '前 10 帖', '20': '前 20 帖', all: '全部帖子' };
const state = { topicId: null, record: null, session: null, task: null, probe: null, config: {}, context: null, open: false, view: 'chat', popover: null };
const nodes = new Map();
let storageNotice = '', scheduled = false, timelineButton, lastTrigger, closeTimer;
const postMenus = new WeakMap(), revealedPostMenus = new WeakSet();
let activePostMenu = null, postMenuSequence = 0;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

function readValue(key, fallback) {
  try { return GM_getValue(key, fallback); }
  catch { storageNotice = '无法读取本地设置，请检查油猴是否允许运行此脚本。'; return fallback; }
}
const savedConfig = readValue(CONFIG_KEY, {});
state.config = savedConfig && typeof savedConfig === 'object' && !Array.isArray(savedConfig) ? savedConfig : {};

const host = element('div', { id: 'linuxdo-ai-root', lang: 'zh-CN' });
const root = host.attachShadow({ mode: 'open' });
root.append(element('style', { text: styles }));
const launcher = element('button', { class: 'launcher', title: 'AI 总结', 'aria-label': 'AI 总结', 'aria-expanded': 'false', hidden: true, onClick: activate }, [aiIcon()]);
const pageStyle = element('style', { text: `
  .timeline-controls:has(> #linuxdo-ai-topic-button) { column-gap: 8px; }
  .timeline-controls:has(> #linuxdo-ai-topic-button) > .reader-mode-toggle { margin-inline-end: 0; }
  #linuxdo-ai-topic-button { margin: 0; width: var(--linuxdo-ai-width); height: var(--linuxdo-ai-height); padding: 0; flex: none; align-items: center; justify-content: center; }
  #linuxdo-ai-topic-button .linuxdo-ai-icon { width: 1em; height: 1em; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  #linuxdo-ai-topic-button[aria-expanded="true"] { color: var(--tertiary); }
  @media (pointer: fine) { #linuxdo-ai-topic-button:active { transform: translateY(1px); } }
  .linuxdo-ai-post-export .ui-icon, .linuxdo-ai-post-more .ui-icon { width: 1.15em; height: 1.15em; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  nav.post-controls .linuxdo-ai-post-actions { display: flex; align-items: center; gap: 4px; }
  .linuxdo-ai-post-actions > :not([data-ai-post-kind]), .linuxdo-ai-post-actions > [data-ai-post-kind="native-more"] { display: none !important; }
  .linuxdo-ai-post-actions > [data-ai-post-kind="like"] { order: 0; }
  .linuxdo-ai-post-actions > [data-ai-post-kind="reply"] { order: 1; margin-inline: 0; min-width: 40px; min-height: 40px; }
  .linuxdo-ai-post-actions > [data-ai-post-kind="reply"] .d-button-label { display: none; }
  .linuxdo-ai-post-actions > [data-ai-post-kind="bookmark"] { order: 2; }
  .linuxdo-ai-post-actions > [data-ai-post-kind="more"] { order: 3; }
  .linuxdo-ai-post-more { min-width: 40px; min-height: 40px; display: inline-flex; align-items: center; justify-content: center; }
  .linuxdo-ai-post-actions > [data-ai-post-kind="secondary"] {
    position: fixed !important; z-index: 1102; inset: auto !important;
    left: calc(var(--ai-post-menu-x, 0px) + 6px) !important;
    top: calc(var(--ai-post-menu-y, 0px) + 6px + var(--ai-post-menu-row, 0) * 40px) !important;
    width: calc(var(--ai-post-menu-width, 196px) - 12px); height: 40px; box-sizing: border-box;
    margin: 0 !important; padding: 8px 10px; border: 0; border-radius: 6px;
    display: flex !important; align-items: center; justify-content: flex-start; gap: 10px;
    background: var(--secondary); color: var(--primary); font: inherit; font-size: 14px; line-height: 1.4;
    visibility: hidden; pointer-events: none;
  }
  .linuxdo-ai-post-actions > [data-ai-post-kind="secondary"]::after { content: attr(data-ai-post-label); }
  nav.post-controls .linuxdo-ai-post-actions > [data-ai-post-kind="secondary"] { color: var(--primary); }
  .linuxdo-ai-post-actions > [data-ai-post-kind="secondary"] > span { display: none; }
  nav.post-controls .linuxdo-ai-post-actions > [data-ai-post-kind="secondary"] > svg { width: 1.15em; height: 1.15em; flex: none; color: inherit; }
  .linuxdo-ai-post-actions[data-ai-post-open] > [data-ai-post-kind="secondary"] { visibility: visible; pointer-events: auto; }
  .linuxdo-ai-post-actions > [hidden] { display: none !important; }
  .linuxdo-ai-post-menu-surface {
    position: fixed; z-index: 1101; left: var(--ai-post-menu-x); top: var(--ai-post-menu-y);
    width: var(--ai-post-menu-width); height: var(--ai-post-menu-height); box-sizing: border-box;
    border: 1px solid var(--primary-low); border-radius: 10px; background: var(--secondary);
    box-shadow: 0 8px 24px #0003; display: none;
  }
  .linuxdo-ai-post-actions[data-ai-post-open] > .linuxdo-ai-post-menu-surface { display: block; }
  .linuxdo-ai-post-more:focus-visible, .linuxdo-ai-post-actions > [data-ai-post-kind="secondary"]:focus-visible { outline: 2px solid var(--tertiary); outline-offset: -2px; }
  @media (hover: hover) { .linuxdo-ai-post-actions > [data-ai-post-kind="secondary"]:hover { background: var(--primary-very-low, var(--primary-low)); } }
  @media (pointer: fine) { .linuxdo-ai-post-more:active { transform: scale(.96); } }
` });
document.head.append(pageStyle);
const panel = element('aside', { class: 'panel', role: 'dialog', 'aria-label': '话题总结', 'aria-busy': 'false', tabindex: '-1', hidden: true });
function iconButton(label, icon, onClick, attrs = {}) {
  return element('button', { type: 'button', class: 'quiet icon-button', title: label, 'aria-label': label, onClick, ...attrs }, [uiIcon(icon)]);
}
const panelTitle = element('strong', { text: '话题总结' });
const backButton = iconButton('返回对话', 'back', () => setView('chat'), { hidden: true });
const moreButton = iconButton('更多操作', 'more', event => togglePopover('more', event), { 'aria-expanded': 'false', 'aria-controls': 'more-menu' });
const settingsButton = element('button', { class: 'menu-item', type: 'button', 'aria-label': '模型设置', onClick: () => setView('settings') }, [uiIcon('settings'), element('span', { text: '模型设置' })]);
const exportButton = iconButton('导出图片', 'image', () => { shot.source = null; setView('export'); });
const closeButton = iconButton('关闭 AI 面板', 'close', event => closePanel({ instant: event.detail === 0 }));
panel.append(element('header', { class: 'head' }, [
  element('div', { class: 'head-row' }, [element('div', { class: 'brand' }, [backButton, panelTitle]), element('div', { class: 'actions' }, [moreButton, exportButton, closeButton])]),
]));
const scopeOptions = ['first', '5', '10', '20', 'all'].map(value => element('button', {
  class: 'menu-item option-item', type: 'button', role: 'menuitemradio', 'aria-checked': 'false', 'data-value': value,
  onClick: () => {
    if (state.task || !state.session) return;
    state.session.scope = value; state.context = null; persist(); refreshControls(); setStatus(''); closePopover(true);
  },
}, [element('span', { text: labels[value] }), uiIcon('check')]));
const refreshButton = element('button', { class: 'quiet refresh-action', type: 'button', 'aria-label': '更新帖子上下文', onClick: () => { closePopover(); void refreshContext(); } }, [uiIcon('refresh'), element('span', { text: '更新原文' })]);
const newButton = element('button', { class: 'menu-item', type: 'button', onClick: () => {
  if (!state.record || state.task) return;
  closePopover();
  if (!state.session.messages.length) { questionInput.focus(); return; }
  const next = newSession(state.session.scope);
  state.record.sessions.unshift(next); state.record.activeId = next.id; state.session = next;
  state.context = null; questionInput.value = ''; resizeComposer(); persist(); renderMessages(); refreshControls(); setStatus(''); questionInput.focus();
} }, [uiIcon('plus'), element('span', { text: '新对话' })]);
const historyButton = element('button', { class: 'menu-item', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'conversation-history', onClick: () => {
  historyBox.hidden = !historyBox.hidden; historyButton.setAttribute('aria-expanded', String(!historyBox.hidden)); fillHistory(); if (!historyBox.hidden) historySelect.focus();
} }, [uiIcon('history'), element('span', { text: '历史' })]);
const contextMeta = element('span', { class: 'context-count' });
const modelMeta = element('span', { class: 'menu-model' });
const historySelect = element('select', { 'aria-label': '选择历史对话', onChange: () => {
  const session = state.record?.sessions.find(item => item.id === historySelect.value);
  if (!session || state.task) return;
  state.record.activeId = session.id; state.session = session; state.context = null; questionInput.value = '';
  resizeComposer(); persist(); renderMessages(); scrollLatest(); refreshControls(); setStatus(''); closePopover(true);
} });
const historyBox = element('div', { class: 'history', id: 'conversation-history', hidden: true }, [historySelect]);
const morePopover = element('div', { class: 'popover more-popover', id: 'more-menu', hidden: true }, [newButton, historyButton, historyBox, settingsButton, modelMeta]);
const scopeLabel = element('span');
const scopeButton = element('button', { class: 'quiet scope-button', type: 'button', 'aria-label': '选择阅读范围', title: '选择阅读范围', 'aria-expanded': 'false', 'aria-haspopup': 'menu', 'aria-controls': 'scope-menu', onClick: event => togglePopover('scope', event) }, [scopeLabel, uiIcon('down')]);
const scopePopover = element('div', { class: 'popover scope-popover', id: 'scope-menu', hidden: true }, [
  element('div', { role: 'menu', 'aria-label': '阅读范围' }, scopeOptions),
  element('div', { class: 'scope-footer' }, [contextMeta, refreshButton]),
]);
const effortLabel = element('span');
const effortButton = element('button', { class: 'quiet effort-button', type: 'button', 'aria-label': '选择思考强度', title: '选择思考强度', 'aria-expanded': 'false', 'aria-haspopup': 'menu', 'aria-controls': 'effort-menu', onClick: event => togglePopover('effort', event) }, [effortLabel, uiIcon('down')]);
const effortOptions = Object.entries(EFFORTS).map(([value, label]) => element('button', {
  class: 'menu-item option-item', type: 'button', role: 'menuitemradio', 'aria-checked': 'false', 'data-value': value,
  onClick: () => {
    if (state.task) return;
    try {
      const config = { ...state.config, effort: value };
      GM_setValue(CONFIG_KEY, config); state.config = config; refreshControls(); closePopover(true);
    } catch { setStatus('思考强度保存失败，请重试。', true); }
  },
}, [element('span', { text: label }), uiIcon('check')]));
const effortPopover = element('div', { class: 'popover effort-popover', id: 'effort-menu', hidden: true }, [
  element('span', { class: 'menu-caption', text: '思考强度' }), element('div', { role: 'menu', 'aria-label': '思考强度' }, effortOptions),
]);
const status = element('p', { class: 'status', role: 'status', 'aria-live': 'polite', hidden: true });
const conversation = element('div', { class: 'conversation', 'aria-label': '对话内容', tabindex: '0' });
const latestButton = element('button', { class: 'latest', type: 'button', title: '回到最新', 'aria-label': '回到最新', hidden: true, onClick: scrollLatest }, [uiIcon('latest')]);
conversation.addEventListener('scroll', updateLatest);
const questionInput = element('textarea', { rows: '1', placeholder: '留空总结，或输入问题…', 'aria-label': '向 AI 提问', maxlength: '20000' });
questionInput.addEventListener('input', () => { resizeComposer(); updateSendButton(); });
questionInput.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault(); event.stopPropagation(); if (!state.task) void submitQuestion();
  }
});
const sendButton = element('button', { class: 'icon-button send-button', type: 'submit', 'aria-label': '总结这个话题', title: '总结这个话题（Enter 发送，Shift + Enter 换行）' }, [uiIcon('send')]);
const stopButton = iconButton('停止', 'stop', () => state.task?.controller.abort(), { class: 'icon-button send-button', hidden: true });
const composer = element('form', { class: 'composer', onSubmit: event => { event.preventDefault(); void submitQuestion(); } }, [
  element('div', { class: 'composer-box' }, [questionInput, element('div', { class: 'composer-actions' }, [
    element('div', { class: 'actions composer-tools' }, [scopeButton, effortButton]),
    // 两个按钮叠放在同一底色上，切换时只有图标交替。
    element('div', { class: 'send-slot' }, [stopButton, sendButton]),
  ])]),
]);
// source 为 null 时导出当前对话，为 { postId } 时导出该楼；post 缓存已内联图片的帖子，切换背景不重新下载。
const shot = { theme: null, blob: null, token: 0, source: null, post: null, controller: null };
const exportPreview = element('div', { class: 'export-preview', 'aria-busy': 'false' });
const exportThemes = Object.entries(SHARE_THEMES).map(([value, theme]) => element('button', {
  type: 'button', class: 'quiet theme-option', 'aria-pressed': 'false', 'data-value': value,
  onClick: () => { if (shot.theme !== value) { shot.theme = value; void drawExport(); } },
}, [element('i', { class: 'swatch', style: `background: ${theme.bg}` }), element('span', { text: theme.label })]));
const copyImageButton = element('button', { type: 'button', class: 'quiet', text: '复制图片', onClick: () => void copyExport() });
const saveImageButton = element('button', { type: 'button', class: 'primary', text: '保存图片', onClick: saveExport });
const exporter = element('section', { class: 'exporter', 'aria-label': '导出图片', hidden: true }, [exportPreview,
  element('div', { class: 'export-bar' }, [
    element('div', { class: 'export-themes', role: 'group', 'aria-label': '图片背景' }, exportThemes),
    element('div', { class: 'actions export-actions' }, [copyImageButton, saveImageButton]),
  ]),
]);
const settings = element('form', { class: 'settings', autocomplete: 'off', hidden: true });
const providerSelect = element('select', {}, [element('option', { value: 'deepseek', text: 'DeepSeek 官方' }), element('option', { value: 'custom', text: '自定义' })]);
const endpointInput = element('input', { type: 'url', required: true, placeholder: 'https://api.example.com/v1', autocomplete: 'off', spellcheck: 'false' });
const keyInput = element('input', { type: 'password', required: true, autocomplete: 'off', spellcheck: 'false', 'data-1p-ignore': true, 'data-lpignore': 'true' });
const modelInput = element('input', { type: 'text', required: true, placeholder: '填写 API 使用的模型名', autocomplete: 'off', spellcheck: 'false' });
const deepseekModel = element('select', {}, [element('option', { value: DEEPSEEK.models[0], text: 'DeepSeek Flash' }), element('option', { value: DEEPSEEK.models[1], text: 'DeepSeek V4 Pro' }), element('option', { value: 'custom', text: '自定义模型名…' })]);
function field(title, input) {
  input.setAttribute('aria-label', title);
  return element('label', { class: 'field' }, [element('span', { text: title }), input]);
}
const endpointField = field('API 地址', endpointInput);
const modelField = field('模型名', modelInput);
const deepseekField = field('模型', deepseekModel);
const saveButton = element('button', { type: 'submit', class: 'primary', text: '保存' });
const testButton = element('button', { type: 'button', class: 'quiet', text: '模型测速', onClick: () => void testModel() });
const testResult = element('div', { class: 'test-result', 'aria-live': 'polite', hidden: true });
settings.append(field('供应商', providerSelect), endpointField, field('API Key', keyInput), deepseekField, modelField,
  element('div', { class: 'actions settings-actions' }, [testButton, saveButton]), testResult);
function savedProvider() {
  if (!state.config.endpoint) return 'deepseek';
  try {
    const url = new URL(state.config.endpoint);
    if (url.origin === 'https://api.deepseek.com' && ['/chat/completions', '/v1/chat/completions', '/v1', '/', ''].includes(url.pathname)) return 'deepseek';
  } catch { /* 旧配置保留在自定义表单中修正。 */ }
  return 'custom';
}
function showProviderFields() {
  const official = providerSelect.value === 'deepseek';
  endpointField.hidden = endpointInput.disabled = official;
  modelField.hidden = modelInput.disabled = official && deepseekModel.value !== 'custom';
  deepseekField.hidden = !official;
  deepseekModel.disabled = !official;
}
providerSelect.addEventListener('change', () => { keyInput.value = ''; showProviderFields(); setStatus(''); });
deepseekModel.addEventListener('change', () => { showProviderFields(); if (!modelField.hidden) modelInput.focus(); });
settings.addEventListener('input', () => { testResult.hidden = true; });
function draftConfig() {
  const official = providerSelect.value === 'deepseek';
  const config = validateConfig({ endpoint: official ? DEEPSEEK.endpoint : endpointInput.value, key: keyInput.value,
    model: official && deepseekModel.value !== 'custom' ? deepseekModel.value : modelInput.value,
  });
  // 更换为未知接口时从“默认”开始，避免沿用 DeepSeek 的专属参数。
  if (isDeepSeek(config) || (config.endpoint === state.config.endpoint && config.model === state.config.model)) {
    config.effort = selectedEffort({ ...config, effort: state.config.effort });
  }
  return config;
}
settings.addEventListener('submit', event => {
  event.preventDefault();
  if (state.probe) return;
  try {
    const config = draftConfig();
    GM_setValue(CONFIG_KEY, config); state.config = config; keyInput.value = ''; setView('chat'); refreshControls();
    setStatus('');
  } catch (error) { setStatus(error.message, true); }
});
// 顶边调高度、左边调宽度、左上角同时调整；高度按可用高度比例保存，窗口变化后仍按比例显示。
const savedLayout = readValue(LAYOUT_KEY, {});
const layout = { ratio: Number(savedLayout?.ratio) || null, width: Number(savedLayout?.width) || null };
const roomHeight = () => Math.max(0, innerHeight - 24);
const maxWidth = () => Math.max(SIZE.minWidth, Math.min(SIZE.maxWidth, innerWidth - 24));
function resizeHandle(className, axes, label) {
  const keyboard = label ? { role: 'separator', tabindex: '0', 'aria-label': label, 'aria-orientation': axes === 'y' ? 'horizontal' : 'vertical' } : { 'aria-hidden': 'true' };
  const handle = element('div', { class: `resize ${className}`, title: label ? `${label}（双击恢复默认）` : '拖动调整大小（双击恢复默认）', ...keyboard,
    onPointerdown: event => startResize(event, axes), onDblclick: () => resetLayout(axes),
    onKeydown: event => {
      const delta = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [1, 0], ArrowRight: [-1, 0] }[event.key];
      if (!delta || !label) return;
      const [dx, dy] = axes === 'y' ? [0, delta[1]] : [delta[0], 0];
      if (!dx && !dy) return;
      event.preventDefault(); event.stopPropagation();
      const rect = panel.getBoundingClientRect();
      setPanelSize({ height: dy ? rect.height + dy * SIZE.step : null, width: dx ? rect.width + dx * SIZE.step : null }); saveLayout();
    },
  });
  return handle;
}
const heightHandle = resizeHandle('resize-top', 'y', '调整面板高度');
const widthHandle = resizeHandle('resize-left', 'x', '调整面板宽度');
const cornerHandle = resizeHandle('resize-corner', 'xy');
function applyLayout() {
  const ratio = layout.ratio && Math.min(1, Math.max(0.1, layout.ratio));
  panel.style.setProperty('--ai-ratio', ratio ? String(ratio) : '');
  panel.style.setProperty('--ai-floor', ratio ? `${SIZE.minHeight}px` : '');
  panel.style.setProperty('--ai-width', layout.width ? `${Math.min(maxWidth(), Math.max(SIZE.minWidth, layout.width))}px` : '');
  if (!ratio) for (const name of ['--ai-ratio', '--ai-floor']) panel.style.removeProperty(name);
  if (!layout.width) panel.style.removeProperty('--ai-width');
  const rect = panel.getBoundingClientRect();
  for (const [handle, value, min, max] of [[heightHandle, rect.height, SIZE.minHeight, roomHeight()], [widthHandle, rect.width, SIZE.minWidth, maxWidth()]]) {
    handle.setAttribute('aria-valuenow', String(Math.round(value))); handle.setAttribute('aria-valuemin', String(min)); handle.setAttribute('aria-valuemax', String(Math.round(max)));
  }
}
function setPanelSize({ height = null, width = null }) {
  if (height !== null) layout.ratio = Math.min(roomHeight(), Math.max(SIZE.minHeight, height)) / (roomHeight() || 1);
  if (width !== null) layout.width = Math.round(Math.min(maxWidth(), Math.max(SIZE.minWidth, width)));
  applyLayout();
  if (width !== null) resizeComposer();
  updateLatest();
}
function saveLayout() {
  try { GM_setValue(LAYOUT_KEY, { ratio: layout.ratio, width: layout.width }); }
  catch { setStatus('面板大小保存失败，刷新后会恢复默认。', true); }
}
function resetLayout(axes) {
  if (axes.includes('y')) layout.ratio = null;
  if (axes.includes('x')) layout.width = null;
  applyLayout(); resizeComposer(); updateLatest(); saveLayout();
}
function startResize(event, axes) {
  if (event.button !== 0) return;
  event.preventDefault();
  const handle = event.currentTarget, rect = panel.getBoundingClientRect(), cursor = getComputedStyle(handle).cursor;
  handle.setPointerCapture(event.pointerId);
  panel.setAttribute('data-resizing', ''); document.documentElement.style.cursor = cursor;
  let last = event, frame = 0;
  // 按帧合并指针移动，松手时才写入存储。
  const apply = () => {
    frame = 0;
    // 按拖动距离计算，按下位置不在边缘线上也不会跳动。
    setPanelSize({ height: axes.includes('y') ? rect.height + event.clientY - last.clientY : null, width: axes.includes('x') ? rect.width + event.clientX - last.clientX : null });
  };
  const move = moveEvent => { last = moveEvent; frame ||= requestAnimationFrame(apply); };
  const end = () => {
    cancelAnimationFrame(frame); apply();
    handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', end); handle.removeEventListener('pointercancel', end);
    panel.removeAttribute('data-resizing'); document.documentElement.style.cursor = '';
    saveLayout();
  };
  handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
}
panel.append(conversation, status, composer, settings, exporter, latestButton, morePopover, scopePopover, effortPopover, heightHandle, widthHandle, cornerHandle);
root.append(launcher, panel);
document.body.append(host);
root.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault(); event.stopPropagation();
    if (state.popover) closePopover(true);
    else if (state.view !== 'chat') setView('chat');
    else closePanel({ instant: true });
  }
});
document.addEventListener('pointerdown', event => {
  if (!state.popover) return;
  const path = event.composedPath();
  const [popover, trigger] = popoverParts(state.popover);
  if (!path.includes(popover) && !path.includes(trigger)) closePopover();
});
for (const [menu, options] of [[scopePopover, scopeOptions], [effortPopover, effortOptions]]) {
  menu.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const available = options.filter(option => !option.hidden && !option.disabled);
    const current = available.indexOf(root.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + available.length) % available.length;
    available[next]?.focus();
  });
}

function updateSendButton() {
  const label = questionInput.value.trim() ? '发送问题' : '总结这个话题';
  sendButton.disabled = Boolean(state.task);
  sendButton.setAttribute('aria-label', label); sendButton.title = `${label}（Enter 发送，Shift + Enter 换行）`;
}
function submitQuestion() { return send(questionInput.value.trim() || SUMMARY_PROMPT); }

function setTesting(busy) {
  for (const input of [providerSelect, endpointInput, keyInput, modelInput, deepseekModel, saveButton]) input.disabled = busy;
  testButton.textContent = busy ? '停止测速' : '模型测速';
  testResult.setAttribute('aria-busy', String(busy));
  if (!busy) showProviderFields();
}
function cancelProbe() {
  state.probe?.controller.abort(); state.probe = null; setTesting(false);
}
async function testModel() {
  if (state.probe) { state.probe.controller.abort(); return; }
  let config;
  try { config = draftConfig(); } catch (error) { setStatus(error.message, true); return; }
  setStatus('');
  const probe = { controller: new AbortController() }; state.probe = probe;
  const note = isDeepSeek(config) ? '短文本测速 · 已关闭思考' : '短文本测速';
  testResult.hidden = false; testResult.dataset.state = 'running'; testResult.textContent = `正在连接 ${config.model}…`;
  setTesting(true);
  const seconds = value => `${(value / 1000).toFixed(2)} 秒`;
  try {
    const result = await measureModel({ config, signal: probe.controller.signal, request: options => GM_xmlhttpRequest(options),
      onProgress: ({ firstMs }) => { if (state.probe === probe) testResult.textContent = `首字 ${seconds(firstMs)}，正在测量生成速度…`; },
    });
    if (state.probe !== probe) return;
    testResult.dataset.state = 'complete';
    const metric = (label, value) => element('div', {}, [element('span', { text: label }), element('strong', { text: value })]);
    testResult.replaceChildren(
      element('div', { class: 'test-model', text: `${config.model} · 已连通` }),
      element('div', { class: 'test-metrics' }, [metric('首字耗时', seconds(result.firstMs)), metric('生成速度', result.rate === null ? '未提供流式数据' : `${result.rate.toFixed(1)} ${result.unit}`), metric('总耗时', seconds(result.totalMs))]),
      element('div', { class: 'test-note', text: `${note}${result.rate !== null && result.tokens === null ? ' · 未返回 token 用量，以字符计速' : ''}` }),
    );
  } catch (error) {
    if (state.probe !== probe) return;
    testResult.dataset.state = error.name === 'AbortError' ? 'stopped' : 'error';
    testResult.textContent = error.name === 'AbortError' ? '已停止测速' : String(error.message || '测速失败。').split(config.key).join('[已隐藏]');
  } finally {
    if (state.probe === probe) { state.probe = null; setTesting(false); }
  }
}

function resizeComposer() {
  questionInput.style.height = 'auto';
  questionInput.style.height = `${Math.min(160, Math.max(40, questionInput.scrollHeight))}px`;
  const height = composer.getBoundingClientRect().height;
  if (height) panel.style.setProperty('--ai-composer-height', `${height}px`);
}
function popoverParts(name) { return { more: [morePopover, moreButton], scope: [scopePopover, scopeButton], effort: [effortPopover, effortButton] }[name] || []; }
function closePopover(restoreFocus = false) {
  const [, trigger] = popoverParts(state.popover);
  morePopover.hidden = scopePopover.hidden = effortPopover.hidden = historyBox.hidden = true;
  for (const button of [moreButton, scopeButton, effortButton, historyButton]) button.setAttribute('aria-expanded', 'false');
  state.popover = null;
  if (restoreFocus) trigger?.focus();
}
function togglePopover(name, event) {
  if (state.task) return;
  if (state.popover === name) { closePopover(true); return; }
  closePopover(); state.popover = name;
  const [popover, trigger] = popoverParts(name);
  // 键盘触发（detail 为 0）的状态变化不播放动画。
  popover.toggleAttribute('data-instant', event?.detail === 0); popover.hidden = false; trigger.setAttribute('aria-expanded', 'true');
  (name === 'more' ? newButton : popover.querySelector('[aria-checked="true"]') || popover.querySelector('button:not([hidden])'))?.focus();
}

function newSession(scope = '5') { return { id: uuid(), createdAt: Date.now(), scope, messages: [] }; }
function loadRecord(topicId) {
  const saved = readValue(`${PREFIX}topic:${topicId}`, null);
  const sessions = Array.isArray(saved?.sessions) ? saved.sessions.filter(session => session?.id && Array.isArray(session.messages)).map(session => ({
    ...session, createdAt: Number.isFinite(session.createdAt) ? session.createdAt : Date.now(), scope: Object.hasOwn(SCOPES, session.scope) ? session.scope : '5',
    messages: session.messages.filter(m => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').map(m => ({
      ...m, status: m.status === 'generating' ? 'stopped' : m.status,
      error: m.status === 'generating' ? '上次生成被中断，已保留当时收到的内容。' : m.error,
    })),
  })) : [];
  if (!sessions.length) sessions.push(newSession());
  return { version: 1, title: typeof saved?.title === 'string' ? saved.title : '', sessions,
    activeId: sessions.some(s => s.id === saved?.activeId) ? saved.activeId : sessions[0].id };
}
function persist(record = state.record, topicId = state.topicId) {
  if (!record || !topicId) return;
  try { GM_setValue(`${PREFIX}topic:${topicId}`, clone(record)); }
  catch { storageNotice = '本地保存失败，对话暂时仍在当前窗口。请检查浏览器存储空间。'; setStatus(storageNotice, true); }
}
function setStatus(text, error = false) {
  status.textContent = storageNotice || text; status.classList.toggle('error', error || Boolean(storageNotice));
  status.hidden = !status.textContent;
}
function setView(view) {
  if (view !== 'chat' && state.task) return;
  if (view === 'export' && !shot.source && !exportMessages().length) return;
  cancelProbe(); testResult.hidden = true; clearExport();
  if (view !== 'export') shot.source = null;
  state.view = view;
  const chat = view === 'chat';
  closePopover();
  conversation.hidden = !chat; composer.hidden = !chat; settings.hidden = view !== 'settings'; exporter.hidden = view !== 'export';
  moreButton.hidden = exportButton.hidden = !chat; backButton.hidden = chat;
  panelTitle.textContent = { chat: '话题总结', settings: '模型设置', export: '导出图片' }[view]; panelTitle.title = chat ? state.record?.title || '' : '';
  updateLatest();
  setStatus('');
  if (view === 'export') {
    keyInput.value = '';
    shot.theme ||= pageIsDark() ? 'dark' : 'light';
    void drawExport();
    exportThemes.find(option => option.dataset.value === shot.theme)?.focus();
  } else if (view === 'settings') {
    providerSelect.value = savedProvider();
    endpointInput.value = state.config.endpoint || ''; keyInput.value = state.config.key || ''; modelInput.value = state.config.model || '';
    deepseekModel.value = DEEPSEEK.models.includes(state.config.model) ? state.config.model : state.config.model && savedProvider() === 'deepseek' ? 'custom' : DEEPSEEK.models[0];
    showProviderFields(); keyInput.focus();
  } else { keyInput.value = ''; if (state.open) questionInput.focus(); resizeComposer(); scrollLatest(); }
}
function openPanel(instant = false) {
  if (!state.topicId) return;
  const closing = panel.hasAttribute('data-closing');
  clearTimeout(closeTimer); panel.removeAttribute('data-closing'); panel.toggleAttribute('data-instant', instant);
  lastTrigger = document.activeElement; state.open = true; panel.hidden = false; launcher.hidden = true;
  if (closing && state.view !== 'chat') setView('chat');
  timelineButton?.setAttribute('aria-expanded', 'true'); launcher.setAttribute('aria-expanded', 'true');
  applyLayout(); refreshControls(); resizeComposer(); scrollLatest(); panel.focus();
}
// 点击关闭时淡出 150ms；Esc、键盘操作和减弱动态效果时立即隐藏。
function closePanel({ instant = false } = {}) {
  state.task?.controller.abort(); cancelProbe(); state.open = false; keyInput.value = '';
  closePopover();
  const finish = () => {
    clearTimeout(closeTimer); panel.removeAttribute('data-closing');
    if (state.open) return;
    panel.hidden = true;
    if (state.view !== 'chat') setView('chat');
  };
  if (instant || panel.hidden || reduceMotion.matches) finish();
  else { panel.removeAttribute('data-instant'); panel.setAttribute('data-closing', ''); closeTimer = setTimeout(finish, 150); }
  lastTrigger?.isConnected && lastTrigger.focus(); reconcile();
}
function activate(event) {
  openPanel(event?.detail === 0);
}
// 生成过程中不自动滚动；只在打开、切换对话或点击按钮时跳到最新。
function scrollLatest() {
  conversation.scrollTop = conversation.scrollHeight; updateLatest();
}
function updateLatest() {
  latestButton.hidden = !state.open || state.view !== 'chat' || conversation.scrollHeight - conversation.scrollTop - conversation.clientHeight < 24;
}
// 新问题滚到顶部，并为回答预留一屏高度，回答在原地向下生成。
function pinQuestion(question, answer) {
  const style = getComputedStyle(conversation);
  const padding = parseFloat(style.paddingTop) || 0, bottom = parseFloat(style.paddingBottom) || 0;
  // 状态条在回答开始后隐藏，预留高度按隐藏后的对话区计算，避免届时位置被修正。
  const height = conversation.clientHeight + (status.hidden ? 0 : status.offsetHeight);
  answer.style.minHeight = `${Math.max(0, height - question.offsetHeight - padding - bottom)}px`;
  conversation.scrollTop += question.getBoundingClientRect().top - conversation.getBoundingClientRect().top - padding;
  updateLatest();
}
function swapIcon(name) {
  const icon = uiIcon(name); icon.classList.add('swap-in'); return icon;
}
function selectingIn(node) {
  const selection = root.getSelection?.() || document.getSelection();
  return Boolean(selection?.rangeCount && !selection.isCollapsed && node.contains(selection.getRangeAt(0).commonAncestorContainer));
}
// 重绘会替换回答节点，用户正在选中文字时推迟到取消选择后再补上。
const pendingRenders = new Map();
function renderSoon(message, delay = 80) {
  if (pendingRenders.has(message.id)) return;
  const flush = () => {
    const parts = nodes.get(message.id);
    if (parts && selectingIn(parts.article)) { pendingRenders.set(message.id, setTimeout(flush, 250)); return; }
    pendingRenders.delete(message.id); updateMessage(message);
  };
  pendingRenders.set(message.id, setTimeout(flush, delay));
}
function fillHistory() {
  historySelect.replaceChildren(...(state.record?.sessions || []).map(session => {
    const first = session.messages.find(m => m.role === 'user');
    const date = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(session.createdAt || Date.now());
    return element('option', { value: session.id, text: `${date} · ${(first?.content || '新对话').slice(0, 25)}` });
  }));
  if (state.session) historySelect.value = state.session.id;
}
function refreshControls() {
  const busy = Boolean(state.task);
  panel.setAttribute('aria-busy', String(busy));
  exportButton.disabled = busy || !exportMessages().length;
  for (const control of [scopeButton, effortButton, moreButton, refreshButton, newButton, historyButton, historySelect, settingsButton, questionInput, ...scopeOptions, ...effortOptions]) control.disabled = busy;
  updateSendButton();
  for (const parts of nodes.values()) if (parts.retry) parts.retry.disabled = busy;
  stopButton.hidden = !busy; sendButton.hidden = busy;
  for (const option of scopeOptions) option.setAttribute('aria-checked', String(option.dataset.value === state.session?.scope));
  const effort = selectedEffort(state.config);
  effortLabel.textContent = effort === 'none' ? '不思考' : effort === 'default' ? '默认思考' : `思考 · ${EFFORTS[effort]}`;
  for (const option of effortOptions) {
    option.setAttribute('aria-checked', String(option.dataset.value === effort));
    option.hidden = option.dataset.value === 'default' && (!state.config.endpoint || isDeepSeek(state.config));
  }
  if (state.view === 'chat') panelTitle.title = state.record?.title || '';
  scopeLabel.textContent = labels[state.session?.scope || '5'];
  contextMeta.textContent = state.context ? `${state.context.count}/${state.context.total} 帖` : '';
  modelMeta.textContent = state.config.model || '';
  fillHistory();
}
function updateMessage(message) {
  const parts = nodes.get(message.id); if (!parts) return;
  parts.article.setAttribute('data-status', message.status);
  if (message.role === 'user') parts.body.textContent = message.content === SUMMARY_PROMPT ? '总结这个话题' : message.content;
  else parts.body.replaceChildren(message.content ? renderMarkdown(message.content) : document.createTextNode(''));
  parts.note.textContent = message.error || (message.status === 'stopped' ? '已停止' : '');
  if (parts.thinking) {
    const reasoning = String(message.reasoning || '').trim();
    const thinking = message.status === 'generating' && !message.content;
    parts.thinking.hidden = !reasoning;
    parts.article.toggleAttribute('data-thinking', thinking && Boolean(reasoning));
    parts.thinkingLabel.textContent = thinking ? '正在思考…' : message.reasoningMs ? `已思考 ${Math.max(1, Math.round(message.reasoningMs / 1000))} 秒` : '思考过程';
    // 思考时展开，正文开始后收起；用户手动展开或收起后不再自动切换。
    if (!parts.touched) parts.thinking.open = thinking;
    const text = parts.thinkingText;
    if (text.textContent !== reasoning) {
      const stick = text.scrollHeight - text.scrollTop - text.clientHeight < 24;
      text.textContent = reasoning;
      if (stick) text.scrollTop = text.scrollHeight;
    }
  }
  if (parts.copy) {
    parts.copy.disabled = !message.content;
    parts.retry.hidden = message.status === 'generating' || state.session?.messages.at(-1)?.id !== message.id;
    parts.retry.disabled = Boolean(state.task);
  }
  updateLatest();
}
function renderMessages() {
  nodes.clear(); conversation.replaceChildren();
  if (!state.session?.messages.length) return;
  for (const message of state.session.messages) {
    const body = element('div', { class: 'body' });
    const note = element('div', { class: 'message-note' });
    if (message.role === 'user') {
      // 灰底气泡已表明发送者，不再单独占一行。
      const article = element('article', { class: 'message user', 'data-message-id': message.id }, [body, note]);
      conversation.append(article); nodes.set(message.id, { article, body, note }); updateMessage(message);
      continue;
    }
    const copy = iconButton('复制这条消息', 'copy', async () => {
      try {
        await navigator.clipboard.writeText(message.content); copy.replaceChildren(swapIcon('check')); copy.title = '已复制';
        setTimeout(() => { copy.replaceChildren(swapIcon('copy')); copy.title = '复制这条消息'; }, 1400);
      } catch { setStatus('复制失败，请选中文本后复制。', true); }
    });
    const retry = iconButton('重新生成', 'refresh', () => {
      if (state.task) return;
      const index = state.session.messages.findIndex(m => m.id === message.id);
      const user = state.session.messages[index - 1];
      if (index === state.session.messages.length - 1 && user?.role === 'user') void send(user.content, true);
    }, { hidden: true });
    const name = message.model || '未知模型';
    const thinkingLabel = element('span');
    const thinkingText = element('div', { class: 'thinking-text' });
    const thinking = element('details', { class: 'thinking', hidden: true }, [
      element('summary', { onClick: () => { parts.touched = true; } }, [thinkingLabel, uiIcon('down')]), thinkingText,
    ]);
    const article = element('article', { class: 'message assistant', 'data-message-id': message.id }, [
      element('div', { class: 'message-head' }, [element('span', { text: name, title: message.model || '' })]), thinking,
      element('div', { class: 'typing', 'aria-hidden': 'true' }, [element('i'), element('i'), element('i')]), body, note,
      element('div', { class: 'actions message-actions' }, [copy, retry]),
    ]);
    const parts = { article, body, note, copy, retry, thinking, thinkingLabel, thinkingText, touched: false };
    conversation.append(article);
    nodes.set(message.id, parts); updateMessage(message);
  }
  updateLatest();
}

// 只导出完整的一问一答；只有一次“总结”时只保留回答，与 FluxDO 的单条导出一致。
function exportMessages() {
  const messages = state.session?.messages || [], pairs = [];
  for (let i = 0; i < messages.length - 1; i++) {
    const ask = messages[i], answer = messages[i + 1];
    if (ask.role === 'user' && answer.role === 'assistant' && answer.status === 'complete' && answer.content.trim()) { pairs.push(ask, answer); i++; }
  }
  return pairs.length === 2 && pairs[0].content === SUMMARY_PROMPT ? [pairs[1]] : pairs;
}
function pageIsDark() {
  const [r = 255, g = 255, b = 255] = (getComputedStyle(panel).backgroundColor.match(/[\d.]+/g) || []).map(Number);
  return r * 0.299 + g * 0.587 + b * 0.114 < 128;
}
function clearExport() {
  shot.token++; shot.blob = null; shot.post = null; shot.controller?.abort(); shot.controller = null;
  exportPreview.replaceChildren(); exportPreview.setAttribute('aria-busy', 'false');
}
// 同站或带 CORS 的图片直接读取；其余经 GM_xmlhttpRequest（首次访问新域名时油猴会询问是否允许）。
async function fetchImage(url, signal) {
  const target = new URL(url);
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
  if (target.origin === location.origin) {
    const response = await fetch(target, { credentials: 'same-origin', signal: timeout });
    if (!response.ok) throw new Error(`图片读取失败（HTTP ${response.status}）`);
    return response.blob();
  }
  try {
    const response = await fetch(target, { mode: 'cors', credentials: 'omit', signal: timeout });
    if (response.ok) return response.blob();
  } catch (error) { if (signal.aborted) throw abortError(); }
  return new Promise((resolve, reject) => {
    const handle = GM_xmlhttpRequest({ method: 'GET', url: target.href, responseType: 'blob', anonymous: true, timeout: 20_000,
      onload: response => {
        const body = response.response, type = body?.type || /content-type:\s*([^;\r\n]+)/i.exec(response.responseHeaders || '')?.[1] || '';
        // 油猴返回的 Blob 可能属于另一个运行环境，重新包装后再交给 createImageBitmap。
        if (response.status >= 200 && response.status < 300 && body) resolve(new Blob([body], { type })); else reject(new Error('图片读取失败'));
      },
      onerror: () => reject(new Error('图片读取失败')), ontimeout: () => reject(new Error('图片读取超时')), onabort: () => reject(abortError()) });
    signal.addEventListener('abort', () => { handle?.abort?.(); reject(abortError()); }, { once: true });
  });
}
async function loadPost(postId, signal) {
  setStatus('正在读取帖子…');
  const json = await getJson(`/posts/${postId}.json`, signal);
  if (String(json.topic_id) !== String(state.topicId)) throw new Error('这一楼不属于当前话题，请刷新页面后重试。');
  const post = await preparePost(json, { fetchImage: url => fetchImage(url, signal),
    onProgress: (loaded, total) => { if (!signal.aborted) setStatus(`正在加载图片 ${loaded}/${total}…`); } });
  checkAbort(signal);
  setStatus('');
  return post;
}
async function exportCard() {
  if (shot.source) {
    if (shot.post?.postId !== shot.source.postId) {
      shot.controller = new AbortController();
      shot.post = { postId: shot.source.postId, ready: loadPost(shot.source.postId, shot.controller.signal) };
    }
    return postCard(await shot.post.ready, shot.theme);
  }
  const messages = exportMessages();
  return shareCard({ title: state.record?.title, topicId: state.topicId, theme: shot.theme, time: shareTime(messages.at(-1)?.createdAt),
    messages: messages.map(m => ({ role: m.role, model: m.model, content: m.role === 'user' && m.content === SUMMARY_PROMPT ? '总结这个话题' : m.content })) });
}
async function drawExport() {
  const token = ++shot.token;
  for (const option of exportThemes) option.setAttribute('aria-pressed', String(option.dataset.value === shot.theme));
  copyImageButton.disabled = saveImageButton.disabled = true; shot.blob = null;
  exportPreview.setAttribute('aria-busy', 'true');
  try {
    const card = await exportCard();
    if (token !== shot.token) return;
    const { canvas, blob } = await renderShareImage(card);
    if (token !== shot.token) return;
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `导出图片预览（${SHARE_THEMES[shot.theme].label}）`);
    exportPreview.replaceChildren(canvas); shot.blob = blob;
    copyImageButton.disabled = saveImageButton.disabled = false;
  } catch (error) {
    if (token === shot.token && error.name !== 'AbortError') setStatus(error.message || '图片生成失败，请重试。', true);
  } finally { if (token === shot.token) exportPreview.setAttribute('aria-busy', 'false'); }
}
async function copyExport() {
  if (!shot.blob) return;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': shot.blob })]);
    copyImageButton.textContent = '已复制'; setStatus('');
    setTimeout(() => { copyImageButton.textContent = '复制图片'; }, 1400);
  } catch { setStatus('复制失败，请改用保存图片。', true); }
}
function saveExport() {
  if (!shot.blob) return;
  const url = URL.createObjectURL(shot.blob);
  const name = `linuxdo-${state.topicId}${shot.source && shot.post ? '-post' : ''}-${shareTime(Date.now()).replace(/[-: ]/g, '').replace(/^(\d{8})/, '$1-')}.png`;
  element('a', { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function getJson(path, signal) {
  checkAbort(signal);
  const response = await fetch(path, { credentials: 'same-origin', signal, headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' } });
  if (!response.ok) {
    if ([401, 403].includes(response.status)) throw new Error('论坛要求重新登录或验证，请在当前 Chrome 页面完成后再试。');
    if (response.status === 429) throw new Error('论坛暂时限流，请稍后再试。本次没有自动重试。');
    throw new Error(`帖子读取失败（HTTP ${response.status}）。`);
  }
  if (!/application\/json/i.test(response.headers.get('content-type') || '')) throw new Error('论坛没有返回帖子数据，请检查当前页面是否需要登录或验证。');
  return response.json();
}

async function refreshContext() {
  if (state.task || !state.topicId) return;
  const task = { topicId: state.topicId, session: state.session, record: state.record, controller: new AbortController() };
  state.task = task; state.context = null; refreshControls(); setStatus('正在读取…');
  try {
    const context = await collectTopic({ topicId: task.topicId, scope: task.session.scope, getJson, toText: htmlToText, signal: task.controller.signal,
      onProgress: (loaded, total) => { if (state.task === task) setStatus(`正在读取 ${loaded}/${total} 帖…`); } });
    if (state.task !== task || topicIdFromUrl(location.href) !== task.topicId) return;
    state.context = context; state.record.title = context.title; persist();
    setStatus(`已读取 ${context.count}/${context.total} 帖`);
  } catch (error) {
    if (state.task === task) setStatus(error.name === 'AbortError' ? '已停止读取。' : error.message, error.name !== 'AbortError');
  } finally { if (state.task === task) { state.task = null; refreshControls(); } }
}

async function send(rawQuestion, replaceLast = false) {
  const question = String(rawQuestion || '').trim();
  if (!question || state.task || !state.session || !state.topicId) return;
  closePopover();
  let config;
  try { config = validateConfig(state.config); }
  catch { openPanel(); setView('settings'); return; }
  const task = { topicId: state.topicId, record: state.record, session: state.session, controller: new AbortController(), lastSave: 0 };
  state.task = task; refreshControls();
  const current = () => state.task === task && state.topicId === task.topicId && topicIdFromUrl(location.href) === task.topicId;
  let answer, thinkStart = 0;
  const saveSoon = () => { if (Date.now() - task.lastSave > 1200) { task.lastSave = Date.now(); persist(task.record, task.topicId); } };
  try {
    setStatus('正在读取帖子…');
    let context = state.context;
    if (!context || context.scope !== task.session.scope || context.topicId !== task.topicId) {
      context = await collectTopic({ topicId: task.topicId, scope: task.session.scope, getJson, toText: htmlToText, signal: task.controller.signal,
        onProgress: (loaded, total) => { if (current()) setStatus(`正在读取 ${loaded}/${total} 帖…`); } });
    }
    checkAbort(task.controller.signal);
    if (!current()) return;
    state.context = context; task.record.title = context.title;
    const history = replaceLast ? task.session.messages.slice(0, -2) : task.session.messages;
    const messages = buildMessages(context, history, question);
    if (replaceLast) task.session.messages.splice(-2);
    const ask = { id: uuid(), role: 'user', content: question, status: 'complete', createdAt: Date.now() };
    answer = { id: uuid(), role: 'assistant', content: '', status: 'generating', model: config.model, createdAt: Date.now() };
    task.session.messages.push(ask, answer); questionInput.value = ''; resizeComposer(); renderMessages(); refreshControls(); persist(task.record, task.topicId);
    pinQuestion(nodes.get(ask.id).article, nodes.get(answer.id).article);
    // 定位完成后再加入场动画，避免位移影响置顶计算。
    for (const id of [ask.id, answer.id]) nodes.get(id).article.classList.add('enter');
    setStatus(`已读取 ${context.count}/${context.total} 帖，正在生成…`);
    await streamChat({ config, messages, request: options => GM_xmlhttpRequest(options), signal: task.controller.signal,
      onDelta: (_delta, content) => {
        if (!current()) { task.controller.abort(); return; }
        if (!answer.content) { setStatus(''); if (thinkStart) answer.reasoningMs = Date.now() - thinkStart; }
        answer.content = content;
        renderSoon(answer); saveSoon();
      },
      // 思考过程只保存在本地用于回看，后续追问不会发回模型。
      onReasoning: (_delta, reasoning) => {
        if (!current()) { task.controller.abort(); return; }
        if (!answer.reasoning) { setStatus(''); thinkStart = Date.now(); }
        answer.reasoning = reasoning;
        renderSoon(answer); saveSoon();
      },
    });
    checkAbort(task.controller.signal); answer.status = 'complete';
    if (current()) setStatus('');
  } catch (error) {
    const stopped = error.name === 'AbortError';
    const message = stopped ? '已停止生成。' : String(error.message || '请求失败。').split(config.key).join('[已隐藏]');
    if (answer) { answer.status = stopped ? 'stopped' : 'error'; answer.error = message; }
    if (current()) setStatus(answer ? '' : message, !stopped && !answer);
  } finally {
    if (answer?.status === 'generating') answer.status = 'stopped';
    if (thinkStart && !answer.reasoningMs) answer.reasoningMs = Date.now() - thinkStart;
    persist(task.record, task.topicId);
    if (state.task === task) {
      state.task = null; refreshControls();
      if (answer) renderSoon(answer, 0);
    }
  }
}

function closePostMenu(restoreFocus = false) {
  if (!activePostMenu) return;
  const menu = activePostMenu; activePostMenu = null;
  menu.actions.removeAttribute('data-ai-post-open'); menu.trigger.setAttribute('aria-expanded', 'false');
  menu.surface.setAttribute('aria-hidden', 'true');
  menu.items.forEach(item => { item.inert = true; });
  if (restoreFocus && menu.trigger.isConnected) menu.trigger.focus();
}
function positionPostMenu(menu) {
  const rect = menu.trigger.getBoundingClientRect();
  if (rect.bottom <= 0 || rect.top >= innerHeight) { closePostMenu(); return; }
  const width = Math.min(196, innerWidth - 16), height = menu.items.length * 40 + 12;
  const x = Math.max(8, Math.min(rect.right - width, innerWidth - width - 8));
  const y = rect.bottom + 6 + height <= innerHeight - 8 ? rect.bottom + 6 : Math.max(8, rect.top - height - 6);
  for (const [key, value] of Object.entries({ x, y, width, height })) menu.actions.style.setProperty(`--ai-post-menu-${key}`, `${value}px`);
}
function togglePostMenu(menu) {
  if (activePostMenu === menu) { closePostMenu(true); return; }
  closePostMenu(); closePopover(); activePostMenu = menu;
  positionPostMenu(menu); menu.actions.setAttribute('data-ai-post-open', '');
  menu.trigger.setAttribute('aria-expanded', 'true'); menu.surface.setAttribute('aria-hidden', 'false');
  menu.items.forEach(item => { item.inert = false; });
  menu.items.find(item => !item.disabled)?.focus();
}
function postMenuKeydown(event, menu) {
  const primary = ['like', 'reply', 'bookmark', 'more'].flatMap(kind => {
    const node = menu.actions.querySelector(`:scope > [data-ai-post-kind="${kind}"]`);
    return node ? [node.matches('button, a[href]') ? node : node.querySelector('button, a[href]')].filter(button => button && !button.disabled) : [];
  });
  if (activePostMenu === menu) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePostMenu(true); return; }
    if (event.key === 'Tab') {
      closePostMenu(true);
      if (event.shiftKey) { event.preventDefault(); primary.at(-2)?.focus(); }
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const items = menu.items.filter(item => !item.disabled), index = items.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
      return;
    }
  }
  // CSS 排序不改变 Glimmer 管理的 DOM，Tab 顺序同步为点赞、回复、收藏、更多。
  if (event.key === 'Tab') {
    const index = primary.indexOf(document.activeElement), next = index + (event.shiftKey ? -1 : 1);
    if (index >= 0 && next >= 0 && next < primary.length) { event.preventDefault(); primary[next].focus(); }
  }
}
function syncPostMenus() {
  const actionsList = [...document.querySelectorAll('nav.post-controls .actions')];
  const isPrivate = document.body.classList.contains('archetype-private_message');
  if (!isPrivate) for (const actions of actionsList) {
    actions.classList.add('linuxdo-ai-post-actions');
    const nativeMore = actions.querySelector(':scope > .show-more-actions');
    // 普通话题先在隐藏状态下让 Discourse 生成原生收藏等控件，不挪动节点或复制事件。
    // 私信的原生展开会读取已读名单，因此仍不接管私信操作栏。
    if (nativeMore && !revealedPostMenus.has(nativeMore)) { revealedPostMenus.add(nativeMore); nativeMore.click(); }
  }
  placePostExports();
  if (isPrivate) { closePostMenu(); return; }
  for (const actions of actionsList) {
    let menu = postMenus.get(actions);
    if (!menu) {
      const id = `linuxdo-ai-post-menu-${++postMenuSequence}`;
      const trigger = element('button', { type: 'button', class: 'btn no-text btn-icon btn-flat linuxdo-ai-post-more', title: '更多', 'aria-label': '更多帖子操作', 'aria-expanded': 'false', 'aria-haspopup': 'menu', 'aria-controls': id, 'data-ai-post-kind': 'more' }, [uiIcon('more')]);
      const surface = element('div', { id, class: 'linuxdo-ai-post-menu-surface', role: 'menu', 'aria-label': '更多帖子操作', 'aria-hidden': 'true', 'data-ai-post-kind': 'surface' });
      menu = { actions, trigger, surface, items: [] }; postMenus.set(actions, menu);
      trigger.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); togglePostMenu(menu); });
      actions.addEventListener('keydown', event => postMenuKeydown(event, menu));
      actions.addEventListener('click', event => {
        if (activePostMenu === menu && menu.items.some(item => item.contains(event.target))) closePostMenu();
      });
    }
    if (!menu.trigger.isConnected) actions.append(menu.trigger);
    if (!menu.surface.isConnected) actions.append(menu.surface);
    menu.items = [];
    for (const node of actions.children) {
      if (node === menu.trigger || node === menu.surface) continue;
      const kind = node.matches('.post-action-menu__like, .discourse-reactions-actions-button-shim') ? 'like'
        : node.matches('.post-action-menu__reply') ? 'reply' : node.matches('.post-action-menu__bookmark') ? 'bookmark'
        : node.matches('.show-more-actions') ? 'native-more' : 'secondary';
      node.dataset.aiPostKind = kind;
      if (kind !== 'secondary' || node.hidden) continue;
      const labels = { 'copy-link': '复制链接', share: '分享', flag: '举报', edit: '编辑', delete: '删除', admin: '管理', read: '已读', 'add-translation': '翻译' };
      const key = Object.keys(labels).find(name => node.classList.contains(`post-action-menu__${name}`));
      node.dataset.aiPostLabel = node.classList.contains('linuxdo-ai-post-export') ? '导出图片' : labels[key] || node.getAttribute('aria-label') || node.title || node.textContent.trim();
      node.style.setProperty('--ai-post-menu-row', menu.items.length);
      if (!node.id) node.id = `${menu.surface.id}-item-${++postMenuSequence}`;
      node.setAttribute('role', 'menuitem'); node.inert = activePostMenu !== menu;
      menu.items.push(node);
    }
    menu.surface.setAttribute('aria-owns', menu.items.map(item => item.id).join(' '));
    if (activePostMenu === menu) positionPostMenu(menu);
  }
  if (activePostMenu && !activePostMenu.trigger.isConnected) closePostMenu();
}
document.addEventListener('pointerdown', event => {
  if (activePostMenu && !activePostMenu.actions.contains(event.target)) closePostMenu();
});
window.addEventListener('resize', () => closePostMenu(), { passive: true });
// 导出排在“更多”的复制链接之后；Discourse 重绘操作栏后补回，保持位置且不重复。
function placePostExports() {
  for (const actions of document.querySelectorAll('nav.post-controls .actions')) {
    const anchor = actions.querySelector(':scope > .post-action-menu__copy-link, :scope > .post-action-menu__share');
    const placed = actions.querySelectorAll(':scope > .linuxdo-ai-post-export');
    if (anchor && placed.length === 1 && anchor.nextElementSibling === placed[0]) continue;
    placed.forEach(node => node.remove());
    if (!anchor) continue;
    anchor.after(element('button', { type: 'button', class: 'btn no-text btn-icon btn-flat linuxdo-ai-post-export', title: '导出图片', 'aria-label': '把这一楼导出为图片',
      onClick: event => { event.preventDefault(); event.stopPropagation(); closePostMenu(); exportPost(event.currentTarget); } }, [uiIcon('image')]));
  }
}
function exportPost(button) {
  const postId = Number(button.closest('article[data-post-id]')?.dataset.postId);
  if (!Number.isSafeInteger(postId) || postId <= 0 || !state.topicId) return;
  if (!state.open) openPanel();
  if (state.task) { setStatus('AI 正在生成，完成后再导出图片。', true); return; }
  shot.source = { postId }; setView('export');
}

function reconcile() {
  const id = topicIdFromUrl(location.href);
  if (id !== state.topicId) {
    closePostMenu();
    state.task?.controller.abort(); cancelProbe(); testResult.hidden = true; state.task = null; state.context = null; state.topicId = id;
    if (state.view === 'export') setView('chat');
    questionInput.value = ''; resizeComposer(); closePopover(); nodes.clear();
    if (id) {
      state.record = loadRecord(id); state.session = state.record.sessions.find(s => s.id === state.record.activeId);
      renderMessages(); scrollLatest(); refreshControls(); setStatus('');
    } else { state.record = null; state.session = null; state.open = false; }
    panel.hidden = !state.open || !id;
  }
  if (!id) { launcher.hidden = true; timelineButton?.remove(); timelineButton = null; return; }
  if (!host.isConnected) document.body.append(host);
  syncPostMenus();
  const heading = document.querySelector('#topic-title h1[data-topic-id]');
  if (heading?.dataset.topicId === id) {
    const text = heading.querySelector('.fancy-title')?.textContent.trim() || heading.textContent.trim();
    if (text && state.record.title !== text) { state.record.title = text; if (state.view === 'chat') panelTitle.title = text; }
  }
  const reader = document.querySelector('.topic-timeline .timeline-controls .reader-mode-toggle');
  if (reader) {
    if (!timelineButton?.isConnected || timelineButton.previousElementSibling !== reader) {
      timelineButton?.remove();
      timelineButton = element('button', { id: 'linuxdo-ai-topic-button', class: 'btn no-text btn-icon btn-default', title: 'AI 总结', 'aria-label': 'AI 总结', type: 'button', onClick: activate }, [aiIcon()]);
      reader.after(timelineButton);
    }
    const size = reader.getBoundingClientRect();
    if (size.width && size.height) {
      timelineButton.style.setProperty('--linuxdo-ai-width', `${size.width}px`);
      timelineButton.style.setProperty('--linuxdo-ai-height', `${size.height}px`);
    }
  } else { timelineButton?.remove(); timelineButton = null; }
  timelineButton?.setAttribute('aria-expanded', String(state.open));
  launcher.setAttribute('aria-expanded', String(state.open));
  const rect = timelineButton?.isConnected ? timelineButton.getBoundingClientRect() : null;
  const visible = rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
  launcher.hidden = state.open || Boolean(visible);
}

function scheduleReconcile() {
  if (scheduled) return; scheduled = true;
  requestAnimationFrame(() => { scheduled = false; reconcile(); });
}
new MutationObserver(scheduleReconcile).observe(document.body, { childList: true, subtree: true });
window.addEventListener('popstate', scheduleReconcile);
window.addEventListener('pageshow', scheduleReconcile);
window.addEventListener('scroll', scheduleReconcile, { passive: true });
window.addEventListener('resize', scheduleReconcile, { passive: true });
// 输入框高度取决于宽度，窗口变化后按新宽度重算，避免停留在窄窗口时撑高的高度。
window.addEventListener('resize', () => { applyLayout(); if (state.open && state.view === 'chat') resizeComposer(); }, { passive: true });
window.navigation?.addEventListener('navigatesuccess', scheduleReconcile);
window.addEventListener('pagehide', () => {
  cancelProbe();
  const task = state.task;
  if (task) {
    const last = task.session.messages.at(-1); if (last?.status === 'generating') last.status = 'stopped';
    persist(task.record, task.topicId); task.controller.abort();
  }
});
if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('Linux.do AI 设置', () => { openPanel(); setView('settings'); });
if (typeof GM_addValueChangeListener === 'function') GM_addValueChangeListener(CONFIG_KEY, (_key, _old, value, remote) => { if (remote && !state.task && !state.probe) { state.config = value || {}; refreshControls(); } });
reconcile();
