const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../miniprogram');
function setup() {
  const storage = new Map(), navigation = [];
  global.wx = {
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, JSON.parse(JSON.stringify(value))), removeStorageSync: key => storage.delete(key),
    navigateTo: v => navigation.push(v.url), redirectTo: v => navigation.push(v.url), switchTab: v => navigation.push(v.url),
    showToast() {}, showModal: v => v.success({ confirm: true }), setClipboardData() {}
  };
  for (const name of ['lib/api.js', 'lib/page.js']) delete require.cache[require.resolve(path.join(root, name))];
  const api = require(path.join(root, 'lib/api.js'));
  function page(name) {
    let result; global.Page = specification => { result = { ...specification, data: JSON.parse(JSON.stringify(specification.data)), setData(values) { for (const [key, value] of Object.entries(values)) { const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.'); let target = this.data; for (const part of parts.slice(0, -1)) target = target[part]; target[parts.at(-1)] = value; } } }; };
    const filename = path.join(root, 'pages', name, 'index.js'); delete require.cache[require.resolve(filename)]; require(filename); return result;
  }
  return { page, api, storage, navigation };
}
const field = (key, value) => ({ currentTarget: { dataset: { key } }, detail: { value } });
test('native submission persists draft, validates consents and navigates to created record', async () => {
  const { page, api, storage, navigation } = setup(); const p = page('submit'); await p.onLoad({});
  p.field(field('title', '原生页面投稿')); p.field(field('text', '溪桥一夜春风暖，燕子衔来故里书。隔岸有人轻唤我，才知乡音未曾疏。'));
  for (const key of ['original', 'adult', 'reviewConsent']) p.check(field(key, ['yes']));
  assert.equal(storage.get(p.draftKey).title, '原生页面投稿');
  await p.submit(); assert.equal(p.data.error, ''); assert(navigation[0].startsWith('/pages/work/index?id='));
  assert.equal(storage.has(p.draftKey), false); assert((await api.call('dashboard')).works.some(w => w.title === '原生页面投稿'));
});
test('native expert/admin pages compute correct role-dependent actions', async () => {
  const { page, api } = setup(); const home = page('home'); await home.load(); const workId = home.data.showcase[0].id;
  await api.switchActor('demo_admin'); const w = page('work'); w.id = workId; await w.load();
  assert.equal(w.data.admin, true); assert.equal(w.data.canPublish, true); assert.equal(w.data.canIncubate, true); assert.equal(w.data.canReview, false);
  await api.switchActor('demo_expert_c'); await w.load(); assert.equal(w.data.admin, false); assert.equal(w.data.canReview, false); assert.equal(w.data.work.files, undefined);
});
test('native generation updates points, stores output and carries AI disclosure into submission', async () => {
  const { page, api, navigation } = setup(); const p = page('create'); await p.load(); const points = p.data.session.user.points;
  p.field(field('title', '原生词谱创作')); p.field(field('scene', '青年回到家乡看望多年未见的母亲。')); p.type({ detail: { value: 2 } }); p.consent({ detail: { value: ['yes'] } });
  await p.generate(); assert.equal(p.data.error, ''); assert.equal(p.data.job.status, 'completed'); assert.equal(p.data.session.user.points, points - 140); assert(p.data.notation.includes('|'));
  p.submitDraft(); assert(navigation[0].includes('fromJob='));
  const submission = page('submit'); await submission.onLoad({ fromJob: p.data.job.id }); assert.equal(submission.data.form.aiUse, 'generated'); assert.equal(submission.data.form.original, false); assert.equal(submission.data.form.title, '原生词谱创作');
  assert.equal((await api.call('dashboard')).jobs.length, 1);
});
test('native profile switch refreshes role and ledger without leaking previous user state', async () => {
  const { page } = setup(); const p = page('profile'); await p.load(); assert.equal(p.data.session.user.role, 'creator'); assert.equal(p.data.session.user.points, 800);
  await p.actor({ detail: { value: 4 } }); assert.equal(p.data.session.user.role, 'admin'); assert.equal(p.data.session.user.points, 300); assert.equal(p.data.dashboard.works.length, 0);
});
test('native page errors remain visible and release busy state', async () => {
  const { page } = setup(); const p = page('submit'); await p.onLoad({}); await p.submit(); assert(p.data.error.includes('作品标题')); assert.equal(p.data.busy, false);
});
