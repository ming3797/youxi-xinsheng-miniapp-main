const P = require('../../lib/page');
Page({
  data: P.base({ work: null, session: null, experts: [], selectedExpertIds: [], scores: P.M.DIMENSIONS.map(d => ({ ...d, value: 80 })), comment: '', noConflict: false, schedule: '', rejectionReason: '' }),
  onLoad(query) { this.id = query.id; this.load(); },
  async refresh() {
    const session = await P.api.call('bootstrap'), w = await P.api.call('getWork', { id: this.id });
    const mine = w.ownerId === session.user.ownerId, admin = session.user.role === 'admin';
    this.setData({ session, work: P.works([w])[0], mine, admin, canAssign: admin && ['submitted', 'needs_third'].includes(w.status), canPublish: admin && ['approved', 'incubating'].includes(w.status) && w.allowDisplay && session.features.showcase, canIncubate: admin && w.status === 'approved' && w.incubationCandidate, canReview: session.user.role === 'expert' && w.status === 'reviewing' && w.expertIds.includes(session.user.id) && !w.reviews.some(r => r.expertId === session.user.id), selectedExpertIds: w.expertIds || [], experts: session.experts.filter(e => e.id !== w.authorId).map(e => ({ ...e, checked: (w.expertIds || []).includes(e.id) })) });
  },
  load() { return P.task(this, () => this.refresh()); },
  pickExperts(e) { this.setData({ selectedExpertIds: e.detail.value }); },
  assign() { return this.mutate('assign', { expertIds: this.data.selectedExpertIds }); },
  field(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }); },
  score(e) { this.setData({ [`scores[${e.currentTarget.dataset.index}].value`]: Number(e.detail.value) }); },
  conflict(e) { this.setData({ noConflict: e.detail.value.length > 0 }); },
  async confirm(title, content) { const result = await new Promise(resolve => wx.showModal({ title, content, success: resolve })); return result.confirm; },
  review() { return P.task(this, async () => { if (!await this.confirm('提交独立评审', '提交后评分与意见将冻结，请确认已完成作品审阅。')) return; const scores = {}; this.data.scores.forEach(d => { scores[d.key] = d.value; }); await P.api.call('review', { id: this.id, scores, comment: this.data.comment, noConflict: this.data.noConflict }); await this.refresh(); }); },
  mutate(action, data) { return P.task(this, async () => { await P.api.call(action, { id: this.id, ...data }); await this.refresh(); }); },
  publish() { return this.mutate('publishWork', { published: !this.data.work.published }); },
  incubate() { return this.mutate('incubate', { schedule: this.data.schedule }); },
  reject() { return this.mutate('rejectWork', { reason: this.data.rejectionReason }); },
  revoke() { return this.mutate('revokeDisplay', {}); },
  file(e) { return P.task(this, async () => { const files = await P.api.call('fileLinks', { id: this.id }); await P.api.openFile(files[Number(e.currentTarget.dataset.index)]); }); },
  report() { return P.task(this, async () => { const r = await new Promise(resolve => wx.showModal({ title: '举报作品', editable: true, placeholderText: '请说明原因，至少5字', success: resolve })); if (r.confirm) { await P.api.call('report', { targetId: this.id, reason: r.content, requestId: P.api.requestId() }); wx.showToast({ title: '已提交运营处理', icon: 'none' }); } }); }
});
