const sycmDirectoryStore = (() => {
  const open = () => new Promise((resolve, reject) => {
    const request = indexedDB.open('sycm-auto-download', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('settings');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  async function getRoot(kind) {
    if (!['商品', '内容'].includes(kind)) throw new Error('目录类型无效');
    const db = await open();
    try { return await new Promise((resolve, reject) => {
      const req = db.transaction('settings').objectStore('settings').get('root:' + kind);
      req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error);
    }); } finally { db.close(); }
  }
  async function setRoot(kind, handle) {
    if (!['商品', '内容'].includes(kind)) throw new Error('目录类型无效');
    const db = await open();
    try { await new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put(handle, 'root:' + kind);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    }); } finally { db.close(); }
  }
  return { getRoot, setRoot };
})();

// 该函数只生成目录句柄；下载文件保存仍需在后续工作流中接入。
async function sycmArchiveDirectory(root, kind, endDate) {
  if (!['商品', '内容'].includes(kind) || !/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(endDate)) throw new Error('归档类型或日期无效');
  return root.getDirectoryHandle(Number(endDate.slice(5, 7)) + '月份', { create: true });
}
if (typeof module !== 'undefined') module.exports = { sycmArchiveDirectory };
