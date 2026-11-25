document.getElementById('extension-id').textContent = '扩展 ID：' + chrome.runtime.id;
document.getElementById('extension-version').textContent = '扩展版本：' + chrome.runtime.getManifest().version;
const archiveStatus = document.getElementById('archive-status');
const historyList = document.getElementById('archive-history');
const historyEmpty = document.getElementById('archive-history-empty');
function renderHistory(records) {
  historyList.replaceChildren();
  const history = Array.isArray(records) ? records : [];
  historyEmpty.hidden = history.length > 0;
  for (const record of [...history].reverse()) {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = record.module + ' · 数据截止 ' + record.endDate;
    const details = document.createElement('span');
    const time = new Date(record.timestamp);
    details.textContent = (Number.isNaN(time.getTime()) ? record.timestamp : time.toLocaleString()) + ' · ' + record.message;
    item.append(title, details);
    if (record.path) {
      const path = document.createElement('span');
      path.textContent = '保存位置：' + record.path;
      item.append(path);
    }
    historyList.append(item);
  }
}
chrome.storage.local.get(['archiveStatus', 'archiveHistory']).then(data => {
  archiveStatus.textContent = data.archiveStatus || '尚无当前流程状态。';
  renderHistory(data.archiveHistory);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.archiveStatus) archiveStatus.textContent = changes.archiveStatus.newValue || '尚无当前流程状态。';
  if (changes.archiveHistory) renderHistory(changes.archiveHistory.newValue);
});
document.getElementById('finish').addEventListener('click', async () => {
  const current = await chrome.tabs.getCurrent();
  if (current && current.openerTabId != null) {
    try { await chrome.tabs.update(current.openerTabId, { active: true }); return; } catch (_) {}
  }
  await chrome.tabs.create({ url: 'https://sycm.taobao.com/portal/home.htm' });
});
for (const [kind, id] of [['商品排行', 'product'], ['店铺来源', 'traffic'], ['流量搜索词分析', 'search'], ['内容作品-光合数据', 'content']]) {
  const status = document.getElementById(id + '-status');
  const key = id + 'RootPath';
  async function showRoot() {
    const stored = await chrome.storage.local.get(key);
    status.textContent = stored[key] ? kind + '根目录：' + stored[key] : '未选择，不会下载此项。';
    document.getElementById('clear-' + id).disabled = !stored[key];
  }
  async function ensureIdle() {
    const { workflowRun } = await chrome.storage.local.get('workflowRun');
    if (workflowRun && ['product', 'traffic', 'search', 'content'].includes(workflowRun.stage)) throw new Error('请先停止当前下载流程，再修改目录');
  }
  document.getElementById('choose-' + id).addEventListener('click', async () => {
    try {
      await ensureIdle();
      const response = await chrome.runtime.sendNativeMessage('com.sycm.folder_picker', { action: 'select_folder' });
      if (response.error) throw new Error(response.error);
      if (response.path) { await ensureIdle(); await chrome.storage.local.set({ [key]: response.path }); await showRoot(); }
    } catch (error) {
      status.textContent = '无法修改目录：' + error.message;
    }
  });
  document.getElementById('clear-' + id).addEventListener('click', async () => {
    try { await ensureIdle(); await chrome.storage.local.remove(key); await showRoot(); }
    catch (error) { status.textContent = '无法清除目录：' + error.message; }
  });
  showRoot().catch(error => { status.textContent = '读取目录失败：' + error.message; });
}
