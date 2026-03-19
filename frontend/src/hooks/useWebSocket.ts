import { useEffect, useRef, useState } from 'react'
import { getToken } from '../api/client'
import type { WsMessage } from '../types'

export function useWebSocket(
  listId: string | null,
  onMessage: (msg: WsMessage) => void,
) {
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    if (!listId) return

    const token = getToken()
    if (!token) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/${listId}?token=${token}`

    let reconnectTimer: ReturnType<typeof setTimeout>
    let ws: WebSocket

    const connect = () => {
      ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => setConnected(true)

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WsMessage
          onMessageRef.current(msg)
        } catch {}
      }

      ws.onclose = () => {
        setConnected(false)
        // Reconnect after 2 seconds
        reconnectTimer = setTimeout(connect, 2000)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      clearTimeout(reconnectTimer)
      if (wsRef.current) {
        wsRef.current.onmessage = null // prevent ghost messages during close
        wsRef.current.onclose = null   // prevent reconnect
        wsRef.current.close()
      }
      setConnected(false)
    }
  }, [listId])

  return { connected }
}
