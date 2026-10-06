// @ts-check
/**
 * ESLint Rule: max-condition-operands
 *
 * A guard (`if` test) or template condition (`v-if`, `v-else-if`, `v-show`) may
 * combine at most N operands with `&&` / `||`. Past that, the condition has a
 * meaning that deserves a name: extract it to a `computed` (`canSubmit`,
 * `submitBlock`) or a function, so the reader — and the template — see the rule,
 * not its mechanics.
 *
 * Operands are the leaves of the `&&`/`||` tree; `!x` and parentheses count as one.
 * `??` is a value fallback, not a condition, and is not counted.
 */

const DEFAULT_MAX = 2
const TEMPLATE_DIRECTIVES = new Set(['if', 'else-if', 'show'])

/** @param {any} node @returns {number} */
function operands(node) {
  if (node?.type === 'LogicalExpression' && (node.operator === '&&' || node.operator === '||')) {
    return operands(node.left) + operands(node.right)
  }
  return 1
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Limit && / || operands in guards and template conditions — name compound conditions' },
    schema: [{ type: 'object', properties: { max: { type: 'integer', minimum: 1 } }, additionalProperties: false }],
    messages: {
      tooManyOperands: [
        '❌ {{where}} combines {{count}} conditions — max {{max}}',
        '💡 A compound guard hides a rule behind its mechanics; every reader re-derives what it means.',
        '🛠 Extract it to a named computed or function (e.g. `const canSubmit = computed(() => …)`), ideally returning the blocking reason.',
        '📖 https://github.com/edumapper/nuxt-harness/blob/main/skills/nuxt-harness/references/eslint-rules.md#max-condition-operands'
      ].join('\n')
    }
  },
  create(context) {
    const max = context.options[0]?.max ?? DEFAULT_MAX

    /** @param {any} test @param {any} node @param {string} where */
    const check = (test, node, where) => {
      const count = operands(test)
      if (count > max) context.report({ node, messageId: 'tooManyOperands', data: { where, count: String(count), max: String(max) } })
    }

    const script = {
      /** @param {any} node */
      IfStatement(node) {
        check(node.test, node.test, 'if guard')
      }
    }
    const template = {
      /** @param {any} node */
      'VAttribute[directive=true]'(node) {
        const name = node.key?.name?.name
        if (!TEMPLATE_DIRECTIVES.has(name) || !node.value?.expression) return
        check(node.value.expression, node, `v-${name}`)
      }
    }
    // Template nodes are only walked through vue-eslint-parser's template visitor.
    return context.sourceCode.parserServices?.defineTemplateBodyVisitor?.(template, script) ?? script
  }
}
