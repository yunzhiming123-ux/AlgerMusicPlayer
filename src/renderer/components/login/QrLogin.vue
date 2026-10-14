<script lang="ts" setup>
import { useMessage } from 'naive-ui';
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

import { checkQr, createQr, getQrKey, getUserDetail } from '@/api/login';
import { setAnimationClass } from '@/utils';

defineOptions({
  name: 'QrLogin'
});

// Emits
interface Emits {
  (e: 'loginSuccess', userProfile: any, loginType: string): void;
  (e: 'loginError', error: string): void;
}

const emit = defineEmits<Emits>();

const { t } = useI18n();
const message = useMessage();

const qrUrl = ref<string>();
const timerRef = ref(null);
const qrStatus = ref<'loading' | 'active' | 'expired' | 'scanned' | 'confirmed' | 'error'>(
  'loading'
);
const isRefreshing = ref(false);
// 具体错误原因（页面直接展示，便于定位是超时、接口异常还是返回结构不匹配）
const errorDetail = ref('');
// 轮询接口连续失败次数（偶发网络抖动不应直接判定失败）
let checkFailCount = 0;

// 兼容不同版本接口的返回结构：{data:{unikey}} / {unikey} / {data:{data:{unikey}}}
const pickField = (payload: any, field: string) => {
  if (!payload) return undefined;
  return payload[field] ?? payload.data?.[field] ?? payload.data?.data?.[field];
};

const makeError = (msg: string, url: string) => new Error(`${msg} (${url})`);

// 把异常转成可读文本，并带上出错的接口地址
const describeError = (error: any) => {
  const msg = error?.message || String(error) || 'Unknown error';
  const url = error?.config?.url ? ` [${error.config.url}]` : '';
  return `${msg}${url}`;
};

const clearTimer = () => {
  if (timerRef.value) {
    clearInterval(timerRef.value);
    timerRef.value = null;
  }
};

const loadLogin = async () => {
  try {
    isRefreshing.value = true;
    qrStatus.value = 'loading';
    errorDetail.value = '';
    checkFailCount = 0;

    // 清理之前的定时器
    clearTimer();

    const qrKey = await getQrKey();
    const key = pickField(qrKey.data, 'unikey');
    if (!key) {
      throw makeError(
        `${t('login.message.qrKeyMissing')} (code=${qrKey.data?.code ?? 'unknown'})`,
        '/login/qr/key'
      );
    }

    const { data } = await createQr(key);
    const qrimg = pickField(data, 'qrimg');
    if (!qrimg) {
      throw makeError(
        `${t('login.message.qrImgMissing')} (code=${data?.code ?? 'unknown'})`,
        '/login/qr/create'
      );
    }
    qrUrl.value = qrimg;
    qrStatus.value = 'active';

    const timer = timerIsQr(key);
    timerRef.value = timer as any;
  } catch (error) {
    console.error(t('login.message.loadError'), error);
    // 请求/解析失败是"错误"，不是"过期"：单独展示，避免误提示二维码已过期
    qrStatus.value = 'error';
    errorDetail.value = describeError(error);
    const errorMsg = t('login.message.loadError');
    message.error(errorMsg);
    emit('loginError', errorMsg);
  } finally {
    isRefreshing.value = false;
  }
};

const timerIsQr = (key: string) => {
  const timer = setInterval(async () => {
    try {
      const { data } = await checkQr(key);
      const code = pickField(data, 'code');
      checkFailCount = 0;

      // 二维码过期或不存在
      if (code === 800) {
        qrStatus.value = 'expired';
        clearInterval(timer);
        timerRef.value = null;
        message.warning(t('login.message.qrExpiredWarning'));
        return;
      }

      // 等待扫码
      if (code === 801) {
        qrStatus.value = 'active';
        return;
      }

      // 已扫码，等待确认
      if (code === 802) {
        if (qrStatus.value !== 'scanned') {
          message.info(t('login.message.qrScannedInfo'));
        }
        qrStatus.value = 'scanned';
        return;
      }

      // 登录成功
      if (code === 803) {
        qrStatus.value = 'confirmed';
        const cookie = pickField(data, 'cookie');
        if (cookie) {
          localStorage.setItem('token', cookie);
        }
        const user = await getUserDetail();
        const profile = pickField(user.data, 'profile');
        if (!profile) {
          throw makeError(
            `${t('login.message.getUserFailed')} (code=${user.data?.code ?? 'unknown'})`,
            '/user/account'
          );
        }
        const successMsg = t('login.message.loginSuccess');
        message.success(successMsg);
        emit('loginSuccess', profile, 'qr');

        clearInterval(timer);
        timerRef.value = null;
      }
    } catch (error) {
      console.error(t('login.message.qrCheckError'), error);

      // 登录收尾阶段失败（如获取用户信息）：立即结束
      if (qrStatus.value === 'confirmed') {
        clearInterval(timer);
        timerRef.value = null;
        qrStatus.value = 'error';
        errorDetail.value = describeError(error);
        message.error(t('login.message.getUserFailed'));
        emit('loginError', t('login.message.getUserFailed'));
        return;
      }

      // 轮询接口偶发失败（超时、网络抖动）：连续 3 次才判定为失败
      checkFailCount += 1;
      if (checkFailCount < 3) return;

      clearInterval(timer);
      timerRef.value = null;
      qrStatus.value = 'error';
      errorDetail.value = describeError(error);
      message.error(t('login.message.qrCheckFailed'));
      emit('loginError', t('login.message.qrCheckFailed'));
    }
  }, 3000);

  return timer;
};

