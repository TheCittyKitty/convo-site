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
  username?: string | null   // ← ADD THIS LINE
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
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const [username, setUsername] = useState('')

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

    // Register immediately on room load
    await upsertPresence(user.id, roomId)

    // Refresh presence every 15 seconds
    intervalId = setInterval(() => {
      upsertPresence(user.id, roomId)
    }, 15000)
  }

  startPresence()

  const handleBeforeUnload = () => {
    if (!currentUserId || !roomId) return

    // Fire-and-forget best effort
    removePresence(currentUserId, roomId)
  }

  window.addEventListener('beforeunload', handleBeforeUnload)

  return () => {
    if (intervalId) clearInterval(intervalId)
    window.removeEventListener('beforeunload', handleBeforeUnload)

    if (currentUserId && roomId) {
      removePresence(currentUserId, roomId)
    }
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

  // ALWAYS fetch fresh username before sending
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
              return (
                <div className="message" key={message.id}>
                  <div className="avatar">{name.slice(0, 1).toUpperCase()}</div>
                  <div className="bubble">
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{name}</div>
                    <div>{message.body}</div>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          <form className="compose" onSubmit={sendMessage}>
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