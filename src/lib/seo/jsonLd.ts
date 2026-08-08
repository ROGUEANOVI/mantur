/**
 * Escaping `<` prevents a `</script>` sequence inside user-supplied content
 * (business/place/guide names, descriptions) from closing the script tag
 * early — the classic JSON-LD injection vector. `<` round-trips through
 * JSON.parse to the same "<" character, so search-engine parsers see
 * identical data.
 */
export function jsonLdScriptProps(data: unknown) {
  return {
    type: 'application/ld+json',
    dangerouslySetInnerHTML: { __html: JSON.stringify(data).replace(/</g, '\\u003c') },
  } as const
}