// 手动刷新二维码
const refreshQr = () => {
  loadLogin();
};

// 二维码图片加载失败（如接口返回的 base64 不完整）
const onQrImgError = () => {
  clearTimer();
  qrStatus.value = 'error';
  errorDetail.value = `${t('login.message.qrImgError')} (/login/qr/create)`;
};

// 获取状态显示文本
const getStatusText = () => {
  switch (qrStatus.value) {
    case 'loading':
      return t('login.message.qrLoading');
    case 'active':
      return t('login.qrTip');
    case 'expired':
      return t('login.message.qrExpired');
    case 'scanned':
      return t('login.message.qrScanned');
    case 'confirmed':
      return t('login.message.qrConfirmed');
    case 'error':
      return t('login.message.loadError');
    default:
      return t('login.qrTip');
  }
};

onMounted(() => {
  loadLogin();
});

onUnmounted(() => {
  clearTimer();
});
</script>

<template>
  <div class="qr-login" :class="setAnimationClass('animate__fadeInUp')">
    <div class="login-title">{{ t('login.title.qr') }}</div>

    <!-- 二维码容器 -->
    <div class="qr-container">
      <!-- 加载状态 -->
      <div v-if="qrStatus === 'loading'" class="qr-loading">
        <n-spin size="large" />
        <div class="loading-text">{{ t('login.message.qrGenerating') }}</div>
      </div>

      <!-- 错误状态：展示具体原因并可重试 -->
      <div v-else-if="qrStatus === 'error'" class="qr-error">
        <div class="error-text">{{ t('login.message.loadError') }}</div>
        <div class="error-detail">{{ errorDetail }}</div>
        <n-button type="primary" size="small" @click="refreshQr" :loading="isRefreshing">
          {{ isRefreshing ? t('login.button.refreshing') : t('login.button.refresh') }}
        </n-button>
      </div>

      <!-- 二维码图片 -->
      <div v-else class="qr-image-wrapper" :class="{ expired: qrStatus === 'expired' }">
        <img class="qr-img" :src="qrUrl" @error="onQrImgError" />

        <!-- 过期遮罩 -->
        <div v-if="qrStatus === 'expired'" class="expired-overlay">
          <div class="expired-text">{{ t('login.message.qrExpiredShort') }}</div>
          <n-button class="refresh-btn" type="primary" @click="refreshQr" :loading="isRefreshing">
            {{ isRefreshing ? t('login.button.refreshing') : t('login.button.refresh') }}
          </n-button>
        </div>

        <!-- 已扫码遮罩 -->
        <div v-if="qrStatus === 'scanned'" class="scanned-overlay">
          <div class="scanned-icon">✓</div>
          <div class="scanned-text">{{ t('login.message.qrScannedShort') }}</div>
        </div>
      </div>
    </div>

    <!-- 状态文本 -->
    <div class="text" :class="{ expired: qrStatus === 'expired', scanned: qrStatus === 'scanned' }">
      {{ getStatusText() }}
    </div>

    <!-- 手动刷新按钮 -->
    <div v-if="qrStatus === 'active'" class="refresh-area">
      <n-button text class="manual-refresh" @click="refreshQr" :loading="isRefreshing">
        {{ t('login.button.refreshQr') }}
      </n-button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.qr-login {
  animation-duration: 0.5s;
}

.login-title {
  @apply text-2xl font-bold mb-6 text-white;
}

.qr-container {
  @apply relative;
  width: 200px;
  height: 200px;
  @apply mx-auto;
}

.qr-loading {
  @apply flex flex-col items-center justify-center h-full;

  .loading-text {
    @apply mt-4 text-white text-sm;
  }
}

.qr-error {
  @apply flex flex-col items-center justify-center h-full text-center px-2;

  .error-text {
    @apply text-white text-sm font-medium mb-2;
  }

  .error-detail {
    @apply text-red-400 text-xs mb-3 break-all;
    max-height: 72px;
    overflow-y: auto;
  }
}

.qr-image-wrapper {
  @apply relative w-full h-full;

  &.expired {
    .qr-img {
      @apply opacity-30;
    }
  }
}

.qr-img {
  @apply w-full h-full rounded-2xl transition-all duration-300;
  object-fit: cover;
}

.expired-overlay {
  @apply absolute inset-0 flex flex-col items-center justify-center;
  @apply bg-black bg-opacity-50 rounded-2xl;

  .expired-text {
    @apply text-white text-sm mb-3;
  }

  .refresh-btn {
    @apply text-sm;
  }
}

.scanned-overlay {
  @apply absolute inset-0 flex flex-col items-center justify-center;
  @apply bg-green-500 bg-opacity-80 rounded-2xl;

  .scanned-icon {
    @apply text-white text-4xl font-bold mb-2;
  }

  .scanned-text {
    @apply text-white text-sm;
  }
}

.text {
  @apply mt-4 text-white text-xs transition-colors duration-300;

  &.expired {
    @apply text-orange-400;
  }

  &.scanned {
    @apply text-green-400;
  }
}

.refresh-area {
  @apply mt-3;

  .manual-refresh {
    @apply text-gray-300 hover:text-white text-xs;
  }
}
</style>
