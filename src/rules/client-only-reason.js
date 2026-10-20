// @ts-check
/**
 * What counts as a written reason for dropping SSR, shared by client-only-needs-reason and
 * client-file-needs-reason: a comment that starts with `ClientOnly:` followed by a sentence.
 *
 * The prefix is what makes the reason a reason. A section label above the element
 * ("Navigation drawer", "Main animation container") is not one, and `rg "ClientOnly:"`
 * lists every place the app renders only in the browser, each with its why.
 */

const MIN_WORDS = 4
const PREFIX = /^ClientOnly:\s*/

/** @param {string} text a comment body, without its delimiters */
export function isReason (text) {
  const body = text.replace(/^\s*\*\s?/gm, '').trim()
  if (!PREFIX.test(body)) return false
  return body.replace(PREFIX, '').split(/\s+/).filter(Boolean).length >= MIN_WORDS
}
