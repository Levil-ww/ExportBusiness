const assert = require('node:assert/strict');
const { sycmSchedule } = require('./schedule');
const run = date => sycmSchedule(new Date(date + 'T07:00:00Z')).search;
assert.deepEqual(run('2026-11-23'), { start: '2026-11-16', end: '2026-11-22' });
assert.deepEqual(run('2026-11-26'), { start: '2026-11-19', end: '2026-11-25' });
assert.deepEqual(run('2027-01-04'), { start: '2026-12-28', end: '2027-01-03' });
for (const date of ['2026-11-24', '2026-11-25', '2026-11-27', '2026-11-28', '2026-11-29']) assert.equal(run(date), null);
console.log('搜索词周期验证通过');
