/**
 * The one-tap ways back to whoever sent an enquiry. Numbers arrive E.164
 * ("+919876543210"), so nothing here has to guess a country.
 */

type GreetingEnquiry = {
  for_whom: "child" | "self"
  player_name: string
  guardian_name: string
  program_name: string
}

/** "tel:+919876543210". */
export function telHref(e164: string): string {
  const digits = (e164 ?? "").replace(/[^\d+]/g, "")
  return `tel:${digits}`
}

/** "https://wa.me/919876543210?text=…": wa.me wants the digits only, no "+". */
export function whatsappHref(e164: string, text: string): string {
  const digits = (e164 ?? "").replace(/\D/g, "")
  const query = text ? `?text=${encodeURIComponent(text)}` : ""
  return `https://wa.me/${digits}${query}`
}

export function firstName(name: string): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? ""
}

/** Who to speak to: the parent or guardian for a child, the player for themselves. */
export function contactPersonName(enquiry: Pick<GreetingEnquiry, "for_whom" | "player_name" | "guardian_name">): string {
  return enquiry.for_whom === "child" && enquiry.guardian_name.trim()
    ? enquiry.guardian_name.trim()
    : enquiry.player_name.trim()
}

/**
 * The WhatsApp opener: "Hi Meera, this is Thrissur Tigers about your enquiry for
 * U12 Football Foundation." A general enquiry is "for joining".
 */
export function whatsappGreeting({ enquiry, orgName }: { enquiry: GreetingEnquiry; orgName: string }): string {
  const name = firstName(contactPersonName(enquiry))
  const hello = name ? `Hi ${name}` : "Hi"
  const about = enquiry.program_name.trim() || "joining"
  return `${hello}, this is ${orgName.trim()} about your enquiry for ${about}.`
}
