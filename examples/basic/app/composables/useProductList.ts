import type { Product } from '#shared/types/product'

export interface UseProductListReturn {
  products: ComputedRef<Product[]>
  pending: Ref<boolean>
}

export function useProductList(): UseProductListReturn {
  const { data, pending } = useFetch('/api/products')
  const products = computed(() => data.value?.products ?? [])
  return { products, pending }
}
