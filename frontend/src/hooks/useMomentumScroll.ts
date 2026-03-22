import { useCallback, useRef } from 'react'

interface UseMomentumScrollOptions {
  scrollContainerRef: React.RefObject<HTMLElement | null>
  isScrollDisabled?: () => boolean
  friction?: number
  minVelocity?: number
}

interface VelocitySample {
  y: number
  t: number
}

const FRICTION = 0.998          // per-ms decay (~2s coast, iOS-like)
const MIN_VELOCITY = 0.3        // px/ms threshold to start momentum
const STOP_THRESHOLD = 0.05     // px/ms, below this halt animation
const MAX_DELTA_MS = 100        // cap per-frame delta (tab-switch safety)
const SAMPLE_WINDOW_MS = 100    // rolling window for velocity estimation

export function useMomentumScroll({
  scrollContainerRef,
  isScrollDisabled,
  friction = FRICTION,
  minVelocity = MIN_VELOCITY,
}: UseMomentumScrollOptions) {
  const lastY = useRef<number | null>(null)
  const samples = useRef<VelocitySample[]>([])
  const rafId = useRef<number | null>(null)
  const velocityRef = useRef(0)
  const lastFrameTime = useRef(0)
  const gestureStarted = useRef(false)

  const cancelMomentum = useCallback(() => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current)
      rafId.current = null
    }
    velocityRef.current = 0
  }, [])

  const startMomentum = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    lastFrameTime.current = performance.now()

    const tick = () => {
      const now = performance.now()
      let dt = now - lastFrameTime.current
      if (dt > MAX_DELTA_MS) dt = MAX_DELTA_MS
      lastFrameTime.current = now

      // Apply decay
      velocityRef.current *= Math.pow(friction, dt)

      // Apply scroll (velocity is in px/ms, negative = scroll up)
      container.scrollTop += velocityRef.current * dt

      // Stop conditions
      if (Math.abs(velocityRef.current) < STOP_THRESHOLD) {
        rafId.current = null
        return
      }
      if (container.scrollTop <= 0 && velocityRef.current < 0) {
        rafId.current = null
        return
      }
      const maxScroll = container.scrollHeight - container.clientHeight
      if (container.scrollTop >= maxScroll && velocityRef.current > 0) {
        rafId.current = null
        return
      }

      rafId.current = requestAnimationFrame(tick)
    }

    rafId.current = requestAnimationFrame(tick)
  }, [scrollContainerRef, friction])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only handle touches on sortable items
    const target = e.target as HTMLElement
    if (!target.closest('[data-sortable]')) return

    cancelMomentum()
    lastY.current = e.touches[0].clientY
    samples.current = []
    gestureStarted.current = false
  }, [cancelMomentum])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isScrollDisabled?.()) return
    if (!scrollContainerRef.current) return
    if (lastY.current === null) return

    const currentY = e.touches[0].clientY
    const now = performance.now()

    // On first move after sensor abort, reset lastY to avoid jump
    if (!gestureStarted.current) {
      gestureStarted.current = true
      lastY.current = currentY
      samples.current = [{ y: currentY, t: now }]
      return
    }

    const deltaY = lastY.current - currentY
    scrollContainerRef.current.scrollTop += deltaY
    lastY.current = currentY

    // Track velocity samples
    samples.current.push({ y: currentY, t: now })
    // Trim old samples
    const cutoff = now - SAMPLE_WINDOW_MS
    while (samples.current.length > 0 && samples.current[0].t < cutoff) {
      samples.current.shift()
    }
  }, [scrollContainerRef, isScrollDisabled])

  const handleTouchEnd = useCallback(() => {
    if (lastY.current === null) return
    lastY.current = null

    const s = samples.current
    if (s.length < 2) return

    // Compute velocity from sample window (px/ms, positive = scrolling down)
    const oldest = s[0]
    const newest = s[s.length - 1]
    const dt = newest.t - oldest.t
    if (dt < 1) return

    // deltaY is inverted: finger moving up (negative dy) = scroll down (positive velocity)
    const velocity = (oldest.y - newest.y) / dt

    if (Math.abs(velocity) < minVelocity) return

    velocityRef.current = velocity
    startMomentum()
  }, [minVelocity, startMomentum])

  return { handleTouchStart, handleTouchMove, handleTouchEnd, cancelMomentum }
}
