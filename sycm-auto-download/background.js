importScripts('schedule.js');
// 同时只允许一个待归档任务；只认来自对应站点的下载。
let queue = Promise.resolve();
const serial = fn => { const result = queue.then(fn); queue = result.catch(error => console.error('[生意参谋归档]', error)); return result; };
const storage = chrome.storage.local;
const HOST = 'com.sycm.folder_picker';
async function status(message) { await storage.set({ archiveStatus: message }); }
const stages = ['product', 'traffic', 'search', 'content'];
const stageNames = { product: '商品排行', traffic: '店铺来源', search: '搜索词分析', content: '内容作品分析' };
function stageUrl(stage, schedule) {
  if (stage === 'product') return 'https://sycm.taobao.com/cc/item_rank';
  if (stage === 'content') return 'https://sycm.taobao.com/xsite/contentanalysis/overview_new_v2';
  const traffic = stage === 'traffic';
  const url = new URL(traffic ? 'https://sycm.taobao.com/flow/monitor/shopsource/construction' : 'https://sycm.taobao.com/flow/monitor/keyword_assistant');
  url.searchParams.set('dateRange', schedule[stage].start + '|' + schedule[stage].end);
  url.searchParams.set('dateType', traffic ? 'day' : 'recent7');
  if (traffic) url.searchParams.set('activeKey', 'item');
  else url.searchParams.set('device', '2');
  return url.href;
}
async function recordArchive(job, outcome, message, path = '') {
  const { archiveHistory } = await storage.get('archiveHistory');
  const history = Array.isArray(archiveHistory) ? archiveHistory : [];
  history.push({ module: job.module, endDate: job.endDate, outcome, message, path, timestamp: new Date().toISOString() });
  await storage.set({ archiveHistory: history });
}
function belongs(item, module) {
  const allowed = module === '商品' || module === '店铺来源' || module === '搜索词分析' ? ['sycm.taobao.com'] : ['web.taobao.com'];
  return [item.referrer, item.url, item.finalUrl].filter(Boolean).some(value => {
    try {
      const u = new URL(value);
      const host = u.protocol === 'blob:' ? new URL(u.pathname).hostname : u.hostname;
      return allowed.includes(host);
    } catch (_) { return false; }
  });
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'stopWorkflow') {
    serial(async () => {
      const { workflowRun: run } = await storage.get('workflowRun');
      if (run && ['product', 'traffic', 'search', 'content'].includes(run.stage)) {
        run.stage = 'failed';
        await storage.set({ workflowRun: run, archiveStatus: '流程已停止；未归档的下载文件保留在浏览器下载目录' });
        await storage.remove('pendingArchive');
        await chrome.alarms.clear('sycm-workflow-timeout');
      }
      return { ok: true };
    }).then(sendResponse, error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.action === 'startContentCheck') {
    (async () => {
      const data = await storage.get(['workflowRun', 'contentRootPath']);
      if (data.workflowRun && ['product', 'traffic', 'search', 'content'].includes(data.workflowRun.stage)) throw new Error('已有流程正在运行，请先停止当前流程');
      if (!data.contentRootPath) throw new Error('请先设置内容根目录');
      const today = sycmSchedule().today;
      const date = new Date(today + 'T00:00:00Z');
      const day = offset => new Date(date.getTime() + offset * 86400000).toISOString().slice(0, 10);
      const range = { start: day(-3), end: day(-2) };
      const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
      await storage.set({ archiveHistory: [], workflowRun: { tabId: tab.id, stage: 'content', claimed: false, schedule: { content: range } }, archiveStatus: '正在准备内容下载验证' });
      await chrome.tabs.update(tab.id, { url: 'https://sycm.taobao.com/xsite/contentanalysis/overview_new_v2' });
      await chrome.alarms.create('sycm-workflow-timeout', { delayInMinutes: 3 });
      return { ok: true };
    })().then(sendResponse, error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.action === 'startSearchCheck') {
    (async () => {
      const data = await storage.get(['workflowRun', 'searchRootPath']);
      if (data.workflowRun && ['product', 'traffic', 'search', 'content'].includes(data.workflowRun.stage)) throw new Error('已有流程正在运行，请先停止当前流程');
      if (!data.searchRootPath) throw new Error('请先设置搜索词分析根目录');
      const today = sycmSchedule().today;
      const date = new Date(today + 'T00:00:00Z');
      const day = offset => new Date(date.getTime() + offset * 86400000).toISOString().slice(0, 10);
      const range = { start: day(-7), end: day(-1) };
      const url = new URL('https://sycm.taobao.com/flow/monitor/keyword_assistant');
      url.searchParams.set('dateRange', range.start + '|' + range.end);
      url.searchParams.set('dateType', 'recent7');
      url.searchParams.set('device', '2');
      const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
      await storage.set({ archiveHistory: [], workflowRun: { tabId: tab.id, stage: 'search', claimed: false, schedule: { search: range, content: null } }, archiveStatus: '正在准备搜索词分析验证' });
      await chrome.tabs.update(tab.id, { url: url.href });
      await chrome.alarms.create('sycm-workflow-timeout', { delayInMinutes: 3 });
      return { ok: true };
    })().then(sendResponse, error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.action === 'startWorkflow') {
    (async () => {
      const data = await storage.get(['workflowRun', 'productRootPath', 'trafficRootPath', 'searchRootPath', 'contentRootPath']);
      if (data.workflowRun && ['product', 'traffic', 'search', 'content'].includes(data.workflowRun.stage)) throw new Error('已有流程正在运行，请查看目录与状态；如需重新开始，请先停止当前流程');
      const schedule = sycmSchedule();
      if (!stages.some(stage => data[stage + 'RootPath'])) throw new Error('请先至少选择一个下载目录');
      for (const stage of stages) if (!data[stage + 'RootPath']) schedule[stage] = null;
      const first = stages.find(stage => schedule[stage]);
      if (!first) throw new Error('已选择的下载项目今天没有任务；搜索词分析和光合数据在周一和周四下载');
      const candidates = stages.flatMap(stage => !schedule[stage] ? [] :
        (stage === 'product' || stage === 'traffic' ? schedule.dailyDates.map(date => ({ stage, range: { start: date, end: date } })) : [{ stage, range: schedule[stage] }]));
      const checked = await chrome.runtime.sendNativeMessage(HOST, { action: 'check_existing', jobs: candidates.map(job => ({ stage: job.stage, root: data[job.stage + 'RootPath'], start: job.range.start, end: job.range.end })) });
      if (!checked || checked.error || !Array.isArray(checked.paths) || checked.paths.length !== candidates.length) throw new Error(checked?.error || '本地辅助程序不支持下载前检查，请重新安装最新版辅助程序');
      const history = [];
      const jobs = candidates.filter((job, index) => {
        const path = checked.paths[index];
        if (!path) return true;
        history.push({ module: stageNames[job.stage], endDate: job.range.end, outcome: 'skipped', message: '已有相同日期范围的文件，跳过下载', path, timestamp: new Date().toISOString() });
        return false;
      });
      if (!jobs.length) {
        await storage.set({ archiveHistory: history, workflowRun: { stage: 'complete' }, archiveStatus: '所选项目的文件均已存在，无需下载' });
        return { ok: true, allSkipped: true };
      }
      const firstJob = jobs[0];
      schedule[firstJob.stage] = firstJob.range;
      const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
      await storage.set({ archiveHistory: history, workflowRun: { tabId: tab.id, stage: firstJob.stage, claimed: false, schedule, jobs, jobIndex: 0 }, archiveStatus: '正在准备' + stageNames[firstJob.stage] + ' ' + firstJob.range.end });
      await chrome.tabs.update(tab.id, { url: stageUrl(firstJob.stage, schedule) });
      await chrome.alarms.create('sycm-workflow-timeout', { delayInMinutes: 3 });
      return { ok: true };
    })().then(sendResponse, error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.action === 'claimWorkflow') {
    (async () => {
      const { workflowRun: run } = await storage.get('workflowRun');
      if (!run || run.claimed || !sender.tab || sender.tab.id !== run.tabId) return { ok: false };
      const url = new URL(sender.url);
      const matches = run.stage === 'product' ? sender.frameId === 0 && url.hostname === 'sycm.taobao.com' && url.pathname === '/cc/item_rank' :
        run.stage === 'traffic' ? sender.frameId === 0 && url.hostname === 'sycm.taobao.com' && url.pathname === '/flow/monitor/shopsource/construction' :
        run.stage === 'search' ? sender.frameId === 0 && url.hostname === 'sycm.taobao.com' && url.pathname === '/flow/monitor/keyword_assistant' :
        run.stage === 'content' && url.hostname === 'web.taobao.com' && url.pathname === '/s-guanghe-creator/asset-overview';
      if (!matches) return { ok: false };
      run.claimed = true;
      const stageName = { product: '商品', traffic: '店铺来源', search: '搜索词分析', content: '内容' }[run.stage];
      await storage.set({ workflowRun: run, archiveStatus: '已进入' + stageName + '页面，正在核对筛选条件' });
      return { ok: true, stage: run.stage, range: run.schedule[run.stage] };
    })().then(sendResponse, error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.action === 'workflowError') {
    (async () => {
      const { workflowRun: run } = await storage.get('workflowRun');
      if (run && sender.tab && sender.tab.id === run.tabId && ['product', 'traffic', 'search', 'content'].includes(run.stage)) {
        run.stage = 'failed'; await storage.set({ workflowRun: run, archiveStatus: '流程停止：' + String(message.error || '未知错误') });
        await storage.remove('pendingArchive'); await chrome.alarms.clear('sycm-workflow-timeout');
      }
    })().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.action !== 'prepareArchive') return;
  (async () => {
    const module = message.module, endDate = message.endDate;
    if (!['商品', '店铺来源', '搜索词分析', '内容'].includes(module) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || '')) throw new Error('归档类型或日期无效');
    const senderUrl = new URL(sender.url);
    if (senderUrl.protocol !== 'https:' || !(((module === '商品' || module === '店铺来源' || module === '搜索词分析') && senderUrl.hostname === 'sycm.taobao.com') ||
      (module === '内容' && senderUrl.hostname === 'web.taobao.com' && senderUrl.pathname === '/s-guanghe-creator/asset-overview'))) throw new Error('页面来源不匹配');
    const data = await storage.get(['productRootPath', 'trafficRootPath', 'searchRootPath', 'contentRootPath', 'pendingArchive', 'workflowRun']);
    const run = data.workflowRun;
    if (!run || !sender.tab || sender.tab.id !== run.tabId || run.stage !== (module === '商品' ? 'product' : module === '店铺来源' ? 'traffic' : module === '搜索词分析' ? 'search' : 'content') ||
        !run.schedule[run.stage] || run.schedule[run.stage].end !== endDate) throw new Error('下载不属于当前流程');
    if (data.pendingArchive && Date.now() - data.pendingArchive.started < 120000) throw new Error('已有下载任务正在等待，请稍后重试');
    const root = module === '商品' ? data.productRootPath : module === '店铺来源' ? data.trafficRootPath : module === '搜索词分析' ? data.searchRootPath : data.contentRootPath;
    if (!root) throw new Error('请先设置' + module + '根目录');
    await storage.set({ pendingArchive: { module, endDate, root, started: Date.now(), downloadId: null }, archiveStatus: '等待' + module + '下载开始' });
    return { ok: true };
  })().then(sendResponse, error => sendResponse({ ok: false, error: error.message }));
  return true;
});
chrome.downloads.onCreated.addListener(item => serial(async () => {
  const { pendingArchive: job } = await storage.get('pendingArchive');
  if (!job || job.downloadId != null || Date.now() - job.started > 120000 || !belongs(item, job.module)) return;
  job.downloadId = item.id;
  await storage.set({ pendingArchive: job, archiveStatus: job.module + '下载中' });
  // 下载可能在监听事件处理期间已经完成。
  const [current] = await chrome.downloads.search({ id: item.id });
  if (current && current.state === 'complete') await archive(current, job);
}));
chrome.downloads.onChanged.addListener(delta => serial(async () => {
  const { pendingArchive: job } = await storage.get('pendingArchive');
  if (!job || job.downloadId !== delta.id || !delta.state) return;
  if (delta.state.current === 'interrupted') { await storage.remove('pendingArchive'); await status(job.module + '下载中断'); await recordArchive(job, 'failed', '下载中断'); return; }
  if (delta.state.current !== 'complete') return;
  const [item] = await chrome.downloads.search({ id: delta.id });
  if (item) await archive(item, job);
}));
async function archive(item, job) {
  let successful = false;
  let archivedPath = '';
  try {
    const response = await chrome.runtime.sendNativeMessage(HOST, { action: 'archive_file', source: item.filename, root: job.root, endDate: job.endDate });
    if (!response || response.error || !response.path) throw new Error(response?.error || '辅助程序未返回保存路径');
    archivedPath = response.path;
    const action = response.deduplicated ? '内容与已有文件相同，已去重' : '归档完成';
    const message = response.sourceRemoved
      ? action + '；已删除默认下载目录中的原文件'
      : action + '；原文件未删除：' + (response.warning || '未知原因');
    await status(message + '：' + response.path);
    successful = true;
    try { await recordArchive(job, 'success', message, response.path); }
    catch (error) { await status('文件已归档，但下载记录保存失败：' + error.message + '；保存位置：' + response.path); }
  } catch (error) {
    const message = '归档失败：' + error.message + '；原文件保留在默认下载目录';
    await status(message);
    if (!successful) await recordArchive(job, 'failed', message);
  }
  finally { await storage.remove('pendingArchive'); }
  const { workflowRun: run } = await storage.get('workflowRun');
  if (!run || !['product', 'traffic', 'search', 'content'].includes(run.stage)) return;
  if (!successful) { run.stage = 'failed'; await storage.set({ workflowRun: run }); await chrome.alarms.clear('sycm-workflow-timeout'); return; }
  const days = !run.jobs && run.schedule[run.stage + 'Days'];
  const index = (run.dailyIndex || 0) + 1;
  if (days && index < days.length) {
    run.dailyIndex = index;
    run.schedule[run.stage] = days[index];
    run.claimed = false;
    await storage.set({ workflowRun: run, archiveStatus: '正在准备' + stageNames[run.stage] + ' ' + days[index].end });
    await chrome.tabs.update(run.tabId, { url: stageUrl(run.stage, run.schedule) });
    await chrome.alarms.create('sycm-workflow-timeout', { delayInMinutes: 3 });
    return;
  }
  run.dailyIndex = 0;
  const nextJob = run.jobs && run.jobs[run.jobIndex + 1];
  const next = run.jobs ? nextJob?.stage : stages.slice(stages.indexOf(run.stage) + 1).find(stage => run.schedule[stage]);
  if (next) {
    if (nextJob) { run.jobIndex++; run.schedule[next] = nextJob.range; }
    run.stage = next; run.claimed = false;
    await storage.set({ workflowRun: run, archiveStatus: job.module + ' ' + job.endDate + '已归档，正在准备' + stageNames[next] + ' ' + run.schedule[next].end });
    await chrome.tabs.update(run.tabId, { url: stageUrl(next, run.schedule) });
    await chrome.alarms.create('sycm-workflow-timeout', { delayInMinutes: 3 });
  } else {
    run.stage = 'complete';
    await storage.set({ workflowRun: run, archiveStatus: '流程完成：' + archivedPath });
    await chrome.alarms.clear('sycm-workflow-timeout');
  }
}
chrome.alarms.onAlarm.addListener(alarm => serial(async () => {
  if (alarm.name !== 'sycm-workflow-timeout') return;
  const { workflowRun: run, archiveStatus: previous } = await storage.get(['workflowRun', 'archiveStatus']);
  if (!run || !['product', 'traffic', 'search', 'content'].includes(run.stage)) return;
  const stageName = { product: '商品', traffic: '店铺来源', search: '搜索词分析', content: '内容' }[run.stage];
  run.stage = 'failed';
  await storage.set({ workflowRun: run, archiveStatus: stageName + '流程超时；超时前状态：' + (previous || '未知') });
  await storage.remove('pendingArchive');
}));
