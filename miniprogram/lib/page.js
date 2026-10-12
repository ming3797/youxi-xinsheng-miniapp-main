const api = require('./api');
const M = require('./model');
function formatTime(value) { const d = new Date(value); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; }
function works(list) { return list.map(w => ({ ...w, statusText: M.STATUS[w.status], typeText: M.TYPES.find(t => t.id === w.workType).label, date: formatTime(w.createdAt) })); }
function error(page, err) { page.setData({ error: err.message || err.errMsg || '操作失败，请重试', busy: false }); }
async function task(page, fn) { if (page.data.busy) return; page.setData({ busy: true, error: '' }); try { return await fn(); } catch (e) { error(page, e); } finally { page.setData({ busy: false }); } }
function base(data) { return { isDemo: api.isDemo, busy: false, error: '', ...data }; }
module.exports = { api, M, formatTime, works, error, task, base };
