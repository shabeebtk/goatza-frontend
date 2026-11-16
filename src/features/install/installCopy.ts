/**
 * Every sentence the install flow shows, shared by the /install page, its
 * sheets, the feed banner and the landing page. One place, so the page and the
 * banner cannot describe the same tap two different ways, and tests import
 * these rather than retyping them. Gender-neutral, no emoji.
 */

export type BrowserName = "Safari" | "Chrome"

export type Benefit = { icon: string; title: string; text?: string }

export const BENEFITS: readonly Benefit[] = [
  { icon: "mdi:fullscreen", title: "Opens full screen", text: "Like any app, with no browser bars." },
  {
    icon: "mdi:bell-ring-outline",
    title: "Trial alerts and messages",
    text: "Know the moment a club replies.",
  },
  { icon: "mdi:update", title: "Always up to date", text: "Nothing to update, ever." },
]

export const SKELETON_STATUS = "Loading the install steps…"

export const ANDROID_COPY = {
  headlineTop: "GOATZA ON YOUR",
  headlineBottom: "HOME SCREEN",
  lede: "Install the app in one tap. No app store, no big download.",
  cta: "Install Goatza",
  ctaNote: "Free · Chrome adds it in a few seconds",
  dismissed: "No problem. You can install it any time from here.",
} as const

export const ANDROID_MENU_COPY = {
  title: "Install from Chrome's menu",
  intro:
    "Chrome sometimes waits a little before it offers the one-tap install. The menu works right now.",
  steps: [
    "Tap the menu next to the address bar",
    "Tap \"Add to home screen\" or \"Install app\"",
    "Choose Install, then tap Install",
  ],
  otherBrowsers: "Using Samsung Internet, Edge or Firefox? It's in their menu too.",
  /** A link opened from WhatsApp or Gmail lands in a Chrome tab inside that app. */
  inAppTab: "Don't see Install? Tap ⋮ → Open in Chrome first, then try again.",
  gotIt: "Got it",
} as const

export const INSTALLED_COPY = {
  headlineTop: "GOATZA IS",
  headlineBottom: "INSTALLED",
  text: "Open it from your home screen for the full-screen app. You can close this tab.",
  tip: "The first time you open it, allow notifications so you never miss a trial or a message.",
  keepUsing: "Keep using the website",
} as const

/** What a step's illustration shows: the thing to tap. */
export type IosStepArt = "more" | "share" | "addToHome" | "webApp" | "add" | "chromeShare"

export type IosStep = { art: IosStepArt; title: string; help: string }

const ADD_TO_HOME_HELP = "Scroll down the list if you don't see it straight away."
const LANDS_HELP = "Goatza lands on your Home Screen. Open it from there."

/** iOS 26 and later: Share moved behind ••• beside the address bar. */
export const IOS_SAFARI_MODERN_STEPS: readonly IosStep[] = [
  {
    art: "more",
    title: "Tap ••• in Safari",
    help: "It sits beside the address bar at the bottom of the screen.",
  },
  { art: "addToHome", title: "Tap Share, then \"Add to Home Screen\"", help: ADD_TO_HOME_HELP },
  { art: "webApp", title: "Keep \"Open as Web App\" on, tap Add", help: LANDS_HELP },
]

/** iOS 18 and older: the Share button in the bottom bar. */
export const IOS_SAFARI_CLASSIC_STEPS: readonly IosStep[] = [
  {
    art: "share",
    title: "Tap the Share button",
    help: "The square with an arrow, in Safari's bar at the bottom.",
  },
  // Share is already open after step 1 here, unlike behind iOS 26's •••.
  { art: "addToHome", title: "Tap \"Add to Home Screen\"", help: ADD_TO_HOME_HELP },
  { art: "add", title: "Tap Add", help: LANDS_HELP },
]

/** Chrome on iPhone: the share icon lives in the address bar at the top. */
export const IOS_CHROME_STEPS: readonly IosStep[] = [
  {
    art: "chromeShare",
    title: "Tap the share icon in the address bar",
    help: "It's at the top of the screen, at the end of the address.",
  },
  { art: "addToHome", title: "Tap \"Add to Home Screen\"", help: ADD_TO_HOME_HELP },
  { art: "add", title: "Tap Add", help: LANDS_HELP },
]

