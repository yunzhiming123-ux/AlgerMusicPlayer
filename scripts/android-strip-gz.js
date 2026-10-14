/**
 * 打包前处理：删除同步进 Android 工程的 .gz/.br 压缩副本。
 *
 * 背景：构建网页时 vite-plugin-compression 会在 out/renderer 里额外生成
 * index.html.gz、*.js.gz 等文件，`npx cap sync android` 会把它们一并拷入
 * android/app/src/main/assets/public。Android Gradle Plugin 8 会把 x.gz 与 x
 * 识别成同一资源路径，导致 mergeDebugAssets 直接失败：
 *   Execution failed for task ':app:mergeDebugAssets'.
 *     > [public/index.html] ...index.html.gz  [public/index.html] ...index.html
 *
 * 这些压缩副本只在网页服务器上有意义，APK 本身就是 zip 压缩格式，
 * 端上用不到它们，删掉即可。
 *
 * 用法（在 npx cap sync android 之后执行）：
 *   node scripts/android-strip-gz.js
 */
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public');

if (!fs.existsSync(assetsDir)) {
  console.log(`[android] 未找到 ${assetsDir}，跳过压缩副本清理（请先执行 npx cap sync android）`);
  process.exit(0);
}

const removed = [];

const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (/\.(gz|br)$/.test(entry.name)) {
      fs.rmSync(fullPath, { force: true });
      removed.push(path.relative(assetsDir, fullPath));
    }
  }
};

walk(assetsDir);

if (removed.length === 0) {
  console.log('[android] 未发现 .gz/.br 压缩副本');
} else {
  console.log(`[android] 已删除 ${removed.length} 个压缩副本: ${removed.join(', ')}`);
}
