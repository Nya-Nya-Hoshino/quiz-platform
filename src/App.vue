<script setup lang="ts">
/**
 * 应用根组件：挂载后若已登录，恢复实时自动同步
 */
import { onMounted } from 'vue'
import AppLayout from './layouts/AppLayout.vue'
import { useAuthStore } from './stores/auth'

onMounted(() => {
  const auth = useAuthStore()
  if (auth.isLoggedIn) auth.startAutoSync()
})
</script>

<template>
  <AppLayout />
</template>
