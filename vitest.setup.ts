/**
 * Per-file setup, run before every test module. Two things live here.
 *
 * SENTRY IS STUBBED FOR EVERY FILE. The real `@sentry/nextjs` cannot be
 * imported under vitest at all: Node resolution picks its server entry, which
 * loads bundler plugins that throw "The URL must be of scheme file" at module
 * load. The upload pipeline reports its failures to Sentry
 * (shared/services/uploadTelemetry.ts) and sits under every composer, so
 * without this a test of anything that can upload a photo fails before its
 * first assertion. A test that checks what was reported mocks it again
 * itself (see mediaUpload.test.ts).
 *
 * THE ASYNC TIMEOUT. Testing Library's `findBy*` / `waitFor` default to
 * a 1000ms wait, and that is not a timeout the suite can honestly meet. The
 * component files run under jsdom alongside the Satori render suites, which
 * saturate the CPU (see the `testTimeout` note in vitest.config.mts) — so a
 * dropdown that appears instantly on an idle machine can miss a one-second
 * window purely because of what else vitest happens to be running in parallel.
 * The symptom is a component test failing with "unable to find an element",
 * which reads as a broken component and is not one.
 *
 * Same reasoning as the 30s `testTimeout`: generous rather than tuned. A real
 * "this element never renders" bug still fails, it just takes five seconds to
 * say so.
 */

import { vi } from "vitest"
import { configure } from "@testing-library/dom"

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

configure({ asyncUtilTimeout: 5000 })
