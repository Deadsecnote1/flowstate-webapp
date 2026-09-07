import { db } from './db.ts'
import { enqueue } from './queue.ts'
import type { Task } from '../types/task.ts'
import { utcNowIso } from '../sync/time.ts'

export async function listArchivedTasks(ownerId: string): Promise<{ id: string; title: string; archived_at: string }[]> {
  const rows = await db.taskArchive.where('ownerId').equals(ownerId).toArray()
  return rows
    .map((row) => ({ id: row.id, title: row.title, archived_at: row.archived_at }))
    .sort((a, b) => (a.archived_at < b.archived_at ? 1 : -1))
}

export async function archiveCompletedTasks(ownerId: string): Promise<number> {
  const now = utcNowIso()
  const tasks = await db.tasks.where('ownerId').equals(ownerId).toArray()
  const completed = tasks.filter((task) => !task.deleted_at && task.completed)
  if (completed.length === 0) return 0

  await db.taskArchive.bulkPut(
    completed.map((task: Task) => ({
      id: task.id,
      ownerId,
      title: task.title,
      notes: task.notes,
      completed: true,
      created_at: task.created_at,
      archived_at: now,
    })),
  )

  for (const task of completed) {
    await db.tasks.put({
      ...task,
      deleted_at: now,
      client_updated_at: now,
    })
    await enqueue(ownerId, 'task', task.id)
  }
  return completed.length
}
