import { db } from './db.ts'
import { enqueue } from './queue.ts'
import { newTaskId } from '../lib/id.ts'
import { isVirtualId } from '../sync/planner.ts'
import type { InboxItem, PlanColor, PlanTask, RepeatMode } from '../types/planner.ts'
import { utcNowIso } from '../sync/time.ts'

function sameOwnerTask(item: PlanTask, ownerId: string): boolean {
  return item.ownerId === ownerId
}

export async function listPlannerTasks(ownerId: string): Promise<PlanTask[]> {
  return db.plannerTasks.where('ownerId').equals(ownerId).toArray()
}

export async function listInbox(ownerId: string): Promise<InboxItem[]> {
  const rows = await db.inboxItems.where('ownerId').equals(ownerId).toArray()
  return rows
    .filter((row) => row.deleted_at == null)
    .sort((a, b) => (a.client_updated_at < b.client_updated_at ? 1 : -1))
}

export async function addPlanTask(
  ownerId: string,
  input: {
    title: string
    date: string
    start_min?: number
    end_min?: number
    all_day?: boolean
    notes?: string
    repeat?: RepeatMode
    color?: PlanColor
  },
): Promise<PlanTask | null> {
  const title = input.title.trim() || 'New task'
  const now = utcNowIso()
  const start = input.start_min ?? 9 * 60
  const end = Math.max(input.end_min ?? start + 60, start + 1)
  const item: PlanTask = {
    id: newTaskId(),
    ownerId,
    title,
    date: input.date,
    start_min: start,
    end_min: end,
    all_day: input.all_day ?? false,
    notes: input.notes ?? '',
    completed: false,
    repeat: input.repeat ?? 'none',
    color: input.color ?? 'coral',
    created_at: now,
    client_updated_at: now,
    deleted_at: null,
  }
  await db.plannerTasks.put(item)
  await enqueue(ownerId, 'planner_task', item.id)
  return item
}

export async function savePlanTask(ownerId: string, task: PlanTask): Promise<PlanTask | null> {
  if (isVirtualId(task.id)) {
    return addPlanTask(ownerId, {
      title: task.title,
      date: task.date,
      start_min: task.start_min,
      end_min: task.end_min,
      all_day: task.all_day,
      notes: task.notes,
      repeat: 'none',
      color: task.color,
    })
  }
  const existing = await db.plannerTasks.get(task.id)
  if (!existing || !sameOwnerTask(existing, ownerId) || existing.deleted_at) return null
  const next: PlanTask = {
    ...existing,
    ...task,
    id: existing.id,
    ownerId,
    client_updated_at: utcNowIso(),
    deleted_at: null,
  }
  await db.plannerTasks.put(next)
  await enqueue(ownerId, 'planner_task', next.id)
  return next
}

export async function deletePlanTask(ownerId: string, id: string): Promise<void> {
  if (isVirtualId(id)) return
  const item = await db.plannerTasks.get(id)
  if (!item || item.ownerId !== ownerId || item.deleted_at) return
  const now = utcNowIso()
  await db.plannerTasks.put({
    ...item,
    deleted_at: now,
    client_updated_at: now,
  })
  await enqueue(ownerId, 'planner_task', id)
}

export async function togglePlanTask(ownerId: string, task: PlanTask): Promise<void> {
  if (isVirtualId(task.id)) {
    const now = utcNowIso()
    const item: PlanTask = {
      id: newTaskId(),
      ownerId,
      title: task.title,
      date: task.date,
      start_min: task.start_min,
      end_min: task.end_min,
      all_day: task.all_day,
      notes: task.notes,
      completed: !task.completed,
      repeat: 'none',
      color: task.color,
      created_at: now,
      client_updated_at: now,
      deleted_at: null,
    }
    await db.plannerTasks.put(item)
    await enqueue(ownerId, 'planner_task', item.id)
    return
  }
  const existing = await db.plannerTasks.get(task.id)
  if (!existing || existing.ownerId !== ownerId || existing.deleted_at) return
  await db.plannerTasks.put({
    ...existing,
    completed: !existing.completed,
    client_updated_at: utcNowIso(),
  })
  await enqueue(ownerId, 'planner_task', task.id)
}

export async function addInboxItem(ownerId: string, title: string): Promise<InboxItem | null> {
  const trimmed = title.trim()
  if (!trimmed) return null
  const item: InboxItem = {
    id: newTaskId(),
    ownerId,
    title: trimmed,
    client_updated_at: utcNowIso(),
    deleted_at: null,
  }
  await db.inboxItems.put(item)
  await enqueue(ownerId, 'inbox_item', item.id)
  return item
}

export async function deleteInboxItem(ownerId: string, id: string): Promise<void> {
  const item = await db.inboxItems.get(id)
  if (!item || item.ownerId !== ownerId || item.deleted_at) return
  await db.inboxItems.put({
    ...item,
    deleted_at: utcNowIso(),
    client_updated_at: utcNowIso(),
  })
  await enqueue(ownerId, 'inbox_item', id)
}

export async function listAllInbox(ownerId: string): Promise<InboxItem[]> {
  return db.inboxItems.where('ownerId').equals(ownerId).toArray()
}
