(() => {
  'use strict';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const visible = el => {
    const style = getComputedStyle(el), rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const text = el => String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const oneText = (selector, label) => {
    const all = [...document.querySelectorAll(selector)].filter(el => visible(el) && text(el) === label);
    const leaf = all.filter(el => !all.some(other => other !== el && el.contains(other)));
    return leaf.length === 1 ? leaf[0] : null;
  };
  async function waitFor(fn, label, timeout = 25000) {
    const until = Date.now() + timeout;
    while (Date.now() < until) { const value = fn(); if (value) return value; await sleep(300); }
    throw new Error('等待超时：' + label);
  }
  async function armAndClick(module, endDate, button) {
    const result = await chrome.runtime.sendMessage({ action: 'prepareArchive', module, endDate });
    if (!result?.ok) throw new Error(result?.error || '无法准备下载');
    if (typeof button.click === 'function') button.click();
    else button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }
  async function product(range) {
    let controls;
    try {
      controls = await waitFor(() => {
        const c = sycmProductControls(document, visible);
        return c.tab && c.day ? c : null;
      }, '商品排行“全部商品”和“日”切换控件');
    } catch (_) {
      throw new Error('商品排行“全部商品”或“日”切换控件未就绪（可见数/总数：' + sycmProductDiagnostics(document, visible) + '）。请确认页面已登录并加载');
    }
    if (!controls.tab.classList.contains('oui-tab-switch-item-active')) controls.tab.click();
    if (!controls.day.classList.contains('ant-btn-primary')) controls.day.click();
    await sleep(500);
    if (!sycmProductReady(document, visible, range.end)) {
      controls.day.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await sleep(500);
      let cell = sycmFindDateCell(document, range.end, visible);
      if (!cell) {
        controls.day.click();
        await sleep(500);
        cell = sycmFindDateCell(document, range.end, visible);
      }
      if (!cell) {
        const previous = [...document.querySelectorAll('.ant-calendar-prev-month-btn, button.next-calendar-btn-prev-month')].filter(visible);
        if (previous.length === 1 && !previous[0].disabled && previous[0].getAttribute('aria-disabled') !== 'true') {
          previous[0].click();
          await sleep(500);
          cell = sycmFindDateCell(document, range.end, visible);
        }
      }
      if (!cell) throw new Error('无法唯一定位商品日历中的日期：' + range.end);
      cell.click();
    }
    await waitFor(() => sycmProductReady(document, visible, range.end), '商品全部商品、日和目标日期 ' + range.end);
    await sleep(1500);
    if (!sycmProductReady(document, visible, range.end)) throw new Error('商品筛选状态发生变化');
    let download;
    try {
      download = await waitFor(() => sycmProductControls(document, visible).download, '选择“日”后出现的商品下载按钮');
    } catch (_) {
      throw new Error('已选择“全部商品”和“日”并确认目标日期，但未找到下载按钮（可见数/总数：' + sycmProductDiagnostics(document, visible) + '）');
    }
    await armAndClick('商品', range.end, download);
  }
  async function traffic(range) {
    await sycmEnsureTrafficDate(async () => {
      try { return !!await waitFor(() => sycmTrafficReady(document, location.href, range.end), '店铺来源目标日期', 8000); }
      catch (_) { return false; }
    }, async () => {
    const day = await waitFor(() => oneText('button,a,[role="button"],[role="tab"]', '日'), '店铺来源“日”切换控件');
    await sycmSelectSingleDate({
      date: range.end,
      open: async () => {
        day.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        await sleep(500);
        if (![...document.querySelectorAll('td[title]')].some(visible)) {
          day.click();
          await sleep(500);
        }
      },
      find: date => sycmFindDateCell(document, date, visible),
      previous: () => {
        const buttons = [...document.querySelectorAll('.ant-calendar-prev-month-btn, button.next-calendar-btn-prev-month')].filter(visible);
        if (buttons.length !== 1 || buttons[0].disabled || buttons[0].getAttribute('aria-disabled') === 'true') return false;
        buttons[0].click();
        return true;
      },
      wait: () => sleep(500)
    });
    });
    await waitFor(() => sycmTrafficReady(document, location.href, range.end), '店铺来源“日”和目标日期 ' + range.end);
    await sleep(1500);
    if (!sycmTrafficReady(document, location.href, range.end)) throw new Error('店铺来源日期发生变化');
    const button = await waitFor(() => sycmTrafficDownload(document, visible), '指标选择右侧的表格下载按钮');
    button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    button.click();
    const excel = await waitFor(() => oneText('button,a,[role="menuitem"],li,div,span', '下载Excel'), '下载Excel菜单');
    if (!sycmTrafficReady(document, location.href, range.end)) throw new Error('店铺来源日期发生变化');
    await armAndClick('店铺来源', range.end, excel);
  }
  async function search(range) {
    await waitFor(() => sycmSearchReady(document, location.href, range, visible), '搜索词分析“7天”、日期范围及引流搜索关键词');
    await sleep(1500);
    const button = await waitFor(() => sycmSearchDownload(document, visible, range), '搜索词分析下载按钮');
    if (!sycmSearchReady(document, location.href, range, visible)) throw new Error('搜索词分析日期或页面发生变化');
    await armAndClick('搜索词分析', range.end, button);
  }
  function contentRange() {
    const m = (document.body?.innerText || '').match(/数据时间范围\s*[:：]?\s*(\d{4}[-./]\d{1,2}[-./]\d{1,2})\s*[-~～至]\s*(\d{4}[-./]\d{1,2}[-./]\d{1,2})/);
    const fmt = s => s.replace(/[./]/g, '-').split('-').map((v, i) => i ? v.padStart(2, '0') : v).join('-');
    return m ? { start: fmt(m[1]), end: fmt(m[2]) } : null;
  }
  function contentDownload() {
    const labels = [...document.querySelectorAll('button,a,[role="button"]')].filter(e => visible(e) && text(e) === '下载');
    if (labels.length === 1) return labels[0];
    if (labels.length > 1) return null;
    const anchor = oneText('button,a,[role="button"],div,span', '展开更多指标');
    if (!anchor) return null;
    const a = anchor.getBoundingClientRect();
    const icons = [...document.querySelectorAll('svg,i,img,[class*="icon"]')].filter(el => {
      if (!visible(el) || anchor.contains(el)) return false;
      const r = el.getBoundingClientRect();
      return r.width <= 48 && r.height <= 48 && r.left >= a.right && r.left - a.right <= 80 && Math.abs((r.top + r.height / 2) - (a.top + a.height / 2)) <= 20;
    });
    const roots = icons.filter(el => !icons.some(other => other !== el && other.contains(el)));
    return roots.length === 1 ? roots[0] : null;
  }
  async function content(range) {
    const tab = await waitFor(() => oneText('button,a,[role="tab"],div,span', '作品分析'), '作品分析');
    tab.click();
    const custom = await waitFor(() => oneText('button,a,[role="button"],div,span', '自定义'), '自定义日期');
    await sycmOpenRangeCalendar({
      hover: () => {
        custom.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        custom.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
      },
      click: () => custom.click(),
      getCalendar: () => sycmRangeCalendar(document, visible),
      wait: () => sleep(500)
    });
    await waitFor(() => sycmRangeCalendar(document, visible), '自定义范围日历');
    const dateTrace = [];
    const traceDate = date => {
      const inputs = [...document.querySelectorAll('input[placeholder="YYYY-MM-DD"]')].filter(visible);
      const values = inputs.map(el => el.value || '空').join(' / ');
      const active = inputs.indexOf(document.activeElement);
      dateTrace.push(date + '后：' + (values || '无日期框') + '，焦点=' + (active < 0 ? '其他' : String(active + 1)));
    };
    try {
    await sycmSelectRange({ start: range.start, end: range.end, onStep: traceDate, focusEnd: calendar => sycmFocusEndDate(document, calendar, range.start, visible), getCalendar: () => sycmRangeCalendar(document, visible),
      movePreviousMonth: calendar => sycmPreviousMonth(calendar, visible), waitForUpdate: () => sleep(400),
      readRange: async () => {
        const inputs = [...document.querySelectorAll('.next-range-picker')].filter(visible).map(el => ({
          start: el.querySelector('input[placeholder="起始日期"]')?.value,
          end: el.querySelector('input[placeholder="结束日期"]')?.value
        }));
        const matching = inputs.filter(item => item.start === range.start && item.end === range.end);
        const inputRange = matching.length === 1 ? matching[0] : inputs.length === 1 ? inputs[0] : null;
        if (inputRange && inputRange.start === range.start && inputRange.end === range.end) return inputRange;
        try {
          return await waitFor(() => {
            const displayed = contentRange();
            return displayed && displayed.start === range.start && displayed.end === range.end ? displayed : null;
          }, '内容页面日期刷新', 8000);
        } catch (_) {
          return inputRange || contentRange();
        }
      }, isVisible: visible });
    } catch (error) {
      throw new Error(error.message + '；选择过程：' + (dateTrace.join('；') || '尚未选择日期'));
    }
    await waitFor(() => { const r = contentRange(); return r && r.start === range.start && r.end === range.end; }, '内容日期刷新');
    await sleep(1500);
    const button = await waitFor(contentDownload, '内容下载按钮');
    await armAndClick('内容', range.end, button);
  }
  (async () => {
    for (let i = 0; i < 60; i++) {
      const job = await chrome.runtime.sendMessage({ action: 'claimWorkflow' });
      if (job?.ok) {
        try { await (job.stage === 'product' ? product(job.range) : job.stage === 'traffic' ? traffic(job.range) : job.stage === 'search' ? search(job.range) : content(job.range)); }
        catch (error) { await chrome.runtime.sendMessage({ action: 'workflowError', error: error.message }); }
        return;
      }
      await sleep(1000);
    }
  })().catch(error => console.error('[生意参谋流程]', error));
})();
