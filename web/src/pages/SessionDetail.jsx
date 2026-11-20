import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { supabase } from '../supabase'
import Avatar from '../components/Avatar'
import ProgressBar from '../components/ProgressBar'
import Comment from '../components/Comment'

export default function SessionDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const { t } = useI18n()
  const [session, setSession] = useState(null)
  const [chapters, setChapters] = useState([])
  const [participants, setParticipants] = useState([])
  const [comments, setComments] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [tab, setTab] = useState('discussion') // mobile tabs
  const [limit, setLimit] = useState(50)
  const timer = useRef(null)

  const me = participants.find((p) => p.user_id === user.id)

  const load = useCallback(async () => {
    const [s, c, p, m] = await Promise.all([
      supabase.from('sessions').select('*, host:profiles!sessions_host_id_fkey(display_name)').eq('id', id).maybeSingle(),
      supabase.from('chapters').select('position, title').eq('session_id', id).order('position'),
      supabase
        .from('participants')
        .select('user_id, chapters_completed, joined_at, profile:profiles!participants_user_id_fkey(display_name, avatar_url)')
        .eq('session_id', id)
        .order('joined_at'),
      supabase
        .from('comments')
        .select('id, body, created_at, edited_at, author_id, author:profiles!comments_author_id_fkey(display_name, avatar_url), reactions(emoji, user_id, user:profiles!reactions_user_id_fkey(display_name))')
        .eq('session_id', id)
        .order('created_at', { ascending: false })
        .limit(limit),
    ])
    const err = s.error || c.error || p.error || m.error
    if (err) setError(err.message)
    else if (!s.data) setError(t('session.notFound'))
    else {
      setSession(s.data)
      setChapters(c.data)
      setParticipants(p.data)
      setComments([...m.data].reverse())
    }
    setLoading(false)
  }, [id, limit, t])

  useEffect(() => {
    load()
    const refresh = () => {
      clearTimeout(timer.current)
      timer.current = setTimeout(load, 250)
    }
    const channel = supabase
      .channel(`session-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `session_id=eq.${id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `session_id=eq.${id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, refresh)
      .subscribe()
    return () => {
      clearTimeout(timer.current)
      supabase.removeChannel(channel)
    }
  }, [id, load])

  async function join() {
    const { error } = await supabase.from('participants').insert({ session_id: id })
    if (error) setError(error.message)
    else load()
  }

  async function leave() {
    if (!window.confirm(t('session.leaveConfirm'))) return
    const { error } = await supabase.from('participants').delete().eq('session_id', id).eq('user_id', user.id)
    if (error) setError(error.message)
    else load()
  }

  async function setProgress(n) {
    setParticipants((ps) => ps.map((p) => (p.user_id === user.id ? { ...p, chapters_completed: n } : p)))
    const { error } = await supabase
      .from('participants')
      .update({ chapters_completed: n })
      .eq('session_id', id)
      .eq('user_id', user.id)
    if (error) setError(error.message)
    load()
  }

  async function post(e) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    setPosting(true)
    const { error } = await supabase.from('comments').insert({ session_id: id, body: text })
    if (error) setError(error.message)
    else {
      setBody('')
      load()
    }
    setPosting(false)
  }

  async function editComment(cid, text) {
    const { error } = await supabase.from('comments').update({ body: text }).eq('id', cid)
    if (error) setError(error.message)
    else load()
  }

  async function deleteComment(cid) {
    const { error } = await supabase.from('comments').delete().eq('id', cid)
    if (error) setError(error.message)
    else load()
  }

  async function toggleReaction(comment, emoji) {
    const has = comment.reactions.some((r) => r.emoji === emoji && r.user_id === user.id)
    const q = has
      ? supabase.from('reactions').delete().eq('comment_id', comment.id).eq('user_id', user.id).eq('emoji', emoji)
      : supabase.from('reactions').insert({ comment_id: comment.id, emoji })
    const { error } = await q
    if (error) setError(error.message)
    else load()
  }

  if (loading) return <p className="muted center pad">{t('common.loading')}</p>
  if (!session)
    return (
      <div className="empty card">
        <h3>{error || t('session.notFound')}</h3>
        <Link to="/" className="btn">{t('session.backToSessions')}</Link>
      </div>
    )

  const total = session.chapter_count
  const avg = participants.length
    ? Math.round((participants.reduce((a, p) => a + p.chapters_completed, 0) / participants.length / total) * 100)
    : 0
  const readersLabel = t(participants.length === 1 ? 'session.readerOne' : 'session.readerMany', {
    count: participants.length,
  })
  const nextChapterTitle = me && chapters[me.chapters_completed]?.title

  return (
    <div>
      <Link to="/" className="back">{t('session.allSessions')}</Link>
      <section className="card hero">
        <div className="hero-cover" aria-hidden>📖</div>
        <div>
          <h1>{session.book_title}</h1>
          <p className="muted">{t('session.byAuthor', { author: session.book_author })}</p>
          <p className="meta">
            {t('session.heroMeta', {
              total,
              host: session.host?.display_name ?? t('common.someone'),
              readers: readersLabel,
              avg,
            })}
          </p>
        </div>
        <div className="hero-action">
          {me ? (
            <button className="btn btn-ghost btn-sm" onClick={leave}>{t('session.leave')}</button>
          ) : (
            <button className="btn btn-primary" onClick={join}>{t('session.join')}</button>
          )}
        </div>
      </section>

      {error && (
        <p className="error" role="alert" onClick={() => setError('')}>{error}</p>
      )}

      <div className="tabs only-mobile" role="tablist">
        <button className={tab === 'discussion' ? 'active' : ''} onClick={() => setTab('discussion')}>{t('session.tabDiscussion')}</button>
        <button className={tab === 'readers' ? 'active' : ''} onClick={() => setTab('readers')}>{t('session.tabProgress')}</button>
      </div>

      <div className="detail-grid">
        <aside className={`side ${tab === 'readers' ? '' : 'hide-mobile'}`}>
          {me && (
            <div className="card">
              <h3>{t('session.yourProgress')}</h3>
              <ProgressBar done={me.chapters_completed} total={total} />
              <p className="muted small">{t('session.tapChapter')}</p>
              <div className="chapter-chips">
                {chapters.map((c) => {
                  const done = c.position <= me.chapters_completed
                  return (
                    <button
                      key={c.position}
                      className={`chip ${done ? 'done' : ''}`}
                      title={c.title || t('session.chapterN', { n: c.position })}
                      aria-pressed={done}
                      onClick={() => setProgress(me.chapters_completed === c.position ? c.position - 1 : c.position)}
                    >
                      {c.position}
                    </button>
                  )
                })}
              </div>
              {me.chapters_completed < total ? (
                <button className="btn btn-block" onClick={() => setProgress(me.chapters_completed + 1)}>
                  {nextChapterTitle
                    ? t('session.finishedChapterTitled', { n: me.chapters_completed + 1, title: nextChapterTitle })
                    : t('session.finishedChapter', { n: me.chapters_completed + 1 })}
                </button>
              ) : (
                <p className="notice">{t('session.finishedBook')}</p>
              )}
            </div>
          )}
          <div className="card">
            <h3>{t('session.readers')}</h3>
            <ul className="readers">
              {participants.map((p) => (
                <li key={p.user_id}>
                  <Avatar name={p.profile?.display_name} url={p.profile?.avatar_url} size={30} />
                  <div className="reader-main">
                    <span className="reader-name">
                      {p.profile?.display_name ?? t('common.deletedUser')}
                      {p.user_id === session.host_id && <span className="pill pill-sm">{t('session.hostBadge')}</span>}
                    </span>
                    <ProgressBar done={p.chapters_completed} total={total} size="sm" />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section className={`thread ${tab === 'discussion' ? '' : 'hide-mobile'}`}>
          <div className="card">
            <h3>{t('session.discussion')}</h3>
            {me ? (
              <form className="composer" onSubmit={post}>
                <textarea
                  rows={3}
                  maxLength={2000}
                  placeholder={t('session.commentPlaceholder')}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') post(e)
                  }}
                />
                <div className="composer-foot">
                  <span className="muted small">{body.length}/2000</span>
                  <button className="btn btn-primary" disabled={posting || !body.trim()}>{t('session.post')}</button>
                </div>
              </form>
            ) : (
              <p className="notice">{t('session.joinToDiscuss')}</p>
            )}

            {comments.length === 0 ? (
              <p className="muted center pad">{t('session.noComments')}</p>
            ) : (
              <>
              {comments.length >= limit && (
                <div className="center pad">
                  <button className="btn btn-sm" onClick={() => setLimit((l) => l + 50)}>{t('session.loadEarlier')}</button>
                </div>
              )}
              <ul className="comments">
                {comments.map((c) => (
                  <Comment
                    key={c.id}
                    comment={c}
                    canReact={!!me}
                    onToggleReaction={toggleReaction}
                    onEdit={editComment}
                    onDelete={deleteComment}
                  />
                ))}
              </ul>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
