"use client";
/**
 * GOATZA — Landing Page (v4 · Football-First · Cinematic)
 * Photo-driven hero, coded product preview, richer motion.
 * Design system + hooks unchanged; all copy speaks football.
 */
import { useState, useEffect, useRef, Fragment } from "react";
import { Icon } from "@iconify/react";
import { Button, Badge } from "@/shared/components/ui";
import styles from "./LandingPage.module.css";
import { LOGO_URL } from "@/constants";
import useTilt from "@/shared/hooks/useTilt";
import useScrollReveal from "@/shared/hooks/useScrollReveal";
import useCounter from "@/shared/hooks/useCounter";
import useSmoothScroll from "./hooks/useSmoothScroll";
import LandingImage from "./components/LandingImage";
import {
  tickerItems,
  showcaseCards,
  features,
  // steps, // re-enable with the commented-out HowItWorks section (video clip)
  personas,
  productPreview,
  landingImages,
} from "./data/landing.data";

// Headline split into words for the staggered reveal.
const HEADLINE: { t: string; accent?: boolean; breakAfter?: boolean }[] = [
  { t: "Where" },
  { t: "the" },
  { t: "Greatest", accent: true, breakAfter: true },
  { t: "Get" },
  { t: "Discovered" },
];

// ── TiltCard ─────────────────────────────────────────────────────
function TiltCard({
  className,
  children,
  intensity = 7,
  ...rest
}: {
  className: string;
  children: React.ReactNode;
  intensity?: number;
} & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  useTilt(ref, intensity);
  return (
    <div ref={ref} className={className} {...rest}>
      {children}
    </div>
  );
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

// ── Header ───────────────────────────────────────────────────────
function Header({ scrolled }: { scrolled: boolean }) {
  return (
    <header className={`${styles.header} ${scrolled ? styles.headerScrolled : ""}`}>
      <div className={`container ${styles.headerContent}`}>
        <LogoLockup />

        <nav className={styles.headerNav} aria-label="Main navigation">
          <a href="#football" className={styles.headerNavLink}>Football</a>
          <a href="#for-you" className={styles.headerNavLink}>For You</a>
          <a href="#preview" className={styles.headerNavLink}>The Product</a>
          <a href="#features" className={styles.headerNavLink}>Features</a>
          {/* TODO: re-enable when the "how it works" video clip is ready
          <a href="#how" className={styles.headerNavLink}>How It Works</a>
          */}
        </nav>

        <div className={styles.headerActions}>
          <Button
            variant="ghost"
            size="sm"
            href="/auth"
            className={scrolled ? "" : styles.navBtnOverHero}
          >
            Sign In
          </Button>
          <Button variant="brand" size="sm" href="/join">
            Register
          </Button>
        </div>
      </div>
    </header>
  );
}

// ── Hero — full-bleed cinematic photo ────────────────────────────
function HeroSection() {
  const parallaxRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const [statsVisible, setStatsVisible] = useState(false);

  // Parallax — rAF-throttled, passive, transform-only.
  useEffect(() => {
    const el = parallaxRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        el.style.transform = `translate3d(0, ${window.scrollY * 0.25}px, 0)`;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Trigger stat counters when they scroll into view.
  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStatsVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const count1 = useCounter(100, 1000, statsVisible);
  const count2 = useCounter(10, 800, statsVisible);
  const count3 = useCounter(10, 700, statsVisible);

  return (
    <section className={styles.hero} aria-label="Hero">
      {/* Photo layers */}
      <div className={styles.heroMedia} aria-hidden="true">
        <div ref={parallaxRef} className={styles.heroParallax}>
          <div className={styles.heroKenBurns}>
            <LandingImage
              src={landingImages.hero}
              alt=""
              sizes="100vw"
              priority
              quality={85}
              className={styles.heroImg}
            />
          </div>
        </div>
      </div>
      <div className={styles.heroScrim} aria-hidden="true" />
      <div className={styles.heroBottomFade} aria-hidden="true" />
      <div className={styles.heroGlow} aria-hidden="true" />
      <div className={styles.heroGrain} aria-hidden="true" />

      <div className={`container ${styles.heroInner}`}>
        <div className={styles.heroCopy}>
          <h1 className={styles.heroHeadline}>
            {HEADLINE.map((w, i) => (
              <Fragment key={i}>
                <span
                  className={`${styles.heroWord} ${w.accent ? styles.heroHeadlineAccent : ""}`}
                  style={{ animationDelay: `${0.15 + i * 0.08}s` }}
                >
                  {w.t}
                </span>
                {w.breakAfter ? <br /> : i < HEADLINE.length - 1 ? " " : null}
              </Fragment>
            ))}
          </h1>

          <p className={styles.heroSub}>
            The football network built for discovery. Showcase your game and connect
            with scouts, clubs &amp; academies — all in one platform.
          </p>

          <div className={styles.heroActions}>
            <Button
              variant="brand"
              size="lg"
              rightIcon={<Icon icon="mdi:arrow-right" width={18} height={18} />}
              href="/join"
            >
              Register
            </Button>
            {/* TODO: re-enable when the "how it works" video clip is ready
            <Button
              variant="outline"
              size="lg"
              leftIcon={<Icon icon="mdi:play-circle-outline" width={18} height={18} />}
              href="#how"
              className={styles.heroOutlineBtn}
            >
              See How It Works
            </Button>
            */}
          </div>

          <div ref={statsRef} className={styles.heroStats} role="list" aria-label="Platform stats">
            <div className={styles.heroStat} role="listitem">
              <div className={styles.heroStatNum}>{count1.toLocaleString()}+</div>
              <div className={styles.heroStatLabel}>Players</div>
            </div>
            <div className={styles.heroStatDivider} aria-hidden="true" />
            <div className={styles.heroStat} role="listitem">
              <div className={styles.heroStatNum}>{count2}+</div>
              <div className={styles.heroStatLabel}>Clubs &amp; Academies</div>
            </div>
            <div className={styles.heroStatDivider} aria-hidden="true" />
            <div className={styles.heroStat} role="listitem">
              <div className={styles.heroStatNum}>{count3}+</div>
              <div className={styles.heroStatLabel}>Open Trials</div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.heroScrollHint} aria-hidden="true">
        <span className={styles.heroScrollHintChevron}>
          <Icon icon="mdi:chevron-down" width={22} height={22} />
        </span>
      </div>
    </section>
  );
}

// ── Ticker ───────────────────────────────────────────────────────
function Ticker() {
  return (
    <div className={styles.ticker} aria-hidden="true">
      <div className={styles.tickerTrack}>
        {tickerItems.map((item, i) => (
          <span key={i} className={styles.tickerItem}>
            {item}
            <span className={styles.tickerSep}>✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Football Showcase ────────────────────────────────────────────
function FootballShowcase() {
  return (
    <section
      id="football"
      className={`${styles.section} ${styles.showcaseSection}`}
      aria-labelledby="football-title"
    >
      <div className="container">
        <div className="reveal">
          <div className={styles.sectionLabel}>
            <span className={styles.sectionLabelLine} />
            Made for Football
          </div>
          <h2 id="football-title" className={styles.sectionTitle}>
            Built for the
            <br />
            beautiful game
          </h2>
          <p className={styles.sectionBody} style={{ maxWidth: 520 }}>
            We&apos;re launching with football first — from grassroots pitches to the
            professional game. More sports coming soon.
          </p>
        </div>

        {/* Featured photo cards */}
        <div className={`${styles.showcaseRow} stagger-children`}>
          {showcaseCards.map((c, i) => (
            <div
              key={c.key}
              className={`reveal ${styles.showcaseCellReveal} ${i === 1 ? styles.showcaseCellRevealMid : ""}`}
            >
              <TiltCard
                className={styles.showcaseCard}
                intensity={4}
                tabIndex={0}
                role="group"
                aria-label={`${c.label}. ${c.line}`}
              >
                <LandingImage
                  src={c.img}
                  alt={c.alt}
                  sizes="(min-width: 640px) 33vw, 100vw"
                  className={styles.showcaseImg}
                  fallbackIcon={c.icon}
                />
                <div className={styles.showcaseScrim} aria-hidden="true" />
                <span className={styles.showcaseChip} aria-hidden="true">
                  <Icon icon={c.icon} width={22} height={22} />
                </span>
                <div className={styles.showcaseContent}>
                  <span className={styles.showcaseLabel}>{c.label}</span>
                  <span className={styles.showcaseLine}>{c.line}</span>
                </div>
              </TiltCard>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Product Preview — coded UI mock ──────────────────────────────
function ProductPreview() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [toastShown, setToastShown] = useState(false);
  const { profile, recruitment, scout } = productPreview;

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          obs.disconnect();
          if (reduce) setToastShown(true);
          else timer = setTimeout(() => setToastShown(true), 1000);
        }
      },
      { threshold: 0.4 }
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <section
      id="preview"
      ref={sectionRef}
      className={`${styles.section} ${styles.previewSection}`}
      aria-labelledby="preview-title"
    >
      <div className="container">
        <div className={`${styles.previewHead} reveal`}>
          <div className={styles.sectionLabel}>
            <span className={styles.sectionLabelLine} />
            Inside Goatza
          </div>
          <h2 id="preview-title" className={styles.sectionTitle}>
            Your profile does
            <br />
            the talking
          </h2>
          <p className={styles.sectionBody}>
            A living football CV that puts your game, your highlights, and open trials
            in one place.
          </p>
        </div>

        <div className={`${styles.previewStage} stagger-children`}>
          {/* Left — scout search */}
          <div className={`reveal ${styles.previewSlot} ${styles.previewSlotLeft}`}>
            <div className={`${styles.previewCard} ${styles.scoutCard}`}>
              <div className={styles.scSearch}>
                <Icon icon="mdi:magnify" width={16} height={16} aria-hidden="true" />
                <span className={styles.scSearchText}>{scout.query}</span>
              </div>
              <div className={styles.scFilters}>
                {scout.filters.map((f) => (
                  <span key={f} className={styles.scFilter}>
                    {f}
                  </span>
                ))}
              </div>
              <div className={styles.scResults}>
                {scout.results.map((r) => (
                  <div key={r.name} className={styles.scResult}>
                    <span className={styles.scResultAvatar} aria-hidden="true">
                      {r.initials}
                    </span>
                    <div>
                      <div className={styles.scResultName}>{r.name}</div>
                      <div className={styles.scResultMeta}>{r.meta}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Center — player profile */}
          <div className={`reveal ${styles.previewSlot} ${styles.previewSlotCenter}`}>
            <div className={`${styles.previewCard} ${styles.profileCard}`}>
              <div
                className={`${styles.pvToast} ${toastShown ? styles.pvToastShown : ""}`}
                aria-hidden="true"
              >
                <Icon icon="mdi:check-circle" width={14} height={14} />
                {profile.toast}
              </div>

              <div className={styles.pvProfileTop}>
                <span className={styles.pvAvatar} aria-hidden="true">
                  {profile.initials}
                </span>
                <div>
                  <div className={styles.pvNameRow}>
                    <span className={styles.pvName}>{profile.name}</span>
                    {profile.verified && (
                      <span className={styles.pvVerified} aria-hidden="true">
                        <Icon icon="mdi:check-decagram" width={16} height={16} />
                      </span>
                    )}
                  </div>
                  <div className={styles.pvHandle}>{profile.handle}</div>
                </div>
              </div>

              <div className={styles.pvChips}>
                {profile.chips.map((c) => (
                  <span key={c} className={styles.pvChip}>
                    {c}
                  </span>
                ))}
              </div>

              <div className={styles.pvStatRow}>
                {profile.stats.map((s) => (
                  <div key={s.label} className={styles.pvStat}>
                    <div className={styles.pvStatNum}>{s.value}</div>
                    <div className={styles.pvStatLabel}>{s.label}</div>
                  </div>
                ))}
              </div>

              <div className={styles.pvAttrs}>
                {profile.attributes.map((a) => (
                  <span key={a} className={styles.pvAttrChip}>
                    {a}
                  </span>
                ))}
              </div>

              <div className={styles.pvFollow}>
                <Button
                  variant="brand"
                  size="sm"
                  fullWidth
                  as="button"
                  type="button"
                  leftIcon={<Icon icon="mdi:plus" width={16} height={16} />}
                >
                  Follow
                </Button>
              </div>
            </div>
          </div>

          {/* Right — recruitment */}
          <div className={`reveal ${styles.previewSlot} ${styles.previewSlotRight}`}>
            <div className={`${styles.previewCard} ${styles.recruitCard}`}>
              <div className={styles.rcHead}>
                <span className={styles.rcAvatar} aria-hidden="true">
                  {recruitment.clubInitials}
                </span>
                <div>
                  <div className={styles.rcClub}>{recruitment.club}</div>
                  <div className={styles.rcTag}>Recruiting now</div>
                </div>
              </div>
              <div className={styles.rcTitle}>{recruitment.title}</div>
              <div className={styles.rcMetaRow}>
                <span className={styles.rcMetaChip}>
                  <Icon icon="mdi:map-marker-outline" width={13} height={13} />
                  {recruitment.location}
                </span>
                <span className={styles.rcMetaChip}>
                  <Icon icon="mdi:calendar-blank-outline" width={13} height={13} />
                  {recruitment.date}
                </span>
              </div>
              <div className={styles.rcFooter}>
                <span className={styles.rcApplicants}>{recruitment.applicants}</span>
                <Button variant="primary" size="sm" as="button" type="button">
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Features ─────────────────────────────────────────────────────
function Features() {
  return (
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
            to get seen
          </h2>
        </div>

        <div className={`${styles.featuresGrid} stagger-children`}>
          {features.map((f, i) => (
            <div key={i} className={`reveal ${styles.featureCellReveal}`}>
              <TiltCard className={styles.featureCard} intensity={6}>
                <span className={styles.featureIcon} aria-hidden="true">
                  <Icon icon={f.icon} width={26} height={26} />
                </span>
                <h3 className={styles.featureTitle}>{f.title}</h3>
                <p className={styles.featureBody}>{f.body}</p>
              </TiltCard>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── How It Works ─────────────────────────────────────────────────
// TODO: re-enable when the "how it works" video clip is ready
/*
function HowItWorks() {
  const gridRef = useRef<HTMLDivElement>(null);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setAnimate(true);
          obs.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section id="how" className={`${styles.section} ${styles.howItWorks}`} aria-labelledby="how-title">
      <div className="container">
        <div className={`${styles.stepsHeader} reveal`}>
          <div className={styles.sectionLabel}>
            <span className={styles.sectionLabelLine} />
            How It Works
          </div>
          <h2 id="how-title" className={styles.sectionTitle}>
            Three steps to your
            <br />
            breakthrough
          </h2>
        </div>

        <div ref={gridRef} className={`${styles.stepsWrap} ${animate ? styles.stepsAnimate : ""}`}>
          <div className={styles.stepsConnector} aria-hidden="true" />
          <div className={`${styles.stepsGrid} stagger-children`}>
            {steps.map((s, i) => (
              <div key={i} className={`${styles.stepCard} reveal`}>
                <div
                  className={styles.stepNumber}
                  aria-hidden="true"
                  style={{ "--num-delay": `${0.25 + i * 0.3}s` } as React.CSSProperties}
                >
                  {s.num}
                </div>
                <div className={styles.stepContent}>
                  <h3 className={styles.stepTitle}>{s.title}</h3>
                  <p className={styles.stepBody}>{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
*/

// ── Persona Selector — "Which one are you?" tabs ─────────────────
function PersonaSelector() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const persona = personas[active];
  const article = /^[aeiou]/i.test(persona.label) ? "an" : "a";

  // Roving-tabindex arrow-key navigation across the tablist.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next = active;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (active + 1) % personas.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (active - 1 + personas.length) % personas.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = personas.length - 1;
    else return;
    e.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <section
      id="for-you"
      className={`${styles.section} ${styles.personaSection}`}
      aria-labelledby="persona-title"
    >
      <div className="container">
        <div className={`${styles.personaHead} reveal`}>
          <div className={styles.sectionLabel}>
            <span className={styles.sectionLabelLine} />
            Who It&apos;s For
          </div>
          <h2 id="persona-title" className={styles.sectionTitle}>
            Which one are you?
          </h2>
          <p className={styles.sectionBody}>
            Pick your role and see exactly what Goatza does for you.
          </p>
        </div>

        <div
          className={`${styles.personaTabs} reveal`}
          role="tablist"
          aria-label="Choose your role"
          onKeyDown={onKeyDown}
        >
          {personas.map((p, i) => (
            <button
              key={p.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`persona-tab-${p.key}`}
              aria-selected={active === i}
              aria-controls="persona-panel"
              tabIndex={active === i ? 0 : -1}
              className={`${styles.personaChip} ${active === i ? styles.personaChipActive : ""}`}
              onClick={() => setActive(i)}
            >
              <span className={styles.personaChipThumb} aria-hidden="true">
                <LandingImage
                  src={p.img}
                  alt=""
                  sizes="56px"
                  className={styles.personaChipImg}
                  fallbackIcon={p.icon}
                  fallbackIconSize={24}
                />
              </span>
              <span className={styles.personaChipLabel}>{p.label}</span>
            </button>
          ))}
        </div>

        <div
          id="persona-panel"
          role="tabpanel"
          aria-labelledby={`persona-tab-${persona.key}`}
          tabIndex={0}
          className={`${styles.personaPanel} reveal`}
        >
          {/* key remounts on change → replays crossfade + benefit stagger */}
          <div key={persona.key} className={styles.personaPanelInner}>
            <div className={styles.personaPhoto}>
              <LandingImage
                src={persona.img}
                alt={persona.imgAlt}
                sizes="(min-width: 760px) 420px, 100vw"
                className={styles.personaPhotoImg}
                fallbackIcon={persona.icon}
              />
              <div className={styles.personaPhotoFade} aria-hidden="true" />
            </div>

            <div className={styles.personaDetail}>
              <h3 className={styles.personaTagline}>{persona.tagline}</h3>
              <ul className={styles.personaBenefits} aria-label={`What a ${persona.label} gets`}>
                {persona.benefits.map((b, j) => (
                  <li
                    key={b}
                    className={styles.personaBenefit}
                    style={{ animationDelay: `${0.12 + j * 0.05}s` } as React.CSSProperties}
                  >
                    <span className={styles.personaCheck} aria-hidden="true">
                      <Icon icon="mdi:check-circle" width={18} height={18} />
                    </span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>

              {persona.comingSoon && (
                <div className={styles.personaComingSoon}>
                  <Badge variant="default" dot>
                    {persona.comingSoon}
                  </Badge>
                </div>
              )}

              <div className={styles.personaCta}>
                <Button
                  variant="brand"
                  size="lg"
                  href="/join"
                  rightIcon={<Icon icon="mdi:arrow-right" width={18} height={18} />}
                >
                  Register
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Final CTA — photo background ─────────────────────────────────
function FinalCTA() {
  return (
    <section className={styles.ctaSection} aria-labelledby="cta-title">
      <div className={styles.ctaMedia} aria-hidden="true">
        <div className={styles.ctaKenBurns}>
          <LandingImage src={landingImages.ctaBg} alt="" sizes="100vw" className={styles.ctaImg} />
        </div>
      </div>
      <div className={styles.ctaScrim} aria-hidden="true" />
      <div className={styles.ctaGlow} aria-hidden="true" />

      <div className="container-tight">
        <div className={`${styles.ctaInner} reveal`}>
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
            Join thousands of players, coaches, and scouts already building their future
            on Goatza.
          </p>

          <div className={styles.ctaActions}>
            <Button
              variant="brand"
              size="lg"
              rightIcon={<Icon icon="mdi:arrow-right" width={18} height={18} />}
              href="/join"
            >
              Register
            </Button>
            <Button variant="outline" size="lg" href="/auth" className={styles.ctaOutlineBtn}>
              Sign In
            </Button>
          </div>

          <p className={styles.ctaNote}>Free forever · No credit card required</p>
        </div>
      </div>
    </section>
  );
}

// ── Footer ───────────────────────────────────────────────────────
function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.footerInner}`}>
        <LogoLockup footer />
        <nav className={styles.footerLinks} aria-label="Footer navigation">
          <a href="/privacy" className={styles.footerLink}>Privacy</a>
          <a href="/terms" className={styles.footerLink}>Terms</a>
          <a href="/contact" className={styles.footerLink}>Contact</a>
        </nav>
        <p className={styles.footerCopy}>
          © {new Date().getFullYear()} Goatza. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

// ── LandingPage ──────────────────────────────────────────────────
export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);

  useScrollReveal();
  useSmoothScroll();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <Header scrolled={scrolled} />
      <main>
        <HeroSection />
        <Ticker />
        <FootballShowcase />
        <PersonaSelector />
        <ProductPreview />
        <Features />
        {/* TODO: re-enable when the "how it works" video clip is ready
        <HowItWorks />
        */}
        <FinalCTA />
      </main>
      <SiteFooter />
    </>
  );
}
