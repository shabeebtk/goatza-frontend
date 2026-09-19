// @vitest-environment jsdom

/**
 * The theme store: light unless this device has said otherwise.
 *
 * Each test loads the module fresh, because what matters is what happens on a
 * page load — `persist` reads localStorage the moment the store is created,
 * and that first read is the whole contract: empty storage is light, a stored
 * choice comes back, and garbage is light rather than a crash. A shared
 * singleton would hide all three behind whatever the previous test left in it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import { THEME_STORAGE_KEY } from "./theme.store"

async function loadStore() {
  vi.resetModules()
  return (await import("./theme.store")).useThemeStore
}

const stored = () => {
  const raw = localStorage.getItem(THEME_STORAGE_KEY)
  return raw ? JSON.parse(raw) : null
}

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

describe("theme.store", () => {
  it("defaults to light with empty storage, and says so on <html>", async () => {
    const store = await loadStore()

    expect(store.getState().theme).toBe("light")
    // The OS is not consulted: nothing here reads prefers-color-scheme, so a
    // dark phone still lands on light.
    expect(document.documentElement.dataset.theme).toBe("light")
  })

  it("setTheme and toggleTheme change the value and the attribute", async () => {
    const store = await loadStore()

    store.getState().setTheme("dark")
    expect(store.getState().theme).toBe("dark")
    expect(document.documentElement.dataset.theme).toBe("dark")

    store.getState().toggleTheme()
    expect(store.getState().theme).toBe("light")
    expect(document.documentElement.dataset.theme).toBe("light")

    store.getState().toggleTheme()
    expect(store.getState().theme).toBe("dark")
    expect(document.documentElement.dataset.theme).toBe("dark")
  })

  it("round-trips through storage", async () => {
    const first = await loadStore()
    first.getState().setTheme("dark")

    // The shape the head script in app/layout.tsx parses — key and path are
    // its contract, so a change here has to be a change there too.
    expect(stored()).toMatchObject({ state: { theme: "dark" } })

    // Only the value is persisted, never the actions.
    expect(Object.keys(stored().state)).toEqual(["theme"])

    const second = await loadStore()
    expect(second.getState().theme).toBe("dark")
    expect(document.documentElement.dataset.theme).toBe("dark")
  })

  it("falls back to light when the stored value is not JSON", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "{not json")

    const store = await loadStore()

    expect(store.getState().theme).toBe("light")
    expect(document.documentElement.dataset.theme).toBe("light")
  })

  it("falls back to light when the stored theme is not a theme", async () => {
    localStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ state: { theme: "blue" }, version: 0 })
    )

    const store = await loadStore()

    expect(store.getState().theme).toBe("light")
  })

  it("still reads a valid theme written under another version", async () => {
    // The head script ignores `version` entirely; the store has to agree with
    // it, or a dark user would get a dark first paint and a light app.
    localStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ state: { theme: "dark" }, version: 42 })
    )

    const store = await loadStore()

    expect(store.getState().theme).toBe("dark")
    expect(stored()).toMatchObject({ state: { theme: "dark" } })
  })

  it("setTheme never writes anything but a theme", async () => {
    const store = await loadStore()

    store.getState().setTheme("neon" as never)

    expect(store.getState().theme).toBe("light")
    expect(document.documentElement.dataset.theme).toBe("light")
  })
})
