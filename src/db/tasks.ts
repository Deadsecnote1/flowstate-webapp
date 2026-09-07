import { db } from './db.ts'
import { enqueue } from './queue.ts'
import { isUuid, newTaskId } from '../lib/id.ts'
import type { Task } from '../types/task.ts'
import { utcNowIso } from '../sync/time.ts'

function queueId(ownerId: string, taskId: string): string {
  return `task:${ownerId}:${taskId}`
}

function syncStateKey(ownerId: string): string {
  return `last_sync_at:${ownerId}`
}

function sameOwner(item: Task, ownerId: string): boolean {
  return item.ownerId === ownerId
}

export async function enqueueTask(ownerId: string, taskId: string): Promise<void> {
  await db.syncQueue.put({
    id: queueId(ownerId, taskId),
    ownerId,
    entity: 'task',
    entityId: taskId,
    queuedAt: utcNowIso(),
  })
}

export async function listVisibleTasks(ownerId: string): Promise<Task[]> {
  const rows = await db.tasks.where('ownerId').equals(ownerId).toArray()
  return rows
    .filter((row) => row.deleted_at == null)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
}

export async function listAllTasks(ownerId: string): Promise<Task[]> {
  return db.tasks.where('ownerId').equals(ownerId).toArray()
}

export async function addTask(ownerId: string, title: string): Promise<Task | null> {
  const trimmed = title.trim()
  if (!trimmed) return null
  const now = utcNowIso()
  const item: Task = {
    id: newTaskId(),
    ownerId,
    title: trimmed,
    completed: false,
    notes: '',
    created_at: now,
    client_updated_at: now,
    deleted_at: null,
  }
  await db.tasks.put(item)
  await enqueueIfSignedIn(ownerId, item.id)
  return item
}

export async function toggleTask(ownerId: string, id: string): Promise<void> {
  const item = await db.tasks.get(id)
  if (!item || !sameOwner(item, ownerId) || item.deleted_at) return
  await db.tasks.put({
    ...item,
    completed: !item.completed,
    client_updated_at: utcNowIso(),
  })
  await enqueueIfSignedIn(ownerId, id)
}

export async function updateTaskTitle(ownerId: string, id: string, title: string): Promise<void> {
  const trimmed = title.trim()
  if (!trimmed) return
  const item = await db.tasks.get(id)
  if (!item || !sameOwner(item, ownerId) || item.deleted_at) return
  await db.tasks.put({
    ...item,
    title: trimmed,
    client_updated_at: utcNowIso(),
  })
  await enqueueIfSignedIn(ownerId, id)
}

export async function deleteTask(ownerId: string, id: string): Promise<void> {
  const item = await db.tasks.get(id)
  if (!item || !sameOwner(item, ownerId) || item.deleted_at) return
  const now = utcNowIso()
  await db.tasks.put({
    ...item,
    deleted_at: now,
    client_updated_at: now,
  })
  await enqueueIfSignedIn(ownerId, id)
}

function enqueueIfSignedIn(ownerId: string, taskId: string): Promise<void> {
  return enqueue(ownerId, 'task', taskId)
}

export async function drainTaskQueue(ownerId: string): Promise<string[]> {
  const entries = await db.syncQueue.where('ownerId').equals(ownerId).toArray()
  const ids = [
    ...new Set(
      entries.filter((entry) => entry.entity === 'task' && isUuid(entry.entityId)).map((entry) => entry.entityId),
    ),
  ]
  await db.syncQueue.bulkDelete(entries.map((entry) => entry.id))
  return ids
}

export async function requeueTaskIds(ownerId: string, ids: readonly string[]): Promise<void> {
  const valid = ids.filter((id) => isUuid(id))
  if (valid.length === 0) return
  const now = utcNowIso()
  await db.syncQueue.bulkPut(
    valid.map((id) => ({
      id: queueId(ownerId, id),
      ownerId,
      entity: 'task' as const,
      entityId: id,
      queuedAt: now,
    })),
  )
}

export async function loadLastSyncAt(ownerId: string): Promise<string | null> {
  const row = await db.syncState.get(syncStateKey(ownerId))
  return row?.lastSyncAt ?? null
}

export async function saveLastSyncAt(ownerId: string, iso: string): Promise<void> {
  await db.syncState.put({
    key: syncStateKey(ownerId),
    ownerId,
    lastSyncAt: iso,
  })
}
