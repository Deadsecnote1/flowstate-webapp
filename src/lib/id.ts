/** Unsigned local tasks. Never synced, never shown to a signed-in account. */
export const LOCAL_OWNER = 'local'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export function newTaskId(): string {
  const id = crypto.randomUUID()
  if (!isUuid(id)) throw new Error('Failed to create a task id')
  return id
}
