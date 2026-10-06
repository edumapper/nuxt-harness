<script setup lang="ts">
import type { Product } from '#shared/types/product'

defineProps<{ products: Product[] }>()
const emit = defineEmits<{ select: [product: Product] }>()
</script>

<template>
  <ul>
    <li v-for="product in products" :key="product.id">
      <button type="button" @click="emit('select', product)">
        {{ product.name }} — {{ product.priceLabel }}
      </button>
    </li>
  </ul>
</template>
