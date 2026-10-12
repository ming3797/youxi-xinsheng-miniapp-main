const P = require('../../lib/page');
Page({
  data: P.base({ session: null, showcase: [], creators: [] }),
  onShow() { this.load(); },
  load() { return P.task(this, async () => { const session = await P.api.call('bootstrap'); this.setData({ session, showcase: P.works(session.showcase), creators: session.creators.map(c => ({ ...c, initial: c.nickname.slice(0, 1) })) }); }); },
  submit() { wx.navigateTo({ url: '/pages/submit/index' }); },
  create() { wx.switchTab({ url: '/pages/create/index' }); },
  openWork(e) { wx.navigateTo({ url: `/pages/work/index?id=${encodeURIComponent(e.currentTarget.dataset.id)}` }); },
  openCreator(e) { wx.navigateTo({ url: `/pages/creator/index?id=${encodeURIComponent(e.currentTarget.dataset.id)}` }); },
  desk() { wx.navigateTo({ url: '/pages/desk/index' }); }
});
