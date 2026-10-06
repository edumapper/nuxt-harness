# Gold Standards — reference implementations

The canonical shape of each layer, on a small product-catalog feature. Imitate them when
building new components. Every `vue` block on this page passes the harness (`test/docs.test.ts`
lints them), so they are safe to copy.

The examples use [Nuxt UI](https://ui.nuxt.com) as the atom layer. With another component
library, keep the structure and swap the primitives.

---

## Page (Assembler)

```vue
<!-- app/pages/products/index.vue -->
<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'Products', description: 'Browse the catalog' })

const route = useRoute()
const search = computed(() => (typeof route.query.q === 'string' ? route.query.q : undefined))
const page = computed(() => Number(route.query.page) || 1)
</script>

<template>
  <!-- Only Orc* and Op* components. Never Presenters. -->
  <OrcProductList :search="search" :page="page" />
</template>
```

---

## Orchestrator (Smartest)

```vue
<!-- app/components/OrcProductList.vue -->
<script setup lang="ts">
import type { Product } from '#shared/types/product'

const props = defineProps<{ search?: string, page: number }>()

// Reads go through a domain composable; the Orchestrator never calls useFetch/$fetch itself.
const { products, pending, error } = useProductList(() => ({ q: props.search, page: props.page }))

async function handleSelect(product: Product): Promise<void> {
  await navigateTo({ name: 'products-slug', params: { slug: product.slug } })
}

async function handlePageChange(page: number): Promise<void> {
  await navigateTo({ query: { q: props.search, page } })
}
</script>

<template>
  <OpProductBrowser
    :products="products"
    :loading="pending"
    :error="error?.message"
    :page="props.page"
    @select="handleSelect"
    @page-change="handlePageChange"
  />
</template>
```

With `@nuxtjs/i18n`, wrap route locations in `localePath()`: `navigateTo(localePath({ name: 'products-slug', … }))`.

---

## Operator (Smart)

```vue
<!-- app/components/OpProductBrowser.vue -->
<script setup lang="ts">
import type { Product } from '#shared/types/product'

const props = defineProps<{
  products: Product[]
  loading: boolean
  error?: string
  page: number
}>()

const emit = defineEmits<{
  'select': [product: Product]
  'page-change': [page: number]
}>()

// Local UI state is the Operator's right
const filter = ref('')
const visible = computed(() =>
  props.products.filter(p => p.name.toLowerCase().includes(filter.value.toLowerCase()))
)

// Domain composables own their data access — calling one is fine here
const { toggleFavorite } = useProductFavorites()
</script>

<template>
  <UInput v-model="filter" icon="i-lucide-search" placeholder="Filter products…" class="mb-4" />

  <div v-if="props.loading" class="grid grid-cols-3 gap-4">
    <USkeleton v-for="n in 6" :key="n" class="h-48" />
  </div>

  <UAlert v-else-if="props.error" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="props.error" />

  <div v-else class="grid grid-cols-3 gap-4">
    <ProductCard
      v-for="p in visible"
      :key="p.id"
      :name="p.name"
      :price="p.priceLabel"
      :image-url="p.imageUrl"
      :favorite="p.favorite"
      @select="emit('select', p)"
      @toggle-favorite="toggleFavorite(p)"
    />
  </div>

  <UPagination
    :page="props.page"
    :total="props.products.length"
    class="mt-6"
    @update:page="emit('page-change', $event)"
  />
</template>
```

---

## Presenter (Dumb)

Presenters use the atom layer directly: no store, no fetch, no navigation, no formatting.
The parent hands over ready-to-display values (`price` is already a label).

```vue
<!-- app/components/ProductCard.vue -->
<script setup lang="ts">
defineProps<{
  name: string
  price: string
  imageUrl: string
  favorite: boolean
}>()

const emit = defineEmits<{
  'select': []
  'toggle-favorite': []
}>()
</script>

<template>
  <UCard class="cursor-pointer" :ui="{ body: 'p-0' }" @click="emit('select')">
    <img :src="imageUrl" :alt="name" class="w-full">

    <div class="p-4">
      <h3 class="font-semibold text-highlighted">
        {{ name }}
      </h3>

      <div class="mt-3 flex items-center justify-between">
        <UBadge color="neutral" variant="soft" :label="price" />
        <UButton
          color="primary"
          variant="ghost"
          :icon="favorite ? 'i-lucide-heart-off' : 'i-lucide-heart'"
          :aria-label="favorite ? 'Remove from favorites' : 'Add to favorites'"
          @click.stop="emit('toggle-favorite')"
        />
      </div>
    </div>
  </UCard>
</template>
```

---

## Orchestrator with a form

```vue
<!-- app/components/OrcNewsletterForm.vue -->
<script setup lang="ts">
import { z } from 'zod'

// The schema lives with the smart component; Presenters never own validation
const schema = z.object({
  email: z.email('Enter a valid email'),
  consent: z.literal(true, 'Please accept the terms')
})

const state = reactive({ email: '', consent: false })
const subscribe = useNewsletterSubscribe()
const toast = useToast()
const submitting = ref(false)

async function onSubmit(): Promise<void> {
  submitting.value = true // lock before the first await
  try {
    await subscribe(state.email)
    toast.add({ title: 'Subscribed', color: 'success', icon: 'i-lucide-circle-check' })
  } catch (error) {
    toast.add({ title: 'Subscription failed', description: String(error), color: 'error' })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
    <UFormField name="email" label="Email">
      <UInput v-model="state.email" type="email" placeholder="you@example.com" />
    </UFormField>

    <UFormField name="consent">
      <UCheckbox v-model="state.consent" label="I accept the terms" />
    </UFormField>

    <UButton type="submit" label="Subscribe" :loading="submitting" block />
  </UForm>
</template>
```

---

## Data layer

Components never talk to the network directly. A **domain composable** owns each read and
write, so the Orchestrator stays readable and the call is testable on its own.

### Reads: a query composable

```ts
// app/composables/useProductList.ts
import type { Product } from '#shared/types/product'

export interface UseProductListReturn {
  products: ComputedRef<Product[]>
  pending: Ref<boolean>
  error: Ref<Error | undefined>
}

export function useProductList(params: MaybeRefOrGetter<{ q?: string, page: number }>): UseProductListReturn {
  const { data, pending, error } = useFetch('/api/products', {
    query: computed(() => toValue(params)),
    key: computed(() => `products:${JSON.stringify(toValue(params))}`)
  })
  const products = computed(() => data.value?.products ?? [])
  return { products, pending, error: computed(() => error.value ?? undefined) }
}
```

### Writes: a mutation composable

```ts
// app/composables/useProductFavorites.ts
import type { Product } from '#shared/types/product'

export function useProductFavorites() {
  async function toggleFavorite(product: Product): Promise<void> {
    // Mutations use $fetch, never useFetch
    await $fetch(`/api/products/${product.id}/favorite`, { method: 'PUT', body: { favorite: !product.favorite } })
    await refreshNuxtData('products') // the composable owns the refresh, callers don't
  }
  return { toggleFavorite }
}
```

### With a query cache (Pinia Colada, TanStack Query)

The layering is identical: `useQuery`/`useMutation` live in the domain composable, never in a
component. Keep query keys in one registry module so invalidation can't miss a spelling, and
declare your own wrappers in `dataComposables` so Presenters can't call them either:

```js
// nuxt-harness.config.mjs
export default { dataComposables: ['useApiQuery', 'useApiMutation'] }
```

### Server routes: validate the body

```ts
// server/api/products/[id]/favorite.put.ts
import { z } from 'zod'

const bodySchema = z.object({ favorite: z.boolean() })

export default defineEventHandler(async (event) => {
  const { favorite } = await readValidatedBody(event, bodySchema.parse)
  const id = getRouterParam(event, 'id')
  return setFavorite(id, favorite)
})
```

---

## Key patterns

| Pattern | Rule |
|---------|------|
| `defineProps<T>()` / `defineEmits<{…}>()` | Always type-based, never runtime syntax |
| Server reads | Domain composable (`useFetch`/`useAsyncData`/`useQuery`), called from an Orchestrator |
| Server writes | `$fetch` inside a domain composable, which owns the refresh |
| Request bodies | `readValidatedBody(event, schema.parse)` |
| `useRouter()` / `navigateTo()` | Orchestrators, Operators, Pages and middleware only |
| Composable return type | Explicit (`UseFooReturn`) for anything shared |
| `console.log` | Forbidden — remove it or use the app's logger |
| `@ts-ignore`, `@ts-expect-error` | Forbidden — fix the type |
| Deep relative imports (`../../`) | Forbidden — use `~/`, `~~/`, `#shared` |

### Atom-layer rules (Nuxt UI)

| Anti-pattern | Correct approach |
|---|---|
| `<button class="…">` styled by hand | `<UButton color="primary">` |
| `<input class="border rounded …">` | `<UInput>` |
| `<select>` / `<option>` | `<USelect :items>` |
| `<table><thead><tr>…` | `<UTable :data :columns>` |
| Hand-rolled bordered card | `<UCard>` |
| `animate-pulse` placeholder | `<USkeleton>` |
| Error `<div>` | `<UAlert color="error">` |
| `AppButton.vue` wrapping `UButton` | Use `<UButton>` directly |
| Manual form error `<p>` tags | `<UForm :schema>` + `<UFormField>` |
| `useToast()` in a Presenter | Orchestrator or composable only |
