// @ts-check
/**
 * ESLint Rule: no-off-palette-color-class (opt-in)
 *
 * Reports Tailwind color utilities that use a built-in palette the app did not
 * allow. The allowed palettes come from the app — the harness ships none:
 *
 *   // nuxt-harness.config.mjs
 *   export default { designSystem: { palettes: ['zinc', 'brand', 'red'] } }
 *
 * Only Tailwind's built-in palette names are checked (gray, slate, sky, …), so custom
 * palettes (`brand`, `accent-pink`) never trigger it, whether listed or not.
 *
 * ─── Why this matters ───────────────────────────────────────────────────────
 *
 * Tailwind ships 20+ built-in palettes. Without enforcement, an AI model or a
 * developer who forgets the palette rules reaches for the familiar defaults.
 * This rule turns that drift into a lint error.
 *
 * What this catches (with palettes: ['zinc']):
 *   class="text-sky-500"        → sky is not allowed
 *   class="bg-gray-100"         → gray is not allowed
 *   class="hover:bg-indigo-600" → indigo is not allowed
 *
 * Not checked: dynamic :class bindings.
 *
 * Targets: app/**\/*.vue (static class attributes only)
 */
import { docsUrl } from './docs.js'

// Tailwind v4 built-in palettes.
const TAILWIND_PALETTES = new Set([
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'
])

// Utilities that take a color: `<utility>-<palette>-<shade>`.
const COLOR_UTILITY = /^(?:bg|text|border(?:-[xytrblse])?|ring(?:-offset)?|outline|decoration|divide|from|via|to|fill|stroke|caret|accent|shadow|placeholder|inset-shadow|inset-ring)-([a-z]+)-\d{2,3}(?:\/\d+)?$/

/**
 * The palette of a class token when it is a built-in palette outside `allowed`, else null.
 * Variant prefixes (hover:, dark:, lg:, …) and the important modifier are stripped.
 * @param {string} cls @param {Set<string>} allowed
 */
function offPalette(cls, allowed) {
  const base = (cls.split(':').at(-1) ?? cls).replace(/^!|!$/g, '')
  const palette = COLOR_UTILITY.exec(base)?.[1]
  if (!palette || !TAILWIND_PALETTES.has(palette) || allowed.has(palette)) return null
  return palette
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow Tailwind built-in color palettes the design system does not allow'
    },
    schema: [{
      type: 'object',
      properties: { palettes: { type: 'array', items: { type: 'string' } } },
      additionalProperties: false
    }],
    messages: {
      offPalette: [
        '❌ Color class "{{cls}}" uses palette "{{palette}}", which the design system does not allow.',
        '💡 Allowed palettes: {{allowed}}.',
        '🛠 Use an allowed palette, or add "{{palette}}" to designSystem.palettes in nuxt-harness.config.',
        `📖 ${docsUrl('no-off-palette-color-class')}`
      ].join('\n')
    }
  },

  create(context) {
    const palettes = context.options[0]?.palettes
    if (!palettes) return {} // no palette configured: nothing to enforce
    const allowed = new Set(palettes)
    const allowedList = palettes.join(', ') || '(none)'
    // Template nodes are only walked through vue-eslint-parser's template visitor —
    // a top-level `VAttribute` key is silently never called.
    return context.sourceCode.parserServices?.defineTemplateBodyVisitor?.({
      /** @param {any} node */
      VAttribute(node) {
        if (node.directive || node.key?.name !== 'class') return
        const value = node.value?.value
        if (typeof value !== 'string') return
        for (const cls of value.split(/\s+/)) {
          const palette = cls && offPalette(cls, allowed)
          if (palette) context.report({ node, messageId: 'offPalette', data: { cls, palette, allowed: allowedList } })
        }
      }
    }) ?? {}
  }
}
