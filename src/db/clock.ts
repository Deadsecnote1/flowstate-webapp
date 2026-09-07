import { db } from './db.ts'

function clockKey(ownerId: string): string {
  return `clock:${ownerId}`
}

export async function loadTimerSeconds(ownerId: string): Promise<number> {
  const row = await db.clock.get(clockKey(ownerId))
  return row && row.timerSeconds > 0 ? row.timerSeconds : 60
}

export async function saveTimerSeconds(ownerId: string, seconds: number): Promise<void> {
  await db.clock.put({
    key: clockKey(ownerId),
    ownerId,
    timerSeconds: Math.max(0, Math.trunc(seconds)),
  })
}
