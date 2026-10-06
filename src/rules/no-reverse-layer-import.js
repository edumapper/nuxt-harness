/**
 * ESLint Rule: no-reverse-layer-import
 *
 * Enforces the one-way data flow: Orc → Op → Presenter.
 * Prevents components from importing "upward" through the layer stack:
 *   - Presenters (plain *.vue) must not import Op*.vue or Orc*.vue
 *   - Operators (Op*.vue) must not import Orc*.vue
 *
 * Why this matters for AI-generated code:
 *   AI models often reach for the nearest component that has the data or
 *   behaviour needed, regardless of direction. A Presenter importing an
 *   Operator to "reuse its logic" breaks the contract: Presenters are
 *   stateless display units whose only inputs are props. An Operator
 *   importing an Orchestrator creates a circular dependency risk and hides
 *   fetch/store logic one layer below where it belongs.
 *
 *   The correct fix is always to move shared logic into a composable
 *   (composables/use*.ts) and let both layers consume it independently.
 *
 * Targets: app/components/**\/*.vue
 *
 * Enabled by harness() in @edumapper/nuxt-harness/eslint.
 */

/** @param {string} filename */
function basename(filename) {
  return filename.split('/').pop() ?? filename
}

/** @param {string} name */
function isOrc(name) {
  return name.startsWith('Orc') && name.endsWith('.vue')
}

/** @param {string} name */
function isOp(name) {
  return name.startsWith('Op') && name.endsWith('.vue')
}

/** @param {string} name */
function isPresenter(name) {
  return name.endsWith('.vue') && !isOrc(name) && !isOp(name)
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce one-way Orc → Op → Presenter layer flow; no upward imports',
      category: 'Architecture'
    },
    schema: [],
    messages: {
      presenterImportsOp: [
        '❌ <{{file}}> imports {{imported}} — a Presenter cannot import an Operator',
        '💡 Presenters receive data through props only.',
        '   Importing an Op adds a dependency on wiring logic',
        '   and breaks the component\'s testability.',
        '🛠 Extract the shared logic into composables/use*.ts,',
        '   use it in the Operator and pass the result to the Presenter through props.'
      ].join('\n'),

      presenterImportsOrc: [
        '❌ <{{file}}> imports {{imported}} — a Presenter cannot import an Orchestrator',
        '💡 Presenters only display. An Orchestrator holds fetching, stores and',
        '   business logic — everything a Presenter must not see.',
        '🛠 Pass the data down the chain: Orc → Op → props.'
      ].join('\n'),

      opImportsOrc: [
        '❌ <{{file}}> imports {{imported}} — an Operator cannot import an Orchestrator',
        '💡 The flow is one-way: Orc drives Op, never the reverse.',
        '   An Op importing an Orc risks a circular dependency and hides',
        '   fetch/store logic where it doesn\'t belong.',
        '🛠 Extract the shared logic into composables/use*.ts.'
      ].join('\n')
    }
  },

  create(context) {
    const filename = basename(context.filename ?? context.getFilename?.() ?? '')

    return {
      ImportDeclaration(node) {
        const source = node.source.value
        if (typeof source !== 'string') return
        const imported = basename(source)

        if (isPresenter(filename)) {
          if (isOp(imported)) {
            context.report({ node, messageId: 'presenterImportsOp', data: { file: filename, imported } })
          } else if (isOrc(imported)) {
            context.report({ node, messageId: 'presenterImportsOrc', data: { file: filename, imported } })
          }
        } else if (isOp(filename) && isOrc(imported)) {
          context.report({ node, messageId: 'opImportsOrc', data: { file: filename, imported } })
        }
      }
    }
  }
}
