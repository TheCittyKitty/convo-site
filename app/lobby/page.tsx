'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { TopBar } from '@/components/TopBar'
import { getTopicForNow } from '@/lib/topics'

type Room = {
  id: string
  name: string
  capacity: number
}

type RoomWithCount = Room & {
  memberCount: number
  rememberedNames: string[]
}

const ROOM_CAPACITY = 7

export default function LobbyPage() {
  const router = useRouter()
  const [rooms, setRooms] = useState<RoomWithCount[]>([])
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [onlineCount, setOnlineCount] = useState(0)

  async function fetchActiveMemberCount(roomId: string) {
    const cutoff = new Date(Date.now() - 45_000).toISOString()

    const { count, error } = await supabase
      .from('room_members')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomId)
      .gt('last_seen', cutoff)

    if (error) return 0
    return count ?? 0
  }

  async function fetchRememberedUsersByRoom(roomIds: string[], currentUserId: string) {
    if (roomIds.length === 0) return {}

    const cutoff = new Date(Date.now() - 45_000).toISOString()

    const { data: rememberedRows, error: rememberedError } = await supabase
      .from('remembers')
      .select('remembered_id')
      .eq('rememberer_id', currentUserId)

    if (rememberedError || !rememberedRows || rememberedRows.length === 0) {
      return {} as Record<string, string[]>
    }

    const rememberedIds = rememberedRows.map((row) => row.remembered_id)

    const { data: activeRememberedMembers, error: membersError } = await supabase
      .from('room_members')
      .select('room_id, user_id')
      .in('room_id', roomIds)
      .in('user_id', rememberedIds)
      .gt('last_seen', cutoff)

    if (membersError || !activeRememberedMembers || activeRememberedMembers.length === 0) {
      return {} as Record<string, string[]>
    }

    const activeUserIds = [...new Set(activeRememberedMembers.map((row) => row.user_id))]

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', activeUserIds)

    if (profilesError || !profiles) {
      return {} as Record<string, string[]>
    }

    const usernameById = new Map(
      profiles.map((profile) => [profile.id, profile.username || 'User'])
    )

    const namesByRoom: Record<string, string[]> = {}

    for (const member of activeRememberedMembers) {
      const username = usernameById.get(member.user_id)
      if (!username) continue

      if (!namesByRoom[member.room_id]) {
        namesByRoom[member.room_id] = []
      }

      if (!namesByRoom[member.room_id].includes(username)) {
        namesByRoom[member.room_id].push(username)
      }
    }

    return namesByRoom
  }

  async function fetchRoomsWithCounts(currentUserId: string) {
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .order('created_at', { ascending: true })

    if (roomError || !roomData) {
      return []
    }

    const roomIds = roomData.map((room: Room) => room.id)
    const rememberedNamesByRoom = await fetchRememberedUsersByRoom(roomIds, currentUserId)

    const roomsWithCounts = await Promise.all(
      roomData.map(async (room: Room) => {
        const memberCount = await fetchActiveMemberCount(room.id)
        return {
          ...room,
          memberCount,
          rememberedNames: rememberedNamesByRoom[room.id] ?? [],
        }
      })
    )

    return roomsWithCounts
  }

  async function fetchOnlineUserCount() {
  const cutoff = new Date(Date.now() - 45_000).toISOString()

  const { data, error } = await supabase
    .from('room_members')
    .select('user_id')
    .gt('last_seen', cutoff)

  if (error || !data) {
    setOnlineCount(0)
    return
  }

  const uniqueUsers = new Set(data.map((row) => row.user_id))
  setOnlineCount(uniqueUsers.size)
}

  async function createRoom() {
    const roomNumber = Date.now()

    const { data, error } = await supabase
      .from('rooms')
      .insert({
        name: `Room ${roomNumber}`,
        capacity: ROOM_CAPACITY,
      })
      .select('*')
      .single()

    if (error || !data) {
      return null
    }

    return {
      ...data,
      memberCount: 0,
      rememberedNames: [],
    }
  }

  async function cleanupAndEnsureRooms(currentUserId: string) {
    let currentRooms = await fetchRoomsWithCounts(currentUserId)

    if (currentRooms.length === 0) {
      await createRoom()
      currentRooms = await fetchRoomsWithCounts(currentUserId)
    }

    const emptyRooms = currentRooms.filter((room) => room.memberCount === 0)

    if (currentRooms.length > 1 && emptyRooms.length > 0) {
      const emptyRoomIds = emptyRooms.map((room) => room.id)

      const { error: deleteError } = await supabase
        .from('rooms')
        .delete()
        .in('id', emptyRoomIds)

      if (!deleteError) {
        currentRooms = await fetchRoomsWithCounts(currentUserId)
      }
    }

    const allRoomsFull =
      currentRooms.length > 0 &&
      currentRooms.every((room) => room.memberCount >= room.capacity)

    if (allRoomsFull) {
      await createRoom()
      currentRooms = await fetchRoomsWithCounts(currentUserId)
    }

    currentRooms.sort((a, b) => {
      if (a.memberCount !== b.memberCount) return b.memberCount - a.memberCount
      return a.name.localeCompare(b.name)
    })

    setRooms(currentRooms)
  }

  useEffect(() => {
    let mounted = true
    let refreshId: ReturnType<typeof setInterval> | null = null

    async function loadLobby() {
      const { data: authData } = await supabase.auth.getUser()

      if (!authData.user) {
        router.replace('/')
        return
      }

      const currentUserId = authData.user.id

      await cleanupAndEnsureRooms(currentUserId)
      await fetchOnlineUserCount()

      if (!mounted) return

      refreshId = setInterval(async () => {
        if (!mounted) return
        await cleanupAndEnsureRooms(currentUserId)
        await fetchOnlineUserCount()
      }, 5000)
    }

    loadLobby()

    return () => {
      mounted = false
      if (refreshId) clearInterval(refreshId)
    }
  }, [router])

  async function handleJoin(roomId: string, capacity: number) {
    if (joiningRoomId) return

    setJoiningRoomId(roomId)
    setError(null)

    try {
      const { data: authData } = await supabase.auth.getUser()
      const user = authData.user

      if (!user) {
        router.replace('/')
        return
      }

      const currentCount = await fetchActiveMemberCount(roomId)

      if (currentCount >= capacity) {
        setError('This room is full.')
        await cleanupAndEnsureRooms(user.id)
        return
      }

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

      await cleanupAndEnsureRooms(user.id)
      router.push(`/chat/${roomId}`)
    } finally {
      setJoiningRoomId(null)
    }
  }

  return (
    <div className="layout">
      <TopBar />

      <main className="container">
        <div style={{ paddingTop: 22 }}>
          <div className="flex items-center justify-between">
            <div>
              <h1 style={{ marginBottom: 0 }}>Active chats</h1>
            </div>

            <Link
              href="/feedback"
              className="border border-[#4f6b8a] bg-[#102235] px-3 py-2 text-sm font-semibold text-[#e5efff] hover:bg-[#16304a]"
            >
              ⭐ Feedback
            </Link>
          </div>
        </div>

        {error && (
          <div className="small" style={{ color: '#ff8a8a', marginTop: 12 }}>
            {error}
          </div>
        )}

        <div className="lobby-list">
          {rooms.length > 0 ? (
            rooms.map((room) => {
              const isFull = room.memberCount >= room.capacity
              const isJoining = joiningRoomId === room.id
              const hasRememberedUser = room.rememberedNames.length > 0

              return (
                <div key={room.id} className="room-row">
                  <div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '1.05rem',
                        marginBottom: 4,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span>{getTopicForNow()}</span>
                      {hasRememberedUser && (
                        <span
                          title={`You remembered: ${room.rememberedNames.join(', ')}`}
                          style={{ fontSize: '1rem' }}
                        >
                          ❤️
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="small">People</div>
                    <div>
                      {room.memberCount} / {room.capacity}
                    </div>
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
                    disabled={!!joiningRoomId || isFull}
                  >
                    {isFull ? 'Full' : isJoining ? 'Joining...' : 'Join'}
                  </button>
                </div>
              )
            })
          ) : (
            <div className="small">No rooms available right now.</div>
          )}
        </div>
      </main>
    </div>
  )
}