import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.alger.music',
  appName: 'AlgerMusicPlayer',
  // 与 npm run build (electron-vite build) 的网页产物目录一致
  webDir: 'out/renderer',
  backgroundColor: '#18181c',
  // 与官方 APK (v5.1.0 capacitor.config.json) 保持一致：
  // http 源 + 允许明文/混合内容，保证 VITE_API 为 http:// 时请求不被拦截
  server: {
    androidScheme: 'http',
    cleartext: true
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
