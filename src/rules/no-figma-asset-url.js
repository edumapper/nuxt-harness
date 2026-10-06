/**
 * ESLint Rule: no-figma-asset-url
 *
 * Figma MCP returns temporary image URLs (`figma.com/api/mcp/asset/<id>`, or
 * `localhost:3845/assets/<id>` from the desktop app). They expire within days
 * and ship as broken images. Use useEmojiUrl() for emojis; upload anything
 * else to the Bunny CDN.
 *
 * Scans raw source text so templates, scripts and styles are all covered
 * with one regex pass per file.
 */

const FIGMA_ASSET_URL = /(?:figma\.com\/api\/mcp\/asset|(?:localhost|127\.0\.0\.1):3845\/assets)\//g

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow expiring Figma MCP asset URLs' },
    schema: [],
    messages: {
      figmaAsset: 'Figma MCP asset URLs expire. Use useEmojiUrl() for emojis, or upload the file to the CDN.'
    }
  },
  create(context) {
    return {
      Program() {
        const { sourceCode } = context
        for (const match of sourceCode.text.matchAll(FIGMA_ASSET_URL)) {
          context.report({
            loc: {
              start: sourceCode.getLocFromIndex(match.index),
              end: sourceCode.getLocFromIndex(match.index + match[0].length)
            },
            messageId: 'figmaAsset'
          })
        }
      }
    }
  }
}
