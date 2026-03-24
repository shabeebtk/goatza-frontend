"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import styles from "./style.module.css";

// ── CONFIG ─────────────────────────────────────────────────────────────────
const GOOGLE_SHEET_URL =
  "https://script.google.com/macros/s/AKfycbx1HrLB57lHlOScYAdixOXayHAZw3o6uvf5JC0UTvjKODFv5NEY2JPWHmSIK2R7nMfAvg/exec";

const LOGO_URL =
  "https://res.cloudinary.com/duotwo8gf/image/upload/v1774332703/goatza-logo-black_ve34f5.png";

// ── Hook: scroll reveal via IntersectionObserver ───────────────────────────
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

// ── Hook: 3D card tilt (desktop only) ─────────────────────────────────────
function useTilt(ref: React.RefObject<HTMLElement | null>, intensity = 8) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Skip on touch devices
    if (!window.matchMedia("(hover: hover)").matches) return;

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
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

// ── Hook: animated counter ─────────────────────────────────────────────────
function useCounter(target: number, duration = 1200, startTrigger: boolean) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!startTrigger) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) { setCount(target); return; }

    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
      else setCount(target);
    };
    requestAnimationFrame(step);
  }, [startTrigger, target, duration]);

  return count;
}

// ── TiltCard wrapper ───────────────────────────────────────────────────────
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
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

// ── LogoLockup ─────────────────────────────────────────────────────────────
function LogoLockup({
  imgClass,
  wrapClass,
  wordmarkClass,
  lockupClass,
}: {
  imgClass: string;
  wrapClass: string;
  wordmarkClass: string;
  lockupClass: string;
}) {
  return (
    <a href="/" aria-label="Goatza home" className={lockupClass}>
      <div className={wrapClass}>
        <img src={LOGO_URL} alt="" aria-hidden="true" className={imgClass} />
      </div>
      <span className={wordmarkClass}>Goatza</span>
    </a>
  );
}

// ── WaitlistForm ───────────────────────────────────────────────────────────
interface WaitlistFormProps {
  inputClass?: string;
  submitBtnClass?: string;
}

function WaitlistForm({ inputClass = "", submitBtnClass = "" }: WaitlistFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        name: name.trim(),
        email: email.trim(),
        timestamp: new Date().toISOString(),
      });

      await fetch(`${GOOGLE_SHEET_URL}?${params.toString()}`, {
        method: "GET",
        mode: "no-cors",
      });

      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className={styles.successMsg}>
        <span aria-hidden="true">✦</span>
        You're on the list — we'll be in touch!
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={styles.waitlistForm} noValidate>
      <div className={styles.formRow}>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className={`${styles.inputField} ${inputClass}`}
          aria-label="Full name"
          autoComplete="name"
        />
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email address"
          className={`${styles.inputField} ${inputClass}`}
          aria-label="Email address"
          autoComplete="email"
        />
      </div>
      {error && <p className={styles.errorMsg} role="alert">{error}</p>}
      <button
        type="submit"
        className={`${styles.submitBtn} ${submitBtnClass}`}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? "Joining…" : "Join the Waitlist →"}
      </button>
    </form>
  );
}

