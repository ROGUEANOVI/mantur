import { describe, it, expect } from 'vitest'
import { jsonLdScriptProps } from './jsonLd'

describe('jsonLdScriptProps', () => {
  it('serializes the data as application/ld+json', () => {
    const props = jsonLdScriptProps({ '@type': 'Organization', name: 'ManTur' })
    expect(props.type).toBe('application/ld+json')
    expect(JSON.parse(props.dangerouslySetInnerHTML.__html)).toEqual({
      '@type': 'Organization',
      name: 'ManTur',
    })
  })

  it('escapes "<" so a user-supplied name cannot close the script tag early', () => {
    const props = jsonLdScriptProps({ name: '</script><script>alert(1)</script>' })
    expect(props.dangerouslySetInnerHTML.__html).not.toContain('</script>')
    expect(JSON.parse(props.dangerouslySetInnerHTML.__html)).toEqual({
      name: '</script><script>alert(1)</script>',
    })
  })
})
