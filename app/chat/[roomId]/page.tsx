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

export default function ChatPage() {
  const params = useParams<{ roomId: string }>()
  const roomId = params.roomId
  const router = useRouter()

  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [userId, setUserId] = useState('')
  const [timeLeft, setTimeLeft] = useState(getTimeLeftMs())
  const [rememberedUserIds, setRememberedUserIds] = useState<string[]>([])
  const [openMenuUserId, setOpenMenuUserId] = useState<string | null>(null)
  const [rememberLoadingUserId, setRememberLoadingUserId] = useState<string | null>(null)

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

    if (error || !data) {
      return
    }

    setRememberedUserIds(data.map((row) => row.remembered_id))
  }

  async function handleRememberUser(targetUserId: string) {
    if (!userId || !targetUserId || targetUserId === userId) return
    if (rememberedUserIds.includes(targetUserId)) {
      setOpenMenuUserId(null)
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
      setOpenMenuUserId(null)
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

  useEffect(() => {
    function handleDocumentClick() {
      setOpenMenuUserId(null)
    }

    document.addEventListener('click', handleDocumentClick)
    return () => {
      document.removeEventListener('click', handleDocumentClick)
    }
  }, [])

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
              const isRemembered = rememberedUserIds.includes(message.user_id)
              const isMenuOpen = openMenuUserId === message.user_id

              return (
                <div className="message" key={message.id}>
                  <div className="avatar">{name.slice(0, 1).toUpperCase()}</div>

                  <div className="bubble" style={{ position: 'relative' }}>
                    <div style={{ marginBottom: 4 }}>
                      {isSelf ? (
                        <span style={{ fontWeight: 700 }}>{name}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenMenuUserId((current) =>
                              current === message.user_id ? null : message.user_id
                            )
                          }}
                          style={{
                            fontWeight: 700,
                            background: 'transparent',
                            border: 'none',
                            padding: 0,
                            margin: 0,
                            color: 'inherit',
                            cursor: 'pointer',
                          }}
                        >
                          {name}
                        </button>
                      )}

                      {isMenuOpen && !isSelf && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            position: 'absolute',
                            top: 28,
                            left: 0,
                            zIndex: 20,
                            minWidth: 220,
                            padding: 10,
                            border: '1px solid #4f6b8a',
                            background: '#102235',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => handleRememberUser(message.user_id)}
                            disabled={isRemembered || rememberLoadingUserId === message.user_id}
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
                                isRemembered || rememberLoadingUserId === message.user_id
                                  ? 'default'
                                  : 'pointer',
                              opacity:
                                isRemembered || rememberLoadingUserId === message.user_id ? 0.75 : 1,
                            }}
                          >
                            {rememberLoadingUserId === message.user_id
                              ? 'Remembering...'
                              : isRemembered
                                ? 'Remembered'
                                : 'Remember this person'}
                          </button>

                          <div className="small" style={{ marginTop: 6, opacity: 0.75 }}>
                            You’ll see a heart on rooms they join.
                          </div>
                        </div>
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
    </div>
  )
}