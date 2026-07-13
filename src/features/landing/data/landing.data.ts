/**
 * GOATZA — Landing Page data (v5 · Football-First)
 * All copy, image paths, personas, and the coded Product Preview mock.
 * Copy is written strictly within Goatza's real capabilities:
 * profiles, posts, discovery, recruitments/trials, follows, messaging.
 * Nothing beyond those features is described. Fictional preview data only.
 */

// ── Image paths ───────────────────────────────────────────────────
// Source files live in /public/landing. Swap these in one place if the
// underlying assets ever change. (coach/scout may not exist yet — the
// UI falls back to an icon tile via LandingImage.)
export const landingImages = {
    hero: "/landing/hero.jpg",
    showcasePlay: "/landing/showcase-play.jpg",
    showcaseTrain: "/landing/showcase-train.jpg",
    showcaseScouted: "/landing/showcase-scouted.jpg",
    audienceAthlete: "/landing/audience-athlete.jpg",
    audienceTeam: "/landing/audience-team.jpg",
    audienceAcademy: "/landing/audience-academy.jpg",
    audienceCoach: "/landing/audience-coach.jpg",
    audienceScout: "/landing/audience-scout.jpg",
    ctaBg: "/landing/cta-bg.jpg",
} as const;

// ── Ticker (duplicated for a seamless -50% marquee loop) ──────────
export const tickerItems = [
    "Players", "Football", "Clubs", "Scouts", "Coaches", "Academies",
    "Trials", "Talent", "Discovery", "Recruitment", "Goatza",
    "Players", "Football", "Clubs", "Scouts", "Coaches", "Academies",
    "Trials", "Talent", "Discovery", "Recruitment", "Goatza",
];

// ── Football Showcase — full-photo cards (the real journey) ───────
export interface ShowcaseCard {
    key: string;
    img: string;
    icon: string;
    label: string;
    line: string;
    alt: string;
}

export const showcaseCards: ShowcaseCard[] = [
    {
        key: "post",
        img: landingImages.showcasePlay,
        icon: "mdi:soccer",
        label: "Showcase",
        line: "Post your skills and your best match-day moments for the football world to see.",
        alt: "Footballer showing their skills during a match",
    },
    {
        key: "discovered",
        img: landingImages.showcaseScouted,
        icon: "mdi:radar",
        label: "Get Discovered",
        line: "Scouts, clubs and academies are on Goatza searching for talent like you.",
        alt: "Scout watching players during a football trial",
    },
    {
        key: "selected",
        img: landingImages.showcaseTrain,
        icon: "mdi:trophy-outline",
        label: "Get Selected",
        line: "Find open trials, apply in a tap, and earn your spot.",
        alt: "Young footballers training on the pitch",
    },
];

// ── Features ──────────────────────────────────────────────────────
export const features = [
    { icon: "mdi:account-star-outline", title: "Player Profiles", body: "Your position, highlight reels, and best moments in one verified football identity." },
    { icon: "mdi:radar", title: "Smart Discovery", body: "Scouts filter by position, age group, and region — then reach out in seconds." },
    { icon: "mdi:whistle-outline", title: "Club & Academy Tools", body: "Post trials, run intakes, and manage your recruitment pipeline in one place." },
    { icon: "mdi:message-text-outline", title: "Direct Messaging", body: "No middlemen. Players and recruiters connect and build relationships right on the platform." },
];

// ── How It Works ──────────────────────────────────────────────────
export const steps = [
    { num: "01", title: "Build Your Profile", body: "Create your football identity — position, bio, and highlight reels." },
    { num: "02", title: "Showcase & Get Discovered", body: "Post your skills and match moments. Scouts and clubs search Goatza 24/7." },
    { num: "03", title: "Apply & Rise", body: "Apply to open trials, get selected, grow your following — and rise to higher levels of the game." },
];

