"use client";
/**
 * GOATZA — Landing Page (v2)
 */
import { useState, useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { Button, Input, Select, Badge, Divider } from "@/shared/components/ui";
import styles from "./LandingPage.module.css";
import { LOGO_URL } from "@/constants";
import AuthCard from "@/features/auth/components/AuthCard/AuthCard";
import useTilt from "@/shared/hooks/useTilt";
import useScrollReveal from "@/shared/hooks/useScrollReveal";
import useCounter from "@/shared/hooks/useCounter";
import { tickerItems, features, steps, audiences } from "@/features/landing/data/landing.data";
import Link from "next/link"

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
            <Button variant="ghost" size="sm" href="/auth">
              Sign In
            </Button>
            <Button variant="primary" size="sm" href="/auth?mode=signup">
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
                href="/auth?mode=signup"
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
                  href="/auth?mode=signup"
                >
                  Create Free Account
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  href="/auth"
                  style={{ borderColor: "rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.7)" }}
                >
                  Sign In
                </Button>
              </div>
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