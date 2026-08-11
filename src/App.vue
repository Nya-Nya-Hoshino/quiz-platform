<script setup lang="ts">
/**
 * 应用根组件：挂载后若已登录，恢复实时自动同步
 */
import { onMounted } from 'vue'
import AppLayout from './layouts/AppLayout.vue'
import { useAuthStore } from './stores/auth'

onMounted(async () => {
  const auth = useAuthStore()
  if (auth.isLoggedIn) {
    // 先拉取云端最新（其他设备的数据/进度/错题同步到本机），再开启自动同步
    try {
      await auth.syncFromCloud()
    } catch {
      /* 拉取失败忽略，使用本地数据 */
    }
    auth.startAutoSync()
    void auth.validateToken()
  }
})
</script>

<template>
  <AppLayout />
</template>
