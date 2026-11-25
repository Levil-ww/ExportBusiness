const assert = require('node:assert/strict');
const { sycmSelectSingleDate } = require('./calendar');
(async () => {
  let selected = false;
  await sycmSelectSingleDate({ date: '2026-11-18', open: async () => {}, find: () => ({ click: () => { selected = true; } }), previous: () => false, wait: async () => {} });
  assert.equal(selected, true);
  await assert.rejects(sycmSelectSingleDate({ date: '2026-11-18', open: async () => {}, find: () => null, previous: () => false, wait: async () => {} }), /无法唯一定位/);
  console.log('单日日期选择验证通过');
})().catch(error => { console.error(error); process.exitCode = 1; });
