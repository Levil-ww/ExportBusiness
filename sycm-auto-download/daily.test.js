const assert = require('node:assert/strict');
const { sycmSchedule } = require('./schedule');
const schedule = d => sycmSchedule(new Date(d + 'T07:00:00Z'));
const days = (s, module) => s[module + 'Days'].map(r => r.end);
for (const module of ['product', 'traffic']) {
  assert.deepEqual(days(schedule('2026-11-19'), module), ['2026-11-16', '2026-11-17', '2026-11-18']);
  assert.deepEqual(days(schedule('2026-11-23'), module), ['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
  assert.deepEqual(days(schedule('2027-01-04'), module), ['2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
  assert.deepEqual(days(schedule('2026-11-20'), module), ['2026-11-19']);
}
console.log('逐日下载计划通过');
