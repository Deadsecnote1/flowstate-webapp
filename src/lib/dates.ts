export function todayKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDays(key: string, delta: number): string {
  const [year, month, day] = key.split('-').map(Number)
  const next = new Date(year, (month || 1) - 1, day || 1)
  next.setDate(next.getDate() + delta)
  return todayKey(next)
}

export function formatDayLabel(key: string): string {
  const today = todayKey()
  if (key === today) return 'Today'
  if (key === addDays(today, 1)) return 'Tomorrow'
  if (key === addDays(today, -1)) return 'Yesterday'
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function formatClock(minutes: number): string {
  const clamped = ((Math.trunc(minutes) % (24 * 60)) + 24 * 60) % (24 * 60)
  const hours = Math.floor(clamped / 60)
  const mins = clamped % 60
  const suffix = hours < 12 ? 'AM' : 'PM'
  const hour12 = hours % 12 || 12
  return `${hour12}:${String(mins).padStart(2, '0')} ${suffix}`
}

export function minutesToTimeInput(minutes: number): string {
  const clamped = Math.min(24 * 60 - 1, Math.max(0, Math.trunc(minutes)))
  const hours = Math.floor(clamped / 60)
  const mins = clamped % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

export function timeInputToMinutes(value: string): number {
  const [hours, mins] = value.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return 9 * 60
  return Math.min(24 * 60 - 1, Math.max(0, hours * 60 + mins))
}
