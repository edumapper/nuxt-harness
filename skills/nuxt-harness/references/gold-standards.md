# Gold Standards — Nuxt / Vue 3 Reference Implementations

These are the canonical patterns for each layer. Imitate them when building new components.

---

## Page (Assembler)

```vue
<!-- pages/formations/index.vue -->
<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'default' })
useSeoMeta({ title: 'Formations', description: 'Catalogue de formations' })

const route = useRoute()
</script>

<template>
  <!-- Only Orc* and Op* components. Never Presenters. -->
  <OrcFormationList
    :search="route.query.q as string"
    :page="Number(route.query.page) || 1"
  />
</template>
```

---

## Orchestrator (Smartest)

```vue
<!-- components/OrcFormationList.vue -->
<script setup lang="ts">
const props = defineProps<{ search?: string, page: number }>()

// Reads go through a domain query composable (useApiQuery + the queryKeys registry).
// The Orchestrator never calls useAsyncData, useFetch or $fetch for reads.
const { formations, isLoading, error } = useFormationList(() => ({ q: props.search, page: props.page }))
const localePath = useLocalePath()

async function handleSelect(formation: Formation): Promise<void> {
  await navigateTo(localePath({ name: 'formations-slug', params: { slug: formation.slug } }))
}

async function handlePageChange(newPage: number): Promise<void> {
  await navigateTo({ query: { page: newPage } })
}
</script>

<template>
  <OpFormationBrowser
    :formations="formations"
    :loading="isLoading"
    :error="error?.message"
    @select="handleSelect"
    @page-change="handlePageChange"
  />
</template>
```

---

## Operator (Smart)

```vue
<!-- components/OpFormationBrowser.vue -->
<script setup lang="ts">
interface Props {
  formations: Formation[]
  loading: boolean
  error?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  select: [formation: Formation]
  'page-change': [page: number]
}>()

// Local state for filtering — Operator's right
const searchText = ref('')
const filtered = computed(() =>
  props.formations.filter(f =>
    f.title.toLowerCase().includes(searchText.value.toLowerCase())
  )
)

// Can use domain composables (they own the data access)
const { toggleFavorite } = useFormationFavorites()

function handleSelect(formation: Formation): void {
  emit('select', formation)
}

const page = ref(1)
</script>

<template>
  <!-- UInput replaces a custom SearchBar presenter -->
  <UInput
    v-model="searchText"
    icon="i-tabler-search"
    placeholder="Rechercher une formation…"
    class="mb-4"
  />

  <!-- USkeleton while loading — replaces a custom LoadingGrid component -->
  <div v-if="props.loading" class="grid grid-cols-3 gap-4">
    <USkeleton v-for="n in 6" :key="n" class="h-48 rounded-lg" />
  </div>

  <!-- UAlert for errors — no custom ErrorBanner presenter needed -->
  <UAlert
    v-else-if="props.error"
    color="error"
    variant="soft"
    icon="i-tabler-alert-triangle"
    :description="props.error"
  />

  <div v-else class="grid grid-cols-3 gap-4">
    <FormationCard
      v-for="f in filtered"
      :key="f.id"
      v-bind="f"
      :is-favorite="f.favorite"
      @click="handleSelect(f)"
      @toggle-favorite="toggleFavorite.mutateAsync({ id: f.id, favorite: !f.favorite })"
    />
  </div>

  <!-- UPagination replaces a custom AppPagination presenter -->
  <UPagination
    v-model="page"
    :total="props.formations.length"
    :page-count="12"
    class="mt-6"
    @update:model-value="emit('page-change', $event)"
  />
</template>
```

---

## Presenter (Dumb)

Presenters use **NuxtUI primitives directly** — never raw HTML elements when a NuxtUI equivalent
exists, and never a custom wrapper component around NuxtUI.

