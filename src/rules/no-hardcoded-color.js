/**
 * ESLint Rule: no-hardcoded-color
 *
 * Disallows hardcoded color values (hex, rgb, hsl) in Vue templates and
 * TypeScript files. All colors must be defined as CSS custom properties in
 * app/assets/css/main.css and used via Tailwind utility classes or var(--color-*).
 *
 * ─── Why this matters ───────────────────────────────────────────────────────
 *
 * Hardcoded color values (#272734, rgb(24,25,29)) bypass the design system
 * entirely. They cannot be updated globally, do not participate in dark mode
 * toggling, and are invisible to design tools. The design system palette is
 * the single source of truth — any value not defined there is improvisation.
 *
 * What this catches:
 *   - style="color: #272734"           → hex in style attribute
 *   - class="bg-[#f7f3f0]"             → Tailwind arbitrary hex value
 *   - class="bg-[rgb(24,25,29)]"       → Tailwind arbitrary rgb value
 *   - const color = '#272734'          → hex literal in TS/JS
 *
 * What this does NOT catch (out of scope for first pass):
 *   - Dynamic :class / :style bindings with computed color strings
 *   - Colors passed via props or composables
 *
 * Targets: app/**\/*.vue, app/**\/*.ts
 */

const COLOR_PATTERNS = [
  /#[0-9a-fA-F]{3,8}\b/, // hex: #fff, #272734, #ffffffcc
  /\brgba?\s*\(/, // rgb() / rgba() // cspell:ignore brgba
  /\bhsla?\s*\(/, // hsl() / hsla() // cspell:ignore bhsla
  /\[#[0-9a-fA-F]/ // Tailwind arbitrary hex: [#fff], [#272734]
]

function containsHardcodedColor(str) {
  return COLOR_PATTERNS.some(p => p.test(str))
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow hardcoded color values; use design system tokens',
      category: 'Design System'
    },
    schema: [],
    messages: {
      hardcodedColor: [
        '❌ Hardcoded color value found.',
        '💡 Colors must be defined as CSS custom properties in app/assets/css/main.css',
        '   and used via Tailwind utility classes.',
        '🛠 Replace with a design system token (e.g. bg-zinc-100, text-brand-500)',
        '   or a CSS variable reference: var(--color-*)'
      ].join('\n')
    }
  },

  create(context) {
    const template = {
      // Vue template: static style and class attributes
      VAttribute(node) {
        if (node.directive) return // skip :style / :class dynamic bindings
        if (!node.value) return
        const attrName = node.key?.name
        if (attrName !== 'style' && attrName !== 'class') return
        const value = node.value.value
        if (typeof value === 'string' && containsHardcodedColor(value)) {
          context.report({ node, messageId: 'hardcodedColor' })
        }
      }
    }

    const script = {
      // JS/TS: string literals that ARE standalone color values
      Literal(node) {
        const { value } = node
        if (typeof value !== 'string') return
        // Skip import paths and requires
        if (node.parent?.type === 'ImportDeclaration') return
        if (
          node.parent?.type === 'CallExpression'
          && node.parent?.callee?.name === 'require'
        ) return
        // Only flag strings that are themselves color values, not strings that
        // happen to contain a hex-like substring (e.g. URL fragments)
        if (
          /^#[0-9a-fA-F]{3,8}$/.test(value)
          || /^rgba?\s*\(/.test(value)
          || /^hsla?\s*\(/.test(value)
        ) {
          context.report({ node, messageId: 'hardcodedColor' })
        }
      }
    }

    // Template nodes are only walked through vue-eslint-parser's template visitor —
    // a top-level `VAttribute` key is silently never called.
    return context.sourceCode.parserServices?.defineTemplateBodyVisitor?.(template, script) ?? script
  }
}
