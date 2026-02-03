/**
 * Tmux Polling Service
 *
 * Polls tmux sessions at 5 FPS (200ms) and emits output changes.
 * Detects session creation/destruction.
 *
 * Session listing uses CHROTE API (terminal backend) when available.
 * Pane capture uses local TmuxBridge.
 */

import { EventEmitter } from "events";
import type { TmuxBridge } from "./bridge";
import type { ChroteClient } from "../chrote";
import type { TmuxSession, TmuxEvent } from "./types";

/** Default polling interval: 200ms = 5 FPS */
const DEFAULT_POLL_INTERVAL = 200;

/** Session polling interval: 2 seconds */
const SESSION_LIST_INTERVAL = 2000;

interface PaneState {
  content: string;
  lastUpdate: Date;
}

interface PollerOptions {
  /** Polling interval in ms (default: 200ms) */
  pollInterval?: number;
  /** Session list refresh interval in ms (default: 2000ms) */
  sessionListInterval?: number;
}

export class TmuxPoller extends EventEmitter {
  private bridge: TmuxBridge;
  private chrote: ChroteClient | null;
  private pollInterval: number;
  private sessionListInterval: number;

  /** Active subscriptions: session -> Set of pane specifiers */
  private subscriptions: Map<string, Set<string>> = new Map();

  /** Last known pane content for diff detection */
  private paneStates: Map<string, PaneState> = new Map();

  /** Last known sessions for creation/destruction detection */
  private knownSessions: Set<string> = new Set();

  /** Polling timer handles */
  private outputPollTimer: ReturnType<typeof setInterval> | null = null;
  private sessionPollTimer: ReturnType<typeof setInterval> | null = null;

  /** Running state */
  private running = false;

  constructor(bridge: TmuxBridge, chrote?: ChroteClient, options: PollerOptions = {}) {
    super();
    this.bridge = bridge;
    this.chrote = chrote ?? null;
    this.pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;
    this.sessionListInterval = options.sessionListInterval ?? SESSION_LIST_INTERVAL;
  }

  /**
   * Start polling
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Poll output at 5 FPS
    this.outputPollTimer = setInterval(() => {
      this.pollOutput().catch((err) => {
        this.emit("error", err);
      });
    }, this.pollInterval);

    // Poll session list less frequently
    this.sessionPollTimer = setInterval(() => {
      this.pollSessions().catch((err) => {
        this.emit("error", err);
      });
    }, this.sessionListInterval);

    // Initial session poll
    this.pollSessions().catch((err) => {
      this.emit("error", err);
    });
  }

  /**
   * Stop polling
   */
  stop(): void {
    this.running = false;

    if (this.outputPollTimer) {
      clearInterval(this.outputPollTimer);
      this.outputPollTimer = null;
    }

    if (this.sessionPollTimer) {
      clearInterval(this.sessionPollTimer);
      this.sessionPollTimer = null;
    }
  }

  /**
   * Subscribe to a session's output
   */
  subscribe(session: string, pane: string = "0"): void {
    if (!this.subscriptions.has(session)) {
      this.subscriptions.set(session, new Set());
    }
    this.subscriptions.get(session)!.add(pane);
  }

  /**
   * Unsubscribe from a session
   */
  unsubscribe(session: string, pane?: string): void {
    if (pane) {
      // Unsubscribe from specific pane
      const panes = this.subscriptions.get(session);
      if (panes) {
        panes.delete(pane);
        if (panes.size === 0) {
          this.subscriptions.delete(session);
        }
      }
    } else {
      // Unsubscribe from entire session
      this.subscriptions.delete(session);
    }

    // Clean up state
    for (const key of this.paneStates.keys()) {
      if (key.startsWith(`${session}:`)) {
        if (!pane || key === `${session}:${pane}`) {
          this.paneStates.delete(key);
        }
      }
    }
  }

  /**
   * Check if any subscriptions exist
   */
  hasSubscriptions(): boolean {
    return this.subscriptions.size > 0;
  }

