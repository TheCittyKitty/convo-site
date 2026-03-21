'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TopBar } from '@/components/TopBar'
import { supabase } from '@/lib/supabase'

type FriendProfile = {
  id: string
  username: string | null
}

export default function SettingsPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [userId, setUserId] = useState('')
  const [friends, setFriends] = useState<FriendProfile[]>([])
  const [friendsLoading, setFriendsLoading] = useState(true)

  async function loadFriends(currentUserId: string) {
    setFriendsLoading(true)

    const { data: iRemember, error: iRememberError } = await supabase
      .from('remembers')
      .select('remembered_id')
      .eq('rememberer_id', currentUserId)

    if (iRememberError || !iRemember || iRemember.length === 0) {
      setFriends([])
      setFriendsLoading(false)
      return
    }

    const { data: rememberMe, error: rememberMeError } = await supabase
      .from('remembers')
      .select('rememberer_id')
      .eq('remembered_id', currentUserId)

    if (rememberMeError || !rememberMe || rememberMe.length === 0) {
      setFriends([])
      setFriendsLoading(false)
      return
    }

    const iRememberIds = iRemember.map((row) => row.remembered_id)
    const rememberMeIds = rememberMe.map((row) => row.rememberer_id)

    const mutualIds = iRememberIds.filter((id) => rememberMeIds.includes(id))

    if (mutualIds.length === 0) {
      setFriends([])
      setFriendsLoading(false)
      return
    }

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', mutualIds)

    if (profilesError || !profiles) {
      setFriends([])
      setFriendsLoading(false)
      return
    }

    const sortedProfiles = [...profiles].sort((a, b) =>
      (a.username || 'User').localeCompare(b.username || 'User')
    )

    setFriends(sortedProfiles)
    setFriendsLoading(false)
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace('/')
        return
      }

      setUserId(data.user.id)
      setEmail(data.user.email ?? '')

      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', data.user.id)
        .single()

      setUsername(profile?.username ?? '')
      await loadFriends(data.user.id)
    })
  }, [router])

  async function save(e: FormEvent) {
    e.preventDefault()
    setMessage('')
    setError('')

    try {
      if (email || password) {
        const { error } = await supabase.auth.updateUser({
          email,
          password: password || undefined,
          data: { username },
        })
        if (error) throw error
      }

      const { error: profileError } = await supabase.from('profiles').upsert({
        id: userId,
        email,
        username,
      })
      if (profileError) throw profileError

      setPassword('')
      setMessage('Account updated.')
    } catch (err: any) {
      setError(err.message ?? 'Failed to save changes.')
    }
  }

  return (
    <div className="layout">
      <TopBar />
      <main className="page-shell">
        <div className="card col" style={{ gap: 18 }}>
          <form className="col" onSubmit={save} style={{ gap: 12 }}>
            <div>
              <h1 style={{ margin: 0 }}>Account settings</h1>
              <p className="small">Change email, password, and username.</p>
            </div>

            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
            />
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              type="email"
            />
            <input
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              type="password"
            />

            {message && <div className="success">{message}</div>}
            {error && <div className="error">{error}</div>}

            <button className="button" type="submit">
              Save changes
            </button>
          </form>

          <div
            style={{
              borderTop: '1px solid rgba(255,255,255,0.12)',
              paddingTop: 16,
            }}
          >
            <div
              title="This list shows people who mutually remember you."
              style={{
                display: 'inline-block',
                fontWeight: 700,
                marginBottom: 8,
                cursor: 'help',
              }}
            >
              Friends
            </div>

            <div className="small" style={{ marginBottom: 10, opacity: 0.8 }}>
              People you’ve both remembered.
            </div>

            {friendsLoading ? (
              <div className="small">Loading friends...</div>
            ) : friends.length > 0 ? (
              <div className="col" style={{ gap: 8 }}>
                {friends.map((friend) => (
                  <div
                    key={friend.id}
                    style={{
                      padding: '10px 12px',
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: 'rgba(255,255,255,0.03)',
                    }}
                  >
                    {friend.username || 'User'}
                  </div>
                ))}
              </div>
            ) : (
              <div className="small">No friends yet.</div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}