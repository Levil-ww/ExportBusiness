(() => {
  'use strict';
  const PREFIX = '[生意参谋自动下载]';
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = el => {
    const style = getComputedStyle(el), rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  // 仅在顶部导航明确标记当前项时启用，避免把市场页的“商品”标签当成商品模块。
  function activeModule() {
    // 内容概况的数据位于跨域 iframe，不能读取外层导航；仅对已确认的内容页面启用。
    if (location.hostname === 'web.taobao.com' && location.pathname === '/s-guanghe-creator/asset-overview') return '内容';
    const found = new Set();
    for (const el of document.querySelectorAll('a, button, [role="tab"], [role="menuitem"], div, span')) {
      const label = normalize(el.innerText || el.textContent);
      if (!['商品', '内容', '市场'].includes(label) || !visible(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.top < 0 || rect.top > 120) continue;
      let node = el;
      for (let i = 0; node && i < 3; i++, node = node.parentElement) {
        const cls = typeof node.className === 'string' ? node.className : '';
        if (/(^|[\s_-])(active|selected|current)([\s_-]|$)/i.test(cls) ||
            node.getAttribute('aria-selected') === 'true' || node.getAttribute('aria-current') === 'page') {
          found.add(label); break;
        }
      }
    }
    return found.size === 1 ? [...found][0] : '';
  }
  function downloadButtons(module) {
    const labeled = [...document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]')].filter(el => {
      const label = normalize(el.innerText || el.value || el.getAttribute('aria-label'));
      return label === '下载' && visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
    });
    if (labeled.length || module !== '内容') return labeled;
    // 内容作品分析的下载入口是“展开更多指标”右侧的独立图标。
    const anchors = [...document.querySelectorAll('button, a, [role="button"], div, span')].filter(el =>
      normalize(el.innerText || el.textContent) === '展开更多指标' && visible(el) &&
      ![...el.children].some(child => normalize(child.innerText || child.textContent) === '展开更多指标'));
    if (anchors.length !== 1) return [];
    const a = anchors[0].getBoundingClientRect();
    const icons = [...document.querySelectorAll('svg, i, img, [class*="icon"]')].filter(el => {
      if (!visible(el) || anchors[0].contains(el)) return false;
      const r = el.getBoundingClientRect();
      return r.width <= 48 && r.height <= 48 && r.left >= a.right && r.left - a.right <= 80 &&
        Math.abs((r.top + r.height / 2) - (a.top + a.height / 2)) <= 20;
    });
    // 多层图标包装视为同一入口；多个独立图标则停止。
    const roots = icons.filter(el => !icons.some(other => other !== el && other.contains(el)));
    return roots.length === 1 ? roots : [];
  }
  let route = location.href, attempted = false, timer = null;
  function pageEndDate(module) {
    const text = (document.body && document.body.innerText) || '';
    const pattern = module === '商品'
      ? /统计时间\s*[:：]?\s*(\d{4}[-./]\d{1,2}[-./]\d{1,2})/
      : /数据时间范围\s*[:：]?\s*\d{4}[-./]\d{1,2}[-./]\d{1,2}\s*[-~～至]\s*(\d{4}[-./]\d{1,2}[-./]\d{1,2})/;
    const match = text.match(pattern);
    if (!match) return '';
    const parts = match[1].replace(/[./]/g, '-').split('-');
    return parts[0] + '-' + parts[1].padStart(2, '0') + '-' + parts[2].padStart(2, '0');
  }
  async function check() {
    if (route !== location.href) { route = location.href; attempted = false; }
    const module = activeModule();
    if (attempted || !['商品', '内容'].includes(module)) return;
    const buttons = downloadButtons(module);
    if (buttons.length !== 1) return;
    const endDate = pageEndDate(module);
    if (!endDate) { console.warn(PREFIX, '未识别数据日期，未下载。'); return; }
    attempted = true;
    try {
      const response = await chrome.runtime.sendMessage({ action: 'prepareArchive', module, endDate });
      if (!response || !response.ok) throw new Error(response?.error || '归档准备失败');
    } catch (error) { console.error(PREFIX, '未启动下载：', error.message); return; }
    if (typeof buttons[0].click === 'function') buttons[0].click();
    else buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    console.info(PREFIX, '已点击平台下载按钮。若出现确认框或下载任务，请按平台提示处理。');
  }
  // 页面异步加载时等待 DOM 稳定；同一 URL 只点击一次。
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(check, 1500);
  }
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  window.addEventListener('popstate', schedule);
  window.addEventListener('hashchange', schedule);
  setInterval(() => {
    if (route !== location.href) { route = location.href; attempted = false; schedule(); }
  }, 1000);
  schedule();
})();
