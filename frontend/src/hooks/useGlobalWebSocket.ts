import { useEffect, useRef } from 'react'
import { getToken } from '../api/client'

type GlobalWsMessage =
  | { type: 'list_created'; list: Record<string, unknown> }
  | { type: 'list_updated'; list: Record<string, unknown> }
  | { type: 'list_archived'; list: Record<string, unknown> }
  | { type: 'list_restored'; list: Record<string, unknown> }
  | { type: 'list_deleted'; list_id: string }

export function useGlobalWebSocket(onMessage: (msg: GlobalWsMessage) => void) {
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    const token = getToken()
    if (!token) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/global?token=${token}`

    let reconnectTimer: ReturnType<typeof setTimeout>
    let ws: WebSocket

    const connect = () => {
      ws = new WebSocket(wsUrl)

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as GlobalWsMessage
          onMessageRef.current(msg)
        } catch {}
      }

      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 2000)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      clearTimeout(reconnectTimer)
      if (ws) {
        ws.onclose = null
        ws.close()
      }
    }
  }, [])
}
