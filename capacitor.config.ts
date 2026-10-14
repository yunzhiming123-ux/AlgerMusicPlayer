import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.alger.music',
  appName: 'AlgerMusicPlayer',
  // 与 npm run build (electron-vite build) 的网页产物目录一致
  webDir: 'out/renderer',
  backgroundColor: '#18181c',
  server: {
    androidScheme: 'https'
  }
};

export default config;
