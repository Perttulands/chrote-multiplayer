/**
 * CHROTE API Client
 *
 * Client for communicating with the CHROTE terminal backend.
 * CHROTE owns tmux operations; multiplayer adds collaboration layer on top.
 */

import type { TmuxSession } from "../tmux/types";

/** CHROTE session response format */
interface ChroteSession {
  name: string;
  windows: number;
  attached: boolean;
  group: string;
}

/** CHROTE /api/tmux/sessions response */
interface ChroteSessionsResponse {
  sessions: ChroteSession[];
  grouped: Record<string, ChroteSession[]>;
  timestamp: string;
}

/** CHROTE client configuration */
export interface ChroteClientConfig {
  /** Base URL for CHROTE API (default: http://chrote:8080) */
  baseUrl: string;
  /** Request timeout in ms (default: 5000) */
  timeout?: number;
}

/**
 * Convert CHROTE session format to our TmuxSession format
 */
function mapChroteSession(session: ChroteSession): TmuxSession {
  return {
    name: session.name,
    windows: session.windows,
    attached: session.attached ? 1 : 0,
    // CHROTE doesn't provide these - use defaults
    created: new Date(),
    id: `$${session.name}`,
    currentWindow: undefined,
    width: undefined,
    height: undefined,
  };
}

export class ChroteClient {
  private baseUrl: string;
  private timeout: number;

  constructor(config: ChroteClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.timeout = config.timeout ?? 5000;
  }

  /**
   * List all tmux sessions from CHROTE
   */
  async listSessions(): Promise<TmuxSession[]> {
    const url = `${this.baseUrl}/api/tmux/sessions`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`CHROTE API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as ChroteSessionsResponse;
      return data.sessions.map(mapChroteSession);
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new Error(`CHROTE API timeout after ${this.timeout}ms`);
        }
        throw new Error(`CHROTE API error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Check if CHROTE API is reachable
   */
  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(`${this.baseUrl}/api/tmux/sessions`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get a specific session by name
   */
  async getSession(name: string): Promise<TmuxSession | null> {
    const sessions = await this.listSessions();
    return sessions.find((s) => s.name === name) ?? null;
  }

  /**
   * Capture pane content from a tmux session
   */
  async capturePane(
    session: string,
    pane: string
  ): Promise<{ session: string; pane: string; content: string; timestamp: string }> {
    const url = `${this.baseUrl}/api/tmux/sessions/${encodeURIComponent(session)}/capture`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Session '${session}' not found`);
        }
        throw new Error(`CHROTE API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as { content?: string; output?: string; timestamp?: string };
      return {
        session,
        pane,
        content: data.content ?? data.output ?? "",
        timestamp: data.timestamp ?? new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new Error(`CHROTE API timeout after ${this.timeout}ms`);
        }
        throw error;
      }
      throw error;
    }
  }
}

/** Singleton instance */
let clientInstance: ChroteClient | null = null;

/**
 * Get the CHROTE client singleton
 */
export function getChroteClient(): ChroteClient {
  if (!clientInstance) {
    const baseUrl = process.env.CHROTE_API_URL || "http://chrote:8080";
    clientInstance = new ChroteClient({ baseUrl });
  }
  return clientInstance;
}

/**
 * Create a new CHROTE client instance (for testing)
 */
export function createChroteClient(config: ChroteClientConfig): ChroteClient {
  return new ChroteClient(config);
}
