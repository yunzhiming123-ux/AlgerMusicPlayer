/**
 * 打包前处理：允许 Android WebView 访问 http 明文接口。
 *
 * 背景：Android 9+ 默认禁止明文（http://）流量，而 AlgerMusicPlayer 的接口地址
 * （VITE_API）可能是 http://192.168.x.x 这类局域网地址，不开启会导致 APK 里
 * 所有请求都失败（浏览器里却一切正常，极难排查）。
 *
 * 用法（在 cap add android 之后执行）：
 *   node scripts/android-enable-cleartext.js
 */
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

if (!fs.existsSync(manifestPath)) {
  console.error(`[android] 未找到 ${manifestPath}，请先执行 npx cap add android`);
  process.exit(1);
}

let xml = fs.readFileSync(manifestPath, 'utf8');

if (xml.includes('usesCleartextTraffic')) {
  console.log('[android] usesCleartextTraffic 已存在，无需修改');
  process.exit(0);
}

const patched = xml.replace(/<application(\s[^>]*)?>/, (tag) => {
  return tag.replace(/>\s*$/, ' android:usesCleartextTraffic="true">');
});

if (patched === xml) {
  console.error('[android] 未能在 AndroidManifest.xml 中找到 <application> 标签');
  process.exit(1);
}

fs.writeFileSync(manifestPath, patched);
console.log('[android] 已开启 android:usesCleartextTraffic="true"（允许 http 接口）');
