/**
 * Real GET page/admin answers, recorded from the backend (2026-11-19): a fresh
 * academy with one branch, then the same academy with two programs, three
 * catalog facilities + one of its own and a photo, a visible and a hidden coach,
 * a description, and Players switched off. Test data only.
 */

import type { PageAdmin, PageSections, PageSettings } from "../types"

export const FRESH_SECTIONS: PageSections = {
  about: { enabled: true, switchable: true, filled: false },
  programs: { enabled: true, switchable: true, count: 0 },
  facilities: { enabled: true, switchable: true, items: 0, photos: 0 },
  coaches: { enabled: true, switchable: true, count: 0 },
  players: { enabled: true, switchable: true, count: 0 },
  squads: { enabled: true, switchable: true, count: 0 },
  locations: { enabled: true, switchable: true, count: 1 },
  trials: { enabled: true, switchable: true, count: 0 },
  posts: { enabled: true, switchable: false, count: 0 },
}

export const FILLED_SECTIONS: PageSections = {
  about: { enabled: true, switchable: true, filled: true },
  programs: { enabled: true, switchable: true, count: 2 },
  facilities: { enabled: true, switchable: true, items: 4, photos: 1 },
  coaches: { enabled: true, switchable: true, count: 1 },
  players: { enabled: false, switchable: true, count: 0 },
  squads: { enabled: true, switchable: true, count: 0 },
  locations: { enabled: true, switchable: true, count: 1 },
  trials: { enabled: true, switchable: true, count: 0 },
  posts: { enabled: true, switchable: false, count: 0 },
}

export const SETTINGS: PageSettings = {
  contact: {
    enquiry_form_enabled: true,
    whatsapp_enabled: false,
    whatsapp_number: "",
    call_enabled: false,
    call_number: "",
    email_enabled: false,
    contact_email: "",
  },
  facts: {
    founded_year: null,
    age_min: null,
    age_max: null,
    coaching_languages: [],
    training_days: [],
    student_range: "",
    student_range_label: "",
    instagram_url: "",
    youtube_url: "",
    facebook_url: "",
  },
  sections: {
    about: true,
    programs: true,
    facilities: true,
    coaches: true,
    players: true,
    squads: true,
    locations: true,
    trials: true,
  },
}

export const FRESH_ADMIN: PageAdmin = {
  settings: SETTINGS,
  can_edit: true,
  sections: FRESH_SECTIONS,
  readiness: {
    percent: 20,
    next: { key: "programs", label: "Add your programs" },
    items: [
      { key: "programs", label: "Add your programs", done: false },
      { key: "facilities", label: "Add your facilities", done: false },
      { key: "coaches", label: "Add your coaches", done: false },
      { key: "about", label: "Write about your page", done: false },
      { key: "facts", label: "Add key facts", done: false },
      { key: "photos", label: "Add a logo and cover", done: false },
      { key: "location", label: "Add a location", done: true },
      { key: "contact", label: "Choose how people reach you", done: true },
    ],
  },
}

export const FILLED_ADMIN: PageAdmin = {
  settings: { ...SETTINGS, sections: { ...SETTINGS.sections, players: false } },
  can_edit: true,
  sections: FILLED_SECTIONS,
  readiness: { ...FRESH_ADMIN.readiness, percent: 80, next: { key: "facts", label: "Add key facts" } },
}
