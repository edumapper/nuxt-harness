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
interface Props {
  search?: string
  page: number
}

const props = defineProps<Props>()

// Data fetching — Orchestrator's exclusive right
const { data: formations, status, error } = await useAsyncData(
  'formations',
  () => $fetch<Formation[]>('/api/formations', {
    query: { q: props.search, page: props.page },
  }),
  { watch: [() => props.search, () => props.page] }
)

// Store access — Orchestrator's right
const recentStore = useRecentStore()
const router = useRouter()

function handleSelect(formation: Formation): void {
  recentStore.addFormation(formation.id)
  router.push(`/formations/${formation.slug}`)
}

function handlePageChange(newPage: number): void {
  router.push({ query: { page: newPage } })
}
</script>

<template>
  <OpFormationBrowser
    :formations="formations ?? []"
    :loading="status === 'pending'"
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

// Can use business composables
const { favorites, toggleFavorite } = useFormationFavorites()

function handleSelect(formation: Formation): void {
  emit('select', formation)
}

const page = ref(1)
</script>

<template>
  <!-- UInput replaces a custom SearchBar presenter -->
  <UInput
    v-model="searchText"
    icon="i-heroicons-magnifying-glass"
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
    color="red"
    variant="soft"
    icon="i-heroicons-exclamation-triangle"
    :description="props.error"
  />

  <div v-else class="grid grid-cols-3 gap-4">
    <FormationCard
      v-for="f in filtered"
      :key="f.id"
      v-bind="f"
      :is-favorite="favorites.includes(f.id)"
      @click="handleSelect(f)"
      @toggle-favorite="toggleFavorite(f.id)"
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
    :ui="{ body: { padding: 'p-0' } }"
    @click="emit('click')"
  >
    <img :src="thumbnailUrl" :alt="title" class="w-full rounded-t-lg" />

    <div class="p-4">
      <h3 class="font-semibold text-gray-900">{{ title }}</h3>
      <p class="text-sm text-gray-600 mt-1">{{ description }}</p>

      <div class="flex items-center justify-between mt-3">
        <!-- UBadge replaces <span class="text-xs"> -->
        <UBadge color="gray" variant="soft">
          <UIcon name="i-heroicons-clock" class="mr-1" />
          {{ duration }}
        </UBadge>

        <!-- UButton replaces <button class="text-amber-500"> -->
        <UButton
          color="amber"
          variant="ghost"
          :icon="isFavorite ? 'i-heroicons-star-solid' : 'i-heroicons-star'"
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
import * as v from 'valibot'

// Schema lives in the Orchestrator — Presenters never own validation logic
const schema = v.object({
  email: v.pipe(v.string(), v.email('Email invalide')),
  consent: v.literal(true, 'Vous devez accepter les conditions'),
})

const state = reactive({ email: '', consent: false as boolean })

const { enroll, isLoading } = useFormationEnrollment()
const toast = useToast()

