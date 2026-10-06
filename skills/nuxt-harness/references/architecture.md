# Architecture en Couches — Nuxt / Vue 3

## The 5 Layers

### Page (Assembler)
- Nuxt route file (`pages/**/*.vue`)
- Has Nuxt superpowers: `definePageMeta`, `useSeoMeta`, middleware, SEO
- Composes Orchestrators and/or Operators
- **NEVER renders a Presenter directly**
- Passes route params to Orchestrators

```vue
<!-- pages/users/index.vue -->
<script setup>
definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'Utilisateurs' })
const route = useRoute()
</script>

<template>
  <!-- Only Orc* and Op* components here -->
  <OrcUserList
    :page="Number(route.query.page) || 1"
    :search="route.query.q"
  />
</template>
```

### Orchestrator (Smartest)
- Prefix: `Orc*.vue`
- Brain of the feature: domain query/mutation composables (Pinia Colada), complex business logic, navigation
- Distributes data to Operators and Presenters via props
- Reusable in drawers, modals, integration tests
- Max 3-4 concerns before splitting

```vue
<!-- components/OrcUserList.vue -->
<script setup>
const props = defineProps<{ page: number; search?: string }>()

const { users, isLoading } = useUserList(() => ({ page: props.page, q: props.search })) // useApiQuery + queryKeys

const localePath = useLocalePath()

async function handleSelect(user: User): Promise<void> {
  await navigateTo(localePath({ name: 'users-id', params: { id: user.id } }))
}

async function handlePageChange(page: number): Promise<void> {
  await navigateTo({ query: { page } })
}
</script>

<template>
  <OpFilterableList
    :users="users"
    :loading="isLoading"
    @select="handleSelect"
    @page-change="handlePageChange"
  />
</template>
```

### Operator (Smart)
- Prefix: `Op*.vue`
- Receives data from Orchestrator or Page
- Wires a group of Presenters together
- Can use `useRouter` and business composables
- Can read/write stores
- **Cannot call `useApiQuery` / `useAsyncData` / `useFetch` / `$fetch`** — reads come from the Orchestrator as props, or through a domain composable
- Max 3 concerns; if more, elevate to Orchestrator

```vue
<!-- components/OpFilterableList.vue -->
<script setup>
const props = defineProps<{ users: User[]; loading: boolean }>()
const emit = defineEmits(['select', 'page-change'])

const filterText = ref('')
const filtered = computed(() =>
  props.users.filter(u => u.name.includes(filterText.value))
)
</script>

<template>
  <FilterBar v-model="filterText" />
  <UserList :users="filtered" :loading="props.loading" @select="emit('select', $event)" />
  <Pagination @change="emit('page-change', $event)" />
</template>
```

### Presenter (Dumb)
- Any `components/*.vue` without `Orc` or `Op` prefix
- Props in, events out. That's it.
- Zero external dependencies
- No stores, no fetch, no navigation, no data transformation
- Testable without mocks
- Parent provides ready-to-display data

```vue
<!-- components/UserList.vue -->
<script setup>
defineProps<{ users: User[]; loading: boolean }>()
const emit = defineEmits(['select'])
</script>

<template>
  <ul>
    <li v-for="user in users" @click="emit('select', user)">
      {{ user.name }}
    </li>
  </ul>
</template>
```

### Composable (Pure Logic)
- File pattern: `composables/use*.ts`
- Returns reactive state. Encapsulates all non-Nuxt-specific side effects
- Business logic, cache, WebSocket, data transformations
- Can access stores — ideal pattern to isolate store access

```ts
// composables/useCartItems.ts
export function useCartItems() {
  const store = useCartStore()
  const items = computed(() => store.items)
  const total = computed(() => store.total)
  function removeItem(id: string): void { store.remove(id) }
  return { items, total, removeItem }
}
```

---

## 8 Rules

1. **The Page is an assembler, not a brain** — `definePageMeta`, `useSeoMeta`, middleware stay in the Page. Everything else (fetch, stores, logic) goes in an Orchestrator. Page NEVER renders Presenters directly.

2. **The Orchestrator is the smartest component** — it calls the domain query/mutation composables, handles complex navigation and business logic. It's the reusable brain of the feature.

3. **The Operator wires, doesn't fetch** — receives data via props, wires Presenters, transforms emits into handlers. Can call domain composables, but never a raw data primitive (`useApiQuery`, `useQuery`, `$fetch`). Fetching is the Orchestrator's role.

