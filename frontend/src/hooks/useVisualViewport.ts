import { useEffect } from 'react'

/**
 * Syncs a CSS custom property (--viewport-height) on <html> to the
 * visual viewport height. This handles Safari (which ignores
 * interactive-widget=resizes-content) by reacting to keyboard show/hide
 * via the VisualViewport API.
 *
 * Usage in CSS/Tailwind: height: var(--viewport-height, 100dvh)
 */
export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      document.documentElement.style.setProperty('--viewport-height', `${vv.height}px`)
    }

    update()
    vv.addEventListener('resize', update)
    // Also listen to scroll — on iOS, the visual viewport can scroll
    // relative to the layout viewport when the keyboard opens
    vv.addEventListener('scroll', update)

    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      document.documentElement.style.removeProperty('--viewport-height')
    }
  }, [])
}
