// A person's full name: letters (including accented/ñ), spaces, apostrophes,
// and hyphens for compound names (e.g. "María José", "Peña-Gómez",
// "O'Connor"). Rejects digits and other symbols.
const FULL_NAME_RE = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'-]*$/

export function isValidFullName(name: string): boolean {
  return FULL_NAME_RE.test(name.trim())
}
