'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { TopBar } from '@/components/TopBar'
import { getTimeLeftMs, getTopicForNow } from '@/lib/topics'

type Message = {
  id: string
  body: string
  created_at: string
  user_id: string
  username?: string | null
  profiles?: {
    username: string | null
  } | null
}

type RawMessage = {
  id: string
  body: string
  created_at: string
  user_id: string
  username?: string | null
  profiles?: { username: string | null }[] | null
}

type UserMenuState = {
  id: string
  name: string
} | null

export default function ChatPage() {
  const params = useParams<{ roomId: string }>()
  const roomId = params.roomId
  const router = useRouter()

  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [userId, setUserId] = useState('')
  const [timeLeft, setTimeLeft] = useState(getTimeLeftMs())
  const [rememberedUserIds, setRememberedUserIds] = useState<string[]>([])
  const [rememberLoadingUserId, setRememberLoadingUserId] = useState<string | null>(null)
  const [openUserMenu, setOpenUserMenu] = useState<UserMenuState>(null)

  const bottomRef = useRef<HTMLDivElement | null>(null)

  async function removePresence(userId: string, roomId: string) {
    const { error } = await supabase
      .from('room_members')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', userId)

    if (error) {
      console.error('Presence remove failed:', error.message)
    }
  }

  async function upsertPresence(userId: string, roomId: string) {
    const { error } = await supabase
      .from('room_members')
      .upsert(
        {
          room_id: roomId,
          user_id: userId,
          last_seen: new Date().toISOString(),
        },
        { onConflict: 'room_id,user_id' }
      )

    if (error) {
      console.error('Presence upsert failed:', error.message)
    }
  }

  async function loadRememberedUsers(currentUserId: string) {
    const { data, error } = await supabase
      .from('remembers')
      .select('remembered_id')
      .eq('rememberer_id', currentUserId)

    if (error || !data) return

    setRememberedUserIds(data.map((row) => row.remembered_id))
  }

  async function handleRememberUser(targetUserId: string) {
    if (!userId || !targetUserId || targetUserId === userId) return

    if (rememberedUserIds.includes(targetUserId)) {
      setOpenUserMenu(null)
      return
    }

    setRememberLoadingUserId(targetUserId)

    const { error } = await supabase
      .from('remembers')
      .upsert(
        {
          rememberer_id: userId,
          remembered_id: targetUserId,
        },
        { onConflict: 'rememberer_id,remembered_id' }
      )

    if (!error) {
      setRememberedUserIds((current) =>
        current.includes(targetUserId) ? current : [...current, targetUserId]
      )
      setOpenUserMenu(null)
    } else {
      console.error('Remember failed:', error.message)
    }

    setRememberLoadingUserId(null)
  }

  const topic = useMemo(() => getTopicForNow(), [timeLeft])

  useEffect(() => {
    const timer = window.setInterval(() => setTimeLeft(getTimeLeftMs()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null
    let currentUserId: string | null = null

    async function startPresence() {
      const { data: authData } = await supabase.auth.getUser()
      const user = authData.user

      if (!user || !roomId) return

      currentUserId = user.id
      await upsertPresence(user.id, roomId)

      intervalId = setInterval(() => {
        upsertPresence(user.id, roomId)
      }, 15000)
    }

    function cleanupPresence() {
      if (!currentUserId || !roomId) return
      removePresence(currentUserId, roomId)
    }

    startPresence()

    const handleBeforeUnload = () => {
      cleanupPresence()
    }

    const handlePageHide = () => {
      cleanupPresence()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        cleanupPresence()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handlePageHide)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (intervalId) clearInterval(intervalId)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handlePageHide)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      cleanupPresence()
    }
  }, [roomId])

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function boot() {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) {
        router.replace('/')
        return
      }

      setUserId(auth.user.id)
      await loadRememberedUsers(auth.user.id)

      const { data } = await supabase
        .from('messages')
        .select('id, body, created_at, user_id, username, profiles(username)')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })

      const normalizedMessages: Message[] = ((data ?? []) as RawMessage[]).map((message) => ({
        id: message.id,
        body: message.body,
        created_at: message.created_at,
        user_id: message.user_id,
        username: message.username ?? null,
        profiles: message.profiles?.[0] ?? null,
      }))

      setMessages(normalizedMessages)

      channel = supabase
        .channel(`room-${roomId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
          async (payload) => {
            const newRow = payload.new as Omit<Message, 'profiles'>
            const { data: profile } = await supabase
              .from('profiles')
              .select('username')
              .eq('id', newRow.user_id)
              .single()

            setMessages((current) => [
              ...current,
              { ...newRow, profiles: profile ? { username: profile.username } : null },
            ])
          }
        )
        .subscribe()
    }

    boot()
    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [roomId, router])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(e: FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return

    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', auth.user.id)
      .single()

    const safeUsername = profile?.username ?? 'User'

    setText('')

    await supabase.from('messages').insert({
      room_id: roomId,
      user_id: auth.user.id,
      username: safeUsername,
      body,
    })
  }

  const mm = String(Math.floor(timeLeft / 60000)).padStart(2, '0')
  const ss = String(Math.floor((timeLeft % 60000) / 1000)).padStart(2, '0')

  const selectedUserId = openUserMenu?.id ?? null
  const selectedUserName = openUserMenu?.name ?? 'User'
  const selectedAlreadyRemembered = selectedUserId
    ? rememberedUserIds.includes(selectedUserId)
    : false

  return (
    <div className="layout">
      <TopBar />

      <main className="chat-grid">
        <aside className="sidebar">
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Chats</div>
          <div className="room-row" style={{ gridTemplateColumns: '1fr', padding: 14 }}>
            <div>
              <div style={{ fontWeight: 700 }}>General Room</div>
              <div className="small">Only one room for now.</div>
            </div>
          </div>
        </aside>

        <section className="main-chat">
          <div className="topic-bar">
            <div className="small">Current topic</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{topic}</div>
            <div className="small" style={{ marginTop: 8 }}>
              Time till next topic: {mm}:{ss}
            </div>
          </div>

          <div className="messages">
            {messages.map((message) => {
              const name = message.username || message.profiles?.username || 'User'
              const isSelf = message.user_id === userId

              return (
                <div className="message" key={message.id}>
                  <div className="avatar">{name.slice(0, 1).toUpperCase()}</div>

                  <div className="bubble">
                    <div style={{ marginBottom: 4 }}>
                      {isSelf ? (
                        <span style={{ fontWeight: 700 }}>{name}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setOpenUserMenu({
                              id: message.user_id,
                              name,
                            })
                          }}
                          style={{
                            fontWeight: 700,
                            background: 'transparent',
                            border: 'none',
                            padding: 0,
                            margin: 0,
                            color: 'inherit',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            textUnderlineOffset: '2px',
                          }}
                        >
                          {name} ↗
                        </button>
                      )}
                    </div>

                    <div>{message.body}</div>
                  </div>
                </div>
              )
            })}

            <div ref={bottomRef} />
          </div>

          <form className="compose" onSubmit={sendMessage}>
            <div className="small" style={{ marginBottom: 6, opacity: 0.7 }}>
              This conversation resets daily.
            </div>

            <div className="row">
              <input
                className="input"
                placeholder="Send a message"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <button className="button" type="submit" style={{ width: 120 }}>
                Send
              </button>
            </div>
          </form>
        </section>
      </main>

      {openUserMenu && (
        <div
          onClick={() => setOpenUserMenu(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0, 0, 0, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 320,
              border: '1px solid #4f6b8a',
              background: '#102235',
              boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
              padding: 16,
              borderRadius: 12,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 10 }}>{selectedUserName}</div>

            <button
              type="button"
              onClick={() => selectedUserId && handleRememberUser(selectedUserId)}
              disabled={!selectedUserId || selectedAlreadyRemembered || rememberLoadingUserId === selectedUserId}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                padding: 0,
                margin: 0,
                fontWeight: 700,
                cursor:
                  !selectedUserId || selectedAlreadyRemembered || rememberLoadingUserId === selectedUserId
                    ? 'default'
                    : 'pointer',
                opacity:
                  !selectedUserId || selectedAlreadyRemembered || rememberLoadingUserId === selectedUserId
                    ? 0.75
                    : 1,
              }}
            >
              {rememberLoadingUserId === selectedUserId
                ? 'Remembering...'
                : selectedAlreadyRemembered
                  ? 'Remembered'
                  : 'Remember this person'}
            </button>

            <div className="small" style={{ marginTop: 8, opacity: 0.8 }}>
              You’ll see a heart on rooms they join.
            </div>

            <button
              type="button"
              onClick={() => setOpenUserMenu(null)}
              className="button"
              style={{ marginTop: 14, width: '100%' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}