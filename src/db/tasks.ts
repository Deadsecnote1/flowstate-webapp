import { db } from './db.ts'
import type { Task } from '../types/task.ts'
import { utcNowIso } from '../sync/time.ts'

function queueId(taskId: string): string {
  return `task:${taskId}`
}

export async function enqueueTask(taskId: string): Promise<void> {
  await db.syncQueue.put({
    id: queueId(taskId),
    entity: 'task',
    entityId: taskId,
    queuedAt: utcNowIso(),
  })
}

export async function listVisibleTasks(): Promise<Task[]> {
  const rows = await db.tasks.toArray()
  return rows
    .filter((row) => row.deleted_at == null)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
}

export async function listAllTasks(): Promise<Task[]> {
  return db.tasks.toArray()
}

export async function addTask(title: string): Promise<Task | null> {
  const trimmed = title.trim()
  if (!trimmed) return null
  const now = utcNowIso()
  const item: Task = {
    id: crypto.randomUUID(),
    title: trimmed,
    completed: false,
    notes: '',
    created_at: now,
    client_updated_at: now,
    deleted_at: null,
  }
  await db.tasks.put(item)
  await enqueueTask(item.id)
  return item
}

export async function toggleTask(id: string): Promise<void> {
  const item = await db.tasks.get(id)
  if (!item || item.deleted_at) return
  await db.tasks.put({
    ...item,
    completed: !item.completed,
    client_updated_at: utcNowIso(),
  })
  await enqueueTask(id)
}

export async function updateTaskTitle(id: string, title: string): Promise<void> {
  const trimmed = title.trim()
  if (!trimmed) return
  const item = await db.tasks.get(id)
  if (!item || item.deleted_at) return
  await db.tasks.put({
    ...item,
    title: trimmed,
    client_updated_at: utcNowIso(),
  })
  await enqueueTask(id)
}

export async function deleteTask(id: string): Promise<void> {
  const item = await db.tasks.get(id)
  if (!item || item.deleted_at) return
  const now = utcNowIso()
  await db.tasks.put({
    ...item,
    deleted_at: now,
    client_updated_at: now,
  })
  await enqueueTask(id)
}

export async function drainTaskQueue(): Promise<string[]> {
  const entries = await db.syncQueue.toArray()
  const ids = [...new Set(entries.filter((entry) => entry.entity === 'task').map((entry) => entry.entityId))]
  await db.syncQueue.bulkDelete(entries.map((entry) => entry.id))
  return ids
}

export async function requeueTaskIds(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  const now = utcNowIso()
  await db.syncQueue.bulkPut(
    ids.map((id) => ({
      id: queueId(id),
      entity: 'task' as const,
      entityId: id,
      queuedAt: now,
    })),
  )
}

export async function loadLastSyncAt(): Promise<string | null> {
  const row = await db.syncState.get('last_sync_at')
  return row?.lastSyncAt ?? null
}

export async function saveLastSyncAt(iso: string): Promise<void> {
  await db.syncState.put({ key: 'last_sync_at', lastSyncAt: iso })
}
