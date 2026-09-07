export type RepeatMode = 'none' | 'daily'
export type PlanColor = 'coral' | 'blue' | 'green'

export type PlanTask = {
  id: string
  ownerId: string
  title: string
  date: string
  start_min: number
  end_min: number
  all_day: boolean
  notes: string
  completed: boolean
  repeat: RepeatMode
  color: PlanColor
  created_at: string
  client_updated_at: string
  deleted_at: string | null
}

export type InboxItem = {
  id: string
  ownerId: string
  title: string
  client_updated_at: string
  deleted_at: string | null
}

export type RemotePlannerRow = {
  id?: string
  title?: string
  task_date?: string | null
  start_min?: number | null
  end_min?: number | null
  all_day?: boolean
  notes?: string
  completed?: boolean
  repeat?: string | null
  color?: string | null
  created_at?: string | null
  client_updated_at?: string | null
  deleted_at?: string | null
}

export type RemoteInboxRow = {
  id?: string
  title?: string
  client_updated_at?: string | null
  deleted_at?: string | null
}
