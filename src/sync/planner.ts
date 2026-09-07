import { isUuid } from '../lib/id.ts'
import type { InboxItem, PlanColor, PlanTask, RemoteInboxRow, RemotePlannerRow, RepeatMode } from '../types/planner.ts'
import { remoteIsNewer } from './merge.ts'
import { utcNowIso } from './time.ts'

export function isVirtualId(id: string): boolean {
  return id.startsWith('virt-')
}

function asRepeat(value: string | null | undefined): RepeatMode {
  return value === 'daily' ? 'daily' : 'none'
}

function asColor(value: string | null | undefined): PlanColor {
  if (value === 'blue' || value === 'green' || value === 'coral') return value
  return 'coral'
}

export function tasksForDay(tasks: readonly PlanTask[], day: string): PlanTask[] {
  const active = tasks.filter((task) => !task.deleted_at && !isVirtualId(task.id))
  const result: PlanTask[] = []
  for (const task of active) {
    if (task.date === day) {
      result.push(task)
      continue
    }
    if (task.repeat === 'daily' && task.date <= day) {
      const exists = active.some(
        (other) => other.date === day && other.title === task.title && other.start_min === task.start_min,
      )
      if (!exists) {
        result.push({
          ...task,
          id: `virt-${task.id}-${day}`,
          date: day,
          completed: false,
        })
      }
    }
  }
  return result.sort((a, b) => {
    if (a.all_day !== b.all_day) return a.all_day ? -1 : 1
    if (a.start_min !== b.start_min) return a.start_min - b.start_min
    return a.title.localeCompare(b.title)
  })
}

export function plannerToRow(task: PlanTask, userId: string) {
  return {
    id: task.id,
    user_id: userId,
    title: task.title,
    task_date: task.date,
    start_min: task.start_min,
    end_min: task.end_min,
    all_day: task.all_day,
    notes: task.notes,
    completed: task.completed,
    repeat: task.repeat,
    color: task.color,
    created_at: task.created_at,
    client_updated_at: task.client_updated_at,
    deleted_at: task.deleted_at,
  }
}

export function inboxToRow(item: InboxItem, userId: string) {
  return {
    id: item.id,
    user_id: userId,
    title: item.title,
    client_updated_at: item.client_updated_at,
    deleted_at: item.deleted_at,
  }
}

export function applyRemotePlanner(
  items: readonly PlanTask[],
  row: RemotePlannerRow,
  ownerId: string,
): { items: PlanTask[]; applied: boolean } {
  const itemId = String(row.id ?? '')
  if (!isUuid(itemId) || isVirtualId(itemId) || !ownerId) {
    return { items: [...items], applied: false }
  }

  const existingIndex = items.findIndex((item) => item.id === itemId && item.ownerId === ownerId)
  const existing = existingIndex >= 0 ? items[existingIndex] : undefined
  if (existing && !remoteIsNewer(existing.client_updated_at, row)) {
    return { items: [...items], applied: false }
  }

  const now = utcNowIso()
  const start = Number(row.start_min ?? 540)
  const end = Number(row.end_min ?? 600)
  const next: PlanTask = {
    id: itemId,
    ownerId,
    title: String(row.title ?? ''),
    date: String(row.task_date || now.slice(0, 10)),
    start_min: Number.isFinite(start) ? start : 540,
    end_min: Number.isFinite(end) ? Math.max(end, start + 1) : 600,
    all_day: Boolean(row.all_day),
    notes: String(row.notes ?? ''),
    completed: Boolean(row.completed),
    repeat: asRepeat(row.repeat),
    color: asColor(row.color),
    created_at: String(row.created_at || now),
    client_updated_at: String(row.client_updated_at || now),
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
  }

  const copy = items.slice()
  if (existingIndex >= 0) copy[existingIndex] = next
  else copy.push(next)
  return { items: copy, applied: true }
}

export function applyRemoteInbox(
  items: readonly InboxItem[],
  row: RemoteInboxRow,
  ownerId: string,
): { items: InboxItem[]; applied: boolean } {
  const itemId = String(row.id ?? '')
  if (!isUuid(itemId) || !ownerId) return { items: [...items], applied: false }

  const existingIndex = items.findIndex((item) => item.id === itemId && item.ownerId === ownerId)
  const existing = existingIndex >= 0 ? items[existingIndex] : undefined
  if (existing && !remoteIsNewer(existing.client_updated_at, row)) {
    return { items: [...items], applied: false }
  }

  const next: InboxItem = {
    id: itemId,
    ownerId,
    title: String(row.title ?? ''),
    client_updated_at: String(row.client_updated_at || utcNowIso()),
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
  }
  const copy = items.slice()
  if (existingIndex >= 0) copy[existingIndex] = next
  else copy.push(next)
  return { items: copy, applied: true }
}
