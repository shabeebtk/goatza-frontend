"use client";
/**
 * GOATZA — Landing Page (v3)
 * No auth card in hero. Sports showcase section added.
 */
import { useState, useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { Button, Badge } from "@/shared/components/ui";
import styles from "./LandingPage.module.css";
import { LOGO_URL } from "@/constants";
import useTilt from "@/shared/hooks/useTilt";
import useScrollReveal from "@/shared/hooks/useScrollReveal";
import useCounter from "@/shared/hooks/useCounter";
import { tickerItems, features, steps, audiences } from "@/features/landing/data/landing.data";

// ── Static data ───────────────────────────────────────────────────

const sports = [
  { icon: "mdi:soccer",         label: "Football",     featured: true  },
  { icon: "mdi:cricket",        label: "Cricket",      featured: true  },
  { icon: "mdi:badminton",      label: "Badminton",    featured: true  },
  { icon: "mdi:basketball",     label: "Basketball",   featured: false },
  { icon: "mdi:tennis",         label: "Tennis",       featured: false },
  { icon: "mdi:swim",           label: "Swimming",     featured: false },
  { icon: "mdi:run-fast",       label: "Athletics",    featured: false },
  { icon: "mdi:table-tennis",   label: "Table Tennis", featured: false },
  { icon: "mdi:volleyball",     label: "Volleyball",   featured: false },
  { icon: "mdi:kabaddi",        label: "Kabaddi",      featured: false },
  { icon: "mdi:hockey-sticks",  label: "Hockey",       featured: false },
  { icon: "mdi:boxing-glove",   label: "Boxing",       featured: false },
  { icon: "mdi:weight-lifter",  label: "Weightlifting",featured: false },
  { icon: "mdi:karate",         label: "Martial Arts", featured: false },
  { icon: "mdi:cycling",        label: "Cycling",      featured: false },
  { icon: "mdi:archery",        label: "Archery",      featured: false },
];

// Decorative bg icons scattered in the hero
const heroBgSports = [
  { icon: "mdi:soccer",    size: 180, top: "8%",  right: "3%",  opacity: 0.055, rotate: -18, anim: "floatA", delay: "0s"    },
  { icon: "mdi:cricket",   size: 130, bottom: "12%", left: "2%", opacity: 0.045, rotate: 14,  anim: "floatB", delay: "1.5s"  },
  { icon: "mdi:badminton", size: 100, top: "52%", right: "14%", opacity: 0.04,  rotate: -8,  anim: "floatA", delay: "2s"    },
  { icon: "mdi:basketball",size: 80,  top: "20%", left: "7%",   opacity: 0.035, rotate: 22,  anim: "floatB", delay: "0.8s"  },
  { icon: "mdi:tennis",    size: 65,  bottom: "28%", right: "6%",opacity: 0.03, rotate: -30, anim: "floatA", delay: "3s"    },
];

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
            <a href="#sports"   className={styles.headerNavLink}>Sports</a>
            <a href="#features" className={styles.headerNavLink}>Features</a>
            <a href="#how"      className={styles.headerNavLink}>How It Works</a>
            <a href="#for-who"  className={styles.headerNavLink}>For Who</a>
          </nav>

          <div className={styles.headerActions}>
            <Button variant="ghost" size="sm" as="a" href="/auth">
              Sign In
            </Button>
            <Button variant="primary" size="sm" as="a" href="/auth?mode=signup">
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

          {/* Scattered sports bg icons */}
          {heroBgSports.map((s, i) => (
            <div
              key={i}
              className={styles.sportsBgIcon}
              aria-hidden="true"
              style={{
                top: s.top, bottom: s.bottom, left: s.left, right: s.right,
                opacity: s.opacity,
                transform: `rotate(${s.rotate}deg)`,
                animation: `${s.anim} ${11 + i * 2}s ease-in-out ${s.delay} infinite`,
              }}
            >
              <Icon icon={s.icon} width={s.size} height={s.size} />
            </div>
          ))}

          <div className="container-tight" style={{ position: "relative", zIndex: 2 }}>
            <div className={styles.heroCopy}>
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
                  <div className={styles.heroStatNum}>{count3}+</div>
                  <div className={styles.heroStatLabel}>Sports</div>
                </div>
              </div>
            </div>
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

        {/* ── SPORTS SHOWCASE ──────────────────────────────────── */}
        <section
          id="sports"
          className={`${styles.section} ${styles.sportsSection}`}
          aria-labelledby="sports-title"
        >
          <div className="container">
            <div className="reveal">
              <div className={styles.sectionLabel}>
                <span className={styles.sectionLabelLine} />
                Sports on Goatza
              </div>
              <h2 id="sports-title" className={styles.sectionTitle}>
                One platform.
                <br />
                Every sport.
              </h2>
              <p className={styles.sectionBody} style={{ maxWidth: 480 }}>
                From football pitches to badminton courts — if you compete, you belong here.
                We're starting with the sports India loves most and growing fast.
              </p>
            </div>

            {/* Featured 3 — large cards */}
            <div className={`${styles.sportsFeaturedRow} stagger-children`}>
              {sports.filter(s => s.featured).map((s, i) => (
                <TiltCard key={i} className={`${styles.sportFeaturedCard} reveal`} intensity={5}>
                  <div className={styles.sportFeaturedBg} aria-hidden="true">
                    <Icon icon={s.icon} width={140} height={140} />
                  </div>
                  <div className={styles.sportFeaturedIcon} aria-hidden="true">
                    <Icon icon={s.icon} width={44} height={44} />
                  </div>
                  <span className={styles.sportFeaturedLabel}>{s.label}</span>
                  <span className={styles.sportFeaturedBadge}>Featured</span>
                </TiltCard>
              ))}
            </div>

            {/* All sports chip grid */}
            <div className={`${styles.sportsChipGrid} reveal`}>
              {sports.filter(s => !s.featured).map((s, i) => (
                <div key={i} className={styles.sportChip} style={{ animationDelay: `${i * 40}ms` }}>
                  <span className={styles.sportChipIcon} aria-hidden="true">
                    <Icon icon={s.icon} width={20} height={20} />
                  </span>
                  <span className={styles.sportChipLabel}>{s.label}</span>
                </div>
              ))}
              {/* More coming soon chip */}
              <div className={`${styles.sportChip} ${styles.sportChipMore}`}>
                <span className={styles.sportChipIcon} aria-hidden="true">
                  <Icon icon="mdi:plus-circle-outline" width={20} height={20} />
                </span>
                <span className={styles.sportChipLabel}>More coming</span>
              </div>
            </div>
          </div>
        </section>

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
        <section className={styles.ctaSection} aria-labelledby="cta-title">
          <div className={styles.ctaBg} aria-hidden="true" />
          <div className={styles.ctaGlow} aria-hidden="true" />
          <div className={`${styles.ctaFloat} ${styles.ctaFloatA}`} aria-hidden="true" />
          <div className={`${styles.ctaFloat} ${styles.ctaFloatB}`} aria-hidden="true" />

          {/* CTA sports bg icons */}
          <div className={styles.ctaSportsBg} aria-hidden="true">
            <Icon icon="mdi:soccer"   width={220} height={220} />
          </div>
          <div className={`${styles.ctaSportsBg} ${styles.ctaSportsBgRight}`} aria-hidden="true">
            <Icon icon="mdi:cricket"  width={160} height={160} />
          </div>

          <div className="container-tight" style={{ position: "relative", zIndex: 1 }}>
            <div className="reveal" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div className={styles.ctaBadge}>
                <span className={styles.ctaBadgeDot} aria-hidden="true" />
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
                  style={{ borderColor: "rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.7)" } as React.CSSProperties}
                >
                  Sign In
                </Button>
              </div>

              <p className={styles.ctaNote}>
                Free forever · No credit card required
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