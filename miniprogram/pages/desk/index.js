const P = require('../../lib/page');
Page({
  data: P.base({ session: null, works: [], users: [], comments: [], reports: [] }),
  onShow() { this.load(); },
  async refresh() { const session = await P.api.call('bootstrap'), d = await P.api.call('desk'); this.setData({ session, works: P.works(d.works), users: d.users, comments: d.comments, reports: d.reports }); },
  load() { return P.task(this, () => this.refresh()); },
  open(e) { wx.navigateTo({ url: `/pages/work/index?id=${encodeURIComponent(e.currentTarget.dataset.id)}` }); },
  publishProfile(e) { return this.mutate('publishProfile', { userId: e.currentTarget.dataset.id, published: !e.currentTarget.dataset.published }); },
  grant(e) { return P.task(this, async () => { const r = await new Promise(resolve => wx.showModal({ title: '核验专家身份', content: '确认已核验该用户的真实专业身份、合作授权及评审规则？', success: resolve })); if (r.confirm) { await P.api.call('grantExpert', { userId: e.currentTarget.dataset.id, verified: true }); await this.refresh(); } }); },
  moderate(e) { return this.mutate('moderateComment', { id: e.currentTarget.dataset.id, status: e.currentTarget.dataset.status }); },
  resolve(e) { return this.mutate('resolveReport', { id: e.currentTarget.dataset.id, resolution: e.currentTarget.dataset.resolution }); },
  mutate(action, data) { return P.task(this, async () => { await P.api.call(action, data); await this.refresh(); }); }
});
