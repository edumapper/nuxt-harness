import type { Product } from '#shared/types/product'

const PRODUCTS: Product[] = [
  { id: '1', slug: 'desk-lamp', name: 'Desk lamp', priceLabel: '€39' },
  { id: '2', slug: 'notebook', name: 'Notebook', priceLabel: '€9' }
]

export default defineEventHandler(() => ({ products: PRODUCTS }))
