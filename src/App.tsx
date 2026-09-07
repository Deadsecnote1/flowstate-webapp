import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabaseConfigError, supabase } from './lib/supabase.ts'
import {
  addTask,
  deleteTask,
  listVisibleTasks,
  toggleTask,
  updateTaskTitle,
} from './db/tasks.ts'
import { syncNow } from './sync/engine.ts'
import type { Task } from './types/task.ts'

type FilterMode = 'all' | 'active' | 'done'

export default function App() {
  const configError = getSupabaseConfigError()
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const [draft, setDraft] = useState('')
  const [filter, setFilter] = useState<FilterMode>('all')
  const [query, setQuery] = useState('')
  const [syncStatus, setSyncStatus] = useState('Not signed in')
  const [syncing, setSyncing] = useState(false)

  const reloadTasks = useCallback(async () => {
    setTasks(await listVisibleTasks())
  }, [])

  useEffect(() => {
    void reloadTasks()
  }, [reloadTasks])

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true)
      setSyncStatus('Sync not configured')
      return
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSyncStatus(data.session ? 'Signed in' : 'Not signed in')
      setAuthReady(true)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setSyncStatus(next ? 'Signed in' : 'Signed out')
    })

    return () => data.subscription.unsubscribe()
  }, [])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tasks.filter((task) => {
      if (filter === 'active' && task.completed) return false
      if (filter === 'done' && !task.completed) return false
      if (q && !task.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [tasks, filter, query])

  async function onAdd(event: FormEvent) {
    event.preventDefault()
    const created = await addTask(draft)
    if (!created) return
    setDraft('')
    await reloadTasks()
  }

  async function onSync() {
    setSyncing(true)
    setSyncStatus('Syncing…')
    try {
      const message = await syncNow()
      setSyncStatus(message)
      await reloadTasks()
    } finally {
      setSyncing(false)
    }
  }

  async function onSignIn() {
    if (!supabase) return
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) setSyncStatus(error.message)
  }

  async function onSignOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    setSyncStatus('Signed out')
  }

  const email = session?.user.email ?? ''

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="brand">Flowstate</p>
          <nav>
            <button type="button" className="nav active">
              Tasks
            </button>
            <button type="button" disabled title="Not in this phase">
              Planner
            </button>
            <button type="button" disabled title="Not in this phase">
              Clock
            </button>
          </nav>
        </div>
        <div className="account">
          {email ? <span className="email">{email}</span> : null}
          {session ? (
            <button type="button" onClick={() => void onSignOut()}>
              Sign out
            </button>
          ) : (
            <button type="button" onClick={() => void onSignIn()} disabled={!!configError || !authReady}>
              Sign in with Google
            </button>
          )}
        </div>
      </header>

      {configError ? <p className="banner">{configError}</p> : null}

      <main>
        <div className="sync-row">
          <button type="button" onClick={() => void onSync()} disabled={syncing || !!configError}>
            Sync now
          </button>
          <p className="status">{syncStatus}</p>
        </div>

        <form className="add-row" onSubmit={(event) => void onAdd(event)}>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add a task"
            aria-label="New task"
          />
        </form>

        <div className="filters">
          {(['all', 'active', 'done'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={filter === mode ? 'chip active' : 'chip'}
              onClick={() => setFilter(mode)}
            >
              {mode === 'all' ? 'All' : mode === 'active' ? 'Active' : 'Done'}
            </button>
          ))}
          <input
            className="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles"
            aria-label="Search tasks"
          />
        </div>

        {visible.length === 0 ? <p className="empty">No tasks</p> : null}

        <ul className="task-list">
          {visible.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onChanged={reloadTasks}
            />
          ))}
        </ul>
      </main>
    </div>
  )
}

function TaskRow({ task, onChanged }: { task: Task; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)

  async function commit() {
    const next = title.trim()
    setEditing(false)
    if (!next || next === task.title) {
      setTitle(task.title)
      return
    }
    await updateTaskTitle(task.id, next)
    await onChanged()
  }

  return (
    <li className={task.completed ? 'task done' : 'task'}>
      <input
        type="checkbox"
        checked={task.completed}
        onChange={() => {
          void toggleTask(task.id).then(onChanged)
        }}
        aria-label={`Complete ${task.title}`}
      />
      {editing ? (
        <input
          className="title-edit"
          value={title}
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void commit()
            if (event.key === 'Escape') {
              setTitle(task.title)
              setEditing(false)
            }
          }}
        />
      ) : (
        <button type="button" className="title" onClick={() => setEditing(true)}>
          {task.title}
        </button>
      )}
      <button
        type="button"
        className="delete"
        onClick={() => {
          void deleteTask(task.id).then(onChanged)
        }}
      >
        Delete
      </button>
    </li>
  )
}
