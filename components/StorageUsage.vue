<script setup lang="ts">
import toastFactory from '~/composables/toast';
import {
  purgeAllArticleContentCaches,
  purgeExportedArticleCaches,
  type PurgeCacheResult,
} from '~/store/v2';

const usage = ref('');
const purgeExportedLoading = ref(false);
const purgeAllLoading = ref(false);
const toast = toastFactory();

function formatBytes(bytes: number) {
  if (bytes < 1000) {
    return `${bytes} B`;
  }
  if (bytes < 1000 ** 2) {
    return `${(bytes / 1000).toFixed(0)} kB`;
  }
  if (bytes < 1000 ** 3) {
    return `${(bytes / 1000 ** 2).toFixed(1)} M`;
  }
  return `${(bytes / 1000 ** 3).toFixed(1)} G`;
}

async function init() {
  const storageUsage = await navigator.storage.estimate();
  usage.value = formatBytes(storageUsage.usage || 0);
}

function describeResult(result: PurgeCacheResult) {
  return `已处理 ${result.articles} 篇文章，释放约 ${formatBytes(result.bytes)} 可统计缓存。`;
}

async function purgeExportedCaches() {
  if (!window.confirm('确定清理已导出文章在 IndexedDB 中的正文、图片资源和留言缓存吗？文章列表会保留。')) {
    return;
  }

  purgeExportedLoading.value = true;
  try {
    const result = await purgeExportedArticleCaches();
    await init();
    toast.success('清理已导出缓存完成', describeResult(result));
  } catch (error) {
    console.error('清理已导出缓存失败:', error);
    toast.error('清理失败', error instanceof Error ? error.message : '未知错误');
  } finally {
    purgeExportedLoading.value = false;
  }
}

async function purgeAllCaches() {
  if (!window.confirm('确定清理全部文章内容缓存吗？文章列表会保留，但未导出的文章需要重新抓取正文后才能导出。')) {
    return;
  }

  purgeAllLoading.value = true;
  try {
    const result = await purgeAllArticleContentCaches();
    await init();
    toast.success('清理全部内容缓存完成', describeResult(result));
  } catch (error) {
    console.error('清理全部内容缓存失败:', error);
    toast.error('清理失败', error instanceof Error ? error.message : '未知错误');
  } finally {
    purgeAllLoading.value = false;
  }
}

let timer: number;
onMounted(() => {
  init();
  timer = window.setInterval(() => {
    init();
  }, 1000);
});
onUnmounted(() => {
  window.clearInterval(timer);
});
</script>

<template>
  <div class="space-y-2">
    <p class="text-sm">
      本地数据库占用约为 <span class="text-rose-500">{{ usage }}</span>
    </p>
    <div class="flex flex-wrap gap-2">
      <UButton
        size="xs"
        color="gray"
        variant="soft"
        :loading="purgeExportedLoading"
        @click="purgeExportedCaches"
      >
        清理已导出缓存
      </UButton>
      <UButton
        size="xs"
        color="rose"
        variant="soft"
        :loading="purgeAllLoading"
        @click="purgeAllCaches"
      >
        清理全部内容缓存
      </UButton>
    </div>
  </div>
</template>
