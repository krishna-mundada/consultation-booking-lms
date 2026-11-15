import { afterAll, afterEach, beforeAll } from "vitest";
import { setupServer } from "msw/node";

/** The origin the app's relative `/api/...` paths resolve to in tests (see setup-dom.ts). */
export const API = "http://localhost";

/**
 * A mock API for one test file. Any request without a handler fails the test, so a screen cannot quietly
 * call something the test did not expect. Handlers are cleared after each test.
 */
export function mockApi() {
  const server = setupServer();
  beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  return server;
}