4. **Presenters are dumb** — props down, events up. No store, no fetch, no navigation, no transformation. Parent provides ready-to-display data.

5. **Max 3 concerns per Operator** — if wiring more than 3 composables, elevate to Orchestrator or split.

6. **Test at the right level** — unit tests on composables, visual tests on Presenters, integration on Operators, E2E on Orchestrators and Pages.

7. **Data flow is bidirectional and explicit** — props down (Page → Orchestrator → Operator → Presenter), events up. No shortcuts. No `provide/inject` for business data.

8. **Only smart components write to stores** — Orchestrator and Operator can read/write Pinia stores. A Presenter never touches a store — not even for reading.

---

## Store Access Matrix

| Layer        | Read store | Write store | Why                                           |
|--------------|-----------|-------------|-----------------------------------------------|
| Page         | Read only | No          | Assembler; if routing needs store state, reads only |
| Orchestrator | Yes       | Yes         | Brain; hydrates stores from API, writes after submit |
| Operator     | Yes       | Yes         | Wirer; reads for derived props, writes on events |
| Presenter    | No        | No          | Dumb; receives everything via props           |
| Composable   | Yes       | Yes         | Ideal pattern to encapsulate store access     |

**Recommended pattern**: composable encapsulates store → Orchestrator/Operator uses composable → passes to Presenter via props.

---

## Audit: 7 Signals for Detecting Monoliths

### Mechanical Signals (grep/AST)

**S1 — Side effect in a component** (weight ×2)
Grep for: `fetch(`, `axios.`, `$fetch(`, `useFetch(`, `useAsyncData(`, `localStorage.`, `sessionStorage.`, `new WebSocket`, `navigateTo(`, `useRouter(`, `router.push(`, `router.replace(` in `.vue` files that shouldn't have them.

Context: a domain query composable in an **Orchestrator** → normal; a raw `useAsyncData`/`useFetch`/`useApiQuery` call in a component → move it into a composable. In an **Operator** or **Presenter** → violation. `useRouter` in Presenter → violation. In Page → only `useRoute` for reading params.

**S1b — Data transformation in a Presenter** (weight ×1)
`computed()` that filters, maps, sorts, groups props. Date/number formatting beyond trivial. Key/enum resolution to display value. Parent should provide ready-to-display data.

**S2 — Behavioral props overload** (weight ×2)
Appearance props (color, size, icon, CSS variant) → healthy in unlimited quantity for a Presenter.
Behavior props (mode, trigger, content key) → problem. 4+ behavior props = god component.

**S3 — Store / inject coupling** (weight ×1)
Grep for: `useXxxStore(`, `inject(`, `$store`, `storeToRefs(` in Presenter files.

### Human Review Signals

**S4 — 4+ distinct concerns** (weight ×2)
Count clusters of `ref()`/`computed()` that don't talk to each other. 4+ → strong signal. 3 → acceptable if `<script>` < 30 lines.

**S5 — Bypass test failure** (weight ×3)
*"If I deleted this file, could I reproduce its behavior by assembling composables + Presenters in < 5 min?"*
- Yes → legitimate Operator. Score = 0
- Partially → moderate monolith. Score = 2
- No → full monolith. Score = 3

**S6 — Domain-coupled naming** (weight ×0.5)
`UiListItem` → correct (describes rendering). `SearchHistoryItem` → incorrect if it's just a list item with icons. The name prevents reuse and announces business logic that will infiltrate.

### Scoring

Max score: **11.5 points**. Mechanical signals produce the suspect list. Human signals separate real problems from false positives. Top 5 components by score = refactoring backlog.

---

## Team Practices

**Component Decision Card**: 3 sentences before creating a smart component — what concerns, Orchestrator or Operator, would a Presenter suffice?

**Bypass Review**: In code review — "Can I get the same result by composing the lower layers directly?" If no, the PR must be reworked.

**Layer Ownership**: UI agent/dev touches Presenters. Service agent/dev owns composables. Integration dev wires Operators and Orchestrators.

**Split before shipping**: If a PR contains both an API call and template rendering in the same file (outside Orchestrator), split before merge.

**Quarterly Audit**: List all Operators. 8+ props → future god component. High bypass rate → the Operator no longer serves its purpose.
