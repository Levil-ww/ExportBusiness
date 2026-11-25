function sycmSearchReady(doc, href, range, visible) {
  let url;
  try { url = new URL(href); } catch (_) { return false; }
  if (url.hostname !== 'sycm.taobao.com' || url.pathname !== '/flow/monitor/keyword_assistant' ||
      url.searchParams.get('dateType') !== 'recent7' || url.searchParams.get('dateRange') !== range.start + '|' + range.end || url.searchParams.get('device') !== '2') return false;
  const body = (doc.body && doc.body.innerText) || '';
  const dates = [...body.matchAll(/统计时间\s*[:：]?\s*(\d{4}[-./]\d{1,2}[-./]\d{1,2})\s*[-~～至]\s*(\d{4}[-./]\d{1,2}[-./]\d{1,2})/g)];
  const normalize = s => s.replace(/[./]/g, '-').split('-').map((v, i) => i ? v.padStart(2, '0') : v).join('-');
  function selected(label) {
    const candidates = [...doc.querySelectorAll('button,a,[role="tab"],div,span')].filter(el => visible(el) && String(el.innerText || el.textContent || '').trim() === label);
    return candidates.some(el => {
      for (let node = el, i = 0; node && i < 4; node = node.parentElement, i++) {
        const cls = typeof node.className === 'string' ? node.className : '';
        if (/(?:^|[-_\s])(active|selected|current)(?:$|[-_\s])/i.test(cls) || node.getAttribute('aria-selected') === 'true') return true;
      }
      return false;
    });
  }
  return dates.length === 1 && normalize(dates[0][1]) === range.start && normalize(dates[0][2]) === range.end && body.includes('本店引流词') && selected('引流搜索关键词') && selected('搜索词');
}
function sycmSearchDownload(doc, visible, range) {
  const links = [...doc.querySelectorAll('a.keyAssistant-download')].filter(el => {
    if (!visible(el)) return false;
    let url;
    try { url = new URL(el.getAttribute('href'), 'https://sycm.taobao.com'); } catch (_) { return false; }
    return url.protocol === 'https:' && url.hostname === 'sycm.taobao.com' &&
      url.pathname === '/flow/v4/shop/wordAide/drainage/excel.json' &&
      url.searchParams.get('device') === '2' && url.searchParams.get('dateType') === 'recent7' &&
      url.searchParams.get('kwType') === 'se_keyword' && url.searchParams.get('dateRange') === range.start + '|' + range.end;
  });
  return links.length === 1 ? links[0] : null;
}
if (typeof module !== 'undefined') module.exports = { sycmSearchReady, sycmSearchDownload };
