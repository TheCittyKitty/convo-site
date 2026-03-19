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
  profiles?: {
    username: string | null
  } | null
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

  const topic = useMemo(() => getTopicForNow(), [timeLeft])

  useEffect(() => {
    const timer = window.setInterval(() => setTimeLeft(getTimeLeftMs()), 1000)
    return () => window.clearInterval(timer)
  }, [])

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
        .select('id, body, created_at, user_id, profiles(username)')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })

      setMessages((data as Message[]) ?? [])

      channel = supabase
        .channel(`room-${roomId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
          async (payload) => {
            const newRow = payload.new as Message
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

    setText('')
    await supabase.from('messages').insert({ room_id: roomId, user_id: userId, body })
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
            <div className="small" style={{ marginTop: 8 }}>Time till next topic: {mm}:{ss}</div>
          </div>

          <div className="messages">
            {messages.map((message) => {
              const name = message.profiles?.username || 'User'
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
              <button className="button" type="submit" style={{ width: 120 }}>Send</button>
            </div>
          </form>
        </section>
      </main>
    </div>
  )
}
