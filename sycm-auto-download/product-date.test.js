const assert = require('node:assert/strict');
const { sycmFindDateCell } = require('./calendar');

const cell = {
  className: 'oui-dt-calendar-day-0 current-month focused-element',
  getAttribute(name) { return { 'data-role': 'date', 'data-value': '2026-11-23' }[name] ?? null; }
};
const doc = { querySelectorAll(selector) {
  return selector.split(',').some(s => s.trim() === 'td[data-role="date"][data-value]') ? [cell] : [];
} };
assert.equal(sycmFindDateCell(doc, '2026-11-23', () => true), cell);
console.log('商品日期单元格定位验证通过');