  /**
   * Get all active subscriptions
   */
  getSubscriptions(): Map<string, Set<string>> {
    return new Map(this.subscriptions);
  }

  /**
   * Poll all subscribed panes for output changes
   */
  private async pollOutput(): Promise<void> {
    const pollPromises: Promise<void>[] = [];

    for (const [session, panes] of this.subscriptions) {
      for (const pane of panes) {
        pollPromises.push(this.pollPane(session, pane));
      }
    }

    await Promise.allSettled(pollPromises);
  }

  /**
   * Poll a single pane and emit if content changed
   */
  private async pollPane(session: string, pane: string): Promise<void> {
    const stateKey = `${session}:${pane}`;

    try {
      const result = await this.bridge.capturePane(session, pane);
      const previousState = this.paneStates.get(stateKey);

      // Only emit if content actually changed
      if (!previousState || previousState.content !== result.content) {
        this.paneStates.set(stateKey, {
          content: result.content,
          lastUpdate: result.timestamp,
        });

        const event: TmuxEvent = {
          type: "output",
          session,
          pane,
          content: result.content,
        };
        this.emit("event", event);
      }
    } catch (error) {
      // Session/pane might have been destroyed
      if (
        error instanceof Error &&
        (error.message.includes("not found") ||
          error.message.includes("no server"))
      ) {
        // Clean up subscription for missing session
        this.unsubscribe(session, pane);
      } else {
        throw error;
      }
    }
  }

  /**
   * Poll session list for creation/destruction
   * Uses CHROTE API if available, falls back to local bridge
   */
  private async pollSessions(): Promise<void> {
    try {
      // Prefer CHROTE API for session listing
      const sessions = this.chrote
        ? await this.chrote.listSessions()
        : await this.bridge.listSessions();
      const currentSessionNames = new Set(sessions.map((s) => s.name));

      // Detect new sessions
      for (const session of sessions) {
        if (!this.knownSessions.has(session.name)) {
          const event: TmuxEvent = {
            type: "session_created",
            session,
          };
          this.emit("event", event);
        }
      }

      // Detect destroyed sessions
      for (const name of this.knownSessions) {
        if (!currentSessionNames.has(name)) {
          const event: TmuxEvent = {
            type: "session_destroyed",
            sessionName: name,
          };
          this.emit("event", event);

          // Clean up subscriptions for destroyed session
          this.unsubscribe(name);
        }
      }

      // Update known sessions
      this.knownSessions = currentSessionNames;

      // Emit sessions list for clients
      this.emit("sessions", sessions);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("no server running")
      ) {
        // All sessions gone
        for (const name of this.knownSessions) {
          const event: TmuxEvent = {
            type: "session_destroyed",
            sessionName: name,
          };
          this.emit("event", event);
        }
        this.knownSessions.clear();
        this.subscriptions.clear();
        this.paneStates.clear();
        this.emit("sessions", []);
      } else {
        throw error;
      }
    }
  }

  /**
   * Force refresh a session's output (bypass change detection)
   */
  async forceRefresh(session: string, pane: string = "0"): Promise<string> {
    const result = await this.bridge.capturePane(session, pane);
    const stateKey = `${session}:${pane}`;

    this.paneStates.set(stateKey, {
      content: result.content,
      lastUpdate: result.timestamp,
    });

    return result.content;
  }

  /**
   * Get current known sessions
   */
  getKnownSessions(): TmuxSession[] {
    // Return cached session info (updated every sessionListInterval)
    return Array.from(this.knownSessions).map((name) => ({
      name,
      windows: 1,
      attached: 0,
      created: new Date(),
      id: name,
    }));
  }
}

/**
 * Create a new poller instance
 *
 * @param bridge - TmuxBridge for pane capture
 * @param chrote - ChroteClient for session listing (optional)
 * @param options - Polling configuration
 */
export function createTmuxPoller(
  bridge: TmuxBridge,
  chrote?: ChroteClient,
  options?: PollerOptions
): TmuxPoller {
  return new TmuxPoller(bridge, chrote, options);
}
