// @ts-check
/**
 * ESLint Rule: client-only-needs-reason
 *
 * Every <ClientOnly> must be directly preceded by an HTML comment explaining
 * why the subtree cannot render on the server.
 *
 * <ClientOnly> silently drops SSR for its subtree: no HTML for crawlers, a
 * layout shift on hydration, and data fetched later. It is often reached for
 * to hide a hydration warning instead of fixing it (see AGENTS.md § Hydration).
 * The comment forces the decision to be made — and reviewed — explicitly.
 */

const MIN_WORDS = 4

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require a preceding comment explaining each <ClientOnly>' },
    schema: [],
    messages: {
      missingReason: [
        '❌ <ClientOnly> without a preceding comment explaining why SSR is not used',
        '💡 ClientOnly drops server rendering for the whole subtree (no HTML, layout shift, later data). It is often used to mask a hydration bug.',
        '🛠 Fix the SSR issue (useCookie, onMounted, useState…) — or, if the subtree truly needs the browser, add `<!-- ClientOnly: <why> -->` right above it.',
        '📖 https://github.com/edumapper/nuxt-harness/blob/main/skills/nuxt-harness/references/eslint-rules.md#client-only-needs-reason'
      ].join('\n')
    }
  },
  create(context) {
    const { sourceCode } = context
    /** @type {any[]} */
    const comments = /** @type {any} */ (sourceCode.ast).templateBody?.comments ?? []
    const htmlComments = comments.filter(c => c.type === 'HTMLComment')

    /** @param {any} node */
    const hasReason = (node) => {
      const start = node.range[0]
      // the closest comment ending before the element, separated only by whitespace
      const comment = htmlComments.filter(c => c.range[1] <= start).at(-1)
      if (!comment || sourceCode.text.slice(comment.range[1], start).trim() !== '') return false
      return String(comment.value).trim().split(/\s+/).length >= MIN_WORDS
    }

    return sourceCode.parserServices?.defineTemplateBodyVisitor?.({
      /** @param {any} node */
      VElement(node) {
        if (node.rawName !== 'ClientOnly' && node.rawName !== 'client-only') return
        if (!hasReason(node)) context.report({ node: node.startTag, messageId: 'missingReason' })
      }
    }) ?? {}
  }
}
