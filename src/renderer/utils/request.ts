import axios, { InternalAxiosRequestConfig } from 'axios';

import { useUserStore } from '@/store/modules/user';

import { getSetData, isElectron, isMobile } from '.';

let setData: any = null;

// 扩展请求配置接口
interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  retryCount?: number;
  noRetry?: boolean;
}

const baseURL = window.electron
  ? `http://127.0.0.1:${setData?.musicApiPort}`
  : import.meta.env.VITE_API;

const request = axios.create({
  baseURL,
  timeout: 15000,
  withCredentials: true
});

// 非 Electron 环境（Web / 移动端 / Android WebView）依赖构建时注入的 VITE_API，
// 缺失时所有接口都会失败，这里给出明确告警便于定位
if (!window.electron && !import.meta.env.VITE_API) {
  console.error(
    '[request] VITE_API 未配置，接口请求将全部失败（构建时请配置 .env.production.local 中的 VITE_API）'
  );
}

// 最大重试次数
const MAX_RETRIES = 1;
// 重试延迟（毫秒）
const RETRY_DELAY = 500;

// 请求拦截器
request.interceptors.request.use(
  (config: CustomAxiosRequestConfig) => {
    setData = getSetData();
    config.baseURL = window.electron
      ? `http://127.0.0.1:${setData?.musicApiPort}`
      : import.meta.env.VITE_API;
    // 只在retryCount未定义时初始化为0
    if (config.retryCount === undefined) {
      config.retryCount = 0;
    }

    // 在请求发送之前做一些处理
    // 在get请求params中添加timestamp
    config.params = {
      ...config.params,
      timestamp: Date.now(),
      device: isElectron ? 'pc' : isMobile ? 'mobile' : 'web'
    };
    const token = localStorage.getItem('token');
    if (token && config.method !== 'post') {
      config.params.cookie = config.params.cookie !== undefined ? config.params.cookie : token;
    } else if (token && config.method === 'post') {
      config.data = {
        ...config.data,
        cookie: token
      };
    }
    if (isElectron) {
      const proxyConfig = setData?.proxyConfig;
      if (proxyConfig?.enable && ['http', 'https'].includes(proxyConfig?.protocol)) {
        config.params.proxy = `${proxyConfig.protocol}://${proxyConfig.host}:${proxyConfig.port}`;
      }
      if (setData.enableRealIP && setData.realIP) {
        config.params.realIP = setData.realIP;
      }
    }

    return config;
  },
  (error) => {
    // 当请求异常时做一些处理
    return Promise.reject(error);
  }
);

// 二维码相关接口不自动重试：接口本身 15s 超时，再重试会让登录页长时间停留在"加载中"
const NO_RETRY_URLS = ['/login/qr/key', '/login/qr/create', '/login/qr/check'];

// 响应拦截器
request.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    console.error('error', error);
    const config = error.config as CustomAxiosRequestConfig;

    // 如果没有配置，直接返回错误
    if (!config) {
      return Promise.reject(error);
    }

    // 处理 301 状态码：登录态失效，重试同一请求无意义，清除登录信息后直接拒绝
    if (error.response?.status === 301 && config.params?.noLogin !== true) {
      // 使用 store mutation 清除用户信息
      const userStore = useUserStore();
      userStore.handleLogout();
      console.log('301 状态码：登录态已失效，已清除登录信息，不再重试');
      return Promise.reject(error);
    }

    // 检查是否还可以重试
    if (
      config.retryCount !== undefined &&
      config.retryCount < MAX_RETRIES &&
      !NO_RETRY_URLS.includes(config.url as string) &&
      !config.noRetry
    ) {
      config.retryCount++;
      console.error(`请求重试第 ${config.retryCount} 次`);

      // 延迟重试
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));

      // 重新发起请求
      return request(config);
    }

    console.error(`重试${MAX_RETRIES}次后仍然失败`);
    return Promise.reject(error);
  }
);

export default request;
