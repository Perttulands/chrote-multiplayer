/**
 * Tmux Bridge Types
 *
 * TypeScript interfaces for tmux session management.
 */

/** Tmux session metadata */
export interface TmuxSession {
  /** Session name (e.g., "dev", "main") */
  name: string;
  /** Number of windows in session */
  windows: number;
  /** Attached client count */
  attached: number;
  /** Session creation timestamp */
  created: Date;
  /** Session ID (e.g., "$0") */
  id: string;
  /** Current window name */
  currentWindow?: string;
  /** Session dimensions */
  width?: number;
  height?: number;
}

/** Tmux pane metadata */
export interface TmuxPane {
  /** Pane index (0, 1, 2...) */
  index: number;
  /** Pane ID (e.g., "%0") */
  id: string;
  /** Is this pane active? */
  active: boolean;
  /** Pane dimensions */
  width: number;
  height: number;
  /** Current working directory */
  cwd?: string;
  /** Current command */
  command?: string;
}

/** Output from capturing a pane */
export interface CaptureResult {
  /** Session name */
  session: string;
  /** Pane specifier (e.g., "0.0") */
  pane: string;
  /** Captured content with ANSI codes */
  content: string;
  /** Capture timestamp */
  timestamp: Date;
}

/** Tmux bridge interface */
export interface ITmuxBridge {
  /** List all tmux sessions */
  listSessions(): Promise<TmuxSession[]>;

  /** Capture pane output with ANSI codes */
  capturePane(session: string, pane?: string): Promise<CaptureResult>;

  /** Send keys to a session */
  sendKeys(session: string, keys: string, pane?: string): Promise<void>;

  /** Get scrollback buffer */
  getScrollback(session: string, lines: number, pane?: string): Promise<string>;

  /** Check if tmux is available */
  isAvailable(): Promise<boolean>;

  /** Get session by name */
  getSession(name: string): Promise<TmuxSession | null>;
}

/** Events emitted by the tmux bridge */
export type TmuxEvent =
  | { type: "session_created"; session: TmuxSession }
  | { type: "session_destroyed"; sessionName: string }
  | { type: "output"; session: string; pane: string; content: string };

/** Polling configuration */
export interface TmuxPollingConfig {
  /** Polling interval in milliseconds (default: 200ms = 5 FPS) */
  intervalMs: number;
  /** Sessions to poll */
  sessions: Map<string, Set<string>>; // session -> panes
}
