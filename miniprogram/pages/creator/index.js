const P = require('../../lib/page');
Page({
  data: P.base({ creator: null, session: null, text: '' }),
  onLoad(query) { this.id = query.id; this.load(); },
  async refresh() { const session = await P.api.call('bootstrap'), c = await P.api.call('creator', { id: this.id }); this.setData({ session, creator: { ...c, initial: c.nickname.slice(0, 1), works: P.works(c.works), comments: c.comments.map(v => ({ ...v, date: P.formatTime(v.createdAt) })) } }); },
  load() { return P.task(this, () => this.refresh()); },
  field(e) { this.setData({ text: e.detail.value }); },
  comment() { return P.task(this, async () => { if (!this.commentId) this.commentId = P.api.requestId(); await P.api.call('comment', { targetId: this.id, text: this.data.text, requestId: this.commentId }); this.commentId = ''; this.setData({ text: '' }); wx.showToast({ title: '评论已提交，审核后展示', icon: 'none' }); }); },
  work(e) { wx.navigateTo({ url: `/pages/work/index?id=${encodeURIComponent(e.currentTarget.dataset.id)}` }); },
  report(e) { return P.task(this, async () => { const r = await new Promise(resolve => wx.showModal({ title: '举报公开内容', editable: true, placeholderText: '请填写原因，至少5字', success: resolve })); if (r.confirm) { await P.api.call('report', { targetId: e.currentTarget.dataset.id || this.id, reason: r.content, requestId: P.api.requestId() }); wx.showToast({ title: '已提交运营处理', icon: 'none' }); } }); }
});