async function onSubmit(): Promise<void> {
  const result = await enroll(state.email)
  if (result.ok) {
    toast.add({ title: 'Inscription confirmée', color: 'green', icon: 'i-heroicons-check-circle' })
  } else {
    toast.add({ title: 'Erreur', description: result.error, color: 'red' })
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

    <UButton type="submit" label="S'inscrire" :loading="isLoading" block />
  </UForm>
</template>
```

---

## Composable (Pure Logic)

```ts
// composables/useFormationFavorites.ts

interface UseFormationFavoritesReturn {
  favorites: Readonly<Ref<string[]>>
  toggleFavorite: (id: string) => void
  isFavorite: (id: string) => boolean
}

/**
 * Manages formation favorites using Pinia store.
 * Encapsulates store access so Operators get a clean interface.
 */
export function useFormationFavorites(): UseFormationFavoritesReturn {
  const store = useFormationStore()

  const favorites = computed(() => store.favoriteIds)

  function toggleFavorite(id: string): void {
    if (store.favoriteIds.includes(id)) {
      store.removeFavorite(id)
    } else {
      store.addFavorite(id)
    }
  }

  function isFavorite(id: string): boolean {
    return store.favoriteIds.includes(id)
  }

  return { favorites, toggleFavorite, isFavorite }
}
```

---

## Composable with Error Handling (Result Pattern)

For service calls that can fail, use an explicit Result type — never throw in composables.

```ts
// types/result.ts
export type Result<T, E = string> =
  | { ok: true; data: T }
  | { ok: false; error: E }

export function ok<T>(data: T): Result<T> { return { ok: true, data } }
export function err<E = string>(error: E): Result<never, E> { return { ok: false, error } }
```

```ts
// composables/useFormationEnrollment.ts
import { ok, err, type Result } from '~/types/result'

interface UseFormationEnrollmentReturn {
  isEnrolled: (formationId: string) => boolean
  enroll: (formationId: string) => Promise<Result<void>>
  isLoading: Ref<boolean>
}

export function useFormationEnrollment(): UseFormationEnrollmentReturn {
  const store = useEnrollmentStore()
  const isLoading = ref(false)

  function isEnrolled(formationId: string): boolean {
    return store.enrolledIds.includes(formationId)
  }

  async function enroll(formationId: string): Promise<Result<void>> {
    isLoading.value = true
    try {
      await $fetch('/api/enroll', { method: 'POST', body: { formationId } })
      store.addEnrollment(formationId)
      return ok(undefined)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Enrollment failed'
      return err(message)
    } finally {
      isLoading.value = false
    }
  }

  return { isEnrolled, enroll, isLoading }
}
```

---

## Pinia Store

```ts
// stores/formation.ts
export const useFormationStore = defineStore('formation', () => {
  // State
  const favoriteIds = ref<string[]>([])
  const enrolledIds = ref<string[]>([])

  // Getters
  const favoriteCount = computed(() => favoriteIds.value.length)

  // Actions
  function addFavorite(id: string): void {
    if (!favoriteIds.value.includes(id)) {
      favoriteIds.value.push(id)
    }
  }

  function removeFavorite(id: string): void {
    favoriteIds.value = favoriteIds.value.filter(f => f !== id)
  }

  function addEnrollment(id: string): void {
    if (!enrolledIds.value.includes(id)) {
      enrolledIds.value.push(id)
    }
  }

  return {
    favoriteIds: readonly(favoriteIds),
    enrolledIds: readonly(enrolledIds),
    favoriteCount,
    addFavorite,
    removeFavorite,
    addEnrollment,
  }
})
```

---

## Key Patterns Summary

| Pattern | Rule |
|---------|------|
| `defineProps<T>()` | Always use type-based, never runtime syntax |
| `defineEmits<{...}>()` | Type-based with call signatures |
| `const emit = defineEmits<{}>()` | Explicitly declare emits |
| `await useAsyncData()` | Only in Orchestrators |
| `useXxxStore()` | Never in Presenters |
| `useRouter()` | Only in Orchestrators and Operators |
| Export composables as named functions | `export function useFoo(): UseFooReturn` |
| Composable return type | Always explicit: `UseFooReturn` interface |
| Never throw in composables | Return `Result<T>` instead |
| `console.log` | Forbidden — use `console.warn` or `console.error` |
| `@ts-ignore` | Forbidden — fix the underlying type issue |
| Deep relative imports (`../../../`) | Forbidden — use `~/` or `@/` |

### NuxtUI Primitive Rules

| Anti-pattern | Correct approach |
|---|---|
| `<button class="bg-primary-500 …">` | `<UButton color="primary">` |
| `<input class="border rounded …">` | `<UInput>` |
| `<select>` / `<option>` | `<USelect :options>` |
| `<table><thead><tr>…` | `<UTable :columns :rows>` |
| `<div class="rounded-lg border p-4">` card | `<UCard>` |
| `<span class="text-xs text-gray-400">` label | `<UBadge color="gray" variant="soft">` |
| `<div class="animate-pulse bg-gray-200">` skeleton | `<USkeleton>` |
| `<div v-if="error" class="text-red-500">` | `<UAlert color="red">` |
| Custom `AppButton.vue` wrapping `UButton` | Use `<UButton>` directly |
| Custom `AppModal.vue` wrapping `UModal` | Use `<UModal>` directly in Operator |
| Manual form error `<p>` tags | `<UForm :schema>` + `<UFormField>` |
| `useToast()` in a Presenter | Call `useToast()` in Orchestrator or composable only |
