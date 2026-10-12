const P = require('../../lib/page');
Page({
  data: P.base({ works: [], user: null }),
  onShow() { this.load(); },
  load() { return P.task(this, async () => { const d = await P.api.call('dashboard'); this.setData({ works: P.works(d.works), user: d.user }); }); },
  open(e) { wx.navigateTo({ url: `/pages/work/index?id=${encodeURIComponent(e.currentTarget.dataset.id)}` }); },
  submit() { wx.navigateTo({ url: '/pages/submit/index' }); }
});
