<script setup lang="ts">
import type { Product } from '#shared/types/product'

const { products, pending } = useProductList()

async function handleSelect(product: Product): Promise<void> {
  await navigateTo({ path: '/products', query: { selected: product.slug } })
}
</script>

<template>
  <p v-if="pending">
    Loading…
  </p>
  <ProductList v-else :products="products" @select="handleSelect" />
</template>
