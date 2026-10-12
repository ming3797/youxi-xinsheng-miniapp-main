const GENRES = ['豫剧', '京剧', '越剧', '黄梅戏', '昆曲', '评剧', '其他'];
const TYPES = [{ id: 'lyrics', label: '原创戏词', cost: 30 }, { id: 'score', label: '曲谱草稿', cost: 120 }, { id: 'both', label: '词谱一体', cost: 140 }];
const DIMENSIONS = [
  { key: 'originality', label: '原创与主题', weight: .2 },
  { key: 'tradition', label: '剧种与文化', weight: .2 },
  { key: 'completeness', label: '文学音乐完整度', weight: .25 },
  { key: 'performability', label: '可唱可演性', weight: .2 },
  { key: 'potential', label: '传播与孵化潜力', weight: .15 }
];
const STATUS = { submitted: '待受理', reviewing: '专家评审中', needs_third: '待第三位复核', approved: '评审通过', revision: '建议修改', rejected: '未受理', incubating: '孵化中' };
const EXTENSIONS = ['txt', 'pdf', 'png', 'jpg', 'jpeg', 'mp3', 'wav', 'm4a', 'mp4', 'mov', 'xml', 'musicxml', 'mid', 'midi'];
const AGREEMENT_VERSION = 'dev-2026-09-19';
const POLICY = { welcomePoints: 300, approvalPoints: 500, incubationPoints: 500, passScore: 80, incubationScore: 90, minDimension: 60, disputeGap: 15, jobTimeoutMs: 300000 };
class DomainError extends Error {
  constructor(code, message) { super(message); this.code = code; this.name = 'DomainError'; }
}
function assert(condition, code, message) { if (!condition) throw new DomainError(code, message); }
function text(value, max, label, min = 0) {
  assert(typeof value === 'string', 'VALIDATION', `${label}格式不正确`);
  const result = value.trim();
  assert(result.length >= min && result.length <= max, 'VALIDATION', `${label}需为${min}—${max}个字符`);
  return result;
}
function requestId(value) { assert(typeof value === 'string' && /^[a-zA-Z0-9_-]{8,48}$/.test(value), 'VALIDATION', '请求编号不正确'); return value; }
function scoreTotal(scores) {
  DIMENSIONS.forEach(d => assert(Number.isInteger(scores[d.key]) && scores[d.key] >= 0 && scores[d.key] <= 100, 'VALIDATION', '每项评分需为0—100的整数'));
  return Math.round(DIMENSIONS.reduce((sum, d) => sum + scores[d.key] * d.weight, 0) * 10) / 10;
}
function scoreDecision(reviews, policy) {
  if (reviews.length < 2) return { status: 'reviewing' };
  if (reviews.length === 2 && Math.abs(reviews[0].total - reviews[1].total) > policy.disputeGap) return { status: 'needs_third' };
  const totals = reviews.map(r => r.total).sort((a, b) => a - b);
  const total = reviews.length === 3 ? totals[1] : Math.round((totals[0] + totals[1]) * 5) / 10;
  const dimensions = DIMENSIONS.map(d => ({ key: d.key, label: d.label, value: Math.round(reviews.reduce((n, r) => n + r.scores[d.key], 0) / reviews.length * 10) / 10 }));
  const passed = total >= policy.passScore && dimensions.every(d => d.value >= policy.minDimension);
  return { total, dimensions, status: passed ? 'approved' : 'revision', incubationCandidate: passed && total >= policy.incubationScore };
}
function validateGeneration(value, kind) {
  assert(value && typeof value === 'object', 'AI_FORMAT', '生成结果格式错误');
  const result = { label: 'AI辅助创作草稿', lyrics: '', score: null, notes: text(value.notes || '用于创作讨论，定谱与演出前请专业老师复核。', 1600, '说明') };
  if (kind !== 'score') result.lyrics = text(value.lyrics, 10000, '生成戏词', 10);
  if (kind !== 'lyrics') {
    const s = value.score;
    assert(s && s.key === 'C' && s.meter === '4/4' && Number.isInteger(s.tempo) && s.tempo >= 40 && s.tempo <= 160, 'AI_FORMAT', '首版曲谱需为C调4/4拍，速度40—160');
    assert(Array.isArray(s.bars) && s.bars.length >= 2 && s.bars.length <= 32, 'AI_FORMAT', '曲谱需含2—32小节');
    assert(s.bars.every(b => Array.isArray(b) && b.length === 4 && b.every(n => Number.isInteger(n) && n >= 0 && n <= 7)), 'AI_FORMAT', '每小节需有四个四分音符，音高范围0—7');
    result.score = { key: 'C', meter: '4/4', tempo: s.tempo, bars: s.bars };
  }
  return result;
}
function xmlEscape(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
function musicXML(job) {
  const score = job.result && job.result.score;
  assert(score, 'NO_SCORE', '该作品没有曲谱');
  const steps = ['', 'C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const measures = score.bars.map((bar, i) => `<measure number="${i + 1}">${i === 0 ? '<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction><sound tempo="' + score.tempo + '"/></direction>' : ''}${bar.map(n => `<note>${n ? '<pitch><step>' + steps[n] + '</step><octave>4</octave></pitch>' : '<rest/>'}<duration>1</duration><type>quarter</type></note>`).join('')}</measure>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<score-partwise version="4.0"><work><work-title>${xmlEscape(job.input.title)}（AI辅助创作草稿）</work-title></work><identification><creator type="composer">AI辅助创作，待专业复核</creator><encoding><software>有戏新声开发版</software></encoding><miscellaneous><miscellaneous-field name="AI-generated">true</miscellaneous-field><miscellaneous-field name="generation-id">${xmlEscape(job.id)}</miscellaneous-field><miscellaneous-field name="provider">${xmlEscape(job.provider || 'unknown')}</miscellaneous-field></miscellaneous></identification><credit><credit-words>AI辅助创作草稿 · C调四分音符旋律练习 · 非专业定谱</credit-words></credit><part-list><score-part id="P1"><part-name>旋律草稿</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
}
function generationText(job) {
  return ['有戏新声 | AI辅助创作草稿', job.input.title, `来源：${job.provider || '未标记'}；记录：${job.id}`, job.result.lyrics, job.result.score ? `1=C  4/4  ♩=${job.result.score.tempo}\n${job.result.score.bars.map(b => b.join(' ')).join(' | ')}` : '', job.result.notes, '公开演出、定谱和商业使用前请专业老师复核。'].filter(Boolean).join('\n\n');
}
module.exports = { GENRES, TYPES, DIMENSIONS, STATUS, EXTENSIONS, AGREEMENT_VERSION, POLICY, DomainError, assert, text, requestId, scoreTotal, scoreDecision, validateGeneration, musicXML, generationText };
