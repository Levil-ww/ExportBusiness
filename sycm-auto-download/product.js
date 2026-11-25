// 商品排行控件按已采集的页面标识查找。校验失败时不得下载。
function sycmProductControls(doc, visible) {
  const unique = nodes => {
    const found = [...nodes].filter(visible);
    return found.length === 1 ? found[0] : null;
  };
  const tab = unique([...doc.querySelectorAll('.oui-tab-switch-item')].filter(e => (e.innerText || e.textContent || '').trim() === '全部商品'));
  const day = unique([...doc.querySelectorAll('button')].filter(e => (e.innerText || e.textContent || '').trim() === '日'));
  const specific = [...doc.querySelectorAll('a.sycm-cc-item-rank-download')].filter(visible);
  const download = specific.length ? unique(specific) : unique([...doc.querySelectorAll('button, a, [role="button"]')]
    .filter(e => (e.innerText || e.textContent || e.getAttribute('aria-label') || '').trim() === '下载'));
  return { tab, day, download };
}

function sycmProductDiagnostics(doc, visible) {
  const names = [
    ['全部商品', '.oui-tab-switch-item', e => (e.innerText || e.textContent || '').trim() === '全部商品'],
    ['日', 'button', e => (e.innerText || e.textContent || '').trim() === '日'],
    ['专用下载', 'a.sycm-cc-item-rank-download', () => true],
    ['文字下载', 'button, a, [role="button"]', e => (e.innerText || e.textContent || e.getAttribute('aria-label') || '').trim() === '下载']
  ];
  return names.map(([label, selector, match]) => {
    const all = [...doc.querySelectorAll(selector)].filter(match);
    return label + ' ' + all.filter(visible).length + '/' + all.length;
  }).join('，');
}

function sycmProductReady(doc, visible, expectedDate) {
  const { tab, day } = sycmProductControls(doc, visible);
  if (!tab || !day) return false;
  if (!tab.classList.contains('oui-tab-switch-item-active') || !day.classList.contains('ant-btn-primary')) return false;
  const text = (doc.body && doc.body.innerText) || '';
  const dates = [...text.matchAll(/统计时间\s*[:：]?\s*(\d{4}[-./]\d{1,2}[-./]\d{1,2})/g)];
  const normalize = s => s.replace(/[./]/g, '-').split('-').map((x, i) => i ? x.padStart(2, '0') : x).join('-');
  return dates.length === 1 && normalize(dates[0][1]) === expectedDate;
}

if (typeof module !== 'undefined') module.exports = { sycmProductControls, sycmProductReady, sycmProductDiagnostics };
