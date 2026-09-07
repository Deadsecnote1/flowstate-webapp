export function utcNowIso(): string {
  return new Date().toISOString()
}

/** Accept Postgres `+00:00` and `Date.toISOString()` `Z` forms. */
export function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null
  const text = value.trim().replace(/Z$/i, '+00:00')
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

/** Pull cursor: last sync minus a small buffer, matching Linux `delta_since`. */
export function deltaSince(iso: string | null | undefined, bufferSeconds = 10): string {
  if (!iso) return '1970-01-01T00:00:00.000Z'
  const parsed = parseIso(iso)
  if (!parsed) return '1970-01-01T00:00:00.000Z'
  return new Date(parsed.getTime() - bufferSeconds * 1000).toISOString()
}