// ── LandingPage ────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [statsVisible, setStatsVisible] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);

  // Init scroll reveal
  useScrollReveal();

  // Header scroll effect
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Trigger stat counters when stats enter viewport
  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setStatsVisible(true); observer.disconnect(); } },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const count1 = useCounter(200, 1000, statsVisible);
  const count2 = useCounter(10, 800, statsVisible);

  const scrollToWaitlist = () => {
    document.getElementById("waitlist")?.scrollIntoView({ behavior: "smooth" });
  };

  // ── Static Data ────────────────────────────────────────────────────────

  const tickerItems = [
    "Athletes", "Teams", "Scouts", "Academies",
    "Talent", "Discovery", "Recruitment", "Goatza",
    "Athletes", "Teams", "Scouts", "Academies",
    "Talent", "Discovery", "Recruitment", "Goatza",
  ];

  const problems = [
    {
      icon: "🔍",
      title: "Talent Stays Hidden",
      body: "Thousands of skilled athletes never get seen. Without the right connections, raw talent simply goes undiscovered.",
    },
    {
      icon: "🤝",
      title: "Recruitment is Broken",
      body: "Teams waste weeks on scattered WhatsApp groups and word-of-mouth. Finding the right player takes far too long.",
    },
    {
      icon: "📊",
      title: "No Digital Identity",
      body: "Athletes have no professional space to showcase stats, video, and achievements the way other professionals do.",
    },
    {
      icon: "🌍",
      title: "Geography Limits Reach",
      body: "Local talent pools are small. Real opportunity requires visibility beyond your city — but the tools haven't existed.",
    },
  ];

  const solutionFeatures = [
    {
      icon: "🏆",
      title: "Athlete Profiles",
      body: "Showcase skills, stats, highlight reels, and milestones — your complete sports identity.",
    },
    {
      icon: "🔎",
      title: "Smart Discovery",
      body: "Scouts and teams filter by sport, position, age, and location — then connect instantly.",
    },
    {
      icon: "🏫",
      title: "Academy Tools",
      body: "Academies list programmes, post recruitment drives, and manage player pipelines.",
    },
  ];

  const steps = [
    {
      num: "01",
      title: "Build Your Profile",
      body: "Create your sports identity — add highlights, stats, position, and achievements. Athletes or organisations, everyone gets a space.",
    },
    {
      num: "02",
      title: "Get Discovered",
      body: "Scouts, coaches, and academies actively search Goatza for talent. Your profile works for you 24/7.",
    },
    {
      num: "03",
      title: "Connect & Grow",
      body: "Message, negotiate, and build relationships directly on the platform. From tryouts to signed contracts — all in one place.",
    },
  ];

  const audiences = [
    {
      emoji: "⚡",
      title: "Athletes",
      benefits: [
        "Build a professional sports profile",
        "Get discovered by scouts and teams",
        "Showcase your highlight reel",
        "Access opportunities globally",
      ],
    },
    {
      emoji: "🏟️",
      title: "Teams & Clubs",
      benefits: [
        "Find verified talent instantly",
        "Filter by position, stats & location",
        "Post open trials and recruitment calls",
        "Reduce recruitment time and cost",
      ],
    },
    {
      emoji: "🏫",
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
      {/* ── HEADER ────────────────────────────────────────────────────── */}
      <header className={`${styles.header} ${scrolled ? styles.headerScrolled : ""}`}>
        <div className={`container ${styles.headerContent}`}>
          <LogoLockup
            lockupClass={styles.logoLockup}
            wrapClass={styles.logoImgWrap}
            imgClass={styles.logoImg}
            wordmarkClass={styles.logoWordmark}
          />
          <button className={styles.headerCta} onClick={scrollToWaitlist}>
            Join Waitlist
          </button>
        </div>
      </header>

      <main>
        {/* ── HERO ──────────────────────────────────────────────────────── */}
        <section className={styles.hero} aria-label="Hero">
          <div className={styles.heroBg} aria-hidden="true" />
          <div className={styles.heroGlow} aria-hidden="true" />

          {/* Floating decorative orbs */}
          <div className={`${styles.heroFloat} ${styles.heroFloatA}`} aria-hidden="true" />
          <div className={`${styles.heroFloat} ${styles.heroFloatB}`} aria-hidden="true" />
          <div className={`${styles.heroFloat} ${styles.heroFloatC}`} aria-hidden="true" />

          <div
            className="container-tight"
            style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative", zIndex: 2 }}
          >
            <div className={styles.heroBadge}>
              <span className={styles.heroBadgeDot} aria-hidden="true" />
              Pre-Launch · Early Access Open
            </div>

            <h1 className={styles.heroHeadline}>
              Where the{" "}
              <span className={styles.heroHeadlineAccent}>Greatest</span>
              <br />
              Get Discovered
            </h1>

            <p className={styles.heroSub}>
              The sports network built for discovery.
              Showcase your talent and connect with scouts, teams & academies.
            </p>

            <div className={styles.heroFormWrap}>
              <WaitlistForm />
            </div>

            <p className={styles.heroNote}>
              Free to join · No credit card · Early members get priority access
            </p>

            {/* Stats with counter animation */}
            <div
              ref={statsRef}
              className={styles.heroStats}
              role="list"
              aria-label="Key numbers"
            >
              <div className={styles.heroStat} role="listitem">
                <div className={styles.heroStatNum}>{count1}+</div>
                <div className={styles.heroStatLabel}>Athletes waiting</div>
              </div>
              <div className={styles.heroStatDivider} aria-hidden="true" />
              <div className={styles.heroStat} role="listitem">
                <div className={styles.heroStatNum}>{count2}+</div>
                <div className={styles.heroStatLabel}>Clubs & academies</div>
              </div>
            </div>
          </div>
        </section>

        {/* ── TICKER ────────────────────────────────────────────────────── */}
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

        {/* ── PROBLEM ───────────────────────────────────────────────────── */}
        <section
          className={`${styles.section} ${styles.problem}`}
          aria-labelledby="problem-title"
        >
          <div className="container">
            <div className="reveal">
              <div className={styles.sectionLabel}>
                <span className={styles.sectionLabelLine} />
                The Problem
              </div>
              <h2 id="problem-title" className={styles.sectionTitle}>
                Sports talent is everywhere.
                <br />
                The system isn't.
              </h2>
              <p className={styles.sectionBody} style={{ maxWidth: "500px" }}>
                The sports world still runs on connections, luck, and geography.
                Talented athletes fall through the cracks every single day.
              </p>
            </div>

            <div className={`${styles.problemGrid} stagger-children`}>
              {problems.map((p, i) => (
                <TiltCard key={i} className={`${styles.problemCard} reveal`} intensity={6}>
                  <span className={styles.problemIcon} aria-hidden="true">{p.icon}</span>
                  <h3 className={styles.problemCardTitle}>{p.title}</h3>
                  <p className={styles.problemCardBody}>{p.body}</p>
                </TiltCard>
              ))}
            </div>
          </div>
        </section>

        {/* ── SOLUTION ──────────────────────────────────────────────────── */}
        <section className={styles.section} aria-labelledby="solution-title">
          <div className="container">
            <div className={styles.solutionInner}>
              {/* Visual panel */}
              <div className={`${styles.solutionVisual} reveal-scale`}>
                <div className={styles.solutionVisualGlow} aria-hidden="true" />
                <div className={styles.solutionVisualInner}>
                  <div className={styles.solutionLogoWrap}>
                    <img src={LOGO_URL} alt="Goatza platform" className={styles.solutionLogoLarge} />
                  </div>
                  <div className={styles.solutionTag}>Your Stage Awaits</div>
                </div>
              </div>

              {/* Copy */}
              <div className="reveal-right">
                <div className={styles.sectionLabel}>
                  <span className={styles.sectionLabelLine} />
                  The Solution
                </div>
                <h2 id="solution-title" className={styles.sectionTitle}>
                  One platform.
                  <br />
                  Infinite reach.
                </h2>
                <p className={styles.sectionBody}>
                  Goatza brings athletes, teams, scouts, and academies onto a single
                  professional network built for sport. Think LinkedIn meets Instagram
                  — but entirely for the field.
                </p>
                <div className={styles.solutionFeatures}>
                  {solutionFeatures.map((f, i) => (
                    <div key={i} className={styles.solutionFeature}>
                      <div className={styles.solutionFeatureIcon} aria-hidden="true">{f.icon}</div>
                      <div className={styles.solutionFeatureText}>
                        <strong>{f.title}</strong>
                        <span>{f.body}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ──────────────────────────────────────────────── */}
        <section
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

        {/* ── WHO IT'S FOR ──────────────────────────────────────────────── */}
        <section className={styles.section} aria-labelledby="audience-title">
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
                  <span className={styles.audienceEmoji} aria-hidden="true">{a.emoji}</span>
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

        {/* ── FINAL CTA ─────────────────────────────────────────────────── */}
        <section
          className={styles.ctaSection}
          id="waitlist"
          aria-labelledby="cta-title"
        >
          <div className={styles.ctaBg} aria-hidden="true" />
          <div className={styles.ctaGlow} aria-hidden="true" />
          <div className={`${styles.ctaFloat} ${styles.ctaFloatA}`} aria-hidden="true" />
          <div className={`${styles.ctaFloat} ${styles.ctaFloatB}`} aria-hidden="true" />

          <div className="container-tight" style={{ position: "relative", zIndex: 1 }}>
            <div className="reveal">
              <h2 id="cta-title" className={styles.ctaTitle}>
                Claim your spot
                <br />
                before <span>launch day</span>
              </h2>
              <p className={styles.ctaBody}>
                Early members get priority access, exclusive features, and the chance
                to shape what Goatza becomes. Don't wait to be great.
              </p>
            </div>

            <div className={`${styles.ctaFormWrap} reveal`} style={{ transitionDelay: "120ms" }}>
              <WaitlistForm
                inputClass={styles.ctaInput}
                submitBtnClass={styles.submitBtnGold}
              />
            </div>

            <p className={styles.ctaNote}>First 10,000 users get free premium access.</p>

            <div className={styles.ctaCounter}>
              <span className={styles.ctaCounterDot} aria-hidden="true" />
              200+ people have already joined the waitlist
            </div>
          </div>
        </section>
      </main>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer className={styles.footer}>
        <div className={`container ${styles.footerInner}`}>
          <LogoLockup
            lockupClass={styles.footerLogoLockup}
            wrapClass={styles.footerLogoImgWrap}
            imgClass={styles.footerLogoImg}
            wordmarkClass={styles.footerWordmark}
          />
          <p className={styles.footerCopy}>
            © {new Date().getFullYear()} Goatza. All rights reserved.
          </p>
        </div>
      </footer>
    </>
  );
}