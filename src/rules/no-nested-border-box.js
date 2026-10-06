/**
 * ESLint Rule: no-nested-border-box
 *
 * Prevents bordered, rounded containers from being placed inside other bordered
 * containers — the "Russian doll" effect. When boxes nest inside boxes, the UI
 * gains visual weight without hierarchy: the reader can't tell which boundary
 * is more important.
 *
 * ─── What counts as a "border box" ──────────────────────────────────────────
 *
 * A border box is an element whose static class attribute contains, in its
 * base/rest state (variant-prefixed tokens like `md:`, `focus:`, `hover:`,
 * `dark:` are ignored — those are decoration, not structural geometry):
 *   - A full border (bare `border` token or `border-{N}` width tokens)
 *     — NOT directional: border-t, border-b, border-l, border-r, border-x, border-y
 *     — NOT dashed: presence of `border-dashed` indicates a dropzone/affordance
 *     — NOT invisible: `border-transparent`, `border-0`, or `border-none`
 *   - AND rounded corners: `rounded` or `rounded-{*}`
 *
 * ─── What counts as an "outer surface" ──────────────────────────────────────
 *
 * 1. A border box element in the same template (same-file static nesting)
 * 2. A surface component (option `surfaceComponents`, default: the Nuxt UI
 *    UCard, UModal, USlideover, UDrawer, …). These always provide a bordered
 *    surface even though their internal classes are not visible in the template.
 *
 * ─── What this catches ───────────────────────────────────────────────────────
 *
 *   ❌ <UModal>
 *        <div class="border border-zinc-950/10 rounded-xl"> ← flagged
 *
 *   ❌ <div class="border border-zinc-950/10 rounded-xl p-4">
 *        <div class="border border-zinc-200 rounded-lg p-3"> ← flagged
 *
 *   ✅ <div class="border border-zinc-950/10 rounded-xl"> (no ancestor surface)
 *   ✅ <div class="border-b border-zinc-950/10"> (divider — directional only)
 *   ✅ <div class="border-2 border-dashed rounded-[14px]"> (dropzone)
 *   ✅ <input class="border border-transparent rounded-[6px]"> (invisible border)
 *   ✅ <input class="border border-zinc-200 rounded-sm"> (form control — always excluded)
 *
 * ─── Limitations (first pass) ────────────────────────────────────────────────
 *
 * - Only static `class="..."` attributes are analyzed; `:class` bindings
 *   are not checked (too complex for the first pass)
 * - Only the configured surface components are recognized as implicit
 *   outer boxes; other custom wrappers are not
 *
 * Targets: app/**\/*.vue
 */

// Template visitors are registered via vue-eslint-parser's
// `parserServices.defineTemplateBodyVisitor`. Sibling rules like
// `no-hardcoded-color` use bare `VAttribute` visitors successfully; this
// rule opts into the explicit visitor wrapper because it walks the VElement
// ancestor chain and benefits from a structured pre/exit traversal pass.
// Access parserServices lazily — its shape moved to `context.sourceCode`
// in ESLint v10 with a fallback on the legacy `context.parserServices`.

// Native form controls always have visible borders as affordance — never flag them.
const FORM_CONTROLS = new Set(['input', 'select', 'textarea', 'button'])

import { DEFAULT_SURFACE_COMPONENTS } from '../config.js'

/**
 * Returns true if the class string describes a visible, full-perimeter border
 * with rounded corners in the element's base/rest state — the signature of a
 * structural container box.
 *
 * Variant-prefixed tokens (`md:`, `focus:`, `hover:`, `dark:`, …) are ignored:
 * a `md:border-0` does NOT cancel a base `border`, and a `focus:border` is
 * decoration that doesn't make the element a structural container.
 */
