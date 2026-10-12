const { createService } = require('./core');
const KEY = 'youxi-xinsheng-dev-v2';
function createMemoryRepository(initial, persist) {
  let state = JSON.parse(JSON.stringify(initial || {})); let queue = Promise.resolve();
  const clone = v => v == null ? null : JSON.parse(JSON.stringify(v));
  const get = async id => clone(state[id]);
  const list = async (kind, filters) => Object.values(state).filter(v => v.kind === kind && Object.keys(filters).every(k => Array.isArray(v[k]) ? v[k].includes(filters[k]) : v[k] === filters[k])).sort((a, b) => b.createdAt - a.createdAt).slice(0, 200).map(clone);
  const transact = fn => {
    const job = queue.then(async () => {
      const draft = clone(state);
      const tx = { get: async id => clone(draft[id]), set: async (id, v) => { draft[id] = clone(v); } };
      const result = await fn(tx);
      if (persist) await persist(draft);
      state = draft;
      return clone(result);
    });
    queue = job.catch(() => {}); return job;
  };
  return { get, list, transact, snapshot: () => clone(state) };
}
const ACTORS = [
  { id: 'demo_creator', label: '投稿人 · 我', nickname: '听棠', role: 'creator', bio: '从一句唱词开始，记录我的第一部原创小戏。', genre: '豫剧' },
  { id: 'demo_expert_a', label: '专家甲 · 戏词', nickname: '示例戏词老师', role: 'expert', bio: '开发体验身份，用于验证戏词评审流程。', genre: '豫剧' },
  { id: 'demo_expert_b', label: '专家乙 · 音乐', nickname: '示例作曲老师', role: 'expert', bio: '开发体验身份，用于验证音乐与可唱性评审。', genre: '豫剧' },
  { id: 'demo_expert_c', label: '专家丙 · 复核', nickname: '示例复核老师', role: 'expert', bio: '开发体验身份，用于验证分差复核流程。', genre: '京剧' },
  { id: 'demo_admin', label: '运营管理员', nickname: '有戏新声运营', role: 'admin', bio: '开发版运营工作台', genre: '豫剧' }
];
async function demoGenerate(input) {
  const bars = [[1, 2, 3, 5], [6, 5, 3, 2], [3, 5, 6, 5], [3, 2, 1, 0], [2, 3, 5, 6], [5, 3, 2, 3], [5, 6, 5, 3], [2, 1, 1, 0]];
  return { lyrics: `【${input.title}】\n一盏灯，照过旧门台，\n半卷心事缓缓来。\n欲将往事轻轻问，\n又把离愁袖底埋。\n今夜不辞千里路，\n愿留新声待春开。`, score: { key: 'C', meter: '4/4', tempo: 72, bars }, notes: `离线模板样稿，用于验证流程，并非真实大模型生成，也不代表${input.genre}的专业唱腔。创作简报：${input.scene}。旋律为C调4/4拍四分音符练习；词曲尚未逐字配唱。` };
}
function makeDemoService(repo, extra) {
  return createService(Object.assign({ repo, adminIds: ['demo_admin'], features: { generation: true, comments: true, showcase: true }, providerName: '离线模板演示（非真实AI）', generate: demoGenerate, validateFiles: async (actor, files) => { files.forEach(f => { if (!f.fileId.startsWith('local:')) throw new Error('仅支持本地附件'); }); return files; }, fileLinks: async files => files }, extra || {}));
}
async function seedDemo(repo, service) {
  if (await repo.get('demo_seed_v2')) return;
  for (const a of ACTORS) {
    await service.run(a.id, 'bootstrap');
    await service.run(a.id, 'saveProfile', { nickname: a.nickname, bio: a.bio, genre: a.genre, profileConsent: true });
    if (a.role === 'expert') await service.run('demo_admin', 'grantExpert', { userId: `user_${a.id}`, verified: true });
  }
  const w = await service.run('demo_creator', 'submit', { requestId: 'seed_work_0001', title: '归燕 · 春信', genre: '豫剧', workType: 'lyrics', text: '檐角一声春又晚，归燕衔泥过旧关。\n母亲灯下缝新袖，未问归期先问寒。\n我把乡音藏心底，今朝唱与故人看。', aiUse: 'assisted', original: true, adult: true, reviewConsent: true, allowDisplay: true, agreementVersion: require('./model').AGREEMENT_VERSION });
  await service.run('demo_admin', 'assign', { id: w.id, expertIds: ['user_demo_expert_a', 'user_demo_expert_b'] });
  for (const a of ['demo_expert_a', 'demo_expert_b']) await service.run(a, 'review', { id: w.id, scores: { originality: 92, tradition: 90, completeness: 91, performability: 93, potential: 90 }, comment: '开发演示评语：人物关系清晰，建议把后两句的情感转折进一步落到行动，再请老师确认气口。', noConflict: true });
  await service.run('demo_admin', 'publishWork', { id: w.id, published: true });
  await service.run('demo_admin', 'publishProfile', { userId: 'user_demo_creator', published: true });
  await repo.transact(tx => tx.set('demo_seed_v2', { id: 'demo_seed_v2', kind: 'meta' }));
}
module.exports = { KEY, ACTORS, createMemoryRepository, makeDemoService, seedDemo, demoGenerate };
