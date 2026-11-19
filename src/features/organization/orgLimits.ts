/**
 * Limits on an org's own fields that more than one screen enforces. The edit
 * modal and the page's About editor both write `description` through
 * PATCH organizations/update, so they count to the same number.
 */
export const ORG_DESCRIPTION_MAX = 2000
