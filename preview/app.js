const M = require('../miniprogram/lib/model');
const L = require('../miniprogram/lib/local');
const policies = require('../miniprogram/lib/agreements');
const $ = selector => document.querySelector(selector);
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rid = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
const date = value => new Date(value).toLocaleDateString('zh-CN');
let actor = localStorage.getItem(L.KEY + ':actor') || 'demo_creator';
if (!L.ACTORS.some(a => a.id === actor)) actor = 'demo_creator';
let state = { page: 'home', id: '', session: null, dashboard: null, detail: null, desk: null, creator: null, job: null, error: '', toast: '' };
let repo, service;
let busy = false;
let draftFiles = [];
let draftId = rid();
let jobRequestId = '';
let commentId = '';
const calls = (action, data = {}) => service.run(actor, action, data);
function field(label, inner, note) { return `<label class="field"><span>${label}</span>${inner}${note ? `<small>${note}</small>` : ''}</label>`; }
const select = (name, choices, value) => `<select name="${name}">${choices.map(c => `<option value="${esc(c.id || c)}" ${(c.id || c) === value ? 'selected' : ''}>${esc(c.label || c)}</option>`).join('')}</select>`;
const button = (label, action, extra = '', klass = 'primary') => `<button type="button" class="${klass}" data-action="${action}" ${extra}>${label}</button>`;
function toast(text) { state.toast = text; $('#toast').textContent = text; $('#toast').classList.add('visible'); setTimeout(() => $('#toast').classList.remove('visible'), 3500); }
function workCard(w, small = false) {
  return `<button type="button" class="work-card" data-action="work" data-id="${esc(w.id)}"><div class="flex between"><div><span class="tag">${esc(w.genre)}</span><span class="tag green">${esc(M.STATUS[w.status])}</span></div>${w.total != null ? `<span class="number-score">${w.total}<small>分</small></span>` : `<span class="muted">${(w.reviews || []).length}份评审</span>`}</div><h3>${esc(w.title)}</h3>${small ? '' : `<p class="excerpt clamp">${esc(w.text)}</p>`}<div class="card-footer"><span>${esc(w.authorName)} · ${esc(M.TYPES.find(t => t.id === w.workType).label)}</span><span>查看作品 ↗</span></div></button>`;
}
function home() {
  const session = state.session;
  return `<div class="brand-row"><div><span class="eyebrow">YOUXI XINSHENG</span><h2>有戏新声<span class="brand-dot">·</span></h2></div><span class="edition">青年戏曲共创计划</span></div>
    <section class="stage"><div class="stage-arch"></div><div class="stage-circle"></div><div class="stage-lines"></div><span class="stage-index">第一幕 / 从热爱出发</span><div class="seal">有<br>戏</div><h1>你的故事，<br>值得一座戏台。</h1><div class="gold-rule"></div><p>从一段戏词、一支旋律开始。<br>让专业老师听见，让下一步创作发生。</p>${button('提交我的作品 <span>↗</span>', 'submit-page', '', 'stage-button')}</section>
    <div class="journey"><div><i>01</i><strong>原创投稿</strong><small>把灵感交给舞台</small></div><span>→</span><div><i>02</i><strong>专业评审</strong><small>让打磨有方向</small></div><span>→</span><div><i>03</i><strong>成长孵化</strong><small>让热爱走得更远</small></div></div>
    <button class="studio-invite" data-action="create-page"><div class="studio-symbol">♫</div><div><strong>戏词与旋律，先有第一稿</strong><small>灵感成词 · 积分创作 · 词谱导出</small></div><span>↗</span></button>
    <div class="section-heading"><h2>本期新声</h2><span>经授权与审核后展出</span></div>${session.showcase.length ? session.showcase.map(w => workCard(w)).join('') : '<div class="empty">下一份新声，可能就是你。<br>作品通过评审与展示审核后，会出现在这里。</div>'}
    <div class="section-heading"><h2>创作者的另一面</h2><span>认识作品背后的人</span></div>${session.creators.map(c => `<button class="creator-card" data-action="creator" data-id="${esc(c.id)}"><span class="avatar">${esc(c.nickname[0])}</span><div><strong>${esc(c.nickname)}</strong><p>${esc(c.bio)}</p></div><span>→</span></button>`).join('')}
    <div class="footnote">每一声热爱，都值得认真回应。<br>YOUXI XINSHENG / 有戏新声</div>`;
}
function submission() {
  const saved = JSON.parse(localStorage.getItem(`youxi:draft:${actor}`) || 'null') || {};
  if (saved.requestId) draftId = saved.requestId;
  draftFiles = saved.files || [];
  const textValue = saved.text || '';
  return `${heading('ORIGINAL SUBMISSION', '让作品，先被听见。', '投稿默认私密。草稿会自动保存在本机。')}<form id="submit-form">
    ${field('作品标题', `<input name="title" value="${esc(saved.title || '')}" maxlength="40" placeholder="例如：归燕 · 春信" required>`)}
    <div class="two-col">${field('剧种', select('genre', M.GENRES, saved.genre || '豫剧'))}${field('投稿类型', select('workType', M.TYPES, saved.workType || 'lyrics'))}</div>
    ${field('正文 / 创作说明', `<textarea name="text" maxlength="12000" placeholder="写下唱词，或说明作品中的人物、场景与创作想法。">${esc(textValue)}</textarea>`, '至少20字，或上传作品附件。评审期间作品版本冻结。')}
    <div class="field"><span>附件（可选）</span><label class="upload"><span>＋ 添加戏词、曲谱或音视频</span><small>最多3份 · 每份20MB以内 · 保存在本机</small><input id="files" type="file" multiple accept=".txt,.pdf,.png,.jpg,.jpeg,.mp3,.wav,.m4a,.mp4,.mov,.xml,.musicxml,.mid,.midi"></label><div id="file-list">${fileList()}</div></div>
    ${field('AI参与程度', select('aiUse', [{ id: 'none', label: '未使用AI' }, { id: 'assisted', label: 'AI辅助修改' }, { id: 'generated', label: '主要由AI生成' }], saved.aiUse || 'none'))}
    ${check('adult', '我已年满18周岁。开发首版仅面向成年人。', saved.adult)}
    ${check('original', '我确认拥有作品提交权，并已说明引用、改编来源和AI参与。', saved.original)}
    ${check('reviewConsent', '同意投稿规则与隐私说明，授权平台和指定专家为评审处理投稿。', saved.reviewConsent)}
    ${check('allowDisplay', '自愿允许作品通过评审后，经运营审核公开正文与署名（不含附件公开播放）。', saved.allowDisplay)}
    ${button('阅读投稿规则与隐私说明', 'policy', '', 'text-button')}<button class="primary full" type="submit">确认并提交评审 <span>→</span></button></form>`;
}
function check(name, label, checked) { return `<label class="check"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span>${label}</span></label>`; }
function heading(eyebrow, title, subtitle) { return `<div class="page-heading"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ''}</div>`; }
function fileList() { return draftFiles.map((f, i) => `<div class="file-row"><span>${esc(f.name)} <small>${(f.size / 1024).toFixed(0)} KB</small></span>${button('移除', 'remove-file', `data-index="${i}"`, 'text-button')}</div>`).join(''); }
function works() { return `${heading('MY CREATIVE JOURNEY', '我的作品', '每一次修改，都离舞台近一点。')}${button('＋ 提交新作品', 'submit-page', '', 'primary full spaced')}<div class="spaced">${state.dashboard.works.length ? state.dashboard.works.map(w => workCard(w)).join('') : '<div class="empty">你还没有提交作品。<br>一段戏词、清唱小样都可以成为开始。</div>'}</div>`; }
function detail() {
  const w = state.detail, u = state.session.user;
  const admin = u.role === 'admin', mine = w.ownerId === u.ownerId;
  const canReview = u.role === 'expert' && w.status === 'reviewing' && w.expertIds.includes(u.id) && !w.reviews.some(r => r.expertId === u.id);
  return `<div class="flex between"><span class="tag green">${M.STATUS[w.status]}</span><span class="muted">${date(w.createdAt)}</span></div>${heading('THE ORIGINAL WORK', esc(w.title), `${esc(w.authorName)} · ${esc(w.genre)} · 冻结版本${w.version || 1}`)}<div class="paper"><div class="excerpt pre">${esc(w.text)}</div><div class="divider"></div><span class="muted">${w.aiUse === 'none' ? '作者声明未使用AI' : '包含AI辅助创作内容'}</span></div>
    ${(w.files || []).map((f, i) => `<div class="file-row"><span>${esc(f.name)}</span>${button('打开附件 ↗', 'open-file', `data-index="${i}"`, 'text-button')}</div>`).join('')}
    ${w.rejectionReason ? `<div class="notice">未受理原因：${esc(w.rejectionReason)}</div>` : ''}
    <div class="section-heading"><h2>专业评审</h2><span>人气与付费不影响结论</span></div><div class="paper">${w.total != null ? `<div class="flex between"><div><span class="muted">专业综合评分</span><p>下一步：${M.STATUS[w.status]}</p></div><strong class="big-score">${w.total}<small>分</small></strong></div>${(w.dimensions || []).map(d => `<div class="dimension"><span>${d.label}</span><div><i style="width:${d.value}%"></i></div><b>${d.value}</b></div>`).join('')}` : '<p class="muted">专家独立评分，提交前无法查看其他人的评分。完成评审后显示结论。</p>'}${w.status === 'needs_third' ? '<div class="notice spaced">两位专家评分差异较大，需安排第三位复核。</div>' : ''}${w.reviews.map(r => `<div class="review"><strong>${esc(r.name)} <span>${r.total}分</span></strong><p class="pre">${esc(r.comment)}</p></div>`).join('')}</div>
    ${(w.benefits || []).length ? '<div class="section-heading"><h2>成长权益</h2><span>由运营安排兑现</span></div>' + w.benefits.map(b => `<div class="benefit"><span class="benefit-icon">✓</span><div><strong>${esc(b.name)}</strong><p>${esc(b.status)}</p></div></div>`).join('') : ''}
    ${admin && ['submitted', 'needs_third'].includes(w.status) ? `<div class="paper spaced"><h3>分配独立专家</h3><p class="muted">初评2位，分差复核需保留原2位并增加第3位。</p><form id="assign-form">${state.session.experts.filter(e => e.id !== w.authorId).map(e => check('expertIds', `${esc(e.nickname)} · ${esc(e.genre)}`, w.expertIds.includes(e.id)).replace('name="expertIds"', `name="expertIds" value="${esc(e.id)}"`)).join('')}<button class="primary full">确认分配</button></form></div>` : ''}
    ${canReview ? `<div class="paper spaced"><h3>独立评审意见</h3><form id="review-form">${M.DIMENSIONS.map(d => `<div class="score-input"><label for="score-${d.key}">${d.label}<small>权重${d.weight * 100}%</small></label><input id="score-${d.key}" name="${d.key}" type="number" min="0" max="100" step="1" value="80" required></div>`).join('')}${field('修改建议', '<textarea name="comment" minlength="20" maxlength="2400" required placeholder="至少20字，给出具体可执行的修改建议。"></textarea>')}${check('noConflict', '我已独立审阅，确认不存在利益冲突。')}<button class="primary full">提交并冻结本次评审</button></form></div>` : ''}
    ${admin && w.status === 'approved' && w.incubationCandidate ? `<div class="paper spaced"><h3>确认入选孵化</h3><form id="incubate-form">${field('免费培训安排', '<input name="schedule" minlength="5" maxlength="300" required placeholder="填写培训时间、联系方式与具体安排">')}<button class="primary full">确认安排并发放奖励</button></form></div>` : ''}
    ${admin && w.status === 'submitted' ? `<form id="reject-form" class="paper spaced">${field('未受理原因（如需退回）', '<input name="reason" minlength="5" maxlength="500" required placeholder="例如：请补充原作改编授权">')}<button class="secondary full">退回补充</button></form>` : ''}
    ${admin && ['approved', 'incubating'].includes(w.status) && w.allowDisplay ? button(w.published ? '下架公开正文' : '审核通过，公开作品正文', 'publish-work', '', 'secondary full spaced') : ''}
    ${mine && w.allowDisplay ? button('撤回公开展示授权', 'revoke-display', '', 'text-button full spaced') : ''}${w.published ? button('举报这份公开内容', 'report', `data-id="${esc(w.id)}"`, 'text-button full spaced') : ''}`;
}
function creation() {
  const s = state.session;
  return `${heading('CREATIVE STUDIO', '先有一段，新声。', '把脑海里的画面，写成第一份创作草稿。')}<div class="points-strip"><span>可用创作积分</span><strong>${s.user.points}<small>积分</small></strong></div><div class="notice">本地模式使用离线模板样稿，非真实大模型生成。首版曲谱为C调4/4拍旋律练习，需专业复核。</div>
    <form id="generate-form" class="spaced">${field('想创作什么？', select('workType', M.TYPES.map(t => ({ ...t, label: `${t.label} · ${t.cost}积分` })), 'lyrics'))}${field('剧种参考', select('genre', M.GENRES, '豫剧'))}${field('创作主题', '<input name="title" minlength="2" maxlength="60" required placeholder="例如：远行的人，在春天归来">')}${field('人物、场景与情绪', '<textarea name="scene" minlength="5" maxlength="600" required placeholder="谁在什么地方，想对谁说什么？"></textarea>')}${check('aiConsent', '我了解输出为AI辅助创作草稿，定谱及演出前须由专业老师复核。')}<button class="primary full">生成我的第一稿 →</button><p class="form-note">生成失败自动退回积分。超过5分钟可检查超时退回。当前不提供现金支付。</p></form>
    ${state.job ? jobResult(state.job) : ''}<div class="section-heading"><h2>创作记录</h2><span>每一份灵感都有来处</span></div>${state.dashboard.jobs.length ? state.dashboard.jobs.map(j => `<button class="record-row" data-action="job" data-id="${esc(j.id)}"><div><strong>${esc(j.input.title)}</strong><small>${esc(j.provider)}</small></div><span class="tag">${j.status === 'completed' ? '已完成' : j.status === 'failed' ? '积分已退回' : '生成中'}</span></button>`).join('') : '<div class="empty">每一份草稿都会保存在这里。</div>'}`;
}
function jobResult(j) {
  if (j.status !== 'completed') return `<div class="paper spaced"><h3>${esc(j.input.title)}</h3><div class="notice">${j.status === 'failed' ? esc(j.error) : '正在生成，请稍后刷新。'}</div>${j.status === 'pending' ? button('检查超时并退回积分', 'recover-job', '', 'secondary full spaced') : ''}</div>`;
  return `<div class="paper result spaced" id="generated-result"><span class="tag red">AI辅助创作草稿</span><h2>${esc(j.input.title)}</h2><div class="pre excerpt">${esc(j.result.lyrics)}</div>${j.result.score ? `<div class="notation"><div>1=C　4/4　♩=${j.result.score.tempo}</div><p>${j.result.score.bars.map(b => b.join(' ')).join(' | ')}</p></div>` : ''}<p class="form-note">${esc(j.result.notes)}</p><div class="actions">${button('导出TXT', 'export-text', '', 'secondary')}${j.result.score ? button('导出MusicXML', 'export-score', '', 'secondary') : ''}</div>${button('带入投稿，继续打磨 →', 'submit-job', '', 'primary full spaced')}</div>`;
}
function profile() {
  const u = state.session.user, dashboard = state.dashboard;
  return `${heading('MY VOICE, MY STAGE', '每一步，都有回声。', `${esc(u.nickname)}，欢迎回来。`)}<div class="profile-stats"><div><strong>${u.points}</strong><small>可用积分</small></div><div><strong>${dashboard.works.length}</strong><small>我的投稿</small></div><div><strong>${dashboard.works.filter(w => ['approved', 'incubating'].includes(w.status)).length}</strong><small>通过评审</small></div></div>${u.role !== 'creator' ? button(u.role === 'admin' ? '进入运营工作台 →' : '进入专家评审席 →', 'desk', '', 'primary full') : ''}
    <div class="section-heading"><h2>个人IP资料</h2><span>让作品背后的人被看见</span></div><form id="profile-form" class="paper">${field('昵称 / 创作署名', `<input name="nickname" value="${esc(u.nickname)}" minlength="2" maxlength="20" required>`)}${field('主要剧种', select('genre', M.GENRES, u.genre))}${field('我的创作介绍', `<textarea name="bio" maxlength="300">${esc(u.bio)}</textarea>`)}${check('profileConsent', '允许运营审核后展示我的个人主页。取消并保存将立即下架。', u.profileConsent)}<button class="secondary full">保存个人资料</button><p class="form-note">资料修改后，公开主页仍显示上一次审核的内容，直到运营重新审核。</p>${u.profilePublished ? button('查看我的公开主页 ↗', 'creator', `data-id="${esc(u.id)}"`, 'text-button full') : ''}</form>
    <div class="section-heading"><h2>积分流水</h2><span>每一笔都可追溯</span></div><div class="paper">${dashboard.ledger.map(l => `<div class="ledger-row"><div><strong>${esc(l.reason)}</strong><small>${date(l.createdAt)} · 余额 ${l.balance}</small></div><b class="${l.delta < 0 ? 'negative' : ''}">${l.delta > 0 ? '+' : ''}${l.delta}</b></div>`).join('')}</div>${button('投稿规则与隐私说明', 'policy', '', 'text-button full spaced')}`;
}
function desk() {
  const d = state.desk, admin = state.session.user.role === 'admin';
  return `${heading(admin ? 'OPERATIONS DESK' : 'EXPERT REVIEW', admin ? '把下一步安排好。' : '让专业，给予方向。', admin ? '受理投稿、分配专家、管理展示与成长计划。' : '独立审阅每一份热爱，给出具体可行的建议。')}<div class="section-heading"><h2>${admin ? '投稿与评审管理' : '分配给我的作品'}</h2><span>${d.works.length}份作品</span></div>${d.works.length ? d.works.map(w => workCard(w, true)).join('') : '<div class="empty">暂时没有待处理作品。</div>'}
    ${admin ? `<div class="section-heading"><h2>创作者与专家</h2><span>${d.users.length}个账号</span></div>${d.users.map(u => `<div class="paper user-card"><div class="flex between"><strong>${esc(u.nickname)}</strong><span class="tag">${u.role === 'admin' ? '运营' : u.role === 'expert' ? '专家' : '创作者'}</span></div><p>${esc(u.bio)}</p><p class="muted">${u.profileConsent ? '已授权个人主页展示' : '未授权公开个人主页'}</p><div class="actions">${u.role === 'creator' ? button('核验并开通专家', 'grant-expert', `data-id="${esc(u.id)}"`, 'secondary') : ''}${u.profileConsent ? button(u.profilePublished ? '下架主页' : '审核并展示主页', 'publish-profile', `data-id="${esc(u.id)}" data-value="${!u.profilePublished}"`, 'secondary') : ''}</div>${u.profilePublished ? button('按当前资料更新公开主页', 'publish-profile', `data-id="${esc(u.id)}" data-value="true"`, 'text-button full spaced') : ''}</div>`).join('')}
    <div class="section-heading"><h2>评论待审</h2><span>${d.comments.length}条</span></div>${d.comments.length ? d.comments.map(c => `<div class="paper"><span class="muted">${esc(c.authorName)}</span><p class="pre">${esc(c.text)}</p><div class="actions">${button('通过并展示', 'moderate', `data-id="${esc(c.id)}" data-value="approved"`, 'secondary')}${button('不予展示', 'moderate', `data-id="${esc(c.id)}" data-value="rejected"`, 'secondary')}</div></div>`).join('') : '<div class="empty small">暂无待审评论</div>'}
    <div class="section-heading"><h2>举报待处理</h2><span>${d.reports.length}条</span></div>${d.reports.length ? d.reports.map(r => `<div class="paper"><p>${esc(r.reason)}</p><small>${esc(r.targetId)}</small><div class="actions">${button('下架并结案', 'resolve-report', `data-id="${esc(r.id)}" data-value="remove"`, 'secondary')}${button('保留并结案', 'resolve-report', `data-id="${esc(r.id)}" data-value="dismiss"`, 'secondary')}</div></div>`).join('') : '<div class="empty small">暂无待处理举报</div>'}` : ''}`;
}
function creator() {
  const c = state.creator;
  return `<div class="creator-hero"><span class="eyebrow">CREATOR PORTRAIT</span><div class="flex"><span class="avatar large">${esc(c.nickname[0])}</span><h1>${esc(c.nickname)}</h1></div><span class="tag">${esc(c.genre)}</span><p class="pre">${esc(c.bio)}</p></div><div class="section-heading"><h2>代表作品</h2><span>认真创作，慢慢被看见</span></div>${c.works.length ? c.works.map(w => workCard(w)).join('') : '<div class="empty">作品正在打磨，期待第一声。</div>'}<div class="section-heading"><h2>听见彼此</h2><span>友善，具体，真诚</span></div>${c.comments.map(v => `<div class="paper"><div class="flex between"><strong>${esc(v.authorName)}</strong><span class="muted">${date(v.createdAt)}</span></div><p class="pre">${esc(v.text)}</p>${button('举报', 'report', `data-id="${esc(v.id)}"`, 'text-button')}</div>`).join('')}<form id="comment-form">${field('留下你的创作建议', '<textarea name="text" minlength="2" maxlength="500" required placeholder="喜欢哪一句？希望听到什么？"></textarea>')}<button class="primary full">提交评论，审核后展示</button></form>${button('举报该主页', 'report', `data-id="${esc(c.id)}"`, 'text-button full spaced')}`;
}
function policy() { return `${heading('SERVICE & RIGHTS', '创作规则与隐私说明', '开发验收草案 · dev-2026-09-19')}<div class="notice">正式运营主体、客服、保存期限和活动安排仍需填写。</div>${policies.map(p => `<section class="policy"><h2>${p.title}</h2><p>${p.body}</p></section>`).join('')}`; }
const pages = { home, submit: submission, works, work: detail, create: creation, profile, desk, creator, policy };
function render() {
  const main = $('#main');
  main.innerHTML = (state.error ? `<div class="error" role="alert">${esc(state.error)}</div>` : '') + pages[state.page]();
  $('#actor').value = actor;
  $('#back').hidden = ['home', 'works', 'create', 'profile'].includes(state.page);
  document.querySelectorAll('[data-nav]').forEach(b => { b.classList.toggle('active', b.dataset.nav === state.page); });
  $('#identity').textContent = L.ACTORS.find(a => a.id === actor).label;
}
async function load(page, id) {
  const next = { ...state, page: page || state.page, id: id || '', error: '' };
  next.session = await calls('bootstrap');
  next.dashboard = await calls('dashboard');
  if (next.page === 'work') next.detail = await calls('getWork', { id: next.id });
  if (next.page === 'creator') next.creator = await calls('creator', { id: next.id });
  if (next.page === 'desk') next.desk = await calls('desk');
  state = next; render();
}
async function guard(fn) {
  if (busy) return;
  busy = true; document.body.classList.add('is-busy'); $('#working').hidden = false;
  try { await fn(); }
  catch (err) {
    state.error = err.message || '操作失败，请重试';
    let box = $('#main .error'); if (!box) { box = document.createElement('div'); box.className = 'error'; box.setAttribute('role', 'alert'); $('#main').prepend(box); } box.textContent = state.error; box.scrollIntoView({ block: 'start', behavior: 'smooth' });
  } finally { busy = false; document.body.classList.remove('is-busy'); $('#working').hidden = true; }
}
async function navigate(page, id) { await load(page, id); window.scrollTo({ top: 0, behavior: 'instant' }); }
const getForm = form => { const data = Object.fromEntries(new FormData(form)); form.querySelectorAll('input[type=checkbox]').forEach(el => { if (el.name !== 'expertIds') data[el.name] = el.checked; }); return data; };
function saveDraft() {
  const form = $('#submit-form'); if (!form) return;
  localStorage.setItem(`youxi:draft:${actor}`, JSON.stringify({ ...getForm(form), files: draftFiles, requestId: draftId }));
}
function download(name, content, type) { const url = URL.createObjectURL(new Blob([content], { type: type || 'text/plain;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = name.replace(/[\\/:*?"<>|]/g, '_'); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
async function fileDB() { return new Promise((resolve, reject) => { const req = indexedDB.open('youxi-xinsheng-files', 1); req.onupgradeneeded = () => req.result.createObjectStore('files'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(new Error('浏览器未允许本地附件存储，请使用Chrome打开')); }); }
async function storeFile(id, file) { const db = await fileDB(); return new Promise((resolve, reject) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(file, id); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(new Error('本地附件保存失败，请检查磁盘空间')); }; }); }
async function readFile(id) { const db = await fileDB(); return new Promise((resolve, reject) => { const tx = db.transaction('files', 'readonly'); const req = tx.objectStore('files').get(id); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(new Error('附件读取失败')); tx.oncomplete = () => db.close(); }); }
document.addEventListener('input', e => { if (e.target.closest('#submit-form')) saveDraft(); if (e.target.closest('#generate-form')) jobRequestId = ''; if (e.target.closest('#comment-form')) commentId = ''; });
document.addEventListener('change', e => {
  if (e.target.id === 'actor') guard(async () => { actor = e.target.value; localStorage.setItem(L.KEY + ':actor', actor); state.job = null; draftFiles = []; draftId = rid(); jobRequestId = ''; await navigate('profile'); });
  if (e.target.id === 'files') guard(async () => {
    const files = Array.from(e.target.files);
    if (files.length + draftFiles.length > 3) throw new Error('最多上传3份附件');
    for (const f of files) {
      if (!M.EXTENSIONS.includes(f.name.split('.').pop().toLowerCase())) throw new Error('暂不支持文件类型：' + f.name);
      if (!f.size || f.size > 20 * 1024 * 1024) throw new Error('每份附件需小于20MB');
      const id = 'local:' + actor + ':' + rid(); await storeFile(id, f); draftFiles.push({ fileId: id, name: f.name, size: f.size }); saveDraft();
    }
    $('#file-list').innerHTML = fileList(); e.target.value = '';
  });
});
document.addEventListener('submit', e => {
  e.preventDefault(); const form = e.target;
  guard(async () => {
    const data = getForm(form);
    if (form.id === 'submit-form') { saveDraft(); const w = await calls('submit', { ...data, files: draftFiles, requestId: draftId, agreementVersion: M.AGREEMENT_VERSION }); localStorage.removeItem(`youxi:draft:${actor}`); draftFiles = []; draftId = rid(); await navigate('work', w.id); toast('投稿成功，已进入私密评审流程'); }
    if (form.id === 'profile-form') { await calls('saveProfile', data); await load('profile'); toast('资料已保存'); }
    if (form.id === 'assign-form') { await calls('assign', { id: state.id, expertIds: new FormData(form).getAll('expertIds') }); await load('work', state.id); toast('专家已分配'); }
    if (form.id === 'review-form') { if (!confirm('提交后评分与意见会冻结，确认提交本次独立评审？')) return; const scores = {}; M.DIMENSIONS.forEach(d => { scores[d.key] = Number(data[d.key]); }); await calls('review', { id: state.id, scores, comment: data.comment, noConflict: data.noConflict }); await load('work', state.id); toast('独立评审已提交'); }
    if (form.id === 'incubate-form') { await calls('incubate', { id: state.id, schedule: data.schedule }); await load('work', state.id); toast('孵化安排及积分奖励已记录'); }
    if (form.id === 'reject-form') { await calls('rejectWork', { id: state.id, reason: data.reason }); await load('work', state.id); }
    if (form.id === 'generate-form') { if (!jobRequestId) jobRequestId = rid(); const j = await calls('generate', { ...data, requestId: jobRequestId }); state.job = j; if (j.status !== 'pending') jobRequestId = ''; await load('create'); $('#generated-result')?.scrollIntoView({ behavior: 'smooth' }); }
    if (form.id === 'comment-form') { if (!commentId) commentId = rid(); await calls('comment', { targetId: state.id, text: data.text, requestId: commentId }); commentId = ''; form.reset(); toast('评论已提交，审核后展示'); }
  });
});
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.nav) return guard(() => navigate(b.dataset.nav));
  const a = b.dataset.action, id = b.dataset.id;
  if (!a) return;
  guard(async () => {
    if (a === 'back') return navigate('home');
    if (a === 'submit-page') return navigate('submit');
    if (a === 'create-page') return navigate('create');
    if (['work', 'creator', 'desk', 'policy'].includes(a)) return navigate(a, id);
    if (a === 'remove-file') { draftFiles.splice(Number(b.dataset.index), 1); saveDraft(); $('#file-list').innerHTML = fileList(); }
    if (a === 'open-file') { const files = await calls('fileLinks', { id: state.id }); const f = files[Number(b.dataset.index)], blob = await readFile(f.fileId); if (!blob) throw new Error('本地附件已不存在，请从原投稿设备打开'); download(f.name, blob, blob.type); }
    if (a === 'publish-work') { await calls('publishWork', { id: state.id, published: !state.detail.published }); await load('work', state.id); toast('展示状态已更新'); }
    if (a === 'revoke-display') { await calls('revokeDisplay', { id: state.id }); await load('work', state.id); toast('已撤回作品展示授权'); }
    if (a === 'grant-expert') { if (!confirm('确认已核验该用户的真实专业身份、合作授权及评审规则？')) return; await calls('grantExpert', { userId: id, verified: true }); await load('desk'); }
    if (a === 'publish-profile') { await calls('publishProfile', { userId: id, published: b.dataset.value === 'true' }); await load('desk'); toast('主页展示已更新'); }
    if (a === 'moderate') { await calls('moderateComment', { id, status: b.dataset.value }); await load('desk'); toast('评论已审核'); }
    if (a === 'report') { const reason = prompt('请填写举报原因（至少5字）'); if (reason !== null) { await calls('report', { targetId: id, reason, requestId: rid() }); toast('举报已提交运营处理'); } }
    if (a === 'resolve-report') { await calls('resolveReport', { id, resolution: b.dataset.value }); await load('desk'); toast('举报已处理'); }
    if (a === 'job') { state.job = state.dashboard.jobs.find(j => j.id === id); render(); $('#generated-result')?.scrollIntoView({ behavior: 'smooth' }); }
    if (a === 'recover-job') { state.job = await calls('recoverGeneration', { id: state.job.id }); await load('create'); }
    if (a === 'export-text') download(state.job.input.title + '.txt', M.generationText(state.job));
    if (a === 'export-score') download(state.job.input.title + '.musicxml', M.musicXML(state.job), 'application/vnd.recordare.musicxml+xml');
    if (a === 'submit-job') { const j = state.job; draftId = rid(); localStorage.setItem(`youxi:draft:${actor}`, JSON.stringify({ title: j.input.title, text: M.generationText(j), genre: j.input.genre, workType: j.input.workType, aiUse: 'generated', requestId: draftId, files: [] })); await navigate('submit'); }
  });
});
async function start() {
  repo = L.createMemoryRepository(JSON.parse(localStorage.getItem(L.KEY) || '{}'), data => localStorage.setItem(L.KEY, JSON.stringify(data)));
  service = L.makeDemoService(repo);
  await L.seedDemo(repo, service);
  $('#actor').innerHTML = L.ACTORS.map(a => `<option value="${a.id}">${a.label}</option>`).join('');
  await load('home');
}
guard(start);
