const config = require('../config');
const L = require('./local');
let ready;
let actor = '';
let service;
function requestId() { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12); }
async function init() {
  if (config.mode === 'demo') {
    actor = wx.getStorageSync(L.KEY + ':actor') || 'demo_creator';
    if (!L.ACTORS.some(a => a.id === actor)) actor = 'demo_creator';
    const repo = L.createMemoryRepository(wx.getStorageSync(L.KEY) || {}, state => wx.setStorageSync(L.KEY, state));
    service = L.makeDemoService(repo);
    await L.seedDemo(repo, service);
  }
}
async function call(action, data = {}) {
  if (!ready) ready = init();
  await ready;
  if (config.mode === 'demo') return service.run(actor, action, data);
  if (getApp().globalData.configError) throw new Error(getApp().globalData.configError);
  const response = await wx.cloud.callFunction({ name: config.cloudFunction, data: { action, data }, timeout: 60000 });
  const result = response.result;
  if (!result || !result.ok) { const err = new Error(result && result.error ? result.error.message : '服务响应异常'); err.code = result && result.error && result.error.code; throw err; }
  return result.data;
}
async function switchActor(id) {
  if (config.mode !== 'demo' || !L.ACTORS.some(a => a.id === id)) throw new Error('正式环境不能切换身份');
  actor = id; wx.setStorageSync(L.KEY + ':actor', id); return call('bootstrap');
}
async function upload(file) {
  const session = await call('bootstrap');
  const ext = file.name.split('.').pop().toLowerCase();
  if (!require('./model').EXTENSIONS.includes(ext)) throw new Error('暂不支持该文件格式');
  if (file.size <= 0 || file.size > 20 * 1024 * 1024) throw new Error('每个附件需小于20MB');
  if (config.mode === 'demo') {
    const saved = await new Promise((resolve, reject) => wx.getFileSystemManager().saveFile({ tempFilePath: file.path, success: resolve, fail: reject }));
    return { fileId: 'local:' + saved.savedFilePath, name: file.name, size: file.size };
  }
  const result = await wx.cloud.uploadFile({ cloudPath: `private/${session.user.ownerId}/${requestId()}.${ext}`, filePath: file.path });
  return { fileId: result.fileID, name: file.name, size: file.size };
}
async function openFile(file) {
  let path;
  if (file.fileId.startsWith('local:')) path = file.fileId.slice(6);
  else {
    if (!file.url) throw new Error('附件链接不可用');
    const result = await new Promise((resolve, reject) => wx.downloadFile({ url: file.url, success: resolve, fail: reject })); path = result.tempFilePath;
  }
  const ext = file.name.split('.').pop().toLowerCase();
  if (['png', 'jpg', 'jpeg'].includes(ext)) return wx.previewImage({ urls: [path] });
  if (['mp3', 'wav', 'm4a'].includes(ext)) { const audio = wx.createInnerAudioContext(); audio.src = path; audio.play(); audio.onEnded(() => audio.destroy()); audio.onError(() => audio.destroy()); wx.showModal({ title: file.name, content: '正在播放，关闭此提示即可停止', showCancel: false, complete: () => audio.destroy() }); return; }
  if (['mp4', 'mov'].includes(ext)) return wx.previewMedia({ sources: [{ url: path, type: 'video' }] });
  if (ext === 'pdf') return wx.openDocument({ filePath: path, showMenu: true });
  if (wx.shareFileMessage) return wx.shareFileMessage({ filePath: path, fileName: file.name });
  throw new Error('请使用支持文件转发的新版微信');
}
async function exportFile(name, content) {
  const safe = name.replace(/[^\u4e00-\u9fa5a-zA-Z0-9_.-]/g, '_');
  const path = `${wx.env.USER_DATA_PATH}/${safe}`;
  await new Promise((resolve, reject) => wx.getFileSystemManager().writeFile({ filePath: path, data: content, encoding: 'utf8', success: resolve, fail: reject }));
  if (wx.shareFileMessage) return wx.shareFileMessage({ filePath: path, fileName: safe });
  return wx.showModal({ title: '文件已生成', content: '当前微信版本不支持文件转发，请升级微信后重试。', showCancel: false });
}
module.exports = { call, requestId, switchActor, upload, openFile, exportFile, isDemo: config.mode === 'demo', actors: L.ACTORS };
