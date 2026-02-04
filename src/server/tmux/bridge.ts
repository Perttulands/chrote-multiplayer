/**
 * Tmux Session Bridge
 *
 * Bridges tmux sessions to the application - read output, send commands, list sessions.
 * Uses tmux CLI commands via child_process.
 */

import { exec } from "child_process";
import { promisify } from "util";
import type {
  TmuxSession,
  CaptureResult,
  ITmuxBridge,
} from "./types";

const execAsync = promisify(exec);

/** Default timeout for tmux commands (ms) */
const TMUX_TIMEOUT = 5000;

/**
 * Parse tmux list-sessions output
 *
 * Format: session_name: windows (created date) [dimensions] (attached)
 * Example: dev: 3 windows (created Mon Feb  3 12:00:00 2026) [190x45] (attached)
 */
function parseListSessions(output: string): TmuxSession[] {
  const sessions: TmuxSession[] = [];
  const lines = output.trim().split("\n").filter(Boolean);

  for (const line of lines) {
    try {
      // Use tmux format string parsing for more reliable extraction
      // Expected format from: tmux list-sessions -F "#{session_name}|#{session_windows}|#{session_attached}|#{session_created}|#{session_id}|#{window_name}|#{session_width}|#{session_height}"
      const parts = line.split("|");
      if (parts.length >= 5) {
        sessions.push({
          name: parts[0],
          windows: parseInt(parts[1], 10) || 1,
          attached: parseInt(parts[2], 10) || 0,
          created: new Date(parseInt(parts[3], 10) * 1000),
          id: parts[4],
          currentWindow: parts[5] || undefined,
          width: parts[6] ? parseInt(parts[6], 10) : undefined,
          height: parts[7] ? parseInt(parts[7], 10) : undefined,
        });
      }
    } catch {
      // Skip malformed lines
      continue;
    }
  }

  return sessions;
}

export class TmuxBridge implements ITmuxBridge {
  private tmuxPath: string;

  constructor(tmuxPath: string = "tmux") {
    this.tmuxPath = tmuxPath;
  }

  /**
   * Execute a tmux command and return stdout
   */
  private async exec(args: string[]): Promise<string> {
    const cmd = `${this.tmuxPath} ${args.join(" ")}`;
    try {
      const { stdout, stderr } = await execAsync(cmd, {
        timeout: TMUX_TIMEOUT,
        encoding: "utf-8",
      });

      // tmux often writes info to stderr that isn't an error
      if (stderr && !stdout) {
        // Check if it's a real error
        if (
          stderr.includes("no server running") ||
          stderr.includes("error") ||
          stderr.includes("unknown")
        ) {
          throw new Error(stderr.trim());
        }
      }

      return stdout;
    } catch (error: unknown) {
      if (error instanceof Error) {
        // Enhance error message
        if (error.message.includes("no server running")) {
          throw new Error("Tmux server not running. Start a tmux session first.");
        }
        if (error.message.includes("session not found")) {
          throw new Error(`Tmux session not found`);
        }
        throw error;
      }
      throw new Error(`Tmux command failed: ${cmd}`);
    }
  }

  /**
   * Check if tmux is available on the system
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execAsync(`${this.tmuxPath} -V`, { timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all tmux sessions with metadata
   */
  async listSessions(): Promise<TmuxSession[]> {
    try {
      // Use format string for reliable parsing
      const format =
        "#{session_name}|#{session_windows}|#{session_attached}|#{session_created}|#{session_id}|#{window_name}|#{session_width}|#{session_height}";
      const output = await this.exec(["list-sessions", "-F", `"${format}"`]);
      return parseListSessions(output.replace(/"/g, ""));
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message.includes("no server running")
      ) {
        // No sessions is valid state
        return [];
      }
      throw error;
    }
  }

  /**
   * Get a specific session by name
   */
  async getSession(name: string): Promise<TmuxSession | null> {
    const sessions = await this.listSessions();
    return sessions.find((s) => s.name === name) || null;
  }

  /**
   * Capture pane output with ANSI escape codes preserved
   *
   * @param session - Session name
   * @param pane - Pane specifier (default: "0" for first pane)
   */
  async capturePane(session: string, pane: string = "0"): Promise<CaptureResult> {
    // -p: print to stdout
    // -e: preserve ANSI escape sequences (colors)
    // -t: target pane
    const target = `${session}:${pane}`;
    const content = await this.exec(["capture-pane", "-p", "-e", "-t", target]);

    return {
      session,
      pane,
      content,
      timestamp: new Date(),
    };
  }

  /**
   * Send keys to a tmux session
   *
   * @param session - Session name
   * @param keys - Keys to send (tmux key names or literal text)
   * @param pane - Pane specifier (default: "0")
   */
  async sendKeys(session: string, keys: string, pane: string = "0"): Promise<void> {
    const target = `${session}:${pane}`;
    // Use -- to prevent keys starting with - from being treated as options
    await this.exec(["send-keys", "-t", target, "--", keys]);
  }

  /**
   * Get scrollback buffer content
   *
   * @param session - Session name
   * @param lines - Number of lines to retrieve
   * @param pane - Pane specifier (default: "0")
   */
  async getScrollback(
    session: string,
    lines: number,
    pane: string = "0"
  ): Promise<string> {
    const target = `${session}:${pane}`;
    // -p: print to stdout
    // -e: preserve ANSI
    // -S: start line (negative = scrollback)
    const startLine = -Math.abs(lines);
    const content = await this.exec([
      "capture-pane",
      "-p",
      "-e",
      "-S",
      startLine.toString(),
      "-t",
      target,
    ]);
    return content;
  }

  /**
   * Check if a session exists
   */
  async hasSession(name: string): Promise<boolean> {
    try {
      await this.exec(["has-session", "-t", name]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List panes in a session window
   */
  async listPanes(session: string, window: string = "0"): Promise<string[]> {
    const format = "#{pane_index}";
    const target = `${session}:${window}`;
    const output = await this.exec(["list-panes", "-t", target, "-F", format]);
    return output.trim().split("\n").filter(Boolean);
  }
}

/** Singleton instance */
let bridgeInstance: TmuxBridge | null = null;

/**
 * Get the tmux bridge singleton
 */
export function getTmuxBridge(): TmuxBridge {
  if (!bridgeInstance) {
    bridgeInstance = new TmuxBridge();
  }
  return bridgeInstance;
}

/**
 * Create a new tmux bridge instance (for testing)
 */
export function createTmuxBridge(tmuxPath?: string): TmuxBridge {
  return new TmuxBridge(tmuxPath);
}
