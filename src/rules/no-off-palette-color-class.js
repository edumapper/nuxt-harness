/**
 * ESLint Rule: no-off-palette-color-class
 *
 * Disallows Tailwind color utility classes from palettes that are not defined
 * in the project design system (app/assets/css/main.css).
 *
 * ─── Why this matters ───────────────────────────────────────────────────────
 *
 * Tailwind ships 22+ built-in color palettes (blue, gray, slate, indigo, …).
 * Without enforcement, an AI model or developer who forgets the palette rules
 * will reach for the familiar Tailwind defaults. This rule makes that a
 * hard build failure instead of a subtle drift.
 *
 * Allowed palettes (defined in app/assets/css/main.css @theme static block):
 *   zinc, brand, sand, green, yellow, red,
 *   accent-lavender, accent-pink, accent-tangerine, accent-forest, accent-lagoon
 *
 * Also allowed: white, black, transparent, current, inherit (Tailwind specials)
 *
 * What this catches:
 *   class="text-blue-500"       → blue not in palette
 *   class="bg-gray-100"         → gray not in palette (use zinc instead)
 *   class="hover:bg-indigo-600" → indigo not in palette
 *
 * What this does NOT catch (by design):
 *   - Dynamic :class bindings with computed class strings (first-pass scope)
 *   - sand-50 invalid shade (sand only has 100/200/300) — convention doc enforces this
 *
 * Targets: app/**\/*.vue (static class attributes only)
 */

// Tailwind built-in palette names that are NOT part of our design system.
// Note: 'pink' is excluded because it appears in our 'accent-pink' palette name.
const FORBIDDEN_PALETTES = new Set([
  'slate', 'gray', 'stone', 'neutral',
  'orange', 'amber', 'lime', 'emerald',
  'teal', 'cyan', 'sky', 'blue',
  'indigo', 'violet', 'purple', 'fuchsia',
  'pink', 'rose'
])

/**
 * Returns the forbidden palette name if found in the class token, null otherwise.
 * Handles variant prefixes (hover:, dark:, lg:, focus:, etc.) and the special
 * case of accent-* palettes (accent-pink is allowed, bare pink is not).
 */
function getOffPalette(cls) {
  // Strip all variant prefixes: "dark:hover:bg-blue-500" → "bg-blue-500"
  const base = cls.split(':').at(-1) ?? cls
  const parts = base.split('-')

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!FORBIDDEN_PALETTES.has(part)) continue
    // "accent-pink" is an allowed palette — skip when 'accent' precedes the name
    if (i > 0 && parts[i - 1] === 'accent') continue
    return part
  }
  return null
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow Tailwind color classes outside the design system palette',
      category: 'Design System'
    },
    schema: [],
    messages: {
      offPalette: [
        '❌ Color class "{{cls}}" uses palette "{{palette}}" which is not in the design system.',
        '💡 Allowed palettes: zinc, brand, sand (100/200/300), green, yellow, red,',
        '   accent-lavender, accent-pink, accent-tangerine, accent-forest, accent-lagoon.',
        '🛠 Replace with a design system token, or add the palette to app/assets/css/main.css.'
      ].join('\n')
    }
  },

  create(context) {
    // Template nodes are only walked through vue-eslint-parser's template visitor —
    // a top-level `VAttribute` key is silently never called.
    return context.sourceCode.parserServices?.defineTemplateBodyVisitor?.({
      // Only inspect static class attributes: class="..."
      // Dynamic :class bindings are out of scope for this first pass.
      VAttribute(node) {
        if (node.directive) return // skip :class dynamic bindings
        if (!node.value) return
        if (node.key?.name !== 'class') return

        const value = node.value.value
        if (typeof value !== 'string') return

        for (const cls of value.split(/\s+/)) {
          if (!cls) continue
          const palette = getOffPalette(cls)
          if (palette) {
            context.report({
              node,
              messageId: 'offPalette',
              data: { cls, palette }
            })
          }
        }
      }
    }) ?? {}
  }
}
