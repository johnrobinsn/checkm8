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
      // Only override when the virtual keyboard is actively shrinking
      // the viewport.  Otherwise let the CSS fallback (100dvh) size
      // the app – it correctly fills fullscreen PWA mode, whereas
      // vv.height can be shorter than the true screen height.
      if (vv.height < window.innerHeight - 100) {
        document.documentElement.style.setProperty('--viewport-height', `${vv.height}px`)
      } else {
        document.documentElement.style.removeProperty('--viewport-height')
      }
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
