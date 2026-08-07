<template>
  <div class="flex flex-col items-center justify-center py-16 text-center">
    <div class="mb-3 text-4xl text-gray-300">📄</div>
    <p class="text-sm text-gray-500">{{ message }}</p>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{ message: string }>()
</script>
