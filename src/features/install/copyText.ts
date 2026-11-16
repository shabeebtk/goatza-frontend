/**
 * Copy text to the clipboard, falling back to a hidden textarea and
 * execCommand where the Clipboard API is missing or refused. In-app browsers
 * (Instagram, Facebook) are exactly where it is refused, and they are where
 * the install page asks people to copy its link. Resolves to whether it
 * worked; never throws.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Refused: try the old way below.
  }

  try {
    const area = document.createElement("textarea")
    area.value = text
    area.setAttribute("readonly", "")
    area.style.position = "fixed"
    area.style.top = "0"
    area.style.opacity = "0"
    document.body.appendChild(area)
    area.select()
    const copied = document.execCommand("copy")
    area.remove()
    return copied
  } catch {
    return false
  }
}
