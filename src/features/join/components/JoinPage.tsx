"use client"

/**
 * /join — the pre-launch registration page.
 *
 * Three states, one route, no navigation between them. The whole page is a
 * single client component holding one piece of state, and intro → form →
 * success is a re-render, not a route change. That is deliberate: this page is
 * opened from a link in an Instagram bio, and every push would put a step
 * between the tap and the signup, hand the browser a back button that lands
 * mid-funnel, and give the network another chance to fail.
 *
 * No PublicShell either — see app/join/page.tsx for why the route sits outside
 * the (public) group.
 */

import { useState } from "react"
import Link from "next/link"
import { Toaster } from "sonner"

import { LOGO_URL } from "@/constants"

import JoinForm from "./JoinForm"
import JoinIntro from "./JoinIntro"
import JoinSuccess from "./JoinSuccess"
import type { SignupResult } from "../types"
import styles from "./JoinPage.module.css"

type Stage =
  | { name: "intro" }
  | { name: "form" }
  | { name: "success"; result: SignupResult }

export default function JoinPage() {
  const [stage, setStage] = useState<Stage>({ name: "intro" })

  return (
    <main className={styles.page}>
      {/*
        Sonner's own <Toaster /> is mounted here rather than assumed. Nothing in
        the app renders one today, so a `toast()` anywhere is currently a no-op
        — scoping one to this route makes the network-failure toast real without
        switching every other feature's silent toasts on at the same time.

        `theme="dark"` because this page is dark whatever the OS says, and the
        toast would otherwise arrive in the visitor's system theme.
      */}
      <Toaster theme="dark" position="top-center" richColors />

      <div className={styles.glow} aria-hidden="true" />

      <div className={styles.shell}>
        <Link href="/" className={styles.logoLockup} aria-label="Goatza home">
          {/* Plain <img>, like LandingPage's lockup: the mark is a fixed 38px
              and carries a CSS filter to flip the black artwork white, neither
              of which next/image adds anything to. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_URL} alt="" aria-hidden="true" className={styles.logoImg} />
          <span className={styles.logoWordmark}>Goatza</span>
        </Link>

        {stage.name === "intro" && (
          <JoinIntro onRegister={() => setStage({ name: "form" })} />
        )}

        {stage.name === "form" && (
          <JoinForm
            onJoined={(result) => setStage({ name: "success", result })}
          />
        )}

        {stage.name === "success" && <JoinSuccess result={stage.result} />}
      </div>
    </main>
  )
}
