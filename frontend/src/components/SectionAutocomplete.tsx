import { useState, useEffect, useRef } from 'react'
import { searchSections } from '../api/nodes'
import type { SectionSearchResult } from '../types'

interface SectionAutocompleteProps {
  query: string
  listId?: string
  anchorRect: { top: number; left: number; height: number } | null
  onSelect: (result: SectionSearchResult) => void
  onClose: () => void
}

export function SectionAutocomplete({ query, listId, anchorRect, onSelect, onClose }: SectionAutocompleteProps) {
  const [results, setResults] = useState<SectionSearchResult[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!query) {
      setResults([])
      return
    }
    const timer = setTimeout(() => {
      searchSections(query, listId).then((r) => {
        setResults(r)
        setSelectedIdx(0)
      }).catch(() => setResults([]))
    }, 200)
    return () => clearTimeout(timer)
  }, [query, listId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        setSelectedIdx((i) => Math.min(i + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        setSelectedIdx((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && results.length > 0) {
        e.preventDefault()
        e.stopPropagation()
        onSelect(results[selectedIdx])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [results, selectedIdx, onSelect, onClose])

  if (!anchorRect || results.length === 0) return null

  // Position dropdown below the input
  const style: React.CSSProperties = {
    position: 'fixed',
    top: anchorRect.top + anchorRect.height + 4,
    left: anchorRect.left,
    minWidth: 240,
    maxWidth: 360,
    zIndex: 100,
  }

  return (
    <div ref={containerRef} style={style} className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {results.map((r, i) => (
        <button
          key={r.id}
          className={`w-full px-3 py-2 text-left text-sm flex flex-col transition-colors ${
            i === selectedIdx ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
          }`}
          onMouseEnter={() => setSelectedIdx(i)}
          onMouseDown={(e) => {
            e.preventDefault() // prevent input blur
            onSelect(r)
          }}
        >
          <span className="font-medium text-gray-900 dark:text-gray-100">{r.text}</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">{r.list_title}</span>
        </button>
      ))}
    </div>
  )
}
