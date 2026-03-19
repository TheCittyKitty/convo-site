'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TopBar } from '@/components/TopBar'
import { supabase } from '@/lib/supabase'

export default function SettingsPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [userId, setUserId] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace('/')
        return
      }

      setUserId(data.user.id)
      setEmail(data.user.email ?? '')

      const { data: profile } = await supabase.from('profiles').select('username').eq('id', data.user.id).single()
      setUsername(profile?.username ?? '')
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
        <form className="card col" onSubmit={save}>
          <div>
            <h1 style={{ margin: 0 }}>Account settings</h1>
            <p className="small">Change email, password, and username.</p>
          </div>

          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" />
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" />
          <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" type="password" />

          {message && <div className="success">{message}</div>}
          {error && <div className="error">{error}</div>}

          <button className="button" type="submit">Save changes</button>
        </form>
      </main>
    </div>
  )
}