function isBorderBox(classStr) {
  if (!classStr) return false

  // Examine only unprefixed (base/rest) tokens. Anything with a `:` is variant-
  // scoped — it applies conditionally and is treated as decoration here.
  const baseTokens = classStr.split(/\s+/).filter(t => t && !t.includes(':'))

  // Invisible border at rest — not a box.
  if (baseTokens.some(t => t === 'border-transparent' || t === 'border-0' || t === 'border-none')) {
    return false
  }

  // Dashed border at rest — dropzone/affordance convention, not a layout box.
  if (baseTokens.some(t => t === 'border-dashed')) return false

  // Full-perimeter border at rest: bare `border` or `border-{number}`.
  const hasBorder = baseTokens.some(t => t === 'border' || /^border-[0-9]/.test(t))
  if (!hasBorder) return false

  // Rounded corners at rest.
  return baseTokens.some(t => t === 'rounded' || t.startsWith('rounded-'))
}

/**
 * Walks up the VElement ancestor chain from a VElement node and returns the
 * first outer surface found — either a surface component or a border
 * box element whose class we already recorded. Returns null if none found.
 *
 * @param {object} element   — the VElement to start from (walk its ancestors)
 * @param {Map<object, string>} classMap  — map from VElement node → its static class string
 * @param {Set<string>} surfaces — component names that render a bordered surface
 */
function findOuterSurface(element, classMap, surfaces) {
  let current = element.parent

  while (current) {
    if (current.type === 'VElement') {
      const name = current.rawName

      // Known surface component
      if (surfaces.has(name)) {
        return { kind: 'component', name }
      }

      // A border box element in the same template
      const ancestorClass = classMap.get(current)
      if (ancestorClass && isBorderBox(ancestorClass)) {
        return { kind: 'element' }
      }
    }

    current = current.parent
  }

  return null
}

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow bordered containers nested inside other bordered surfaces (Russian doll effect)',
      category: 'Design System'
    },
    schema: [{
      type: 'object',
      properties: { surfaceComponents: { type: 'array', items: { type: 'string' } } },
      additionalProperties: false
    }],
    messages: {
      nestedBorderBox: [
        '❌ Border box nested inside {{outer}} — avoid the Russian doll effect.',
        '💡 Bordered containers inside bordered surfaces add visual weight without hierarchy.',
        '   Use spacing, dividers (border-b/t), or background tints to separate sections instead.',
        '🛠 Remove border+rounded from this element, or restructure so only one boundary is visible.'
      ].join('\n')
    }
  },

  create(context) {
    // ESLint v10 moved parserServices to context.sourceCode.parserServices
    const { defineTemplateBodyVisitor } = context.sourceCode?.parserServices ?? context.parserServices ?? {}
    if (typeof defineTemplateBodyVisitor !== 'function') return {}
    const surfaces = new Set(context.options[0]?.surfaceComponents ?? DEFAULT_SURFACE_COMPONENTS)
    // Maps each VElement node to its static class string.
    // Built during traversal so ancestor lookups are O(1).
    const classMap = new Map()

    return defineTemplateBodyVisitor({
      // Record every static class attribute on every VElement
      'VAttribute[directive=false][key.name="class"]'(node) {
        const value = node.value?.value
        if (typeof value !== 'string') return
        // node.parent is VStartTag; node.parent.parent is VElement
        const element = node.parent?.parent
        if (element?.type === 'VElement') {
          classMap.set(element, value)
        }
      },

      // After recording, check each border box element for ancestor surfaces
      'VAttribute[directive=false][key.name="class"]:exit'(node) {
        const value = node.value?.value
        if (typeof value !== 'string' || !isBorderBox(value)) return

        const element = node.parent?.parent
        if (!element || element.type !== 'VElement') return

        // Native form controls always need visible borders — skip them.
        if (FORM_CONTROLS.has(element.rawName)) return

        const outer = findOuterSurface(element, classMap, surfaces)
        if (!outer) return

        const outerLabel = outer.kind === 'component'
          ? `<${outer.name}>`
          : 'another border box'

        context.report({
          node,
          messageId: 'nestedBorderBox',
          data: { outer: outerLabel }
        })
      }
    })
  }
}
