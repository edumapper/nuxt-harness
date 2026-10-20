// @ts-check
/**
 * ESLint Rule: no-browser-api-in-setup
 *
 * Flags `window` / `document` / `localStorage` / `sessionStorage` / `navigator` read at the
 * top level of `setup`, i.e. outside a function and without an `import.meta.client` guard.
 *
 * Setup runs on the server during SSR. A top-level read either throws (500 for every
 * visitor) or renders a different value than the client, which is the mismatch class this
 * rule exists to prevent. Move the work into `onMounted`, or guard the branch.
 *
 * Only references that resolve to the browser global are reported (scope analysis): a
 * property named `document` (`hit.document.title`, `{ document: … }`, an interface field) or a
 * local variable that shadows the name is not the global. Templates are not checked: they
 * cannot reach `window` or `document` at all. `typeof window`, and branches guarded by
 * `import.meta.client` / `import.meta.server` / `typeof` (`if`, `? :`, `&&`), are allowed.
 */

import { docsUrl } from './docs.js'

const GLOBALS = new Set(['window', 'document', 'localStorage', 'sessionStorage', 'navigator'])
const GUARD = /import\.meta\.(client|server)|\btypeof\b/
const FUNCTION_TYPES = new Set([
  'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
  'PropertyDefinition', 'MethodDefinition', 'StaticBlock'
])

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow browser globals at the top level of setup' },
    schema: [],
    messages: {
      browserApi: [
        '❌ {{name}} read during setup',
        '💡 Setup runs on the server: a top-level browser read throws during SSR (or renders a different value than the client).',
        '🛠 Move the work into onMounted, or guard the branch with `if (import.meta.client)`; for a whole subtree use <ClientOnly> with a reason.',
        '📖 ' + docsUrl('no-browser-api-in-setup')
      ].join('\n')
    }
  },
  create (context) {
    const { sourceCode } = context

    /** Inside the guarded branch of an `if`, `? :` or `&&` whose test is a client/server check. @param {any} node @param {any[]} ancestors */
    function guarded (node, ancestors) {
      const chain = [...ancestors, node]
      return chain.some((a, i) => {
        const child = chain[i + 1]
        if (!child) return false
        if (a.type === 'IfStatement' || a.type === 'ConditionalExpression') return child !== a.test && GUARD.test(sourceCode.getText(a.test))
        return a.type === 'LogicalExpression' && a.operator === '&&' && child === a.right && GUARD.test(sourceCode.getText(a.left))
      })
    }

    return {
      /** @param {any} program */
      'Program:exit' (program) {
        const global = sourceCode.getScope(program)
        // Unresolved references, plus references to the name when the config declares browser globals.
        const refs = [...global.through, ...[...GLOBALS].flatMap(name => global.set.get(name)?.references ?? [])]
        for (const ref of refs.sort((a, b) => a.identifier.range[0] - b.identifier.range[0])) {
          const id = ref.identifier
          if (!GLOBALS.has(id.name)) continue
          if (id.parent?.type === 'UnaryExpression' && id.parent.operator === 'typeof') continue
          const ancestors = sourceCode.getAncestors(id)
          if (ancestors.some(a => FUNCTION_TYPES.has(a.type)) || guarded(id, ancestors)) continue
          context.report({ node: id, messageId: 'browserApi', data: { name: id.name } })
        }
      }
    }
  }
}
