"use client";

/**
 * GOATZA — Landing Page (v2)
 * Real product entry: Sign in / Sign up inline in hero.
 * No waitlist. Users go directly into the product.
 *
 * Imports shared UI from: @/shared/components/ui
 */

import { useState, useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { Button, Input, Select, Badge, Divider } from "@/shared/components/ui";
import styles from "./style.module.css";
import { LOGO_URL } from "@/constants";

// ── Hook: scroll reveal ──────────────────────────────────────────
function useScrollReveal() {
  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const elements = document.querySelectorAll<HTMLElement>(
      ".reveal, .reveal-left, .reveal-right, .reveal-scale"
    );
    if (prefersReduced) {
      elements.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

// ── Hook: 3D card tilt ───────────────────────────────────────────
function useTilt(ref: React.RefObject<HTMLElement | null>, intensity = 8) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia("(hover: hover)").matches) return;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const dx = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
      const dy = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);
      el.style.setProperty("--tilt-y", `${dx * intensity}deg`);
      el.style.setProperty("--tilt-x", `${-dy * intensity}deg`);
    };
    const onLeave = () => {
      el.style.setProperty("--tilt-x", "0deg");
      el.style.setProperty("--tilt-y", "0deg");
    };
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [ref, intensity]);
}

// ── Hook: animated counter ───────────────────────────────────────
function useCounter(target: number, duration = 1200, active: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCount(target);
      return;
    }
    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setCount(Math.floor((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) requestAnimationFrame(step);
      else setCount(target);
    };
    requestAnimationFrame(step);
  }, [active, target, duration]);
  return count;
}

// ── TiltCard ─────────────────────────────────────────────────────
function TiltCard({
  className,
  children,
  intensity = 7,
}: {
  className: string;
  children: React.ReactNode;
  intensity?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useTilt(ref, intensity);
  return <div ref={ref} className={className}>{children}</div>;
}

// ── LogoLockup ───────────────────────────────────────────────────
function LogoLockup({ footer = false }: { footer?: boolean }) {
  if (footer) {
    return (
      <a href="/" aria-label="Goatza home" className={styles.footerLogoLockup}>
        <div className={styles.footerLogoImgWrap}>
          <img src={LOGO_URL} alt="" aria-hidden="true" className={styles.footerLogoImg} />
        </div>
        <span className={styles.footerWordmark}>Goatza</span>
      </a>
    );
  }
  return (
    <a href="/" aria-label="Goatza home" className={styles.logoLockup}>
      <div className={styles.logoImgWrap}>
        <img src={LOGO_URL} alt="" aria-hidden="true" className={styles.logoImg} />
      </div>
      <span className={styles.logoWordmark}>Goatza</span>
    </a>
  );
}

// ── AuthCard — sign in / sign up in the hero ────────────────────
type AuthMode = "signin" | "signup";

function AuthCard() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // TODO: replace with real auth call (e.g. NextAuth signIn / Supabase)
    setTimeout(() => {
      setLoading(false);
      // router.push("/dashboard")
    }, 1500);
  };

  const isSignUp = mode === "signup";

  return (
    <div className={styles.heroAuthCard}>
      <p className={styles.authCardTitle}>
        {isSignUp ? "Join the Game" : "Welcome Back"}
      </p>
      <p className={styles.authCardSubtitle}>
        {isSignUp
          ? "Create your free account and get discovered."
          : "Sign in to your Goatza account."}
      </p>

      {/* Tab switcher */}
      <div className={styles.authTabs} role="tablist">
        <button
          role="tab"
          aria-selected={!isSignUp}
          className={`${styles.authTab} ${!isSignUp ? styles.authTabActive : ""}`}
          onClick={() => setMode("signin")}
        >
          Sign In
        </button>
        <button
          role="tab"
          aria-selected={isSignUp}
          className={`${styles.authTab} ${isSignUp ? styles.authTabActive : ""}`}
          onClick={() => setMode("signup")}
        >
          Sign Up
        </button>
      </div>

      {/* Social auth */}
      <div className={styles.authSocialRow}>
        <button className={styles.authSocialBtn} type="button" aria-label="Continue with Google">
          <Icon icon="mdi:google" width={18} height={18} aria-hidden="true" />
          Google
        </button>
        <button className={styles.authSocialBtn} type="button" aria-label="Continue with Apple">
          <Icon icon="mdi:apple" width={18} height={18} aria-hidden="true" />
          Apple
        </button>
      </div>

      <Divider label="or" style={{ marginBlock: "var(--space-4)" } as React.CSSProperties} />

      {/* Form */}
      <form onSubmit={handleSubmit} className={styles.authForm} noValidate>
        {isSignUp && (
          <div className={styles.authFormRow}>
            <Input
              label="First name"
              placeholder="Virat"
              required
              autoComplete="given-name"
              leftIcon={<Icon icon="mdi:account-outline" width={18} height={18} />}
            />
            <Input
              label="Last name"
              placeholder="Kohli"
              required
              autoComplete="family-name"
            />
          </div>
        )}

        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          required
          autoComplete="email"
          leftIcon={<Icon icon="mdi:email-outline" width={18} height={18} />}
        />

        <Input
          label="Password"
          type="password"
          placeholder={isSignUp ? "Create a strong password" : "Your password"}
          required
          autoComplete={isSignUp ? "new-password" : "current-password"}
          leftIcon={<Icon icon="mdi:lock-outline" width={18} height={18} />}
        />

        {isSignUp && (
          <Select
            label="I am a…"
            placeholder="Select your role"
            required
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={[
              { value: "athlete", label: "Athlete" },
              { value: "team",    label: "Team / Club" },
              { value: "scout",   label: "Scout" },
              { value: "academy", label: "Academy" },
              { value: "coach",   label: "Coach" },
            ]}
          />
        )}

        {!isSignUp && (
          <div style={{ textAlign: "right", marginTop: "calc(-1 * var(--space-2))" }}>
            <a href="/auth/forgot-password" className={styles.authFooterLink} style={{ fontSize: "var(--text-xs)" }}>
              Forgot password?
            </a>
          </div>
        )}

        <Button
          variant="brand"
          size="lg"
          fullWidth
          loading={loading}
          type="submit"
          style={{ marginTop: "var(--space-2)" } as React.CSSProperties}
        >
          {isSignUp ? "Create Free Account →" : "Sign In →"}
        </Button>
      </form>

      <p className={styles.authFooterText} style={{ marginTop: "var(--space-4)" }}>
        {isSignUp ? (
          <>Already have an account?{" "}
            <button className={styles.authFooterLink} onClick={() => setMode("signin")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}>
              Sign in
            </button>
          </>
        ) : (
          <>Don't have an account?{" "}
            <button className={styles.authFooterLink} onClick={() => setMode("signup")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}>
              Sign up free
            </button>
          </>
        )}
      </p>
    </div>
  );
}

