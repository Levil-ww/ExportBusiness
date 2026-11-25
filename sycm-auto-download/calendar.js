// 按日期标识定位一个可见且可选的日期格；存在歧义时拒绝选择。
function sycmFindDateCell(root, date, isVisible) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日期格式应为 YYYY-MM-DD');
  const cells = [...root.querySelectorAll('td[title], td[data-role="date"][data-value]')].filter(el => {
    if (el.getAttribute('title') !== date && el.getAttribute('data-value') !== date) return false;
    if (!isVisible(el)) return false;
    if (el.getAttribute('aria-disabled') === 'true' || el.disabled) return false;
    return !/(^|[\s_-])disabled([\s_-]|$)/i.test(String(el.className || ''));
  });
  if (cells.length === 1) return cells[0];
  const inMonth = cells.filter(el => !/next-calendar-cell-(prev|next)-month/.test(String(el.className || '')));
  return inMonth.length === 1 ? inMonth[0] : null;
}

// 作品分析页存在单日/周日历和范围日历，必须只操作范围日历。
function sycmRangeCalendar(doc, isVisible) {
  const calendars = [...doc.querySelectorAll('.next-calendar.next-calendar-range')].filter(isVisible);
  return calendars.length === 1 ? calendars[0] : null;
}

async function sycmOpenRangeCalendar({ hover, click, getCalendar, wait }) {
  if (getCalendar()) return getCalendar();
  hover();
  await wait();
  if (getCalendar()) return getCalendar();
  click();
  await wait();
  return getCalendar();
}

function sycmPreviousMonth(calendar, isVisible) {
  const buttons = [...calendar.querySelectorAll('button.next-calendar-btn-prev-month')].filter(isVisible);
  if (buttons.length !== 1 || buttons[0].disabled || buttons[0].getAttribute('aria-disabled') === 'true') return false;
  buttons[0].click();
  return true;
}

// 日期弹层上方有两个独立输入框，按日历位置及已选起始日期识别。
function sycmFocusEndDate(doc, calendar, start, isVisible) {
  if (!calendar) return false;
  const c = calendar.getBoundingClientRect();
  const inputs = [...doc.querySelectorAll('input[placeholder="YYYY-MM-DD"]')].filter(el => {
    if (!isVisible(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const r = el.getBoundingClientRect();
    return r.left >= c.left && r.right <= c.right && r.bottom <= c.top && c.top - r.bottom <= 80;
  }).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
  if (inputs.length !== 2 || inputs[0].value !== start) return false;
  if (doc.activeElement !== inputs[1]) {
    inputs[1].focus();
  }
  return doc.activeElement === inputs[1];
}

// 不推测日历控件的状态：调用方必须提供当前弹层、月份切换及刷新等待。
async function sycmSelectRange({ start, end, getCalendar, movePreviousMonth, waitForUpdate, readRange, isVisible, onStep, focusEnd }) {
  if (start > end) throw new Error('开始日期晚于结束日期');
  for (const [index, date] of [start, end].entries()) {
    if (index === 1 && focusEnd) {
      if (!focusEnd(getCalendar())) throw new Error('无法定位或聚焦结束日期输入框');
      await waitForUpdate();
      if (onStep) onStep('切换结束日期');
    }
    let cell = null;
    for (let attempts = 0; attempts < 4; attempts++) {
      const calendar = getCalendar();
      if (!calendar) throw new Error('未找到展开的日期日历');
      cell = sycmFindDateCell(calendar, date, isVisible);
      if (cell) break;
      if (attempts === 3 || !movePreviousMonth(calendar)) break;
      await waitForUpdate();
    }
    if (!cell) throw new Error('无法唯一定位可选日期：' + date);
    cell.click();
    await waitForUpdate();
    if (onStep) onStep(date);
  }
  const selected = await readRange();
  if (!selected || selected.start !== start || selected.end !== end) {
    const actual = selected ? (selected.start || '空') + ' 至 ' + (selected.end || '空') : '无法读取唯一可见的日期输入框';
    throw new Error('日期选择结果与目标范围不一致；目标：' + start + ' 至 ' + end + '；实际：' + actual);
  }
  return selected;
}
async function sycmSelectSingleDate({ date, open, find, previous, wait }) {
  await open();
  let cell = find(date);
  if (!cell && previous()) {
    await wait();
    cell = find(date);
  }
  if (!cell) throw new Error('无法唯一定位可选日期：' + date);
  cell.click();
  await wait();
}

if (typeof module !== 'undefined') module.exports = { sycmOpenRangeCalendar, sycmFindDateCell, sycmSelectRange, sycmRangeCalendar, sycmPreviousMonth, sycmFocusEndDate, sycmSelectSingleDate };
