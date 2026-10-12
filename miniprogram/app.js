const config = require('./config');
App({
  onLaunch() {
    if (config.mode === 'cloud') {
      if (!config.cloudEnv || !wx.cloud) { this.globalData.configError = '请填写云环境ID，并使用支持云开发的基础库'; return; }
      wx.cloud.init({ env: config.cloudEnv, traceUser: false });
    }
  },
  globalData: { configError: '' }
});
