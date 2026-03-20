'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { TopBar } from '@/components/TopBar'
import { supabase } from '@/lib/supabase'

type FeedbackRow = {
  id: string
  user_id: string
  username: string
  body: string
  created_at: string
}

type FeedbackLikeRow = {
  feedback_id: string
  user_id: string
}

type FeedbackItem = FeedbackRow & {
  likeCount: number
  likedByMe: boolean
}

export default function FeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [likingId, setLikingId] = useState<string | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [draft, setDraft] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUsername, setCurrentUsername] = useState<string>('Anonymous')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function loadFeedback() {
    setLoading(true)
    setErrorMsg(null)

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) {
      setErrorMsg(authError.message)
      setLoading(false)
      return
    }

    const userId = user?.id ?? null
    setCurrentUserId(userId)

    let resolvedUsername = 'Anonymous'

    if (user) {
  const userId = user.id
  setCurrentUserId(userId)

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .maybeSingle()

  const resolvedUsername =
    profile?.username?.trim() ||
    user.user_metadata?.username ||
    user.email?.split('@')[0] ||
    'Anonymous'

  setCurrentUsername(resolvedUsername)
}

    setCurrentUsername(resolvedUsername)

    const { data: feedbackRows, error: feedbackError } = await supabase
      .from('feedback')
      .select('id, user_id, username, body, created_at')
      .order('created_at', { ascending: false })

    if (feedbackError) {
      setErrorMsg(feedbackError.message)
      setLoading(false)
      return
    }

    const { data: likeRows, error: likesError } = await supabase
      .from('feedback_likes')
      .select('feedback_id, user_id')

    if (likesError) {
      setErrorMsg(likesError.message)
      setLoading(false)
      return
    }

    const feedbackList = (feedbackRows ?? []) as FeedbackRow[]
    const likesList = (likeRows ?? []) as FeedbackLikeRow[]

    const likeCountMap = new Map<string, number>()
    const likedByMeSet = new Set<string>()

    for (const like of likesList) {
      likeCountMap.set(
        like.feedback_id,
        (likeCountMap.get(like.feedback_id) ?? 0) + 1
      )

      if (userId && like.user_id === userId) {
        likedByMeSet.add(like.feedback_id)
      }
    }

    const merged: FeedbackItem[] = feedbackList.map((item) => ({
      ...item,
      likeCount: likeCountMap.get(item.id) ?? 0,
      likedByMe: likedByMeSet.has(item.id),
    }))

    merged.sort((a, b) => {
      if (b.likeCount !== a.likeCount) return b.likeCount - a.likeCount
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    })

    setFeedback(merged)
    setLoading(false)
  }

  useEffect(() => {
    loadFeedback()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    const trimmed = draft.trim()

    if (!currentUserId) {
      setErrorMsg('You need to be signed in to leave feedback.')
      return
    }

    if (trimmed.length < 8) {
      setErrorMsg('Feedback must be at least 8 characters.')
      return
    }

    if (trimmed.length > 500) {
      setErrorMsg('Feedback must be 500 characters or fewer.')
      return
    }

    setSubmitting(true)
    setErrorMsg(null)

    const { error } = await supabase.from('feedback').insert({
      user_id: currentUserId,
      username: currentUsername,
      body: trimmed,
    })

    if (error) {
      setErrorMsg(error.message)
      setSubmitting(false)
      return
    }

    setDraft('')
    setShowModal(false)
    setSubmitting(false)
    await loadFeedback()
  }

  async function toggleLike(item: FeedbackItem) {
    if (!currentUserId) {
      setErrorMsg('You need to be signed in to like feedback.')
      return
    }

    if (item.user_id === currentUserId) {
      setErrorMsg('You cannot like your own feedback.')
      return
    }

    setLikingId(item.id)
    setErrorMsg(null)

    if (item.likedByMe) {
      const { error } = await supabase
        .from('feedback_likes')
        .delete()
        .eq('feedback_id', item.id)
        .eq('user_id', currentUserId)

      if (error) {
        setErrorMsg(error.message)
        setLikingId(null)
        return
      }
    } else {
      const { error } = await supabase.from('feedback_likes').insert({
        feedback_id: item.id,
        user_id: currentUserId,
      })

      if (error) {
        setErrorMsg(error.message)
        setLikingId(null)
        return
      }
    }

    setLikingId(null)
    await loadFeedback()
  }

  const topFeedbackId = useMemo(() => {
    if (!feedback.length) return null
    return feedback[0].id
  }, [feedback])

  return (
    <main className="min-h-screen bg-[#07131f] text-[#d9e7ff]">
      <TopBar />

      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-wide">Community Feedback</h1>
            <p className="mt-1 text-sm text-[#9db4d4]">
              Most-liked ideas rise to the top.
            </p>
          </div>

          <button
            onClick={() => {
              setErrorMsg(null)
              setShowModal(true)
            }}
            className="border border-[#4f6b8a] bg-[#102235] px-4 py-2 text-sm font-semibold text-[#e5efff] transition hover:bg-[#16304a]"
          >
            Leave Feedback?
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 border border-[#7a3340] bg-[#2a1016] px-4 py-3 text-sm text-[#ffb8c1]">
            {errorMsg}
          </div>
        )}

        {loading ? (
          <div className="border border-[#334a66] bg-[#0d1b2a] px-4 py-5 text-[#a9bfdc]">
            Loading feedback...
          </div>
        ) : feedback.length === 0 ? (
          <div className="border border-[#334a66] bg-[#0d1b2a] px-4 py-5 text-[#a9bfdc]">
            No feedback yet. Be the first to leave some.
          </div>
        ) : (
          <div className="space-y-4">
            {feedback.map((item) => {
              const isTop = item.id === topFeedbackId

              return (
                <article
                  key={item.id}
                  className="border border-[#334a66] bg-[#0d1b2a] px-4 py-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
                >
                  <div className="mb-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {isTop && <span className="text-lg">⭐</span>}
                        <span className="font-bold underline underline-offset-4">
                          {item.username}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-[#89a1c3]">
                        {new Date(item.created_at).toLocaleString()}
                      </div>
                    </div>

                    <button
                      onClick={() => toggleLike(item)}
                      disabled={likingId === item.id || item.user_id === currentUserId}
                      className={`shrink-0 border px-3 py-1 text-sm font-semibold transition ${
                        item.likedByMe
                          ? 'border-[#6d86ab] bg-[#1d3650] text-white hover:bg-[#28476a]'
                          : 'border-[#4f6b8a] bg-[#102235] text-[#dce9ff] hover:bg-[#16304a]'
                      } ${
                        item.user_id === currentUserId
                          ? 'cursor-not-allowed opacity-60'
                          : ''
                      }`}
                      title={
                        item.user_id === currentUserId
                          ? 'You cannot like your own feedback'
                          : item.likedByMe
                          ? 'Unlike'
                          : 'Like'
                      }
                    >
                      👍 {item.likeCount}
                    </button>
                  </div>

                  <p className="whitespace-pre-wrap break-words text-[15px] leading-6 text-[#e4eeff]">
                    {item.body}
                  </p>
                </article>
              )
            })}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg border border-[#4a6380] bg-[#0d1b2a] p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-xl font-bold">Leave Feedback</h2>
              <button
                onClick={() => {
                  if (!submitting) {
                    setShowModal(false)
                    setDraft('')
                    setErrorMsg(null)
                  }
                }}
                className="border border-[#4f6b8a] bg-[#102235] px-3 py-1 text-sm hover:bg-[#16304a]"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <label className="mb-2 block text-sm font-semibold text-[#bdd0ea]">
                What should be improved, added, removed, or fixed?
              </label>

              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={500}
                rows={7}
                placeholder="Write your feedback here..."
                className="w-full resize-none border border-[#4a6380] bg-[#08131e] px-3 py-3 text-sm text-white outline-none placeholder:text-[#6f88ab]"
              />

              <div className="mt-2 text-right text-xs text-[#8ea5c7]">
                {draft.trim().length}/500
              </div>

              <div className="mt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (!submitting) {
                      setShowModal(false)
                      setDraft('')
                      setErrorMsg(null)
                    }
                  }}
                  className="border border-[#4f6b8a] bg-[#102235] px-4 py-2 text-sm font-semibold hover:bg-[#16304a]"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="border border-[#6d86ab] bg-[#1d3650] px-4 py-2 text-sm font-semibold text-white hover:bg-[#28476a] disabled:opacity-60"
                >
                  {submitting ? 'Submitting...' : 'Submit Feedback'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}