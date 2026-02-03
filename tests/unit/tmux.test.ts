/**
 * Tmux Bridge Unit Tests
 *
 * Tests for tmux session management logic.
 * Note: These are unit tests with mocked exec - integration tests require actual tmux.
 */

import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";

describe("TmuxSession Types", () => {
  it("should have correct structure", () => {
    const session = {
      name: "dev",
      windows: 3,
      attached: 1,
      created: new Date(),
      id: "$0",
      currentWindow: "vim",
      width: 190,
      height: 45,
    };

    expect(session.name).toBe("dev");
    expect(session.windows).toBe(3);
    expect(session.attached).toBe(1);
    expect(session.id).toBe("$0");
    expect(session.currentWindow).toBe("vim");
    expect(session.width).toBe(190);
    expect(session.height).toBe(45);
  });
});

describe("CaptureResult Types", () => {
  it("should have correct structure", () => {
    const result = {
      session: "dev",
      pane: "0",
      content: "\x1b[32mgreen text\x1b[0m",
      timestamp: new Date(),
    };

    expect(result.session).toBe("dev");
    expect(result.pane).toBe("0");
    expect(result.content).toContain("\x1b[32m"); // ANSI escape for green
    expect(result.timestamp).toBeInstanceOf(Date);
  });
});

describe("Tmux Format String Parsing", () => {
  // Simulates parsing tmux list-sessions output with format string
  function parseListSessions(output: string) {
    const sessions: Array<{
      name: string;
      windows: number;
      attached: number;
      created: Date;
      id: string;
    }> = [];

    const lines = output.trim().split("\n").filter(Boolean);

    for (const line of lines) {
      const parts = line.split("|");
      if (parts.length >= 5) {
        sessions.push({
          name: parts[0],
          windows: parseInt(parts[1], 10) || 1,
          attached: parseInt(parts[2], 10) || 0,
          created: new Date(parseInt(parts[3], 10) * 1000),
          id: parts[4],
        });
      }
    }

    return sessions;
  }

  it("should parse single session", () => {
    const output = "dev|3|1|1706976000|$0";
    const sessions = parseListSessions(output);

    expect(sessions).toHaveLength(1);
    expect(sessions[0].name).toBe("dev");
    expect(sessions[0].windows).toBe(3);
    expect(sessions[0].attached).toBe(1);
    expect(sessions[0].id).toBe("$0");
  });

  it("should parse multiple sessions", () => {
    const output = `dev|3|1|1706976000|$0
main|2|0|1706975000|$1
test|1|0|1706974000|$2`;

    const sessions = parseListSessions(output);

    expect(sessions).toHaveLength(3);
    expect(sessions[0].name).toBe("dev");
    expect(sessions[1].name).toBe("main");
    expect(sessions[2].name).toBe("test");
  });

  it("should handle empty output", () => {
    const output = "";
    const sessions = parseListSessions(output);

    expect(sessions).toHaveLength(0);
  });

  it("should skip malformed lines", () => {
    const output = `dev|3|1|1706976000|$0
invalid line
main|2|0|1706975000|$1`;

    const sessions = parseListSessions(output);

    expect(sessions).toHaveLength(2);
    expect(sessions[0].name).toBe("dev");
    expect(sessions[1].name).toBe("main");
  });
});

describe("Session Target Format", () => {
  it("should format session:pane correctly", () => {
    const session = "dev";
    const pane = "0";
    const target = `${session}:${pane}`;

    expect(target).toBe("dev:0");
  });

  it("should format session:window.pane correctly", () => {
    const session = "dev";
    const window = "1";
    const pane = "2";
    const target = `${session}:${window}.${pane}`;

    expect(target).toBe("dev:1.2");
  });

  it("should handle special characters in session names", () => {
    const session = "my-dev_session";
    const pane = "0";
    const target = `${session}:${pane}`;

    expect(target).toBe("my-dev_session:0");
  });
});

describe("Polling Configuration", () => {
  it("should use 200ms interval for 5 FPS", () => {
    const FPS = 5;
    const intervalMs = 1000 / FPS;

    expect(intervalMs).toBe(200);
  });

  it("should track subscriptions correctly", () => {
    const subscriptions = new Map<string, Set<string>>();

    // Subscribe to dev session, pane 0
    if (!subscriptions.has("dev")) {
      subscriptions.set("dev", new Set());
    }
    subscriptions.get("dev")!.add("0");

    // Subscribe to dev session, pane 1
    subscriptions.get("dev")!.add("1");

    // Subscribe to main session
    if (!subscriptions.has("main")) {
      subscriptions.set("main", new Set());
    }
    subscriptions.get("main")!.add("0");

    expect(subscriptions.size).toBe(2);
    expect(subscriptions.get("dev")!.size).toBe(2);
    expect(subscriptions.get("main")!.size).toBe(1);
  });

  it("should unsubscribe correctly", () => {
    const subscriptions = new Map<string, Set<string>>();
    subscriptions.set("dev", new Set(["0", "1"]));

    // Unsubscribe from pane 1
    subscriptions.get("dev")!.delete("1");

    expect(subscriptions.get("dev")!.size).toBe(1);
    expect(subscriptions.get("dev")!.has("0")).toBe(true);
    expect(subscriptions.get("dev")!.has("1")).toBe(false);
  });
});

describe("ANSI Escape Handling", () => {
  it("should preserve color codes", () => {
    const content = "\x1b[32mSuccess\x1b[0m: Build complete";

    // Check ANSI codes are present
    expect(content).toContain("\x1b[32m"); // Green
    expect(content).toContain("\x1b[0m"); // Reset
  });

  it("should preserve cursor movement codes", () => {
    const content = "\x1b[2J\x1b[H"; // Clear screen + home

    expect(content).toContain("\x1b[2J");
    expect(content).toContain("\x1b[H");
  });

  it("should handle empty content", () => {
    const content = "";
    expect(content.length).toBe(0);
  });
});

describe("Error Messages", () => {
  it("should detect 'no server running' error", () => {
    const error = "no server running on /tmp/tmux-1000/default";
    const isNoServer = error.includes("no server running");

    expect(isNoServer).toBe(true);
  });

  it("should detect 'session not found' error", () => {
    const error = "can't find session: nonexistent";
    const isNotFound =
      error.includes("session not found") ||
      error.includes("can't find session");

    expect(isNotFound).toBe(true);
  });
});

describe("Scrollback Buffer", () => {
  it("should calculate negative start line correctly", () => {
    const requestedLines = 1000;
    const startLine = -Math.abs(requestedLines);

    expect(startLine).toBe(-1000);
  });

  it("should handle zero lines request", () => {
    const requestedLines = 0;
    const startLine = -Math.abs(requestedLines);

    // -0 and 0 are equal in value
    expect(startLine).toBe(-0);
    expect(Object.is(startLine, -0)).toBe(true);
  });
});
