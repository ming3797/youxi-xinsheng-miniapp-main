const M = require('./model');
const { assert, text, requestId } = M;
const FINAL_STATES = ['approved', 'revision', 'incubating'];

function createService(options) {
  const { repo } = options;
  const now = options.now || (() => Date.now());
  const policy = Object.assign({}, M.POLICY, options.policy || {});
  const flags = Object.assign({ generation: false, comments: false, showcase: false }, options.features || {});
  const admins = options.adminIds || [];
  function record(kind, id, fields) { return Object.assign({ id, kind, createdAt: now(), updatedAt: now() }, fields); }
  async function user(tx, actor) {
    assert(typeof actor === 'string' && /^[a-zA-Z0-9_-]{3,80}$/.test(actor), 'UNAUTHENTICATED', '请先登录');
    let value = await tx.get(`user_${actor}`);
    if (!value) {
      value = record('user', `user_${actor}`, { ownerId: actor, nickname: '新声创作者', bio: '', genre: '豫剧', role: admins.includes(actor) ? 'admin' : 'creator', points: policy.welcomePoints, activeJobId: '', profileConsent: false, publicProfile: null });
      await tx.set(value.id, value);
      await tx.set(`welcome_${actor}`, record('ledger', `welcome_${actor}`, { ownerId: actor, delta: policy.welcomePoints, reason: '新用户创作体验积分', balance: policy.welcomePoints }));
    }
    // 管理员身份只能由服务端环境授权，客户端传入的 role 无效。
    if (admins.includes(actor) && value.role !== 'admin') { value.role = 'admin'; await tx.set(value.id, value); }
    if (!admins.includes(actor) && value.role === 'admin') { value.role = 'creator'; await tx.set(value.id, value); }
    return value;
  }
  function requireAdmin(u) { assert(u.role === 'admin', 'FORBIDDEN', '仅运营管理员可以操作'); }
  async function need(tx, id, kind) {
    assert(typeof id === 'string' && id.length <= 160, 'VALIDATION', '记录编号不正确');
    const value = await tx.get(id); assert(value && value.kind === kind, 'NOT_FOUND', '记录不存在'); return value;
  }
  function canRead(u, work) { return work.ownerId === u.ownerId || u.role === 'admin' || work.expertIds.includes(u.id); }
  function publicWork(w) {
    return { id: w.id, title: w.title, genre: w.genre, workType: w.workType, authorName: w.authorName, authorId: w.authorId, text: w.text, aiUse: w.aiUse, status: w.status, total: w.total, dimensions: w.dimensions, createdAt: w.createdAt, published: true, reviews: [] };
  }
  function workFor(u, w) {
    if (!canRead(u, w)) { assert(flags.showcase && w.published, 'FORBIDDEN', '你没有查看这份投稿的权限'); return publicWork(w); }
    const result = Object.assign({}, w);
    if (u.role === 'expert' && !FINAL_STATES.includes(w.status)) result.reviews = w.reviews.filter(r => r.expertId === u.id);
    return result;
  }
  async function ledger(tx, u, id, delta, reason, referenceId) {
    if (await tx.get(id)) return;
    u.points += delta;
    assert(u.points >= 0, 'INSUFFICIENT_POINTS', '创作积分不足');
    await tx.set(u.id, u);
    await tx.set(id, record('ledger', id, { ownerId: u.ownerId, delta, reason, referenceId: referenceId || '', balance: u.points }));
  }
  async function audit(tx, actor, action, targetId, suffix) {
    const id = `audit_${targetId}_${action}_${suffix || now()}`;
    await tx.set(id, record('audit', id, { ownerId: actor, action, targetId }));
  }
  async function finishJob(actor, jobId, result, failure) {
    return repo.transact(async tx => {
      const u = await user(tx, actor); const job = await need(tx, jobId, 'job');
      assert(job.ownerId === actor, 'FORBIDDEN', '不能操作他人的生成记录');
      if (job.status !== 'pending') return job;
      job.status = failure ? 'failed' : 'completed'; job.updatedAt = now();
      if (failure) { job.error = failure; await ledger(tx, u, `refund_${job.id}`, job.cost, '生成失败退回积分', job.id); }
      else job.result = result;
      if (u.activeJobId === job.id) u.activeJobId = '';
      await tx.set(u.id, u); await tx.set(job.id, job); return job;
    });
  }
  async function run(actor, action, input = {}) {
    const u = await repo.transact(tx => user(tx, actor));
    if (action === 'bootstrap') {
      const experts = await repo.list('user', { role: 'expert' });
      const works = flags.showcase ? await repo.list('work', { published: true }) : [];
      const people = flags.showcase ? await repo.list('user', { profilePublished: true }) : [];
      return { user: u, features: flags, policy, agreementVersion: M.AGREEMENT_VERSION, experts: experts.map(e => ({ id: e.id, nickname: e.nickname, genre: e.genre, bio: e.bio })), showcase: works.map(publicWork), creators: people.map(p => ({ id: p.id, ...p.publicProfile })) };
    }
    if (action === 'dashboard') return { user: u, works: await repo.list('work', { ownerId: actor }), jobs: await repo.list('job', { ownerId: actor }), ledger: await repo.list('ledger', { ownerId: actor }) };
    if (action === 'saveProfile') {
      const nickname = text(input.nickname, 20, '昵称', 2), bio = text(input.bio || '', 300, '个人介绍');
      assert(M.GENRES.includes(input.genre), 'VALIDATION', '请选择剧种');
      return repo.transact(async tx => {
        const current = await user(tx, actor);
        Object.assign(current, { nickname, bio, genre: input.genre, profileConsent: input.profileConsent === true, updatedAt: now() });
        if (!current.profileConsent) { current.publicProfile = null; current.profilePublished = false; }
        await tx.set(current.id, current); return current;
      });
    }
    if (action === 'submit') {
      const rid = requestId(input.requestId), id = `work_${actor}_${rid}`;
      const existing = await repo.get(id); if (existing) return existing;
      const title = text(input.title, 40, '作品标题', 2), body = text(input.text || '', 12000, '作品正文');
      assert(M.GENRES.includes(input.genre), 'VALIDATION', '请选择剧种');
      assert(M.TYPES.some(t => t.id === input.workType), 'VALIDATION', '请选择作品类型');
      assert(['none', 'assisted', 'generated'].includes(input.aiUse), 'VALIDATION', '请注明AI参与程度');
      assert(input.original === true && input.reviewConsent === true && input.adult === true && input.agreementVersion === M.AGREEMENT_VERSION, 'CONSENT_REQUIRED', '请确认原创声明、评审授权和成年声明');
      let files = input.files || [];
      assert(Array.isArray(files) && files.length <= 3, 'VALIDATION', '最多上传3个附件');
      files = files.map(f => {
        assert(f && typeof f.fileId === 'string', 'VALIDATION', '附件格式不正确');
        const name = text(f.name, 120, '文件名', 1), ext = name.split('.').pop().toLowerCase();
        assert(M.EXTENSIONS.includes(ext), 'FILE_TYPE', '附件类型暂不支持');
        assert(Number.isFinite(f.size) && f.size > 0 && f.size <= 20 * 1024 * 1024, 'FILE_SIZE', '每个附件需小于20MB');
        return { fileId: f.fileId, name, size: f.size };
      });
      assert(body.length >= 20 || files.length > 0, 'VALIDATION', '请填写至少20字正文或上传作品文件');
      if (files.length) { assert(options.validateFiles, 'UPLOAD_DISABLED', '文件服务暂不可用'); files = await options.validateFiles(actor, files); }
      return repo.transact(async tx => {
        const prior = await tx.get(id); if (prior) return prior;
        const author = await user(tx, actor);
        const work = record('work', id, { ownerId: actor, authorId: author.id, authorName: author.nickname, title, text: body, genre: input.genre, workType: input.workType, aiUse: input.aiUse, files, original: true, adult: true, reviewConsent: true, allowDisplay: input.allowDisplay === true, agreementVersion: M.AGREEMENT_VERSION, status: 'submitted', expertIds: [], reviews: [], version: 1, published: false, benefits: [], total: null, dimensions: [] });
        await tx.set(id, work); await audit(tx, actor, 'submit', id, 'v1'); return work;
      });
    }
    if (action === 'getWork') return workFor(u, await need(repo, input.id, 'work'));
    if (action === 'fileLinks') {
      const work = await need(repo, input.id, 'work'); assert(canRead(u, work), 'FORBIDDEN', '附件只对作者、指定专家和运营开放');
      assert(options.fileLinks, 'UPLOAD_DISABLED', '附件服务未配置'); return options.fileLinks(work.files);
    }
    if (action === 'desk') {
      assert(['admin', 'expert'].includes(u.role), 'FORBIDDEN', '仅评审与运营人员可以进入');
      const works = u.role === 'admin' ? await repo.list('work', {}) : await repo.list('work', { expertIds: u.id });
      return { works: works.map(w => workFor(u, w)), users: u.role === 'admin' ? await repo.list('user', {}) : [], comments: u.role === 'admin' ? await repo.list('comment', { status: 'pending' }) : [], reports: u.role === 'admin' ? await repo.list('report', { status: 'pending' }) : [] };
    }
    if (action === 'grantExpert') {
      return repo.transact(async tx => {
        requireAdmin(await user(tx, actor)); const person = await need(tx, input.userId, 'user');
        assert(person.role !== 'admin', 'VALIDATION', '运营身份不能同时用作独立评审');
        assert(input.verified === true, 'CONSENT_REQUIRED', '请先核验专家身份与合作授权');
        person.role = 'expert'; person.expertVerifiedAt = now(); await tx.set(person.id, person); await audit(tx, actor, 'grantExpert', person.id); return person;
      });
    }
    if (action === 'assign') {
      return repo.transact(async tx => {
        requireAdmin(await user(tx, actor)); const w = await need(tx, input.id, 'work');
        assert(['submitted', 'needs_third'].includes(w.status), 'STATE', '当前状态不能分配专家');
        const ids = input.expertIds;
        assert(Array.isArray(ids) && new Set(ids).size === ids.length && ids.length === (w.status === 'needs_third' ? 3 : 2), 'VALIDATION', '初评需2位专家，复核需保留原专家并增加第3位');
        for (const id of ids) { const expert = await need(tx, id, 'user'); assert(expert.role === 'expert' && expert.ownerId !== w.ownerId, 'CONFLICT', '只能选择已核验的独立专家，且不能评审自己的作品'); }
        assert(w.reviews.every(r => ids.includes(r.expertId)), 'STATE', '不能移除已经提交评审的专家');
        w.expertIds = ids; w.status = 'reviewing'; w.updatedAt = now();
        await tx.set(w.id, w); await audit(tx, actor, 'assign', w.id); return w;
      });
    }
    if (action === 'review') {
      const total = M.scoreTotal(input.scores || {}), comment = text(input.comment, 2400, '评审意见', 20);
      assert(input.noConflict === true, 'CONFLICT', '请先确认不存在利益冲突');
      return repo.transact(async tx => {
        const expert = await user(tx, actor); const w = await need(tx, input.id, 'work');
        assert(expert.role === 'expert' && w.expertIds.includes(expert.id) && w.ownerId !== actor, 'FORBIDDEN', '你不是这份作品的指定独立评审');
        const previous = w.reviews.find(r => r.expertId === expert.id);
        if (previous) { assert(previous.total === total && previous.comment === comment && M.DIMENSIONS.every(d => previous.scores[d.key] === input.scores[d.key]), 'IMMUTABLE', '评审提交后不可修改'); return workFor(expert, w); }
        assert(w.status === 'reviewing', 'STATE', '作品不在评审阶段');
        const scores = {}; M.DIMENSIONS.forEach(d => { scores[d.key] = input.scores[d.key]; });
        w.reviews.push({ expertId: expert.id, name: expert.nickname, scores, total, comment, noConflict: true, createdAt: now(), version: w.version });
        if (w.reviews.length === w.expertIds.length) Object.assign(w, M.scoreDecision(w.reviews, policy));
        w.updatedAt = now();
        if (w.status === 'approved') {
          const author = await need(tx, w.authorId, 'user');
          await ledger(tx, author, `award_${w.id}`, policy.approvalPoints, '作品通过评审奖励', w.id);
          w.benefits = [{ name: '免费专业集体点评', status: '待运营安排' }, { name: '创作修改任务书', status: '待导师安排' }];
        }
        await tx.set(w.id, w); await audit(tx, actor, 'review', w.id, expert.id); return workFor(expert, w);
      });
    }
    if (action === 'rejectWork') {
      const reason = text(input.reason, 500, '未受理原因', 5);
      return repo.transact(async tx => { requireAdmin(await user(tx, actor)); const w = await need(tx, input.id, 'work'); assert(w.status === 'submitted', 'STATE', '只能退回尚未分配专家的投稿'); w.status = 'rejected'; w.rejectionReason = reason; await tx.set(w.id, w); await audit(tx, actor, 'reject', w.id); return w; });
    }
    if (action === 'publishWork' || action === 'incubate' || action === 'revokeDisplay') {
      return repo.transact(async tx => {
        const current = await user(tx, actor); const w = await need(tx, input.id, 'work');
        if (action === 'revokeDisplay') { assert(current.role === 'admin' || w.ownerId === actor, 'FORBIDDEN', '仅作者或运营可撤回展示'); w.published = false; w.allowDisplay = false; }
        else {
          requireAdmin(current); assert(['approved', 'incubating'].includes(w.status), 'STATE', '需先通过专家评审');
          if (action === 'publishWork') { assert(flags.showcase, 'FEATURE_DISABLED', '作品展示暂未开放'); assert(w.allowDisplay, 'CONSENT_REQUIRED', '作者未授权公开展示'); w.published = input.published === true; }
          else {
            assert(w.incubationCandidate, 'STATE', '尚未达到孵化候选条件');
            const schedule = text(input.schedule, 300, '培训安排', 5);
            const author = await need(tx, w.authorId, 'user');
            await ledger(tx, author, `incubation_${w.id}`, policy.incubationPoints, '孵化计划入选奖励', w.id);
            w.status = 'incubating'; w.incubationSchedule = schedule;
            w.benefits = [{ name: '免费专业培训', status: schedule }, { name: '导师作品打磨', status: '待导师安排' }];
          }
        }
        w.updatedAt = now(); await tx.set(w.id, w); await audit(tx, actor, action, w.id); return w;
      });
    }
    if (action === 'publishProfile') {
      return repo.transact(async tx => {
        requireAdmin(await user(tx, actor)); assert(flags.showcase, 'FEATURE_DISABLED', '个人主页展示暂未开放');
        const p = await need(tx, input.userId, 'user');
        if (input.published === true) { assert(p.profileConsent, 'CONSENT_REQUIRED', '该用户尚未授权展示个人主页'); p.publicProfile = { nickname: p.nickname, bio: p.bio, genre: p.genre }; p.profilePublished = true; }
        else { p.publicProfile = null; p.profilePublished = false; }
        await tx.set(p.id, p); await audit(tx, actor, 'publishProfile', p.id); return p;
      });
    }
    if (action === 'creator') {
      assert(flags.showcase, 'FEATURE_DISABLED', '个人主页暂未开放'); const p = await need(repo, input.id, 'user');
      assert(p.profilePublished && p.publicProfile, 'NOT_FOUND', '主页尚未公开');
      return { id: p.id, ...p.publicProfile, works: (await repo.list('work', { authorId: p.id, published: true })).map(publicWork), comments: flags.comments ? (await repo.list('comment', { targetId: p.id, status: 'approved' })).map(c => ({ id: c.id, authorName: c.authorName, text: c.text, createdAt: c.createdAt })) : [] };
    }
    if (action === 'comment') {
      assert(flags.comments, 'FEATURE_DISABLED', '评论暂未开放'); const body = text(input.text, 500, '评论', 2); const id = `comment_${actor}_${requestId(input.requestId)}`;
      return repo.transact(async tx => {
        const previous = await tx.get(id); if (previous) return previous;
        const target = await need(tx, input.targetId, 'user'); assert(target.profilePublished && target.publicProfile, 'NOT_FOUND', '主页尚未公开');
        const c = record('comment', id, { ownerId: actor, targetId: target.id, authorName: u.nickname, text: body, status: 'pending' });
        await tx.set(id, c); return c;
      });
    }
    if (action === 'moderateComment') {
      return repo.transact(async tx => { requireAdmin(await user(tx, actor)); const c = await need(tx, input.id, 'comment'); assert(['approved', 'rejected'].includes(input.status), 'VALIDATION', '审核状态不正确'); c.status = input.status; c.updatedAt = now(); await tx.set(c.id, c); await audit(tx, actor, 'moderateComment', c.id); return c; });
    }
    if (action === 'report') {
      const reason = text(input.reason, 500, '举报原因', 5), id = `report_${actor}_${requestId(input.requestId)}`;
      return repo.transact(async tx => { const prior = await tx.get(id); if (prior) return prior; const target = await tx.get(input.targetId); assert(target && (target.kind === 'work' && target.published || target.kind === 'user' && target.profilePublished || target.kind === 'comment' && target.status === 'approved'), 'NOT_FOUND', '该公开内容已不可用'); const r = record('report', id, { ownerId: actor, targetId: target.id, reason, status: 'pending' }); await tx.set(id, r); return r; });
    }
    if (action === 'resolveReport') {
      return repo.transact(async tx => {
        requireAdmin(await user(tx, actor)); const r = await need(tx, input.id, 'report');
        assert(['remove', 'dismiss'].includes(input.resolution), 'VALIDATION', '请选择处理结果');
        if (input.resolution === 'remove') { const target = await tx.get(r.targetId); if (target) { if (target.kind === 'work') target.published = false; if (target.kind === 'user') { target.profilePublished = false; target.publicProfile = null; } if (target.kind === 'comment') target.status = 'rejected'; await tx.set(target.id, target); } }
        r.status = 'resolved'; r.resolution = input.resolution; r.updatedAt = now(); await tx.set(r.id, r); await audit(tx, actor, 'resolveReport', r.id); return r;
      });
    }
    if (action === 'generate') {
      assert(flags.generation && options.generate, 'AI_UNAVAILABLE', '创作服务尚未启用，未扣除积分');
      const kind = M.TYPES.find(t => t.id === input.workType); assert(kind, 'VALIDATION', '请选择生成类型');
      assert(M.GENRES.includes(input.genre), 'VALIDATION', '请选择剧种');
      assert(input.aiConsent === true, 'CONSENT_REQUIRED', '请确认AI草稿使用说明');
      const brief = { title: text(input.title, 60, '创作主题', 2), genre: input.genre, workType: kind.id, scene: text(input.scene, 600, '人物与场景', 5) };
      const id = `job_${actor}_${requestId(input.requestId)}`;
      const prepared = await repo.transact(async tx => {
        const prior = await tx.get(id); if (prior) return { job: prior, fresh: false };
        const author = await user(tx, actor);
        assert(!author.activeJobId, 'JOB_PENDING', '上一份作品仍在生成，请查看生成记录或在超时后退回积分');
        assert(author.points >= kind.cost, 'INSUFFICIENT_POINTS', '创作积分不足');
        const job = record('job', id, { ownerId: actor, input: brief, cost: kind.cost, status: 'pending', provider: options.providerName || '未命名模型服务', expiresAt: now() + policy.jobTimeoutMs });
        author.activeJobId = id;
        await ledger(tx, author, `charge_${id}`, -kind.cost, '创作任务扣除积分', id); await tx.set(id, job); return { job, fresh: true };
      });
      if (!prepared.fresh) return prepared.job;
      try { const result = M.validateGeneration(await options.generate(brief), kind.id); return await finishJob(actor, id, result); }
      catch (err) { return finishJob(actor, id, null, err.code === 'AI_FORMAT' ? '生成内容未通过格式检查，积分已退回。' : '生成服务暂不可用，积分已退回。'); }
    }
    if (action === 'recoverGeneration') {
      const job = await need(repo, input.id, 'job'); assert(job.ownerId === actor, 'FORBIDDEN', '只能处理自己的生成任务');
      if (job.status !== 'pending') return job;
      assert(now() >= job.expiresAt, 'NOT_EXPIRED', '任务尚未超时，请稍后刷新'); return finishJob(actor, job.id, null, '任务超时，积分已退回。');
    }
    throw new M.DomainError('UNKNOWN_ACTION', '不支持的操作');
  }
  return { run };
}
module.exports = { createService };
