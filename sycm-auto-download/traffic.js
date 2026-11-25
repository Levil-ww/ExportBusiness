// 仅选择与“指标选择”同一行的表格下载按钮，避免误点上方汇总下载。
function sycmTrafficDownload(doc, visible) {
  const text = el => String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const leafMatches = predicate => {
    const matches = [...doc.querySelectorAll('button,a,[role="button"],div,span,th')].filter(el => visible(el) && predicate(text(el)));
    return matches.filter(el => !matches.some(other => other !== el && el.contains && el.contains(other)));
  };
  const buttons = [...doc.querySelectorAll('button,a,[role="button"]')].filter(el =>
    visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && text(el) === '下载');
  const containers = [...doc.querySelectorAll('.all-shop-source-v2-flow-table-header-right')]
    .filter(el => visible(el) && typeof el.querySelectorAll === 'function');
  if (containers.length > 1) return null;
  if (containers.length === 1) {
    const tableButtons = [...containers[0].querySelectorAll('button,a,[role="button"]')].filter(el =>
      visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && text(el) === '下载');
    if (tableButtons.length === 1) return tableButtons[0];
    if (tableButtons.length > 1) return null;
  }
  const anchors = leafMatches(label => /^指标选择(?:\s*[（(]?\s*\d+\s*\/\s*\d+\s*[）)]?)?$/.test(label));
  if (anchors.length === 1) {
    const a = anchors[0].getBoundingClientRect();
    const aligned = buttons.filter(el => {
      const r = el.getBoundingClientRect();
      return r.left >= a.right && r.left - a.right <= 250 && Math.abs((r.top + r.height / 2) - (a.top + a.height / 2)) <= 20;
    });
    if (aligned.length === 1) return aligned[0];
    if (aligned.length > 1) return null;
  }
  // 页面控件的文字结构可能变化；以表头上方的唯一下载按钮作为备用定位。
  const headers = leafMatches(label => /^流量来源(?:\s|$)/.test(label));
  if (headers.length !== 1) return null;
  const h = headers[0].getBoundingClientRect();
  const nearTable = buttons.filter(el => {
    const r = el.getBoundingClientRect();
    return r.left > h.right && r.bottom <= h.top && h.top - r.bottom <= 120;
  });
  return nearTable.length === 1 ? nearTable[0] : null;
}
function sycmTrafficReady(doc, href, expected) {
  let url;
  try { url = new URL(href); } catch (_) { return false; }
  if (url.hostname !== 'sycm.taobao.com' || url.pathname !== '/flow/monitor/shopsource/construction' ||
      url.searchParams.get('dateType') !== 'day' || url.searchParams.get('dateRange') !== expected + '|' + expected) return false;
  const dates = [...((doc.body && doc.body.innerText) || '').matchAll(/统计时间\s*[:：]?\s*(\d{4}[-./]\d{1,2}[-./]\d{1,2})/g)];
  const normalize = s => s.replace(/[./]/g, '-').split('-').map((v, i) => i ? v.padStart(2, '0') : v).join('-');
  return dates.length === 1 && normalize(dates[0][1]) === expected;
}
async function sycmEnsureTrafficDate(ready, select) {
  if (!await ready()) await select();
}
if (typeof module !== 'undefined') module.exports = { sycmTrafficDownload, sycmTrafficReady, sycmEnsureTrafficDate };