```vue
<!-- components/FormationCard.vue -->
<script setup lang="ts">
/**
 * Displays a single formation card.
 * Receives ready-to-display data. No logic, no deps, no store.
 * Uses NuxtUI primitives (UCard, UButton, UBadge, UIcon) directly.
 */
interface Props {
  id: string
  title: string
  description: string
  thumbnailUrl: string
  duration: string
  isFavorite: boolean
  isLoading?: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  click: []
  'toggle-favorite': []
}>()
</script>

<template>
  <!-- UCard replaces the hand-rolled <article class="rounded-lg border"> pattern -->
  <UCard
    class="cursor-pointer"
    :ui="{ body: 'p-0' }"
    @click="emit('click')"
  >
    <img :src="thumbnailUrl" :alt="title" class="w-full rounded-t-lg" />

    <div class="p-4">
      <h3 class="font-semibold text-gray-900">{{ title }}</h3>
      <p class="text-sm text-gray-600 mt-1">{{ description }}</p>

      <div class="flex items-center justify-between mt-3">
        <!-- UBadge replaces <span class="text-xs"> -->
        <UBadge color="neutral" variant="soft">
          <UIcon name="i-tabler-clock" class="mr-1" />
          {{ duration }}
        </UBadge>

        <!-- UButton replaces <button class="text-amber-500"> -->
        <UButton
          color="amber"
          variant="ghost"
          :icon="isFavorite ? 'i-tabler-star-filled' : 'i-tabler-star'"
          :aria-label="isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'"
          @click.stop="emit('toggle-favorite')"
        />
      </div>
    </div>
  </UCard>
</template>
```

---

## Orchestrator with UForm (Form Submit)

```vue
<!-- components/OrcEnrollmentForm.vue -->
<script setup lang="ts">
import { z } from 'zod'

// Schema lives in the Orchestrator — Presenters never own validation logic
const schema = z.object({
  email: z.email('Email invalide'),
  consent: z.literal(true, 'Vous devez accepter les conditions'),
})

const state = reactive({ email: '', consent: false as boolean })

const props = defineProps<{ formationId: string }>()
const enroll = useEnrollFormation()
const toast = useToast()
const submitting = ref(false)

async function onSubmit(): Promise<void> {
  submitting.value = true // lock before the first await
  try {
    await enroll.mutateAsync({ formationId: props.formationId, email: state.email })
    toast.add({ title: 'Inscription confirmée', color: 'success', icon: 'i-tabler-circle-check' })
  } catch {
    // the mutation already rolled back and showed its error toast
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <!-- UForm handles schema validation, error display, and submit — no manual fieldsets -->
  <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
    <UFormField name="email" label="Email">
      <UInput v-model="state.email" type="email" placeholder="vous@example.com" />
    </UFormField>

    <UFormField name="consent">
      <UCheckbox v-model="state.consent" label="J'accepte les conditions d'utilisation" />
    </UFormField>

    <UButton type="submit" label="S'inscrire" :loading="submitting" block />
  </UForm>
</template>
```

---

## Data layer (Pinia Colada)

Server state lives in the Pinia Colada cache, never in a Pinia store. Four pieces, each with one owner:

### 1. Key registry: the only producer of keys and URLs

```ts
// utils/queryKeys.ts
export const queryKeys = {
  formations: {
    root: (): EntryKey => ['formations'],
    list: (params: { q?: string, page: number }): ApiQueryInput => ({
      key: ['formations', params],
      url: `/api/formations?${new URLSearchParams({ q: params.q ?? '', page: String(params.page) })}`,
      keepPrevious: true // paging keeps the previous page on screen
    }),
    detail: (slug: MaybeRefOrGetter<string>): ApiQueryInput => ({
      key: ['formations', toValue(slug)],
      url: `/api/formations/${toValue(slug)}`
    })
  }
}
```

Details live under their list root, so invalidating `['formations']` sweeps both. No string-literal key anywhere else.

### 2. Query composable: reads

```ts
// composables/useFormationList.ts
export function useFormationList(params: MaybeRefOrGetter<{ q?: string, page: number }>) {
  const { data, isLoading, error } = useApiQuery<{ formations: Formation[] }>(
    () => queryKeys.formations.list(toValue(params))
  )
  const formations = computed(() => data.value?.formations ?? [])
  return { formations, isLoading, error }
}
```

`useApiQuery` applies the shared cache policy (`staleTime: Infinity`, refetch only stale entries on mount, SSR errors land in `error`). Outside setup (a click, an idle prefetch), read through `fetchThroughCache(queryCache, input)`. Never `$fetch` + `setQueryData`, which creates an entry that is never invalidated.

