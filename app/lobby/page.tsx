'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { TopBar } from '@/components/TopBar'
import { getTopicForNow } from '@/lib/topics'

type Room = {
  id: string
  name: string
  capacity: number
}

export default function LobbyPage() {
  const router = useRouter()
  const [room, setRoom] = useState<Room | null>(null)
  const [memberCount, setMemberCount] = useState(0)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function loadLobby() {
      const { data: authData } = await supabase.auth.getUser()

      if (!authData.user) {
        router.replace('/')
        return
      }

      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .limit(1)
        .single()

      if (roomError || !roomData) {
        if (mounted) setRoom(null)
        return
      }

      const { count, error: countError } = await supabase
        .from('room_members')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', roomData.id)

      if (!mounted) return

      setRoom(roomData)
      setMemberCount(countError ? 0 : (count ?? 0))
    }

    loadLobby()

    return () => {
      mounted = false
    }
  }, [router])

  async function handleJoin(roomId: string, capacity: number) {
    if (joining) return

    setJoining(true)
    setError(null)

    try {
      const { data: authData } = await supabase.auth.getUser()
      const user = authData.user

      if (!user) {
        router.replace('/')
        return
      }

      // Count current members in this room
      const { count, error: countError } = await supabase
        .from('room_members')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', roomId)

      if (countError) {
        setError('Could not check room size.')
        return
      }

      const currentCount = count ?? 0

      // If full, block entry
      if (currentCount >= capacity) {
        setError('This room is full.')
        setMemberCount(currentCount)
        return
      }

      // Register this user as being in the room
      const { error: joinError } = await supabase
        .from('room_members')
        .upsert(
          {
            room_id: roomId,
            user_id: user.id,
            last_seen: new Date().toISOString(),
          },
          { onConflict: 'room_id,user_id' }
        )

      if (joinError) {
        setError('Could not join room.')
        return
      }

      setMemberCount(currentCount + 1)
      router.push(`/chat/${roomId}`)
    } finally {
      setJoining(false)
    }
  }

  const isFull = room ? memberCount >= room.capacity : false

  return (
    <div className="layout">
      <TopBar />
      <main className="container">
        <div style={{ paddingTop: 22 }}>
          <h1 style={{ marginBottom: 8 }}>Active chats</h1>
          <div className="small">Webfishing-style room list. Only one room is needed right now.</div>
        </div>

        {error && (
          <div className="small" style={{ color: '#ff8a8a', marginTop: 12 }}>
            {error}
          </div>
        )}

        <div className="lobby-list">
          {room ? (
            <div className="room-row">
              <div>
                <div style={{ fontWeight: 700 }}>{room.name}</div>
                <div className="small">Current topic: {getTopicForNow()}</div>
              </div>

              <div>
                <div className="small">People</div>
                <div>{memberCount} / {room.capacity}</div>
              </div>

              <div>
                <div className="small">Status</div>
                <div>{isFull ? 'Full' : 'Open'}</div>
              </div>

              <button
                type="button"
                className="button"
                style={{ textAlign: 'center' }}
                onClick={() => handleJoin(room.id, room.capacity)}
                disabled={joining || isFull}
              >
                {isFull ? 'Full' : joining ? 'Joining...' : 'Join'}
              </button>
            </div>
          ) : (
            <div className="small">No room found yet. Run the SQL seed so the starter room exists.</div>
          )}
        </div>
      </main>
    </div>
  )
}