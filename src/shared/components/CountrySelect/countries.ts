/**
 * ISO-3166-1 alpha-2 countries, with their international dialling codes.
 *
 * The `code` is the only thing that leaves this file — it is what gets stored
 * on the user and what the backend's per-country consent-age table is keyed by
 * (see accounts/constants.py in goatza-backend). The name is for reading and
 * the dial code is for searching ("+91" finds India) and for the prefill.
 *
 * Ordered alphabetically by name, which is the order the dropdown renders in.
 */

export type Country = {
  /** ISO-3166-1 alpha-2, uppercase. The stored value. */
  code: string
  name: string
  /** International dialling code, digits only, no "+". */
  dial: string
}

export const COUNTRIES: Country[] = [
  { code: "AF", name: "Afghanistan", dial: "93" },
  { code: "AL", name: "Albania", dial: "355" },
  { code: "DZ", name: "Algeria", dial: "213" },
  { code: "AD", name: "Andorra", dial: "376" },
  { code: "AO", name: "Angola", dial: "244" },
  { code: "AG", name: "Antigua and Barbuda", dial: "1" },
  { code: "AR", name: "Argentina", dial: "54" },
  { code: "AM", name: "Armenia", dial: "374" },
  { code: "AU", name: "Australia", dial: "61" },
  { code: "AT", name: "Austria", dial: "43" },
  { code: "AZ", name: "Azerbaijan", dial: "994" },
  { code: "BS", name: "Bahamas", dial: "1" },
  { code: "BH", name: "Bahrain", dial: "973" },
  { code: "BD", name: "Bangladesh", dial: "880" },
  { code: "BB", name: "Barbados", dial: "1" },
  { code: "BY", name: "Belarus", dial: "375" },
  { code: "BE", name: "Belgium", dial: "32" },
  { code: "BZ", name: "Belize", dial: "501" },
  { code: "BJ", name: "Benin", dial: "229" },
  { code: "BT", name: "Bhutan", dial: "975" },
  { code: "BO", name: "Bolivia", dial: "591" },
  { code: "BA", name: "Bosnia and Herzegovina", dial: "387" },
  { code: "BW", name: "Botswana", dial: "267" },
  { code: "BR", name: "Brazil", dial: "55" },
  { code: "BN", name: "Brunei", dial: "673" },
  { code: "BG", name: "Bulgaria", dial: "359" },
  { code: "BF", name: "Burkina Faso", dial: "226" },
  { code: "BI", name: "Burundi", dial: "257" },
  { code: "KH", name: "Cambodia", dial: "855" },
  { code: "CM", name: "Cameroon", dial: "237" },
  { code: "CA", name: "Canada", dial: "1" },
  { code: "CV", name: "Cape Verde", dial: "238" },
  { code: "CF", name: "Central African Republic", dial: "236" },
  { code: "TD", name: "Chad", dial: "235" },
  { code: "CL", name: "Chile", dial: "56" },
  { code: "CN", name: "China", dial: "86" },
  { code: "CO", name: "Colombia", dial: "57" },
  { code: "KM", name: "Comoros", dial: "269" },
  { code: "CG", name: "Congo", dial: "242" },
  { code: "CD", name: "Congo (DRC)", dial: "243" },
  { code: "CR", name: "Costa Rica", dial: "506" },
  { code: "CI", name: "Côte d'Ivoire", dial: "225" },
  { code: "HR", name: "Croatia", dial: "385" },
  { code: "CU", name: "Cuba", dial: "53" },
  { code: "CY", name: "Cyprus", dial: "357" },
  { code: "CZ", name: "Czechia", dial: "420" },
  { code: "DK", name: "Denmark", dial: "45" },
  { code: "DJ", name: "Djibouti", dial: "253" },
  { code: "DM", name: "Dominica", dial: "1" },
  { code: "DO", name: "Dominican Republic", dial: "1" },
  { code: "EC", name: "Ecuador", dial: "593" },
  { code: "EG", name: "Egypt", dial: "20" },
  { code: "SV", name: "El Salvador", dial: "503" },
  { code: "GQ", name: "Equatorial Guinea", dial: "240" },
  { code: "ER", name: "Eritrea", dial: "291" },
  { code: "EE", name: "Estonia", dial: "372" },
  { code: "SZ", name: "Eswatini", dial: "268" },
  { code: "ET", name: "Ethiopia", dial: "251" },
  { code: "FJ", name: "Fiji", dial: "679" },
  { code: "FI", name: "Finland", dial: "358" },
  { code: "FR", name: "France", dial: "33" },
  { code: "GA", name: "Gabon", dial: "241" },
  { code: "GM", name: "Gambia", dial: "220" },
  { code: "GE", name: "Georgia", dial: "995" },
  { code: "DE", name: "Germany", dial: "49" },
  { code: "GH", name: "Ghana", dial: "233" },
  { code: "GR", name: "Greece", dial: "30" },
  { code: "GD", name: "Grenada", dial: "1" },
  { code: "GT", name: "Guatemala", dial: "502" },
  { code: "GN", name: "Guinea", dial: "224" },
  { code: "GW", name: "Guinea-Bissau", dial: "245" },
  { code: "GY", name: "Guyana", dial: "592" },
  { code: "HT", name: "Haiti", dial: "509" },
  { code: "HN", name: "Honduras", dial: "504" },
  { code: "HK", name: "Hong Kong", dial: "852" },
  { code: "HU", name: "Hungary", dial: "36" },
  { code: "IS", name: "Iceland", dial: "354" },
  { code: "IN", name: "India", dial: "91" },
  { code: "ID", name: "Indonesia", dial: "62" },
  { code: "IR", name: "Iran", dial: "98" },
  { code: "IQ", name: "Iraq", dial: "964" },
  { code: "IE", name: "Ireland", dial: "353" },
  { code: "IL", name: "Israel", dial: "972" },
  { code: "IT", name: "Italy", dial: "39" },
  { code: "JM", name: "Jamaica", dial: "1" },
  { code: "JP", name: "Japan", dial: "81" },
  { code: "JO", name: "Jordan", dial: "962" },
  { code: "KZ", name: "Kazakhstan", dial: "7" },
  { code: "KE", name: "Kenya", dial: "254" },
  { code: "KI", name: "Kiribati", dial: "686" },
  { code: "KW", name: "Kuwait", dial: "965" },
  { code: "KG", name: "Kyrgyzstan", dial: "996" },
  { code: "LA", name: "Laos", dial: "856" },
  { code: "LV", name: "Latvia", dial: "371" },
  { code: "LB", name: "Lebanon", dial: "961" },
  { code: "LS", name: "Lesotho", dial: "266" },
  { code: "LR", name: "Liberia", dial: "231" },
  { code: "LY", name: "Libya", dial: "218" },
  { code: "LI", name: "Liechtenstein", dial: "423" },
  { code: "LT", name: "Lithuania", dial: "370" },
  { code: "LU", name: "Luxembourg", dial: "352" },
  { code: "MO", name: "Macao", dial: "853" },
  { code: "MG", name: "Madagascar", dial: "261" },
  { code: "MW", name: "Malawi", dial: "265" },
  { code: "MY", name: "Malaysia", dial: "60" },
  { code: "MV", name: "Maldives", dial: "960" },
  { code: "ML", name: "Mali", dial: "223" },
  { code: "MT", name: "Malta", dial: "356" },
  { code: "MH", name: "Marshall Islands", dial: "692" },
  { code: "MR", name: "Mauritania", dial: "222" },
  { code: "MU", name: "Mauritius", dial: "230" },
  { code: "MX", name: "Mexico", dial: "52" },
  { code: "FM", name: "Micronesia", dial: "691" },
  { code: "MD", name: "Moldova", dial: "373" },
  { code: "MC", name: "Monaco", dial: "377" },
  { code: "MN", name: "Mongolia", dial: "976" },
  { code: "ME", name: "Montenegro", dial: "382" },
  { code: "MA", name: "Morocco", dial: "212" },
  { code: "MZ", name: "Mozambique", dial: "258" },
  { code: "MM", name: "Myanmar", dial: "95" },
  { code: "NA", name: "Namibia", dial: "264" },
  { code: "NR", name: "Nauru", dial: "674" },
  { code: "NP", name: "Nepal", dial: "977" },
  { code: "NL", name: "Netherlands", dial: "31" },
  { code: "NZ", name: "New Zealand", dial: "64" },
  { code: "NI", name: "Nicaragua", dial: "505" },
  { code: "NE", name: "Niger", dial: "227" },
  { code: "NG", name: "Nigeria", dial: "234" },
  { code: "KP", name: "North Korea", dial: "850" },
  { code: "MK", name: "North Macedonia", dial: "389" },
  { code: "NO", name: "Norway", dial: "47" },
  { code: "OM", name: "Oman", dial: "968" },
  { code: "PK", name: "Pakistan", dial: "92" },
  { code: "PW", name: "Palau", dial: "680" },
  { code: "PS", name: "Palestine", dial: "970" },
  { code: "PA", name: "Panama", dial: "507" },
  { code: "PG", name: "Papua New Guinea", dial: "675" },
  { code: "PY", name: "Paraguay", dial: "595" },
  { code: "PE", name: "Peru", dial: "51" },
  { code: "PH", name: "Philippines", dial: "63" },
  { code: "PL", name: "Poland", dial: "48" },
  { code: "PT", name: "Portugal", dial: "351" },
  { code: "PR", name: "Puerto Rico", dial: "1" },
  { code: "QA", name: "Qatar", dial: "974" },
  { code: "RO", name: "Romania", dial: "40" },
  { code: "RU", name: "Russia", dial: "7" },
  { code: "RW", name: "Rwanda", dial: "250" },
  { code: "KN", name: "Saint Kitts and Nevis", dial: "1" },
  { code: "LC", name: "Saint Lucia", dial: "1" },
  { code: "VC", name: "Saint Vincent and the Grenadines", dial: "1" },
  { code: "WS", name: "Samoa", dial: "685" },
  { code: "SM", name: "San Marino", dial: "378" },
  { code: "ST", name: "São Tomé and Príncipe", dial: "239" },
  { code: "SA", name: "Saudi Arabia", dial: "966" },
  { code: "SN", name: "Senegal", dial: "221" },
  { code: "RS", name: "Serbia", dial: "381" },
  { code: "SC", name: "Seychelles", dial: "248" },
  { code: "SL", name: "Sierra Leone", dial: "232" },
  { code: "SG", name: "Singapore", dial: "65" },
  { code: "SK", name: "Slovakia", dial: "421" },
  { code: "SI", name: "Slovenia", dial: "386" },
  { code: "SB", name: "Solomon Islands", dial: "677" },
  { code: "SO", name: "Somalia", dial: "252" },
  { code: "ZA", name: "South Africa", dial: "27" },
  { code: "KR", name: "South Korea", dial: "82" },
  { code: "SS", name: "South Sudan", dial: "211" },
  { code: "ES", name: "Spain", dial: "34" },
  { code: "LK", name: "Sri Lanka", dial: "94" },
  { code: "SD", name: "Sudan", dial: "249" },
  { code: "SR", name: "Suriname", dial: "597" },
  { code: "SE", name: "Sweden", dial: "46" },
  { code: "CH", name: "Switzerland", dial: "41" },
  { code: "SY", name: "Syria", dial: "963" },
  { code: "TW", name: "Taiwan", dial: "886" },
  { code: "TJ", name: "Tajikistan", dial: "992" },
  { code: "TZ", name: "Tanzania", dial: "255" },
  { code: "TH", name: "Thailand", dial: "66" },
  { code: "TL", name: "Timor-Leste", dial: "670" },
  { code: "TG", name: "Togo", dial: "228" },
  { code: "TO", name: "Tonga", dial: "676" },
  { code: "TT", name: "Trinidad and Tobago", dial: "1" },
  { code: "TN", name: "Tunisia", dial: "216" },
  { code: "TR", name: "Türkiye", dial: "90" },
  { code: "TM", name: "Turkmenistan", dial: "993" },
  { code: "TV", name: "Tuvalu", dial: "688" },
  { code: "UG", name: "Uganda", dial: "256" },
  { code: "UA", name: "Ukraine", dial: "380" },
  { code: "AE", name: "United Arab Emirates", dial: "971" },
  { code: "GB", name: "United Kingdom", dial: "44" },
  { code: "US", name: "United States", dial: "1" },
  { code: "UY", name: "Uruguay", dial: "598" },
  { code: "UZ", name: "Uzbekistan", dial: "998" },
  { code: "VU", name: "Vanuatu", dial: "678" },
  { code: "VA", name: "Vatican City", dial: "39" },
  { code: "VE", name: "Venezuela", dial: "58" },
  { code: "VN", name: "Vietnam", dial: "84" },
  { code: "YE", name: "Yemen", dial: "967" },
  { code: "ZM", name: "Zambia", dial: "260" },
  { code: "ZW", name: "Zimbabwe", dial: "263" },
]

