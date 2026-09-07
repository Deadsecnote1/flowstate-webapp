import Dexie, { type Table } from 'dexie'
import type { Task } from '../types/task.ts'

export type SyncQueueEntry = {
  id: string
  entity: 'task'
  entityId: string
  queuedAt: string
}

export type SyncStateRow = {
  key: 'last_sync_at'
  lastSyncAt: string | null
}

export class FlowstateDB extends Dexie {
  tasks!: Table<Task, string>
  syncQueue!: Table<SyncQueueEntry, string>
  syncState!: Table<SyncStateRow, string>

  constructor() {
    super('flowstate')
    this.version(1).stores({
      tasks: 'id, deleted_at, client_updated_at',
      syncQueue: 'id, entityId',
      syncState: 'key',
    })
  }
}

export const db = new FlowstateDB()
