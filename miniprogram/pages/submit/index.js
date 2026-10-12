const P = require('../../lib/page');
const initial = () => ({ title: '', text: '', genre: '豫剧', workType: 'lyrics', aiUse: 'none', original: false, adult: false, reviewConsent: false, allowDisplay: false, files: [], requestId: P.api.requestId(), agreementVersion: P.M.AGREEMENT_VERSION });
Page({
  data: P.base({ form: initial(), genres: P.M.GENRES, types: P.M.TYPES, genreIndex: 0, typeIndex: 0, aiIndex: 0, aiLabels: ['未使用AI', 'AI辅助修改', '主要由AI生成'] }),
  async onLoad(query) {
    await P.task(this, async () => {
      const session = await P.api.call('bootstrap'); this.draftKey = `youxi:draft:${session.user.id}`;
      let form = wx.getStorageSync(this.draftKey) || initial();
      if (query.fromJob) { const dashboard = await P.api.call('dashboard'); const job = dashboard.jobs.find(j => j.id === query.fromJob && j.status === 'completed'); if (job) form = { ...initial(), title: job.input.title, genre: job.input.genre, text: P.M.generationText(job), workType: job.input.workType, aiUse: 'generated' }; }
      this.setData({ form, genreIndex: P.M.GENRES.indexOf(form.genre), typeIndex: P.M.TYPES.findIndex(t => t.id === form.workType), aiIndex: ['none', 'assisted', 'generated'].indexOf(form.aiUse) });
    });
  },
  persist() { if (this.draftKey) wx.setStorageSync(this.draftKey, this.data.form); },
  field(e) { this.setData({ [`form.${e.currentTarget.dataset.key}`]: e.detail.value }); this.persist(); },
  check(e) { this.setData({ [`form.${e.currentTarget.dataset.key}`]: e.detail.value.length > 0 }); this.persist(); },
  genre(e) { this.setData({ genreIndex: Number(e.detail.value), 'form.genre': P.M.GENRES[e.detail.value] }); this.persist(); },
  type(e) { this.setData({ typeIndex: Number(e.detail.value), 'form.workType': P.M.TYPES[e.detail.value].id }); this.persist(); },
  ai(e) { this.setData({ aiIndex: Number(e.detail.value), 'form.aiUse': ['none', 'assisted', 'generated'][e.detail.value] }); this.persist(); },
  chooseFile() { return P.task(this, async () => {
    const remaining = 3 - this.data.form.files.length; if (remaining <= 0) throw new Error('最多上传3个附件');
    const chosen = await new Promise((resolve, reject) => wx.chooseMessageFile({ count: remaining, type: 'all', success: resolve, fail: reject }));
    for (const f of chosen.tempFiles) { const uploaded = await P.api.upload(f); this.setData({ 'form.files': this.data.form.files.concat(uploaded) }); this.persist(); }
  }); },
  removeFile(e) { this.setData({ 'form.files': this.data.form.files.filter((_, i) => i !== Number(e.currentTarget.dataset.index)) }); this.persist(); },
  policy() { wx.navigateTo({ url: '/pages/policy/index' }); },
  submit() { return P.task(this, async () => { const result = await P.api.call('submit', this.data.form); wx.removeStorageSync(this.draftKey); wx.redirectTo({ url: `/pages/work/index?id=${encodeURIComponent(result.id)}` }); }); }
});
