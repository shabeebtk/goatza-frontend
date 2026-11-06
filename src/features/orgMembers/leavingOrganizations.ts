/**
 * Organizations this device is leaving right now.
 *
 * Leaving ends with the server sending this device an "org_membership_changed"
 * event, and it can arrive before the HTTP response. Whoever acts on it first
 * would otherwise show the person a second toast ("You're no longer a member")
 * for something they just did. Memory only: it lasts one request.
 */

const leaving = new Set<string>()

export const markLeaving = (organizationId: string) => {
  leaving.add(organizationId)
}

export const unmarkLeaving = (organizationId: string) => {
  leaving.delete(organizationId)
}

export const isLeaving = (organizationId: string) => leaving.has(organizationId)