// ── LandingPage ──────────────────────────────────────────────────
export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [statsVisible, setStatsVisible] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);

  useScrollReveal();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setStatsVisible(true); obs.disconnect(); } },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const count1 = useCounter(2800, 1000, statsVisible);
  const count2 = useCounter(140,  800,  statsVisible);
  const count3 = useCounter(38,   700,  statsVisible);

  // ── Static data ────────────────────────────────────────────────

  const tickerItems = [
    "Athletes", "Cricket", "Teams", "Football", "Scouts",
    "Badminton", "Academies", "Talent", "Discovery", "Recruitment", "Goatza",
    "Athletes", "Cricket", "Teams", "Football", "Scouts",
    "Badminton", "Academies", "Talent", "Discovery", "Recruitment", "Goatza",
  ];

  const features = [
    { icon: "mdi:account-star-outline", title: "Athlete Profiles",   body: "Showcase skills, stats, highlight reels, and career milestones — your complete sports identity." },
    { icon: "mdi:radar",                title: "Smart Discovery",    body: "Scouts filter by sport, position, age, and region — then connect directly in seconds." },
    { icon: "mdi:school-outline",       title: "Academy Tools",      body: "List programmes, post intake drives, and manage your entire player pipeline in one place." },
    { icon: "mdi:message-text-outline", title: "Direct Messaging",   body: "No middlemen. Athletes and recruiters negotiate and build relationships right on the platform." },
  ];

  const steps = [
    { num: "01", title: "Build Your Profile",  body: "Create your sports identity — add highlights, stats, position, and achievements." },
    { num: "02", title: "Get Discovered",      body: "Scouts and clubs actively search Goatza for talent. Your profile works 24/7 for you." },
    { num: "03", title: "Connect & Grow",      body: "Message, negotiate, and build lasting relationships — all in one platform." },
  ];

  const audiences = [
    {
      icon: "mdi:run-fast",
      title: "Athletes",
      benefits: [
        "Build a verified sports profile",
        "Get discovered by scouts & teams",
        "Showcase your highlight reel",
        "Access opportunities globally",
      ],
    },
    {
      icon: "mdi:shield-crown-outline",
      title: "Teams & Clubs",
      benefits: [
        "Find verified talent instantly",
        "Filter by position, stats & location",
        "Post open trials and recruitment calls",
        "Cut recruitment time and cost",
      ],
    },
    {
      icon: "mdi:school-outline",
      title: "Academies",
      benefits: [
        "List programmes and intake dates",
        "Connect with athletes at every level",
        "Build your academy's reputation",
        "Streamline your scouting process",
      ],
    },
  ];

  return (
    <>
      {/* ── HEADER ─────────────────────────────────────────────── */}
      <header className={`${styles.header} ${scrolled ? styles.headerScrolled : ""}`}>
        <div className={`container ${styles.headerContent}`}>
          <LogoLockup />

          <nav className={styles.headerNav} aria-label="Main navigation">
            <a href="#features"  className={styles.headerNavLink}>Features</a>
            <a href="#how"       className={styles.headerNavLink}>How It Works</a>
            <a href="#for-who"   className={styles.headerNavLink}>For Who</a>
          </nav>

          <div className={styles.headerActions}>
            <Button variant="ghost" size="sm" as="a" href="#signin">
              Sign In
            </Button>
            <Button variant="primary" size="sm" as="a" href="#signup">
              Get Started
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* ── HERO ─────────────────────────────────────────────── */}
        <section className={styles.hero} aria-label="Hero">
          <div className={styles.heroBg} aria-hidden="true" />
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={`${styles.heroFloat} ${styles.heroFloatA}`} aria-hidden="true" />
          <div className={`${styles.heroFloat} ${styles.heroFloatB}`} aria-hidden="true" />

          <div className={`${styles.sportsBgIcon} ${styles.sportsBgSoccer}`} aria-hidden="true">
            <Icon icon="mdi:soccer" width={160} height={160} />
          </div>
          <div className={`${styles.sportsBgIcon} ${styles.sportsBgCricket}`} aria-hidden="true">
            <Icon icon="mdi:cricket" width={110} height={110} />
          </div>

          {/* Left: copy */}
          <div className={`container ${styles.heroCopy}`}>
            <Badge variant="brand" dot>Now Live · Join Today</Badge>

            <h1 className={styles.heroHeadline}>
              Where the{" "}
              <span className={styles.heroHeadlineAccent}>Greatest</span>
              <br />
              Get Discovered
            </h1>

            <p className={styles.heroSub}>
              The sports network built for discovery. Showcase your talent and
              connect with scouts, teams &amp; academies — all in one platform.
            </p>

            <div className={styles.heroActions}>
              <Button
                variant="brand"
                size="lg"
                rightIcon={<Icon icon="mdi:arrow-right" width={18} height={18} />}
                as="a"
                href="#signup"
              >
                Start for Free
              </Button>
              <Button
                variant="outline"
                size="lg"
                leftIcon={<Icon icon="mdi:play-circle-outline" width={18} height={18} />}
                as="a"
                href="#how"
              >
                See How It Works
              </Button>
            </div>

            {/* Stats */}
            <div ref={statsRef} className={styles.heroStats} role="list" aria-label="Platform stats">
              <div className={styles.heroStat} role="listitem">
                <div className={styles.heroStatNum}>{count1.toLocaleString()}+</div>
                <div className={styles.heroStatLabel}>Athletes</div>
              </div>
              <div className={styles.heroStatDivider} aria-hidden="true" />
              <div className={styles.heroStat} role="listitem">
                <div className={styles.heroStatNum}>{count2}+</div>
                <div className={styles.heroStatLabel}>Clubs &amp; Academies</div>
              </div>
              <div className={styles.heroStatDivider} aria-hidden="true" />
              <div className={styles.heroStat} role="listitem">
                <div className={styles.heroStatNum}>{count3}</div>
                <div className={styles.heroStatLabel}>Sports</div>
              </div>
            </div>
          </div>

          {/* Right: auth card */}
          <div className="container" style={{ display: "flex", justifyContent: "center", position: "relative", zIndex: 2 }}>
            <AuthCard />
          </div>
        </section>

        {/* ── TICKER ───────────────────────────────────────────── */}
        <div className={styles.ticker} aria-hidden="true">
          <div className={styles.tickerTrack}>
            {tickerItems.map((item, i) => (
              <span key={i} className={styles.tickerItem}>
                {item}<span className={styles.tickerSep}>✦</span>
              </span>
            ))}
          </div>
        </div>

        {/* ── FEATURES ─────────────────────────────────────────── */}
        <section
          id="features"
          className={`${styles.section} ${styles.featuresSection}`}
          aria-labelledby="features-title"
        >
          <div className="container">
            <div className="reveal">
              <div className={styles.sectionLabel}>
                <span className={styles.sectionLabelLine} />
                Platform Features
              </div>
              <h2 id="features-title" className={styles.sectionTitle}>
                Everything you need
                <br />
                to level up
              </h2>
            </div>

            <div className={`${styles.featuresGrid} stagger-children`}>
              {features.map((f, i) => (
                <TiltCard key={i} className={`${styles.featureCard} reveal`} intensity={6}>
                  <span className={styles.featureIcon} aria-hidden="true">
                    <Icon icon={f.icon} width={26} height={26} />
                  </span>
                  <h3 className={styles.featureTitle}>{f.title}</h3>
                  <p className={styles.featureBody}>{f.body}</p>
                </TiltCard>
              ))}
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ─────────────────────────────────────── */}
        <section
          id="how"
          className={`${styles.section} ${styles.howItWorks}`}
          aria-labelledby="how-title"
        >
          <div className="container">
            <div className={`${styles.stepsHeader} reveal`}>
              <div className={styles.sectionLabel} style={{ justifyContent: "center" }}>
                <span className={styles.sectionLabelLine} />
                How It Works
              </div>
              <h2 id="how-title" className={styles.sectionTitle}>
                Three steps to your
                <br />
                breakthrough
              </h2>
            </div>

            <div className={`${styles.stepsGrid} stagger-children`}>
              {steps.map((s, i) => (
                <div key={i} className={`${styles.stepCard} reveal`}>
                  <div className={styles.stepNumber} aria-hidden="true">{s.num}</div>
                  <div className={styles.stepContent}>
                    <h3 className={styles.stepTitle}>{s.title}</h3>
                    <p className={styles.stepBody}>{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── WHO IT'S FOR ─────────────────────────────────────── */}
        <section
          id="for-who"
          className={`${styles.section} ${styles.audienceSection}`}
          aria-labelledby="audience-title"
        >
          <div className="container">
            <div className="reveal">
              <div className={styles.sectionLabel}>
                <span className={styles.sectionLabelLine} />
                Who It's For
              </div>
              <h2 id="audience-title" className={styles.sectionTitle}>
                Built for everyone
                <br />
                in the game
              </h2>
            </div>

            <div className={`${styles.audienceGrid} stagger-children`}>
              {audiences.map((a, i) => (
                <TiltCard key={i} className={`${styles.audienceCard} reveal`} intensity={5}>
                  <span className={styles.audienceIcon} aria-hidden="true">
                    <Icon icon={a.icon} width={36} height={36} />
                  </span>
                  <h3 className={styles.audienceTitle}>{a.title}</h3>
                  <ul className={styles.audienceBenefits} aria-label={`${a.title} benefits`}>
                    {a.benefits.map((b, j) => (
                      <li key={j} className={styles.audienceBenefit}>{b}</li>
                    ))}
                  </ul>
                </TiltCard>
              ))}
            </div>
          </div>
        </section>

        {/* ── FINAL CTA ─────────────────────────────────────────── */}
        <section
          className={styles.ctaSection}
          aria-labelledby="cta-title"
        >
          <div className={styles.ctaBg} aria-hidden="true" />
          <div className={styles.ctaGlow} aria-hidden="true" />
          <div className={`${styles.ctaFloat} ${styles.ctaFloatA}`} aria-hidden="true" />
          <div className={`${styles.ctaFloat} ${styles.ctaFloatB}`} aria-hidden="true" />

          <div className="container-tight" style={{ position: "relative", zIndex: 1 }}>
            <div className="reveal" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div className={styles.ctaBadge}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-brand)", animation: "pulse-brand 2s infinite", flexShrink: 0 }} aria-hidden="true" />
                First 10,000 users get free premium access
              </div>

              <h2 id="cta-title" className={styles.ctaTitle}>
                Your moment
                <br />
                starts <span>now</span>
              </h2>

              <p className={styles.ctaBody}>
                Join thousands of athletes, coaches, and scouts already building
                their future on Goatza.
              </p>

              <div className={styles.ctaActions}>
                <Button
                  variant="brand"
                  size="lg"
                  rightIcon={<Icon icon="mdi:arrow-right" width={18} height={18} />}
                  as="a"
                  href="#signup"
                >
                  Create Free Account
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  as="a"
                  href="#signin"
                  style={{ borderColor: "rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.7)" } as React.CSSProperties}
                >
                  Sign In
                </Button>
              </div>

              <p className={styles.ctaNote}>
                Free forever · No credit card required · Cancel anytime
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* ── FOOTER ───────────────────────────────────────────────── */}
      <footer className={styles.footer}>
        <div className={`container ${styles.footerInner}`}>
          <LogoLockup footer />

          <nav className={styles.footerLinks} aria-label="Footer navigation">
            <a href="/privacy" className={styles.footerLink}>Privacy</a>
            <a href="/terms"   className={styles.footerLink}>Terms</a>
            <a href="/contact" className={styles.footerLink}>Contact</a>
          </nav>

          <p className={styles.footerCopy}>
            © {new Date().getFullYear()} Goatza. All rights reserved.
          </p>
        </div>
      </footer>
    </>
  );
}