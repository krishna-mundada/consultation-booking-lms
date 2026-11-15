import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { navigation, navigationModule } from "./navigation";

// The screens read their list state from the URL (ADR 0007, A22); this gives them one that works in jsdom.
vi.mock("next/navigation", () => navigationModule);
afterEach(() => navigation.reset());

// jsdom has no layout engine: these tests prove behaviour and accessibility, not appearance.
// Viewport and CSS concerns are checked in a real browser (Playwright + responsive check).
afterEach(() => {
  cleanup();
});

// Browser APIs Radix UI primitives use that jsdom does not implement.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

// Node's fetch rejects relative URLs, but the app uses relative paths (`/api/...`) like a
// browser does. Resolve them against the origin the MSW handlers are written for. This wraps
// whatever fetch is installed at the start of each test, so it sits on top of MSW's
// interceptor (which is installed later, in a test file's beforeAll) and not underneath it.
export const TEST_ORIGIN = "http://localhost";

let restoreFetch: (() => void) | undefined;

beforeEach(() => {
  const underlying = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    underlying(typeof input === "string" && input.startsWith("/") ? `${TEST_ORIGIN}${input}` : input, init)) as typeof fetch;
  restoreFetch = () => {
    globalThis.fetch = underlying;
  };
});

afterEach(() => {
  restoreFetch?.();
});
