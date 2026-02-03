/**
 * Server Smoke Tests
 *
 * CMP-ev4.1: Verify basic server functionality
 */

import { describe, it, expect } from "bun:test";

describe("Server", () => {
  it("should start and respond to health check", async () => {
    // Import the server
    const server = await import("../../src/server/index");

    // Make a health check request
    const response = await server.default.fetch(
      new Request("http://localhost/health")
    );

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.status).toBe("ok");
    expect(data.version).toBe("0.1.0");
    expect(data.timestamp).toBeDefined();
  });

  it("should return API info at /api", async () => {
    const server = await import("../../src/server/index");

    const response = await server.default.fetch(
      new Request("http://localhost/api")
    );

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.message).toBe("CHROTE Multiplayer API");
  });
});
