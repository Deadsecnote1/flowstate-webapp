import type { RemoteTaskRow, Task } from '../types/task.ts'
import { parseIso, utcNowIso } from './time.ts'

/** Last-write-wins on `client_updated_at`. Equal timestamps count as remote newer. */
export function remoteIsNewer(
  localClientUpdatedAt: string,
  remoteRow: { client_updated_at?: string | null },
): boolean {
  const remoteClient = parseIso(remoteRow.client_updated_at)
  const localClient = parseIso(localClientUpdatedAt)
  if (remoteClient === null) return true
  if (localClient === null) return true
  return remoteClient.getTime() >= localClient.getTime()
}

export function visibleTasks(items: readonly Task[]): Task[] {
  return items.filter((item) => item.deleted_at == null)
}

export function taskToRow(item: Task, userId: string) {
  return {
    id: item.id,
    user_id: userId,
    title: item.title,
    completed: item.completed,
    notes: item.notes,
    created_at: item.created_at,
    client_updated_at: item.client_updated_at,
    deleted_at: item.deleted_at,
  }
}

/** Apply a remote row if it is newer or equal. Does not drop a newer local tombstone. */
export function applyRemoteTask(
  items: readonly Task[],
  row: RemoteTaskRow,
): { items: Task[]; applied: boolean } {
  const itemId = String(row.id ?? '')
  if (!itemId) return { items: [...items], applied: false }

  const existingIndex = items.findIndex((item) => item.id === itemId)
  const existing = existingIndex >= 0 ? items[existingIndex] : undefined
  if (existing && !remoteIsNewer(existing.client_updated_at, row)) {
    return { items: [...items], applied: false }
  }

  const now = utcNowIso()
  const next: Task = {
    id: itemId,
    title: String(row.title ?? ''),
    completed: Boolean(row.completed),
    notes: String(row.notes ?? ''),
    created_at: String(row.created_at || now),
    client_updated_at: String(row.client_updated_at || now),
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
  }

  const copy = items.slice()
  if (existingIndex >= 0) copy[existingIndex] = next
  else copy.push(next)
  return { items: copy, applied: true }
}