export const IOS_COPY = {
  headlineTop: "ADD GOATZA TO YOUR",
  headlineBottom: "HOME SCREEN",
  lede: (browser: BrowserName) =>
    `Three taps in ${browser}. On iPhone, trial and message notifications only work from the Home Screen app.`,
  stepOf: (step: number, total: number) => `Step ${step} of ${total}`,
  back: "Back",
  next: "Next",
  done: "Done",
  doneNote: "That's it. Open Goatza from your Home Screen.",
  olderIphone: "Older iPhone? Tap the Share button (square with an arrow) instead of •••.",
  arrowModern: "Tap •••",
  arrowClassic: "Tap Share",
} as const

export const IN_APP_COPY = {
  headlineTop: (browser: BrowserName) => `OPEN IN ${browser.toUpperCase()}`,
  headlineBottom: "TO INSTALL",
  inside: (appName: string | null, browser: BrowserName) =>
    `You're inside ${appName ? `${appName}'s` : "this app's"} browser. Apps can only be added to your home screen from ${browser}.`,
  /** iPhone Firefox, Edge, Opera and the like: a real browser, the wrong one. */
  otherBrowser: (browser: BrowserName) =>
    `Apps can only be added to your home screen from ${browser}.`,
  openInChrome: "Open in Chrome",
  thenTapInstall: "Then tap Install on the page that opens.",
  iosSteps: ["Tap ••• at the top right", "Choose Open in external browser (or Open in Safari)"],
  copyPrompt: (browser: BrowserName) => `Or copy the link and paste it into ${browser}:`,
  copyLink: "Copy link",
  copied: "Link copied",
  copyFailed: "Couldn't copy automatically",
  linkLabel: "Install page link",
} as const

export const DESKTOP_COPY = {
  headlineTop: "GOATZA IS MADE",
  headlineBottom: "FOR YOUR PHONE",
  lede: "Scan the code with your phone's camera. It opens the install page with the right steps for your phone.",
  qrTitle: "Scan to install",
  qrSub: (display: string) => `Or open ${display} on your phone.`,
  qrLabel: "QR code for the install page",
  computerTitle: "Want it on this computer too?",
  computerText: "Chrome and Edge can install Goatza as a desktop app.",
  computerCta: "Install on this computer",
  macSafari: "On a Mac with Safari: File → Add to Dock.",
} as const

export const BANNER_COPY = {
  androidTitle: "Get the Goatza app",
  androidText: "Full screen, faster, with trial alerts.",
  androidCta: "Install",
  installed: "Installed. Open Goatza from your home screen.",
  iosTitle: "Add Goatza to your Home Screen",
  iosText: "On iPhone, trial and message notifications only work from the app.",
  iosCta: "Show me how",
  iosCtaNote: "3 taps",
  notNow: "Not now",
} as const

export const IOS_SHEET_COPY = {
  title: "Add to Home Screen",
  gotIt: "Got it",
  fullGuide: "Full guide",
  belowHint: "Safari's ••• is just below ↓",
} as const

export const LANDING_COPY = {
  headerPill: "Get app",
  heroNeutral: "Get the app",
  heroAndroid: "Install the app",
  heroIos: "Add to Home Screen",
  installedToast: "Goatza is installed",
  sectionLabel: "The app",
  headlineTop: "GOATZA IN",
  headlineBottomPlain: "YOUR",
  headlineBottomAccent: "POCKET",
  lede: "Put Goatza on your home screen. It opens like any app, and no app store is needed.",
  benefits: [
    { icon: "mdi:fullscreen", title: "Full screen, no browser bars" },
    { icon: "mdi:bell-ring-outline", title: "Alerts for trials, messages and squad invites" },
    { icon: "mdi:update", title: "Always the latest version" },
  ] as readonly Benefit[],
  ctaAndroid: "Install Goatza",
  ctaIos: "Show me how",
  noteAndroid: "Free · one tap in Chrome",
  noteIos: (browser: BrowserName) => `Free · three taps in ${browser}`,
  qrTitle: "Scan with your phone",
  qrSub: (display: string) => `It opens ${display} with the steps for your phone.`,
  qrLabel: "QR code for the install page",
  computerLink: "Or install it on this computer →",
} as const

export const SETTINGS_INSTALL_LABEL = "Install the app"
