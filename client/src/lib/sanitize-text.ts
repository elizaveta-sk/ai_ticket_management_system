import DOMPurify from 'dompurify'

// Removes all HTML from text that gets shown as plain text. It reads the text from the
// parsed result, because the HTML string would make "a < b" appear as "a &lt; b".
export function sanitizeText(value: string) {
  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    RETURN_DOM_FRAGMENT: true,
  }).textContent
}
