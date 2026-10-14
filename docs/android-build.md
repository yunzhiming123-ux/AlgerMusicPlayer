# 打包 Android APK

本项目是 Capacitor 工程：`npm run build` 产出的网页（`out/renderer`）会被打进 Android WebView。
Android 原生工程（`android/`）不入库，由 `npx cap add android` 按需生成。

## 方式一：GitHub Actions 云打包（推荐，无需本地 Android 环境）

前提：一个 GitHub 账号。

1. **Fork 本仓库**到自己的账号。

2. **推送代码**（本仓库的修改）到你 fork 的 `main` 分支。

3. **配置接口地址 Secret**
   进入你 fork 的仓库 → `Settings` → `Secrets and variables` → `Actions` → `New repository secret`：

   | Name | Value |
   | --- | --- |
   | `VITE_API` | 手机能访问到的接口地址，如 `https://你的接口域名` 或 `http://192.168.1.5:30488` |

   说明：
   - 这是网页版/移动端唯一的接口来源（桌面端 Electron 用本地接口，不走这个值）。
   - 填错（不是 `http` 开头）时工作流会直接报错并提示。
   - `http://` 明文接口已通过 `scripts/android-enable-cleartext.js` 放行，可放心使用。

4. **触发构建**
   - 推送到 `main` 会自动触发；或
   - 打开 `Actions` → `Build Android APK` → `Run workflow` 手动触发。

5. **下载 APK**
   构建完成后（约 3~6 分钟），在该次运行页面底部的 `Artifacts` 中下载
   `AlgerMusicPlayer-debug-apk`，解压得到 `app-debug.apk`，传到手机安装即可
   （安装时需允许"安装未知来源应用"）。

## 方式二：本地打包

前置条件：

- Node.js 18+
- JDK 17
- Android SDK（安装 [Android Studio](https://developer.android.com/studio) 最省事，
  或单独装 commandline-tools + platform + build-tools）

步骤（PowerShell / bash 通用）：

```bash
# 1. 安装依赖（跳过 electron 下载等脚本，网页打包用不到）
npm install --ignore-scripts

# 2. 配置接口地址
echo "VITE_API = https://你的接口地址" > .env.production.local

# 3. 构建网页产物
npm run build

# 4. 生成 Android 工程并同步网页资源
npx cap add android
node scripts/android-enable-cleartext.js   # 允许 http 接口
npx cap sync android

# 5. 打包
cd android
./gradlew assembleDebug        # Windows 用: gradlew.bat assembleDebug
```

产物路径：`android/app/build/outputs/apk/debug/app-debug.apk`

## 常见问题

**Q: 构建报 `VITE_API 未配置或不以 http 开头`？**
A: fork 仓库里没设置名为 `VITE_API` 的 Secret，见上文第 3 步。

**Q: APK 装上后所有接口都失败，但浏览器里同一地址一切正常？**
A: 多半是接口地址在手机上不可达（例如填了 `127.0.0.1`——那指的是手机自己），
或电脑与手机不在同一 Wi-Fi。把地址换成本机局域网 IP（`ipconfig` 查看）或公网地址。

**Q: 扫码登录提示"加载登录信息时出错"？**
A: 登录页会直接显示具体错误和出错的接口，例如
`接口未返回二维码key (code=200) (/login/qr/key)`，按提示排查返回结构或网络。
