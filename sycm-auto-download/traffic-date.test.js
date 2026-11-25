const assert = require('node:assert/strict');
const { sycmEnsureTrafficDate } = require('./traffic');
(async () => {
  let selected = 0;
  await sycmEnsureTrafficDate(() => true, async () => { selected++; });
  assert.equal(selected, 0);
  await sycmEnsureTrafficDate(() => false, async () => { selected++; });
  assert.equal(selected, 1);
  console.log('店铺来源日期准备验证通过');
})().catch(e => { console.error(e); process.exitCode = 1; });
