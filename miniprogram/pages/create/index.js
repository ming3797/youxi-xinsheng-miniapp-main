const P = require('../../lib/page');
Page({
  data: P.base({ session: null, form: { title: '', scene: '', genre: '豫剧', workType: 'lyrics', aiConsent: false }, genres: P.M.GENRES, types: P.M.TYPES, genreIndex: 0, typeIndex: 0, job: null, notation: '', jobs: [] }),
  onShow() { this.load(); },
  async refresh() { const session = await P.api.call('bootstrap'), dashboard = await P.api.call('dashboard'); this.setData({ session, jobs: dashboard.jobs.map(j => ({ ...j, stateText: j.status === 'completed' ? '已完成' : j.status === 'failed' ? '已退回积分' : '生成中' })) }); },
  load() { return P.task(this, () => this.refresh()); },
  field(e) { this.pendingRequestId = ''; this.setData({ [`form.${e.currentTarget.dataset.key}`]: e.detail.value }); },
  genre(e) { this.pendingRequestId = ''; this.setData({ genreIndex: Number(e.detail.value), 'form.genre': P.M.GENRES[e.detail.value] }); },
  type(e) { this.pendingRequestId = ''; this.setData({ typeIndex: Number(e.detail.value), 'form.workType': P.M.TYPES[e.detail.value].id }); },
  consent(e) { this.setData({ 'form.aiConsent': e.detail.value.length > 0 }); },
  showJob(job) { this.setData({ job, notation: job.result && job.result.score ? job.result.score.bars.map(b => b.join(' ')).join(' | ') : '' }); },
  generate() { return P.task(this, async () => { if (!this.pendingRequestId) this.pendingRequestId = P.api.requestId(); const job = await P.api.call('generate', { ...this.data.form, requestId: this.pendingRequestId }); this.showJob(job); if (job.status !== 'pending') this.pendingRequestId = ''; await this.refresh(); }); },
  selectJob(e) { const job = this.data.jobs.find(j => j.id === e.currentTarget.dataset.id); this.showJob(job); },
  recover() { return P.task(this, async () => { const job = await P.api.call('recoverGeneration', { id: this.data.job.id }); this.showJob(job); await this.refresh(); }); },
  exportText() { return P.task(this, () => P.api.exportFile(this.data.job.input.title + '.txt', P.M.generationText(this.data.job))); },
  exportScore() { return P.task(this, () => P.api.exportFile(this.data.job.input.title + '.musicxml', P.M.musicXML(this.data.job))); },
  submitDraft() { wx.navigateTo({ url: `/pages/submit/index?fromJob=${encodeURIComponent(this.data.job.id)}` }); }
});
