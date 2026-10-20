// @ts-check
/**
 * ESLint Rule: client-file-needs-reason
 *
 * A `*.client.vue` / `*.client.ts` / `*.client.js` file must open with its reason for running
 * only in the browser: `<!-- ClientOnly: <why> -->` before the first block of a `.vue` file,
 * `// ClientOnly: <why>` (or a block comment) before the first statement of a script; imports
 * may come first, since that is where a script's header comment usually sits.
 *
 * Nuxt never renders or loads a `.client` file on the server. Like <ClientOnly>, it drops SSR
 * (no HTML, a layout shift, data later), and the harness exempts it from the SSR rules, so the
 * decision must be written where the next reader looks first.
 */

import { isReason } from './client-only-reason.js'
import { docsUrl } from './docs.js'

/** @param {string} text the whole SFC: HTML comments before its first block */
const vueHeadComments = text => {
  const firstBlock = text.search(/<(template|script|style)\b/)
  const head = firstBlock === -1 ? text : text.slice(0, firstBlock)
  return [...head.matchAll(/<!--([\s\S]*?)-->/g)].map(m => m[1] ?? '')
}

/** Comments before the first statement that is not an import; consecutive `//` lines read as one comment. @param {any} sourceCode */
const scriptHeadComments = sourceCode => {
  const first = sourceCode.ast.body.find((/** @type {any} */ s) => s.type !== 'ImportDeclaration')?.range[0] ?? Infinity
  /** @type {string[]} */
  const merged = []
  let previous
  for (const comment of sourceCode.getAllComments().filter((/** @type {any} */ c) => c.range[1] <= first)) {
    const continues = comment.type === 'Line' && previous?.type === 'Line' && comment.loc.start.line === previous.loc.end.line + 1
    if (continues) merged[merged.length - 1] += `\n${comment.value}`
    else merged.push(comment.value)
    previous = comment
  }
  return merged
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require a ClientOnly reason at the top of each .client file' },
    schema: [],
    messages: {
      missingReason: [
        '❌ {{file}} runs only in the browser and does not say why',
        '💡 Nuxt never renders or loads a .client file on the server: like <ClientOnly>, it drops SSR, and the SSR rules skip it. The reason must be where the next reader looks first.',
        '🛠 Make it universal and drop the .client suffix — or open the file with {{form}}.',
        '📖 ' + docsUrl('client-file-needs-reason')
      ].join('\n')
    }
  },
  create (context) {
    const { sourceCode, filename } = context
    if (!/\.client\.(vue|ts|js)$/.test(filename)) return {}
    const vue = filename.endsWith('.vue')
    return {
      Program () {
        const comments = vue ? vueHeadComments(sourceCode.text) : scriptHeadComments(sourceCode)
        if (comments.some(isReason)) return
        context.report({
          loc: { line: 1, column: 0 },
          messageId: 'missingReason',
          data: { file: filename.split('/').pop() ?? filename, form: vue ? '<!-- ClientOnly: <why> -->' : '// ClientOnly: <why>' }
        })
      }
    }
  }
}
