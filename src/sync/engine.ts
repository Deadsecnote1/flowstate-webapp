import { supabase } from '../lib/supabase.ts'
import { isUuid } from '../lib/id.ts'
import { isVirtualId } from './planner.ts'
import { db } from '../db/db.ts'
import { drainQueue, requeue, type QueueItem } from '../db/queue.ts'
import { listAllInbox, listPlannerTasks } from '../db/planner.ts'
import { listAllTasks, loadLastSyncAt, saveLastSyncAt } from '../db/tasks.ts'
import { applyRemoteTask, taskToRow } from './merge.ts'
import { applyRemoteInbox, applyRemotePlanner, inboxToRow, plannerToRow } from './planner.ts'
import { deltaSince, utcNowIso } from './time.ts'

let syncing = false

export async function syncNow(): Promise<string | null> {
  if (!supabase) return 'Sync not configured'
  if (syncing) return null

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) return sessionError.message
  if (!sessionData.session) return 'Not signed in'

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
  if (refreshError || !refreshed.session?.user.id) {
    return 'Session expired — sign in again'
  }

  const userId = refreshed.session.user.id
  if (!isUuid(userId)) return 'Not signed in'

  syncing = true
  let attempted: QueueItem[] = []
  try {
    const pulled = await pullAll(userId)
    const pushed = await pushAll(userId, (items) => {
      attempted = items
    })
    await saveLastSyncAt(userId, utcNowIso())
    return `Synced (${pulled} pulled, ${pushed} pushed)`
  } catch (error) {
    if (attempted.length > 0) await requeue(userId, attempted)
    const message = error instanceof Error ? error.message : 'Sync failed'
    return message.startsWith('Sync failed') ? message : `Sync failed: ${message}`
  } finally {
    syncing = false
  }
}

async function pullAll(userId: string): Promise<number> {
  const since = deltaSince(await loadLastSyncAt(userId))
  const [tasks, planner, inbox] = await Promise.all([
    fetchSince('tasks', since),
    fetchSince('planner_tasks', since),
    fetchSince('inbox_items', since),
  ])

  let applied = 0
  applied += await applyTable(db.tasks, tasks, userId, applyRemoteTask)
  applied += await applyTable(db.plannerTasks, planner, userId, applyRemotePlanner)
  applied += await applyTable(db.inboxItems, inbox, userId, applyRemoteInbox)
  return applied
}

async function fetchSince(table: 'tasks' | 'planner_tasks' | 'inbox_items', since: string) {
  if (!supabase) return []
  const { data, error } = await supabase.from(table).select('*').gt('server_updated_at', since)
  if (error) throw new Error(error.message)
  return data ?? []
}

async function applyTable<T extends { ownerId: string }>(
  table: { toArray: () => Promise<T[]>; bulkPut: (rows: T[]) => Promise<unknown> },
  rows: readonly Record<string, unknown>[],
  userId: string,
  apply: (items: T[], row: Record<string, unknown>, ownerId: string) => { items: T[]; applied: boolean },
): Promise<number> {
  if (rows.length === 0) return 0
  let applied = 0
  await db.transaction('rw', table as never, async () => {
    let current = (await table.toArray()).filter((item) => item.ownerId === userId)
    for (const row of rows) {
      const result = apply(current, row, userId)
      if (!result.applied) continue
      applied += 1
      current = result.items
    }
    if (applied > 0) await table.bulkPut(current)
  })
  return applied
}

async function pushAll(userId: string, remember: (items: QueueItem[]) => void): Promise<number> {
  if (!supabase) return 0

  let items = await drainQueue(userId)
  if (items.length === 0) items = await snapshot(userId)
  remember(items)
  if (items.length === 0) return 0

  const taskRows = []
  const plannerRows = []
  const inboxRows = []

  for (const item of items) {
    if (!isUuid(item.entityId) || isVirtualId(item.entityId)) continue
    if (item.entity === 'task') {
      const row = await db.tasks.get(item.entityId)
      if (row && row.ownerId === userId) taskRows.push(taskToRow(row, userId))
    } else if (item.entity === 'planner_task') {
      const row = await db.plannerTasks.get(item.entityId)
      if (row && row.ownerId === userId && !isVirtualId(row.id)) plannerRows.push(plannerToRow(row, userId))
    } else if (item.entity === 'inbox_item') {
      const row = await db.inboxItems.get(item.entityId)
      if (row && row.ownerId === userId) inboxRows.push(inboxToRow(row, userId))
    }
  }

  if (taskRows.length > 0) {
    const { error } = await supabase.from('tasks').upsert(taskRows)
    if (error) throw new Error(error.message)
  }
  if (plannerRows.length > 0) {
    const { error } = await supabase.from('planner_tasks').upsert(plannerRows)
    if (error) throw new Error(error.message)
  }
  if (inboxRows.length > 0) {
    const { error } = await supabase.from('inbox_items').upsert(inboxRows)
    if (error) throw new Error(error.message)
  }

  return taskRows.length + plannerRows.length + inboxRows.length
}

async function snapshot(userId: string): Promise<QueueItem[]> {
  const tasks = await listAllTasks(userId)
  const planner = await listPlannerTasks(userId)
  const inbox = await listAllInbox(userId)
  return [
    ...tasks.filter((item) => isUuid(item.id)).map((item) => ({ entity: 'task' as const, entityId: item.id })),
    ...planner
      .filter((item) => isUuid(item.id) && !isVirtualId(item.id))
      .map((item) => ({ entity: 'planner_task' as const, entityId: item.id })),
    ...inbox.filter((item) => isUuid(item.id)).map((item) => ({ entity: 'inbox_item' as const, entityId: item.id })),
  ]
}
