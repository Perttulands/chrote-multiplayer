/**
 * WebSocket Hook for Terminal Communication
 *
 * Manages WebSocket connection for terminal streaming,
 * including subscribe/unsubscribe, send keys, and lock management.
 */

import { useEffect, useRef, useCallback, useState } from 'react'

// Message types (matching server protocol)
interface OutputMessage {
  type: 'output'
  sessionId: string
  pane: string
  data: string
  timestamp: string
}

interface ClaimedMessage {
  type: 'claimed'
  sessionId: string
  by: { id: string; name: string }
  expiresAt: string
}

interface ReleasedMessage {
  type: 'released'
  sessionId: string
}

interface ErrorMessage {
  type: 'error'
  code: string
  message: string
}

interface ConnectedMessage {
  type: 'connected'
  userId: string
  role: string
}

type ServerMessage = OutputMessage | ClaimedMessage | ReleasedMessage | ErrorMessage | ConnectedMessage

interface UseTerminalWsOptions {
  sessionId: string
  onOutput?: (data: string) => void
  onClaimed?: (by: { id: string; name: string }) => void
  onReleased?: () => void
  onError?: (error: { code: string; message: string }) => void
}

interface UseTerminalWsReturn {
  isConnected: boolean
  lockedBy: { id: string; name: string } | null
  sendKeys: (keys: string) => void
  claim: () => void
  release: () => void
}

// Singleton WebSocket connection
let sharedWs: WebSocket | null = null
let wsRefCount = 0
const messageHandlers = new Map<string, Set<(msg: ServerMessage) => void>>()

function getSharedWs(): WebSocket {
  if (sharedWs && sharedWs.readyState === WebSocket.OPEN) {
    return sharedWs
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.host}/ws`

  sharedWs = new WebSocket(wsUrl)

  sharedWs.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data) as ServerMessage
      // Dispatch to all handlers for this session
      if ('sessionId' in msg) {
        const handlers = messageHandlers.get(msg.sessionId)
        handlers?.forEach((handler) => handler(msg))
      }
      // Also dispatch to global handlers (empty string key)
      const globalHandlers = messageHandlers.get('')
      globalHandlers?.forEach((handler) => handler(msg))
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e)
    }
  }

  sharedWs.onclose = () => {
    sharedWs = null
    // Reconnect after delay
    setTimeout(() => {
      if (wsRefCount > 0) {
        getSharedWs()
      }
    }, 1000)
  }

  return sharedWs
}

function sendMessage(msg: object) {
  const ws = getSharedWs()
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  } else {
    // Queue message to send when connected
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify(msg))
    }, { once: true })
  }
}

export function useTerminalWs({
  sessionId,
  onOutput,
  onClaimed,
  onReleased,
  onError,
}: UseTerminalWsOptions): UseTerminalWsReturn {
  const [isConnected, setIsConnected] = useState(false)
  const [lockedBy, setLockedBy] = useState<{ id: string; name: string } | null>(null)

  // Store callbacks in refs to avoid re-subscribing
  const callbacksRef = useRef({ onOutput, onClaimed, onReleased, onError })
  callbacksRef.current = { onOutput, onClaimed, onReleased, onError }

  useEffect(() => {
    wsRefCount++
    const ws = getSharedWs()

    // Handler for this session's messages
    const handler = (msg: ServerMessage) => {
      switch (msg.type) {
        case 'output':
          if (msg.sessionId === sessionId) {
            callbacksRef.current.onOutput?.(msg.data)
          }
          break
        case 'claimed':
          if (msg.sessionId === sessionId) {
            setLockedBy(msg.by)
            callbacksRef.current.onClaimed?.(msg.by)
          }
          break
        case 'released':
          if (msg.sessionId === sessionId) {
            setLockedBy(null)
            callbacksRef.current.onReleased?.()
          }
          break
        case 'error':
          callbacksRef.current.onError?.({ code: msg.code, message: msg.message })
          break
        case 'connected':
          setIsConnected(true)
          break
      }
    }

    // Register handler
    if (!messageHandlers.has(sessionId)) {
      messageHandlers.set(sessionId, new Set())
    }
    messageHandlers.get(sessionId)!.add(handler)

    // Subscribe to session
    sendMessage({ type: 'subscribe', sessionId })

    // Track connection state
    const handleOpen = () => setIsConnected(true)
    const handleClose = () => setIsConnected(false)

    ws.addEventListener('open', handleOpen)
    ws.addEventListener('close', handleClose)

    if (ws.readyState === WebSocket.OPEN) {
      setIsConnected(true)
    }

    return () => {
      wsRefCount--
      messageHandlers.get(sessionId)?.delete(handler)
      if (messageHandlers.get(sessionId)?.size === 0) {
        messageHandlers.delete(sessionId)
      }

      // Unsubscribe from session
      sendMessage({ type: 'unsubscribe', sessionId })

      ws.removeEventListener('open', handleOpen)
      ws.removeEventListener('close', handleClose)

      // Close shared WebSocket if no more subscribers
      if (wsRefCount === 0 && sharedWs) {
        sharedWs.close()
        sharedWs = null
      }
    }
  }, [sessionId])

  const sendKeys = useCallback((keys: string) => {
    sendMessage({ type: 'sendKeys', sessionId, keys })
  }, [sessionId])

  const claim = useCallback(() => {
    sendMessage({ type: 'claim', sessionId })
  }, [sessionId])

  const release = useCallback(() => {
    sendMessage({ type: 'release', sessionId })
  }, [sessionId])

  return {
    isConnected,
    lockedBy,
    sendKeys,
    claim,
    release,
  }
}
