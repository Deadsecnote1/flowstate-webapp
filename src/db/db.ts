import Dexie, { type Table } from 'dexie'
import { LOCAL_OWNER } from '../lib/id.ts'
import type { InboxItem, PlanTask } from '../types/planner.ts'
import type { Task } from '../types/task.ts'

export type EntityKind = 'task' | 'planner_task' | 'inbox_item'

export type SyncQueueEntry = {
  id: string
  ownerId: string
  entity: EntityKind
  entityId: string
  queuedAt: string
}

export type ClockRow = {
  key: string
  ownerId: string
  timerSeconds: number
}

export type ArchivedTask = {
  id: string
  ownerId: string
  title: string
  notes: string
  completed: boolean
  created_at: string
  archived_at: string
}

export type SyncStateRow = {
  key: string
  ownerId: string
  lastSyncAt: string | null
}

export class FlowstateDB extends Dexie {
  tasks!: Table<Task, string>
  plannerTasks!: Table<PlanTask, string>
  inboxItems!: Table<InboxItem, string>
  clock!: Table<ClockRow, string>
  taskArchive!: Table<ArchivedTask, string>
  syncQueue!: Table<SyncQueueEntry, string>
  syncState!: Table<SyncStateRow, string>

  constructor() {
    super('flowstate')
    this.version(1).stores({
      tasks: 'id, deleted_at, client_updated_at',
      syncQueue: 'id, entityId',
      syncState: 'key',
    })
    this.version(2)
      .stores({
        tasks: 'id, ownerId, deleted_at, client_updated_at',
        syncQueue: 'id, ownerId, entityId',
        syncState: 'key, ownerId',
      })
      .upgrade(async (tx) => {
        await tx
          .table('tasks')
          .toCollection()
          .modify((row: Task) => {
            if (!row.ownerId) row.ownerId = LOCAL_OWNER
          })
        await tx
          .table('syncQueue')
          .toCollection()
          .modify((row: SyncQueueEntry) => {
            if (!row.ownerId) row.ownerId = LOCAL_OWNER
          })

        const states = await tx.table('syncState').toArray()
        for (const row of states) {
          if (row.ownerId && row.key.startsWith('last_sync_at:')) continue
          await tx.table('syncState').delete(row.key)
          await tx.table('syncState').put({
            key: `last_sync_at:${LOCAL_OWNER}`,
            ownerId: LOCAL_OWNER,
            lastSyncAt: row.lastSyncAt ?? null,
          })
        }
      })
    this.version(3).stores({
      plannerTasks: 'id, ownerId, date, deleted_at',
      inboxItems: 'id, ownerId, deleted_at',
      clock: 'key, ownerId',
      taskArchive: 'id, ownerId',
    })
  }
}

export const db = new FlowstateDB()