// ── Personas — "Which one are you?" selector ──────────────────────
export interface Persona {
    key: string;
    label: string;
    icon: string;
    img: string;
    imgAlt: string;
    tagline: string;
    benefits: string[];
    comingSoon?: string;
}

export const personas: Persona[] = [
    {
        key: "player",
        label: "Player",
        icon: "mdi:run-fast",
        img: landingImages.audienceAthlete,
        imgAlt: "Footballer portrait",
        tagline: "Your talent, seen by the right people.",
        benefits: [
            "Post your skills & match highlights",
            "Get discovered by scouts, clubs & academies",
            "Find & apply to open trials — and get selected",
            "Grow followers & connect with nearby players",
        ],
    },
    {
        key: "club",
        label: "Club",
        icon: "mdi:shield-crown-outline",
        img: landingImages.audienceTeam,
        imgAlt: "Football club squad together on the pitch",
        tagline: "Find the players your club needs.",
        benefits: [
            "Find verified players fast",
            "Post trials & selection calls",
            "Get matching players for every recruitment",
            "Message and sign talent directly",
        ],
    },
    {
        key: "team",
        label: "Team",
        icon: "mdi:account-group-outline",
        img: landingImages.audienceTeam,
        imgAlt: "Football team huddled together before kick-off",
        tagline: "Build your squad, one signing at a time.",
        benefits: [
            "Build your team profile & post as the team",
            "Search players by position, age & region",
            "Run trials & selections in one pipeline",
            "Get matching players automatically",
        ],
    },
    {
        key: "academy",
        label: "Academy",
        icon: "mdi:school-outline",
        img: landingImages.audienceAcademy,
        imgAlt: "Young players training at a football academy",
        tagline: "Where the next generation gets found.",
        benefits: [
            "List programmes & intake drives",
            "Discover players at every level",
            "Get matching applicants for each intake",
            "Build your academy's reputation",
        ],
    },
    {
        key: "coach",
        label: "Coach",
        icon: "mdi:whistle-outline",
        img: landingImages.audienceCoach,
        imgAlt: "Football coach on the touchline",
        tagline: "Follow the talent. Shape the talent.",
        benefits: [
            "Browse & follow player content",
            "Save players to your shortlist",
            "Discover talent near you",
        ],
        comingSoon: "More coaching tools coming soon",
    },
    {
        key: "scout",
        label: "Scout",
        icon: "mdi:binoculars",
        img: landingImages.audienceScout,
        imgAlt: "Scout watching players at a football match",
        tagline: "Every pitch, one watchlist.",
        benefits: [
            "Discover players by position, age & region",
            "Save & shortlist standout players",
            "Follow their journey and highlights",
        ],
        comingSoon: "More scout tools coming soon",
    },
];

// ── Product Preview — coded UI mock (fictional data) ──────────────
export const productPreview = {
    profile: {
        initials: "JM",
        name: "Jordan Marsh",
        handle: "@jmarsh",
        verified: true,
        chips: ["Football", "Striker", "U-19"],
        stats: [
            { value: "86", label: "Posts" },
            { value: "1.2k", label: "Followers" },
            { value: "348", label: "Following" },
        ],
        attributes: ["Pace", "Finishing", "Left Foot"],
        toast: "Invited to trials",
    },
    recruitment: {
        clubInitials: "RF",
        club: "Riverside FC",
        title: "Open Trials — U-19 Strikers",
        location: "Manchester, UK",
        date: "Sat 26 Jul",
        applicants: "24 applicants",
    },
    scout: {
        query: "Strikers, U-19",
        filters: ["Position", "Age Group", "Region"],
        results: [
            { initials: "AC", name: "Aiden Cole", meta: "ST · U-19 · London" },
            { initials: "LM", name: "Leo Martins", meta: "ST · U-18 · Leeds" },
            { initials: "KB", name: "Kai Brooks", meta: "ST · U-19 · Bristol" },
        ],
    },
} as const;
