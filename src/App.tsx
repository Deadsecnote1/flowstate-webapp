import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { LOCAL_OWNER } from './lib/id.ts'
import { getSupabaseConfigError, supabase } from './lib/supabase.ts'
import { ClockPage } from './pages/ClockPage.tsx'
import { PlannerPage } from './pages/PlannerPage.tsx'
import { TasksPage } from './pages/TasksPage.tsx'
import { syncNow } from './sync/engine.ts'

type View = 'tasks' | 'planner' | 'clock'

export default function App() {
  const configError = getSupabaseConfigError()
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [view, setView] = useState<View>('tasks')
  const [syncStatus, setSyncStatus] = useState('Not signed in')
  const [syncing, setSyncing] = useState(false)
  const [revision, setRevision] = useState(0)
  const syncingRef = useRef(false)
  const loadedSyncFor = useRef<string | null>(null)
  const syncTimer = useRef<number | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const ownerId = session?.user.id ?? LOCAL_OWNER
  const signedIn = Boolean(session?.user.id)

  const runSync = useCallback(async () => {
    if (syncingRef.current) {
      if (syncTimer.current) window.clearTimeout(syncTimer.current)
      syncTimer.current = window.setTimeout(() => {
        syncTimer.current = null
        void runSync()
      }, 2000)
      return
    }
    syncingRef.current = true
    setSyncing(true)
    setSyncStatus('Syncing…')
    try {
      const message = await syncNow()
      if (message == null) return
      setSyncStatus(message)
      setRevision((value) => value + 1)
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [])

  const scheduleSync = useCallback(() => {
    setRevision((value) => value + 1)
    if (!signedIn) return
    if (syncTimer.current) window.clearTimeout(syncTimer.current)
    syncTimer.current = window.setTimeout(() => {
      syncTimer.current = null
      void runSync()
    }, 2000)
  }, [signedIn, runSync])

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
      if (!next) setSyncStatus('Signed out')
    })

    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!signedIn || !session?.user.id) {
      loadedSyncFor.current = null
      return
    }
    if (loadedSyncFor.current === session.user.id) return
    loadedSyncFor.current = session.user.id
    void runSync()
  }, [signedIn, session?.user.id, runSync])

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && signedIn) void runSync()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [signedIn, runSync])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      if (typing) return
      if (event.key === '/' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f')) {
        event.preventDefault()
        setView('tasks')
        window.setTimeout(() => searchRef.current?.focus(), 0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
    <div className={view === 'planner' ? 'app wide' : 'app'}>
      <header className="topbar">
        <div>
          <p className="brand">Flowstate</p>
          <nav>
            <button type="button" className={view === 'tasks' ? 'nav active' : 'nav'} onClick={() => setView('tasks')}>
              Tasks
            </button>
            <button type="button" className={view === 'planner' ? 'nav active' : 'nav'} onClick={() => setView('planner')}>
              Planner
            </button>
            <button type="button" className={view === 'clock' ? 'nav active' : 'nav'} onClick={() => setView('clock')}>
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

      <div className="sync-row">
        <button type="button" onClick={() => void runSync()} disabled={syncing || !!configError}>
          Sync now
        </button>
        <p className="status">{syncStatus}</p>
      </div>

      {view === 'tasks' ? (
        <TasksPage ownerId={ownerId} revision={revision} onEdited={scheduleSync} searchRef={searchRef} />
      ) : null}
      {view === 'planner' ? <PlannerPage ownerId={ownerId} revision={revision} onEdited={scheduleSync} /> : null}
      {view === 'clock' ? <ClockPage ownerId={ownerId} /> : null}
    </div>
  )
}