### 3. Invalidation helper: the domain owns its refresh

```ts
// composables/useFormationInvalidation.ts
const FORMATION_TARGETS: InvalidationTarget[] = [{ key: queryKeys.formations.root() }]

export function useFormationInvalidation() {
  const queryCache = useQueryCache()
  return () => invalidateSettled(queryCache, FORMATION_TARGETS, 'formations') // logs, never throws
}
```

Callers never refetch on their own after a mutation; the helper does.

### 4. Mutation composable: optimistic writes

```ts
// composables/useFormationFavorites.ts
export function useFormationFavorites() {
  const invalidate = useFormationInvalidation()
  const toggleFavorite = useOptimisticListMutation<{ id: string, favorite: boolean }, { formation: Formation }>({
    // Mutations use $fetch, never useFetch
    mutation: vars => $fetch(`/api/formations/${vars.id}/favorite`, { method: 'PUT', body: { favorite: vars.favorite } }),
    // Every cached page of the list, patched before the server answers; rolled back on error
    targets: () => [{
      key: queryKeys.formations.root(),
      exact: false,
      apply: (current: { formations: Formation[] } | undefined, vars) => current && {
        ...current,
        formations: current.formations.map(f => f.id === vars.id ? { ...f, favorite: vars.favorite } : f)
      }
    }],
    invalidate,
    errorTitle: 'Impossible de mettre à jour le favori'
  })
  return { toggleFavorite }
}
```

The helper keeps the snapshot in the mutation's own context. It rolls back only where the cache still holds its optimistic value, toasts the error, and invalidates once the last overlapping mutation settles. A failed `mutateAsync` rejects after its toast. Callers that only need to stop a spinner catch it and don't add a second message.

Field-level editing of one entity (draft, dirty fields, PATCH, optimistic save) is `useEntityEditor` + `useOptimisticSave`, not this recipe.

---

## Key Patterns Summary

| Pattern | Rule |
|---------|------|
| `defineProps<T>()` | Always use type-based, never runtime syntax |
| `defineEmits<{...}>()` | Type-based with call signatures |
| `const emit = defineEmits<{}>()` | Explicitly declare emits |
| Server reads | `useApiQuery(queryKeys.x…)` inside a domain composable, called from an Orchestrator |
| Server writes | `useOptimisticListMutation` / `useEntityEditor` inside a domain composable; `$fetch`, never `useFetch` |
| Query keys and URLs | Only from the `queryKeys` registry |
| Server state in Pinia stores | Never — the Colada cache is the store |
| `useRouter()` | Only in Orchestrators and Operators |
| Export composables as named functions | `export function useFoo(): UseFooReturn` |
| Composable return type | Always explicit: `UseFooReturn` interface |
| `console.log` | Forbidden — use the evlog logger |
| `@ts-ignore` | Forbidden — fix the underlying type issue |
| Deep relative imports (`../../../`) | Forbidden — use `~/` or `@/` |

### NuxtUI Primitive Rules

| Anti-pattern | Correct approach |
|---|---|
| `<button class="bg-primary-500 …">` | `<UButton color="primary">` |
| `<input class="border rounded …">` | `<UInput>` |
| `<select>` / `<option>` | `<USelect :items>` |
| `<table><thead><tr>…` | `<UTable :data :columns>` |
| `<div class="rounded-lg border p-4">` card | `<UCard>` |
| `<span class="text-xs text-zinc-400">` label | `<UBadge color="neutral" variant="soft">` |
| `<div class="animate-pulse bg-gray-200">` skeleton | `<USkeleton>` |
| `<div v-if="error" class="text-red-500">` | `<UAlert color="error">` |
| Custom `AppButton.vue` wrapping `UButton` | Use `<UButton>` directly |
| Custom `AppModal.vue` wrapping `UModal` | Use `<UModal>` directly in Operator |
| Manual form error `<p>` tags | `<UForm :schema>` + `<UFormField>` |
| `useToast()` in a Presenter | Call `useToast()` in Orchestrator or composable only |
