export interface TextSegment {
  type: 'text'
  value: string
}

export interface LinkSegment {
  type: 'link'
  raw: string        // full match including [[ ]]
  name: string       // section name
  listTitle?: string  // optional list title prefix
}

export type Segment = TextSegment | LinkSegment

const LINK_RE = /\[\[([^\]]+)\]\]/g

export function parseLinks(text: string): Segment[] {
  const segments: Segment[] = []
  let lastIndex = 0

  for (const match of text.matchAll(LINK_RE)) {
    const start = match.index!
    if (start > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, start) })
    }

    const inner = match[1]
    const slashIdx = inner.indexOf('/')
    if (slashIdx >= 0) {
      segments.push({
        type: 'link',
        raw: match[0],
        listTitle: inner.slice(0, slashIdx).trim(),
        name: inner.slice(slashIdx + 1).trim(),
      })
    } else {
      segments.push({
        type: 'link',
        raw: match[0],
        name: inner.trim(),
      })
    }

    lastIndex = start + match[0].length
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }

  return segments
}

export function hasLinks(text: string): boolean {
  return LINK_RE.test(text)
}
