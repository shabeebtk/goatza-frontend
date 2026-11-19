/**
 * The page as visitors read it (GET page/showcase/<username>), shaped like the
 * server's payload: an academy with everything filled and the form on, and a
 * club with the form off, in the club order (squads and trials early, programs
 * later). Tests copy and trim these rather than build their own.
 */

import type { PageShowcase, Program, ShowcaseCoach, ShowcasePlayer } from "../types"

export const program = (overrides: Partial<Program> = {}): Program => ({
  id: "prog-1",
  name: "U12 Football Foundation",
  sport: { id: "sport-1", name: "Football" },
  age_min: 8,
  age_max: 12,
  level: "beginner",
  level_label: "Beginner",
  days: ["tue", "thu", "sat"],
  start_time: "16:30",
  end_time: "18:00",
  location: { id: "loc-2", name: "Main Ground", city: "Kannur" },
  fee: { mode: "amount", amount: 1500, currency: "INR", per: "month" },
  free_trial: true,
  spots: "open",
  spots_label: "Spots open",
  ...overrides,
})

export const coach = (overrides: Partial<ShowcaseCoach> = {}): ShowcaseCoach => ({
  id: "coach-1",
  name: "Meera Nair",
  username: "meeranair",
  photo: "",
  role_label: "Head coach",
  licence: "AFC C Licence",
  years_coaching: 12,
  ...overrides,
})

export const player = (overrides: Partial<ShowcasePlayer> = {}): ShowcasePlayer => ({
  username: "adityamenon",
  name: "Aditya Menon",
  photo: "",
  position: "Goalkeeper",
  years_label: "2019 – 2023",
  now_at: "Gokulam Kerala",
  highlight: null,
  ...overrides,
})

const ALL_ON = {
  about: true,
  programs: true,
  facilities: true,
  coaches: true,
  players: true,
  squads: true,
  locations: true,
  trials: true,
}

export const ACADEMY_PAGE: PageShowcase = {
  organization: { id: "org-1", username: "kannurfa", name: "Kannur Football Academy", type: "academy" },
  contact: {
    enquiry_form: true,
    whatsapp: "+919876543210",
    call: "+919812345678",
    email: "hello@kannurfa.in",
  },
  order: ["about", "programs", "facilities", "coaches", "players", "squads", "locations", "trials", "posts"],
  sections: ALL_ON,
  facts: {
    founded_year: 2012,
    age_min: 6,
    age_max: 18,
    coaching_languages: ["Malayalam", "English"],
    training_days: ["tue", "thu", "sat"],
    student_range: "100_200",
    student_range_label: "100–200",
    links: { instagram: "https://instagram.com/kannurfa", youtube: null, facebook: null },
  },
  programs: [
    program(),
    program({ id: "prog-2", name: "U16 Development", age_min: 13, age_max: 16, location: null }),
  ],
  facilities: [
    {
      location: { id: "loc-1", name: "Thana Turf", city: "Kannur" },
      items: [{ key: "floodlights", label: "Floodlights", group: "playing_area" }],
      custom_items: ["Physio room"],
      photos: [{ id: "ph-1", url: "https://media.goatza.com/f/1.webp" }],
    },
  ],
  coaches: [coach()],
  players: [player()],
}

export const CLUB_PAGE: PageShowcase = {
  organization: { id: "org-2", username: "thalassery", name: "Thalassery United", type: "club" },
  contact: { enquiry_form: false, whatsapp: "+919876543210", call: "+919812345678", email: null },
  order: ["about", "squads", "trials", "coaches", "players", "programs", "facilities", "locations", "posts"],
  sections: ALL_ON,
  facts: null,
  programs: [program()],
  facilities: [],
  coaches: [coach()],
  players: [player()],
}

/** The profile bundle's branches, as OrganizationProfile hands them over. */
export const LOCATIONS = [
  {
    id: "loc-1",
    name: "Thana Turf",
    address: "Thana Road",
    city: "Kannur",
    state: "Kerala",
    country_code: "IN",
    latitude: 11.87,
    longitude: 75.37,
    is_primary: true,
  },
  {
    id: "loc-2",
    name: "Main Ground",
    address: "Stadium Road",
    city: "Kannur",
    state: "Kerala",
    country_code: "IN",
    latitude: null,
    longitude: null,
    is_primary: false,
  },
]
