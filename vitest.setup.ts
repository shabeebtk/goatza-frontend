/**
 * Per-file setup, run before every test module.
 *
 * It exists for ONE reason: Testing Library's `findBy*` / `waitFor` default to
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

import { configure } from "@testing-library/dom"

configure({ asyncUtilTimeout: 5000 })
