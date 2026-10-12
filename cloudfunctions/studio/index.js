const cloud = require('wx-server-sdk');
const crypto = require('node:crypto');
const { createService } = require('./lib/core');
const { DomainError } = require('./lib/model');
const { createCloudRepository } = require('./repository');
const { generate } = require('./provider');
const { createFileServices } = require('./files');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const database = cloud.database({ throwOnNotFound: false });
const repo = createCloudRepository(database);

exports.main = async event => {
  const context = cloud.getWXContext();
  // 仅信任微信执行环境的 OPENID，不接收 event.openid / actor / role。
  if (!context.OPENID) return { ok: false, error: { code: 'UNAUTHENTICATED', message: '请从微信小程序登录后调用' } };
  // 业务账号使用不可逆别名，公开路由和数据库不保存原始微信 OpenID。
  const actor = crypto.createHash('sha256').update('youxi-account-v1:' + context.OPENID).digest('hex');
  const features = {
    generation: process.env.AI_ENABLED === 'true' && Boolean(process.env.AI_URL && process.env.AI_KEY && process.env.AI_MODEL),
    showcase: process.env.SHOWCASE_ENABLED === 'true',
    comments: process.env.SHOWCASE_ENABLED === 'true' && process.env.COMMENTS_ENABLED === 'true'
  };
  const service = createService({
    repo,
    adminIds: (process.env.ADMIN_ACCOUNT_IDS || '').split(',').map(v => v.trim()).filter(Boolean),
    features,
    providerName: process.env.AI_MODEL || '未配置',
    generate,
    ...createFileServices(cloud, context.ENV || process.env.TCB_ENV)
  });
  try {
    if (!event || typeof event.action !== 'string' || !event.data || typeof event.data !== 'object' || Array.isArray(event.data)) throw new DomainError('VALIDATION', '请求格式错误');
    const data = await service.run(actor, event.action, event.data);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: { code: error.code, message: error.message } };
    // 不把正文、证件、模型密钥和原始供应商错误写入日志或返回客户端。
    console.error('studio-failure', { action: event && event.action, code: String(error.code || error.errCode || 'INTERNAL').slice(0, 80) });
    return { ok: false, error: { code: 'SERVICE_UNAVAILABLE', message: '服务暂不可用，请稍后重试。重复提交不会重复扣分。' } };
  }
};
