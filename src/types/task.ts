export type Task = {
  id: string
  title: string
  completed: boolean
  notes: string
  created_at: string
  client_updated_at: string
  deleted_at: string | null
}

export type RemoteTaskRow = {
  id?: string
  title?: string
  completed?: boolean
  notes?: string
  created_at?: string | null
  client_updated_at?: string | null
  deleted_at?: string | null
}
