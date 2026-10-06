# Layered architecture — Nuxt 4 / Vue 3

Paths below use the Nuxt 4 layout (`app/`). With `srcDir: '.'` (Nuxt 3 layout), drop the
`app/` prefix; inside a Nuxt layer, prefix with `layers/<name>/`.

## The 5 layers

### Page (Assembler)
- Nuxt route file: `app/pages/**/*.vue`
- Owns route-level concerns: `definePageMeta`, `useSeoMeta`, middleware, reading route params
- Composes Orchestrators and/or Operators
- **Never renders a Presenter directly**
- Passes route params down as props

```vue
<!-- app/pages/users/index.vue -->
<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'Users' })

const route = useRoute()
const page = computed(() => Number(route.query.page) || 1)
</script>

<template>
  <OrcUserList :page="page" />
</template>
```

### Orchestrator (Smartest)
- Prefix: `Orc*.vue`
- Brain of the feature: domain query/mutation composables, business logic, navigation
- Distributes data to Operators and Presenters through props
- Reusable in drawers, modals and integration tests
- Max 3–4 concerns before splitting

```vue
<!-- app/components/OrcUserList.vue -->
<script setup lang="ts">
import type { User } from '#shared/types/user'

const props = defineProps<{ page: number }>()

const { users, pending } = useUserList(() => ({ page: props.page }))

async function handleSelect(user: User): Promise<void> {
  await navigateTo({ name: 'users-id', params: { id: user.id } })
}

async function handlePageChange(page: number): Promise<void> {
  await navigateTo({ query: { page } })
}
</script>

<template>
  <OpFilterableUserList
    :users="users"
    :loading="pending"
    @select="handleSelect"
    @page-change="handlePageChange"
  />
</template>
```

### Operator (Smart)
- Prefix: `Op*.vue`
- Receives data from an Orchestrator or a Page
- Wires a group of Presenters together and owns local UI state
- May use navigation, stores and domain composables
- **Never calls a raw data primitive** (`$fetch`, `useFetch`, `useAsyncData`, `useQuery`) —
  data arrives as props, or through a domain composable
- Max 3 concerns; beyond that, promote to an Orchestrator

```vue
<!-- app/components/OpFilterableUserList.vue -->
<script setup lang="ts">
import type { User } from '#shared/types/user'

const props = defineProps<{ users: User[], loading: boolean }>()
const emit = defineEmits<{ 'select': [user: User], 'page-change': [page: number] }>()

const filter = ref('')
const filtered = computed(() => props.users.filter(u => u.name.includes(filter.value)))
</script>

<template>
  <FilterBar v-model="filter" />
  <UserList :users="filtered" :loading="props.loading" @select="emit('select', $event)" />
  <PageNav @change="emit('page-change', $event)" />
</template>
```

### Presenter (Dumb)
- Any `app/components/**/*.vue` without the `Orc`/`Op` prefix
- Props in, events out. That's it.
- No stores, no fetching, no navigation, no data transformation
- Testable without mocks; the parent provides ready-to-display data

```vue
<!-- app/components/UserList.vue -->
<script setup lang="ts">
import type { User } from '#shared/types/user'

defineProps<{ users: User[], loading: boolean }>()
const emit = defineEmits<{ select: [user: User] }>()
</script>

<template>
  <ul>
    <li v-for="user in users" :key="user.id" @click="emit('select', user)">
      {{ user.name }}
    </li>
  </ul>
</template>
```

### Composable (Pure logic)
- File pattern: `app/composables/use*.ts`
- Returns reactive state; encapsulates side effects
- Business logic, data access, caching, WebSockets, transformations
- The right place to isolate store access

```ts
// app/composables/useCartItems.ts
export function useCartItems() {
  const store = useCartStore()
  const items = computed(() => store.items)
  const total = computed(() => store.total)
  function removeItem(id: string): void {
    store.remove(id)
  }
  return { items, total, removeItem }
}
```

---

## 8 rules

