/**
 * Custom touch sensor: long-press (600ms) → drag, quick swipe → scroll.
 *
 * dnd-kit's built-in TouchSensor does NOT call preventDefault() during
 * the delay period, so the browser hijacks the touch for scrolling before
 * the sensor ever activates.  This sensor fixes that by:
 *
 *   1. Calling preventDefault() on touchmove during the delay so the
 *      browser can't start scrolling.
 *   2. If the finger moves more than `tolerance` px before the delay
 *      expires, cancelling and signalling "scroll mode" so the component
 *      can scroll manually.
 *   3. If the delay expires with the finger still, activating drag.
 *
 * The component reads `sensorPhase` to decide whether to scroll.
 */

import type { SyntheticEvent } from 'react'

// ── Shared state readable by TreeView ──────────────────────────────
export type SensorPhase = 'idle' | 'pending' | 'active'
export let sensorPhase: SensorPhase = 'idle'
export let sensorDebug: string = ''

function debugLog(msg: string) {
  console.log(msg)
  sensorDebug = msg
  // Update visible debug overlay
  const el = document.getElementById('sensor-debug')
  if (el) el.textContent = msg
}

// ── Minimal type stubs ─
interface Coordinates { x: number; y: number }

// Use `any` for constructor props to match dnd-kit's internal SensorProps type
// which isn't publicly exported with compatible generics.
type SensorProps = any

// ── Sensor class ──────────────────────────────────────────────────
export class LongPressTouchSensor {
  autoScrollEnabled = true

  private props: SensorProps
  private initialCoords: Coordinates
  private timer: ReturnType<typeof setTimeout> | null = null
  private activated = false
  private moveHandler: (e: TouchEvent) => void
  private endHandler: () => void
  private cancelHandler: () => void

  constructor(props: SensorProps) {
    this.props = props
    const touch = (props.event as TouchEvent).touches[0]
    this.initialCoords = { x: touch.clientX, y: touch.clientY }
    debugLog(`[S] created at ${touch.clientX.toFixed(0)},${touch.clientY.toFixed(0)}`)

    this.moveHandler = this.handleMove.bind(this)
    this.endHandler = this.handleEnd.bind(this)
    this.cancelHandler = this.handleEnd.bind(this)

    document.addEventListener('touchmove', this.moveHandler, { passive: false })
    document.addEventListener('touchend', this.endHandler)
    document.addEventListener('touchcancel', this.cancelHandler)

    // Prevent context-menu popup on long-press
    document.addEventListener('contextmenu', preventDefault, { capture: true })

    sensorPhase = 'pending'
    const delay = props.options?.delay ?? 600
    this.timer = setTimeout(() => {
      debugLog('[S] DRAG ACTIVE')
      this.activated = true
      sensorPhase = 'active'
      props.onStart(this.initialCoords)
    }, delay)
  }

  private handleMove(event: TouchEvent) {
    const touch = event.touches[0]
    const coords: Coordinates = { x: touch.clientX, y: touch.clientY }

    if (!this.activated) {
      // During the delay: check if finger moved too far
      const dx = coords.x - this.initialCoords.x
      const dy = coords.y - this.initialCoords.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      const tolerance = this.props.options?.tolerance ?? 10

      if (distance > tolerance) {
        // Finger moved → this is a scroll, not a drag
        debugLog(`[S] scroll (moved ${distance.toFixed(0)}px)`)
        this.abort()
        return
      }

      // Still within tolerance – prevent browser from claiming the touch
      debugLog(`[S] pending d=${distance.toFixed(0)} cancel=${event.cancelable}`)
      if (event.cancelable) event.preventDefault()
      return
    }

    // Drag is active – move
    if (event.cancelable) event.preventDefault()
    this.props.onMove(coords)
  }

  private handleEnd() {
    if (this.activated) {
      this.cleanup()
      this.props.onEnd()
    } else {
      this.abort()
    }
  }

  private abort() {
    this.cleanup()
    this.props.onAbort(this.props.active as any)
    this.props.onCancel()
  }

  private cleanup() {
    sensorPhase = 'idle'
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    document.removeEventListener('touchmove', this.moveHandler)
    document.removeEventListener('touchend', this.endHandler)
    document.removeEventListener('touchcancel', this.cancelHandler)
    document.removeEventListener('contextmenu', preventDefault, { capture: true })
  }

  // ── Static activators (dnd-kit calls this to decide if sensor fires) ─
  static activators = [{
    eventName: 'onTouchStart' as const,
    handler: (event: SyntheticEvent, _options: any, _ctx: any) => {
      const te = event.nativeEvent as TouchEvent
      debugLog(`[S] activator fired touches=${te.touches.length}`)
      if (te.touches.length > 1) return false
      return true
    },
  }]

  // Needed for iOS Safari: a non-passive touchmove listener on window
  // so that future addEventListener(..., {passive:false}) + preventDefault works.
  static setup() {
    const noop = () => {}
    window.addEventListener('touchmove', noop, { capture: false, passive: false })
    return () => window.removeEventListener('touchmove', noop)
  }
}

function preventDefault(e: Event) { e.preventDefault() }
