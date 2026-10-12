const P = require('../../lib/page');
Page({
  data: P.base({ session: null, dashboard: null, ledger: [], genres: P.M.GENRES, genreIndex: 0, actors: P.api.actors, actorIndex: 0, form: { nickname: '', bio: '', genre: '豫剧', profileConsent: false }, passedCount: 0 }),
  onShow() { this.load(); },
  async refresh() {
    const session = await P.api.call('bootstrap'), dashboard = await P.api.call('dashboard'); const u = session.user;
    this.setData({ session, dashboard, form: { nickname: u.nickname, bio: u.bio, genre: u.genre, profileConsent: u.profileConsent }, genreIndex: P.M.GENRES.indexOf(u.genre), actorIndex: P.api.actors.findIndex(a => a.id === u.ownerId), ledger: dashboard.ledger.map(l => ({ ...l, date: P.formatTime(l.createdAt), deltaText: l.delta > 0 ? '+' + l.delta : String(l.delta) })), passedCount: dashboard.works.filter(w => ['approved', 'incubating'].includes(w.status)).length });
  },
  load() { return P.task(this, () => this.refresh()); },
  field(e) { this.setData({ [`form.${e.currentTarget.dataset.key}`]: e.detail.value }); },
  genre(e) { this.setData({ genreIndex: Number(e.detail.value), 'form.genre': P.M.GENRES[e.detail.value] }); },
  consent(e) { this.setData({ 'form.profileConsent': e.detail.value.length > 0 }); },
  save() { return P.task(this, async () => { await P.api.call('saveProfile', this.data.form); await this.refresh(); wx.showToast({ title: '个人资料已保存', icon: 'none' }); }); },
  actor(e) { return P.task(this, async () => { await P.api.switchActor(P.api.actors[e.detail.value].id); await this.refresh(); }); },
  desk() { wx.navigateTo({ url: '/pages/desk/index' }); },
  policy() { wx.navigateTo({ url: '/pages/policy/index' }); },
  publicPage() { wx.navigateTo({ url: `/pages/creator/index?id=${encodeURIComponent(this.data.session.user.id)}` }); },
  copyId() { wx.setClipboardData({ data: this.data.session.user.ownerId }); }
});
