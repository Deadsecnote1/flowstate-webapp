import { supabase } from '../lib/supabase.ts'
import {
  drainTaskQueue,
  listAllTasks,
  loadLastSyncAt,
  requeueTaskIds,
  saveLastSyncAt,
} from '../db/tasks.ts'
import { applyRemoteTask, taskToRow } from './merge.ts'
import { deltaSince, utcNowIso } from './time.ts'
import { db } from '../db/db.ts'

let syncing = false

export async function syncNow(): Promise<string> {
  if (!supabase) return 'Sync not configured'
  if (syncing) return 'Sync already running'

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) return sessionError.message
  if (!sessionData.session) return 'Not signed in'

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
  if (refreshError || !refreshed.session?.user.id) {
    return 'Session expired — sign in again'
  }

  const userId = refreshed.session.user.id
  syncing = true
  try {
    const pulled = await pullTasks()
    const pushed = await pushTasks(userId)
    await saveLastSyncAt(utcNowIso())
    return `Synced (${pulled} pulled, ${pushed} pushed)`
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed'
    return message.startsWith('Sync failed') ? message : `Sync failed: ${message}`
  } finally {
    syncing = false
  }
}

async function pullTasks(): Promise<number> {
  if (!supabase) return 0
  const since = deltaSince(await loadLastSyncAt())
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, completed, notes, created_at, client_updated_at, deleted_at')
    .gt('server_updated_at', since)

  if (error) throw new Error(error.message)

  const rows = data ?? []
  let applied = 0
  await db.transaction('rw', db.tasks, async () => {
    let current = await db.tasks.toArray()
    for (const row of rows) {
      const result = applyRemoteTask(current, row)
      if (!result.applied) continue
      applied += 1
      current = result.items
    }
    if (applied > 0) {
      await db.tasks.bulkPut(current)
    }
  })
  return applied
}

async function pushTasks(userId: string): Promise<number> {
  if (!supabase) return 0

  let ids = await drainTaskQueue()
  if (ids.length === 0) {
    const all = await listAllTasks()
    ids = all.map((item) => item.id)
  }

  const uniqueIds = [...new Set(ids)]
  try {
    const rows = []
    for (const id of uniqueIds) {
      const item = await db.tasks.get(id)
      if (item) rows.push(taskToRow(item, userId))
    }

    if (rows.length === 0) return 0

    const { error } = await supabase.from('tasks').upsert(rows)
    if (error) throw new Error(error.message)
    return rows.length
  } catch (error) {
    await requeueTaskIds(uniqueIds)
    throw error
  }
}