1. **The Page is an assembler, not a brain** — `definePageMeta`, `useSeoMeta` and middleware stay in the Page. Fetching, stores and logic go in an Orchestrator. A Page never renders a Presenter directly.
2. **The Orchestrator is the smartest component** — it calls the domain query/mutation composables and handles navigation and business logic. It is the reusable brain of the feature.
3. **The Operator wires, it doesn't fetch** — it receives data through props, wires Presenters and turns emits into handlers. It may call domain composables, never a raw data primitive.
4. **Presenters are dumb** — props down, events up. No store, no fetch, no navigation, no transformation.
5. **Max 3 concerns per Operator** — wiring more than 3 composables means promote to an Orchestrator, or split.
6. **Test at the right level** — unit tests on composables, visual tests on Presenters, integration tests on Operators, E2E on Orchestrators and Pages.
7. **Data flow is explicit** — props down (Page → Orchestrator → Operator → Presenter), events up. No shortcuts: no `provide`/`inject`, no event bus.
8. **Only smart components touch stores** — Orchestrators and Operators may read and write stores. A Presenter never touches one, not even to read.

---

## Store access matrix

| Layer        | Read store | Write store | Why |
|--------------|-----------|-------------|-----|
| Page         | Read only | No          | Assembler; reads only if routing depends on store state |
| Orchestrator | Yes       | Yes         | Brain; hydrates stores, writes after submit |
| Operator     | Yes       | Yes         | Wirer; reads for derived props, writes on events |
| Presenter    | No        | No          | Dumb; receives everything through props |
| Composable   | Yes       | Yes         | Best place to encapsulate store access |

**Recommended pattern**: a composable encapsulates the store → the Orchestrator/Operator uses the composable → passes the result to Presenters as props.

---

## Audit: 7 signals for detecting monoliths

### Mechanical signals (grep/AST)

**S1 — Side effect in a component** (weight ×2)
Grep `.vue` files for: `fetch(`, `axios.`, `$fetch(`, `useFetch(`, `useAsyncData(`, `localStorage.`, `sessionStorage.`, `new WebSocket`, `navigateTo(`, `useRouter(`, `router.push(`.

Context: a domain composable in an **Orchestrator** → normal. A raw `useFetch`/`useAsyncData` in any component → move it into a composable. In an **Operator** or **Presenter** → violation. In a **Page** → only `useRoute` to read params.

**S1b — Data transformation in a Presenter** (weight ×1)
A `computed()` that filters, maps, sorts or groups props; non-trivial date/number formatting; enum-to-label resolution. The parent should provide ready-to-display data.

**S2 — Behavioral props overload** (weight ×2)
Appearance props (color, size, icon, variant) are healthy in any number. Behavior props (mode, trigger, content key) are not: 4+ behavior props = god component.

**S3 — Store / inject coupling** (weight ×1)
Grep Presenter files for `use*Store(`, `inject(`, `storeToRefs(`.

### Human review signals

**S4 — 4+ distinct concerns** (weight ×2)
Count clusters of `ref()`/`computed()` that don't talk to each other. 4+ → strong signal. 3 → acceptable if `<script>` is under 30 lines.

**S5 — Bypass test failure** (weight ×3)
*"If I deleted this file, could I rebuild its behavior from composables + Presenters in under 5 minutes?"*
- Yes → legitimate Operator. Score 0
- Partially → moderate monolith. Score 2
- No → full monolith. Score 3

**S6 — Domain-coupled naming** (weight ×0.5)
`UiListItem` describes rendering — good. `SearchHistoryItem` is wrong if it is just a list item with icons: the name blocks reuse and invites business logic in.

### Scoring

Max score: **11.5 points**. Mechanical signals produce the suspect list; human signals separate real problems from false positives. The top 5 components by score are the refactoring backlog.

---

## Team practices

**Component decision card** — 3 sentences before creating a smart component: which concerns, Orchestrator or Operator, would a Presenter suffice?

**Bypass review** — in code review: "Can I get the same result by composing the lower layers directly?" If yes, the new component is not needed.

**Split before shipping** — a PR with both an API call and template rendering in the same file (outside an Orchestrator) is split before merge.

**Periodic audit** — list all Operators. 8+ props → a future god component.
