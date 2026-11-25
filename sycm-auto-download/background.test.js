const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function scenario(paths, expected, existing = [], actualSchedule = null) {
  const data = { ...paths };
  let listener;
  const urls = [];
  const chrome = {
    storage: { local: {
      get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, data[k]])),
      set: async values => Object.assign(data, values),
      remove: async key => { delete data[key]; }
    } },
    runtime: { onMessage: { addListener: fn => { listener = fn; } }, sendNativeMessage: async (host, message) => message.action === 'check_existing' ? ({ paths: message.jobs.map(job => existing.includes(job.stage + ':' + job.end) ? 'existing.xls' : null) }) : ({ path: 'saved', sourceRemoved: true }) },
    tabs: { create: async () => ({ id: 1 }), update: async (id, options) => { urls.push(options.url); } },
    alarms: { create: async () => {}, clear: async () => {}, onAlarm: { addListener() {} } },
    downloads: { onCreated: { addListener() {} }, onChanged: { addListener() {} } }
  };
  const context = vm.createContext({ chrome, URL, Date, console, importScripts() {}, sycmSchedule: () => actualSchedule || ({
    dailyDates: ['2026-11-28', '2026-11-29'], product: { start: '2026-11-29', end: '2026-11-29' }, traffic: { start: '2026-11-29', end: '2026-11-29' },
    productDays: [{ start: '2026-11-28', end: '2026-11-28' }, { start: '2026-11-29', end: '2026-11-29' }],
    trafficDays: [{ start: '2026-11-28', end: '2026-11-28' }, { start: '2026-11-29', end: '2026-11-29' }],
    search: { start: '2026-11-23', end: '2026-11-29' }, content: { start: '2026-11-26', end: '2026-11-29' }
  }) });
  vm.runInContext(fs.readFileSync(require.resolve('./background.js'), 'utf8'), context);
  const response = await new Promise(resolve => listener({ action: 'startWorkflow' }, {}, resolve));
  assert.equal(response.ok, true, response.error);
  const stages = [];
  while (data.workflowRun.stage !== 'complete') {
    const stage = data.workflowRun.stage;
    stages.push(stage + ':' + data.workflowRun.schedule[stage].end);
    await context.archive({ filename: 'download.csv' }, { module: { product: '商品', traffic: '店铺来源', search: '搜索词分析', content: '内容' }[stage], endDate: data.workflowRun.schedule[stage].end, root: 'root' });
  }
  assert.deepEqual(stages, expected);
  assert.equal(urls.length, expected.length);
  assert.equal(data.archiveHistory.filter(item => item.outcome === 'skipped').length, existing.length);
}

(async () => {
  await scenario({ productRootPath: 'p', trafficRootPath: 't', contentRootPath: 'c' }, ['product:2026-11-28', 'product:2026-11-29', 'traffic:2026-11-28', 'traffic:2026-11-29', 'content:2026-11-29']);
  await scenario({ searchRootPath: 's' }, ['search:2026-11-29']);
  await scenario({ productRootPath: 'p', trafficRootPath: 't' }, ['product:2026-11-28', 'traffic:2026-11-28', 'traffic:2026-11-29'], ['product:2026-11-29']);
  await scenario({ productRootPath: 'p', trafficRootPath: 't' }, ['product:2026-11-23', 'traffic:2026-11-23'], ['product:2026-11-24', 'traffic:2026-11-24'], require('./schedule').sycmSchedule(new Date('2026-11-25T07:00:00Z')));
  await scenario({ searchRootPath: 's' }, [], ['search:2026-11-29']);
  await scenario({ trafficRootPath: 't' }, ['traffic:2026-11-28', 'traffic:2026-11-29']);
  await scenario({ contentRootPath: 'c' }, ['content:2026-11-29']);
  await scenario({ productRootPath: 'p', trafficRootPath: 't', searchRootPath: 's', contentRootPath: 'c' }, ['product:2026-11-28', 'product:2026-11-29', 'traffic:2026-11-28', 'traffic:2026-11-29', 'search:2026-11-29', 'content:2026-11-29']);
  console.log('目录选择流程验证通过');
})().catch(error => { console.error(error); process.exitCode = 1; });