/**
 * The fallback prefill. India is where the users are; picking the modal answer
 * is worth more than picking a neutral one, because the cost of a wrong
 * default is one search and the cost of no default is a search for everybody.
 */
export const DEFAULT_COUNTRY_CODE = "IN"

/**
 * Dialling codes shared by several countries, and which one wins the prefill.
 *
 * "+1" is the NANP — the US, Canada and twenty-odd Caribbean states — and "+7"
 * is Russia and Kazakhstan. There is no way to tell them apart from the code
 * alone, so the most populous member takes it. This only decides what the
 * dropdown OPENS on; it is always changeable, which is what makes an
 * imperfect guess cheap.
 */
const AMBIGUOUS_DIAL_WINNER: Record<string, string> = {
  "1": "US",
  "7": "RU",
  "39": "IT",
}

const COUNTRY_BY_DIAL: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const country of COUNTRIES) {
    if (!(country.dial in map)) map[country.dial] = country.code
  }
  return { ...map, ...AMBIGUOUS_DIAL_WINNER }
})()

// Longest first, so "+353" is never read as "+35" and "+91" never as "+9".
const DIAL_CODES_LONGEST_FIRST = Object.keys(COUNTRY_BY_DIAL).sort(
  (a, b) => b.length - a.length,
)

/**
 * The country implied by a phone number's international dialling code, or "".
 *
 * Requires a leading "+". A number in national format carries no country code
 * at all, and guessing one from a bare "9876543210" would be a guess about the
 * user rather than a reading of what they typed.
 */
export function countryFromPhone(phone: string | null | undefined): string {
  if (!phone) return ""

  const trimmed = phone.trim()
  if (!trimmed.startsWith("+")) return ""

  const digits = trimmed.slice(1).replace(/[\s-()]/g, "")
  if (!/^\d+$/.test(digits)) return ""

  for (const dial of DIAL_CODES_LONGEST_FIRST) {
    if (digits.startsWith(dial)) return COUNTRY_BY_DIAL[dial]
  }

  return ""
}

/**
 * What the country field should start on.
 *
 * Derived from the phone number when signing up by phone, otherwise the
 * default. Never empty — an empty select is a search through 190 entries, and
 * making everybody do that to catch the minority who need to is the wrong
 * trade.
 */
export function defaultCountryCode(phone?: string | null): string {
  return countryFromPhone(phone) || DEFAULT_COUNTRY_CODE
}

const COUNTRY_BY_CODE: Record<string, Country> = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, c]),
)

export function findCountry(code: string | null | undefined): Country | null {
  if (!code) return null
  return COUNTRY_BY_CODE[code.toUpperCase()] ?? null
}
