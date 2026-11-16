import { describe, expect, it } from "vitest"

import { detectPlatform, isStandalone, type PlatformInfo } from "./platform"
import { UA } from "./testing/userAgents"

const TOUCH_IPAD = { maxTouchPoints: 5 }
const NO_TOUCH = { maxTouchPoints: 0 }

const cases: Array<[string, string, { maxTouchPoints: number } | undefined, PlatformInfo]> = [
  ["Android Chrome", UA.androidChrome, undefined, { os: "android", browser: "chrome", inApp: null, safariMajor: null }],
  ["Samsung Internet", UA.samsung, undefined, { os: "android", browser: "samsung", inApp: null, safariMajor: null }],
  ["Firefox for Android", UA.androidFirefox, undefined, { os: "android", browser: "firefox", inApp: null, safariMajor: null }],
  ["Edge for Android", UA.androidEdge, undefined, { os: "android", browser: "edge", inApp: null, safariMajor: null }],
  ["iPhone Safari 26", UA.iphoneSafari26, undefined, { os: "ios", browser: "safari", inApp: null, safariMajor: 26 }],
  ["iPhone Safari 18", UA.iphoneSafari18, undefined, { os: "ios", browser: "safari", inApp: null, safariMajor: 18 }],
  ["iPadOS (a Mac UA with touch)", UA.ipadOs, TOUCH_IPAD, { os: "ios", browser: "safari", inApp: null, safariMajor: 18 }],
  ["Chrome on iPhone", UA.iphoneChrome, undefined, { os: "ios", browser: "chrome", inApp: null, safariMajor: null }],
  ["Firefox on iPhone", UA.iphoneFirefox, undefined, { os: "ios", browser: "firefox", inApp: null, safariMajor: null }],
  ["Instagram on iPhone", UA.instagramIphone, undefined, { os: "ios", browser: "other", inApp: { name: "Instagram" }, safariMajor: null }],
  ["Instagram on Android", UA.instagramAndroid, undefined, { os: "android", browser: "chrome", inApp: { name: "Instagram" }, safariMajor: null }],
  ["Facebook on iPhone", UA.facebookIphone, undefined, { os: "ios", browser: "other", inApp: { name: "Facebook" }, safariMajor: null }],
  ["an Android WebView", UA.androidWebView, undefined, { os: "android", browser: "chrome", inApp: { name: null }, safariMajor: null }],
  ["desktop Chrome", UA.desktopChrome, NO_TOUCH, { os: "desktop", browser: "chrome", inApp: null, safariMajor: null }],
  ["desktop Edge", UA.desktopEdge, NO_TOUCH, { os: "desktop", browser: "edge", inApp: null, safariMajor: null }],
  ["Mac Safari", UA.macSafari, NO_TOUCH, { os: "desktop", browser: "safari", inApp: null, safariMajor: null }],
  ["desktop Firefox", UA.desktopFirefox, NO_TOUCH, { os: "desktop", browser: "firefox", inApp: null, safariMajor: null }],
]

describe("detectPlatform", () => {
  it.each(cases)("%s", (_label, ua, nav, expected) => {
    expect(detectPlatform(ua, nav)).toEqual(expected)
  })

  it("names the other in-app browsers", () => {
    const named = (token: string) =>
      detectPlatform(`Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile/15E148 ${token}`).inApp
    expect(named("LinkedInApp")).toEqual({ name: "LinkedIn" })
    expect(named("Snapchat/12.90")).toEqual({ name: "Snapchat" })
    expect(named("Twitter for iPhone")).toEqual({ name: "X" })
    expect(named("musical_ly_33.0 BytedanceWebview/d8a21c6")).toEqual({ name: "TikTok" })
    expect(named("Line/14.5.0")).toEqual({ name: "LINE" })
  })

  it("does not read the frozen iPhone OS version", () => {
    // Same "iPhone OS 18_6", different Safari: only Version/ decides.
    const old = UA.iphoneSafari26.replace("Version/26.0", "Version/18.6")
    expect(detectPlatform(old).safariMajor).toBe(18)
    expect(detectPlatform(UA.iphoneSafari26).safariMajor).toBe(26)
  })

  it("treats an empty user agent as other", () => {
    expect(detectPlatform("")).toEqual({ os: "other", browser: "other", inApp: null, safariMajor: null })
  })
})

describe("isStandalone", () => {
  it("is false on the server", () => {
    expect(isStandalone()).toBe(false)
  })
})
