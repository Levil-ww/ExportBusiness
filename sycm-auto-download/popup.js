document.getElementById('open-settings').addEventListener('click', async () => {
  const [source] = await chrome.tabs.query({ active: true, currentWindow: true });
  const options = { url: chrome.runtime.getURL('settings.html') };
  if (source && source.id != null) options.openerTabId = source.id;
  await chrome.tabs.create(options);
  window.close();
});
document.getElementById('start').addEventListener('click', async () => {
  const message = document.getElementById('message');
  try {
    const result = await chrome.runtime.sendMessage({ action: 'startWorkflow' });
    if (!result || !result.ok) throw new Error(result?.error || '启动失败');
    message.textContent = result.allSkipped ? '所选项目的文件均已存在，无需下载。' : '已启动，请查看新打开的页面。';
  } catch (error) { message.textContent = '启动失败：' + error.message; }
});

document.getElementById('stop').addEventListener('click', async () => {
  const message = document.getElementById('message');
  try {
    const result = await chrome.runtime.sendMessage({ action: 'stopWorkflow' });
    if (!result || !result.ok) throw new Error(result?.error || '停止失败');
    message.textContent = '已停止当前流程，现在可以重新开始。未归档文件保留在浏览器下载目录。';
  } catch (error) { message.textContent = '停止失败：' + error.message; }
});

document.getElementById('check-search').addEventListener('click', async () => {
  const message = document.getElementById('message');
  try {
    const result = await chrome.runtime.sendMessage({ action: 'startSearchCheck' });
    if (!result || !result.ok) throw new Error(result?.error || '启动失败');
    message.textContent = '已启动搜索词下载验证，请查看新打开的页面和目录状态。';
  } catch (error) { message.textContent = '验证启动失败：' + error.message; }
});

document.getElementById('check-content').addEventListener('click', async () => {
  const message = document.getElementById('message');
  try {
    const result = await chrome.runtime.sendMessage({ action: 'startContentCheck' });
    if (!result || !result.ok) throw new Error(result?.error || '启动失败');
    message.textContent = '已启动内容下载验证，请查看新打开的页面和目录状态。';
  } catch (error) { message.textContent = '验证启动失败：' + error.message; }
});
