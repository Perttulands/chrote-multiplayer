import { useEffect, useRef, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'

interface TerminalProps {
  sessionId: string
  onData?: (data: string) => void
  onResize?: (cols: number, rows: number) => void
  readOnly?: boolean
}

const TERMINAL_THEME = {
  background: '#0a0a0a',
  foreground: '#e5e5e5',
  cursor: '#e5e5e5',
  cursorAccent: '#0a0a0a',
  selectionBackground: 'rgba(99, 102, 241, 0.3)',
  selectionForeground: undefined,
  selectionInactiveBackground: 'rgba(99, 102, 241, 0.15)',
  black: '#1a1a1a',
  red: '#ef4444',
  green: '#10b981',
  yellow: '#f59e0b',
  blue: '#3b82f6',
  magenta: '#8b5cf6',
  cyan: '#06b6d4',
  white: '#e5e5e5',
  brightBlack: '#525252',
  brightRed: '#f87171',
  brightGreen: '#34d399',
  brightYellow: '#fbbf24',
  brightBlue: '#60a5fa',
  brightMagenta: '#a78bfa',
  brightCyan: '#22d3ee',
  brightWhite: '#ffffff',
}

export function Terminal({ sessionId, onData, onResize, readOnly = false }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new XTerm({
      theme: TERMINAL_THEME,
      fontFamily: '"JetBrains Mono", "Menlo", "Monaco", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: !readOnly,
      cursorStyle: 'block',
      scrollback: 10000,
      allowProposedApi: true,
      disableStdin: readOnly,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    const searchAddon = new SearchAddon()

    terminal.loadAddon(fitAddon)
    terminal.loadAddon(webLinksAddon)
    terminal.loadAddon(searchAddon)

    terminal.open(containerRef.current)
    fitAddon.fit()

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Handle input
    if (!readOnly && onData) {
      terminal.onData(onData)
    }

    // Handle resize
    const handleResize = () => {
      if (fitAddonRef.current && terminalRef.current) {
        fitAddonRef.current.fit()
        onResize?.(terminalRef.current.cols, terminalRef.current.rows)
      }
    }

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(containerRef.current)

    // Initial resize callback
    onResize?.(terminal.cols, terminal.rows)

    return () => {
      resizeObserver.disconnect()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [sessionId, readOnly, onData, onResize])

  // Public method to write data
  const write = useCallback((data: string) => {
    terminalRef.current?.write(data)
  }, [])

  // Public method to clear terminal
  const clear = useCallback(() => {
    terminalRef.current?.clear()
  }, [])

  // Public method to focus terminal
  const focus = useCallback(() => {
    terminalRef.current?.focus()
  }, [])

  // Expose methods via ref
  useEffect(() => {
    // Store methods on the container element for external access
    const container = containerRef.current
    if (container) {
      (container as any).__terminal = { write, clear, focus }
    }
  }, [write, clear, focus])

  return (
    <div
      ref={containerRef}
      className="terminal-container w-full h-full"
      data-session-id={sessionId}
    />
  )
}

// Helper hook to access terminal methods
export function useTerminalRef(containerRef: React.RefObject<HTMLDivElement>) {
  return {
    write: (data: string) => {
      (containerRef.current as any)?.__terminal?.write(data)
    },
    clear: () => {
      (containerRef.current as any)?.__terminal?.clear()
    },
    focus: () => {
      (containerRef.current as any)?.__terminal?.focus()
    },
  }
}
