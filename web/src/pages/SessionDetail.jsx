import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { supabase } from '../supabase'
import Avatar from '../components/Avatar'
import ProgressBar from '../components/ProgressBar'
import Comment from '../components/Comment'

export default function SessionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useI18n()
  const [session, setSession] = useState(null)
  const [chapters, setChapters] = useState([])
  const [participants, setParticipants] = useState([])
  const [comments, setComments] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [chapterRef, setChapterRef] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [hideSpoilers, setHideSpoilers] = useState(true)
  const [posting, setPosting] = useState(false)
  const [tab, setTab] = useState('discussion')
  const [limit, setLimit] = useState(50)
  const [editingSession, setEditingSession] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editAuthor, setEditAuthor] = useState('')
  const [editCount, setEditCount] = useState(1)
  const [editVisibility, setEditVisibility] = useState('public')
  const [editTitles, setEditTitles] = useState([])
  const [savingSession, setSavingSession] = useState(false)
  const timer = useRef(null)

  const me = participants.find((p) => p.user_id === user.id)
  const isHost = session?.host_id === user.id

  const load = useCallback(async () => {
    const [s, c, p, m] = await Promise.all([
      supabase.from('sessions').select('*, host:profiles!sessions_host_id_fkey(display_name)').eq('id', id).maybeSingle(),
      supabase.from('chapters').select('position, title').eq('session_id', id).order('position'),
      supabase
        .from('participants')
        .select('user_id, chapters_completed, muted, joined_at, profile:profiles!participants_user_id_fkey(display_name, avatar_url)')
        .eq('session_id', id)
        .order('joined_at'),
      supabase
        .from('comments')
        .select('id, body, chapter_ref, reply_to_id, created_at, edited_at, author_id, author:profiles!comments_author_id_fkey(display_name, avatar_url), reactions(emoji, user_id, user:profiles!reactions_user_id_fkey(display_name))')
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

  async function toggleMute() {
    if (!me) return
    const next = !me.muted
    setParticipants((ps) => ps.map((p) => (p.user_id === user.id ? { ...p, muted: next } : p)))
    const { error } = await supabase
      .from('participants')
      .update({ muted: next })
      .eq('session_id', id)
      .eq('user_id', user.id)
    if (error) setError(error.message)
    load()
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
    const payload = {
      session_id: id,
      body: text,
      chapter_ref: chapterRef ? Number(chapterRef) : null,
      reply_to_id: replyTo?.id ?? null,
    }
    const { error } = await supabase.from('comments').insert(payload)
    if (error) setError(error.message)
    else {
      setBody('')
      setReplyTo(null)
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

  async function copyInviteLink() {
    if (!session?.invite_code) return
    const url = `${window.location.origin}/invite/${session.invite_code}`
    try {
      await navigator.clipboard.writeText(url)
      setNotice(t('session.copiedInvite'))
      setTimeout(() => setNotice(''), 2500)
    } catch {
      window.prompt(t('session.copyInvite'), url)
    }
  }

  async function regenerateInvite() {
    if (!window.confirm(t('session.regenerateConfirm'))) return
    const { error } = await supabase.rpc('regenerate_invite_code', { p_session_id: id })
    if (error) setError(error.message)
    else load()
  }

  function openEditSession() {
    setEditTitle(session.book_title)
    setEditAuthor(session.book_author)
    setEditCount(session.chapter_count)
    setEditVisibility(session.visibility ?? 'public')
    setEditTitles(chapters.map((c) => c.title ?? ''))
    setEditingSession(true)
  }

  async function saveSessionEdits(e) {
    e.preventDefault()
    setSavingSession(true)
    setError('')
    const n = Math.min(200, Math.max(1, Number(editCount) || 1))
    const nextChapters = Array.from({ length: n }, (_, i) => (editTitles[i] ?? '').trim())
    const { error } = await supabase.rpc('update_session', {
      p_session_id: id,
      p_title: editTitle,
      p_author: editAuthor,
      p_chapters: nextChapters,
      p_visibility: editVisibility,
    })
    if (error) setError(error.message)
    else {
      setEditingSession(false)
      load()
    }
    setSavingSession(false)
  }

  async function deleteSession() {
    if (!window.confirm(t('session.deleteSessionConfirm'))) return
    const { error } = await supabase.rpc('delete_session', { p_session_id: id })
    if (error) setError(error.message)
    else navigate('/', { replace: true })
  }

  async function removeParticipant(p) {
    const name = p.profile?.display_name ?? t('common.deletedUser')
    if (!window.confirm(t('session.removeReaderConfirm', { name }))) return
    const { error } = await supabase.rpc('remove_participant', { p_session_id: id, p_user_id: p.user_id })
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
  const commentsById = Object.fromEntries(comments.map((c) => [c.id, c]))
  const editN = Math.min(200, Math.max(1, Number(editCount) || 1))

  return (
    <div>
      <Link to="/" className="back">{t('session.allSessions')}</Link>
      <section className="card hero">
        <div className="hero-cover" aria-hidden>{session.visibility === 'private' ? '🔐' : '📖'}</div>
        <div>
          <div className="hero-title-row">
            <h1>{session.book_title}</h1>
            {session.visibility === 'private' && <span className="pill">{t('session.privateBadge')}</span>}
          </div>
          <p className="muted">{t('session.byAuthor', { author: session.book_author })}</p>
          <p className="meta">
            {t('session.heroMeta', {
              total,
              host: session.host?.display_name ?? t('common.someone'),
              readers: readersLabel,
              avg,
            })}
          </p>
          {session.visibility === 'private' && session.invite_code && (
            <div className="invite-bar">
              <code className="invite-code">{t('session.inviteCode', { code: session.invite_code })}</code>
              <button type="button" className="btn btn-sm" onClick={copyInviteLink}>{t('session.copyInvite')}</button>
              {isHost && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={regenerateInvite}>{t('session.regenerateInvite')}</button>
              )}
            </div>
          )}
        </div>
        <div className="hero-action">
          {isHost && (
            <button className="btn btn-sm" onClick={openEditSession}>⚙ {t('session.hostSettings')}</button>
          )}
          {me && (
            <button className="btn btn-ghost btn-sm" onClick={toggleMute}>
              {me.muted ? `🔔 ${t('session.unmute')}` : `🔕 ${t('session.mute')}`}
            </button>
          )}
          {me ? (
            !isHost && <button className="btn btn-ghost btn-sm" onClick={leave}>{t('session.leave')}</button>
          ) : (
            <button className="btn btn-primary" onClick={join}>{t('session.join')}</button>
          )}
        </div>
      </section>

      {notice && <p className="notice">{notice}</p>}
      {error && (
        <p className="error" role="alert" onClick={() => setError('')}>{error}</p>
      )}

      {editingSession && (
        <section className="card host-panel">
          <div className="host-panel-head">
            <h3>{t('session.editSession')}</h3>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingSession(false)}>{t('common.close')}</button>
          </div>
          <form className="form" onSubmit={saveSessionEdits}>
            <label>
              {t('createSession.bookTitle')}
              <input required maxLength={200} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </label>
            <label>
              {t('createSession.author')}
              <input required maxLength={200} value={editAuthor} onChange={(e) => setEditAuthor(e.target.value)} />
            </label>
            <label>
              {t('createSession.chapterCount')}
              <input type="number" required min={1} max={200} value={editCount} onChange={(e) => setEditCount(e.target.value)} />
            </label>
            <div className="vis-grid" role="radiogroup" aria-label={t('createSession.visibility')}>
              <button type="button" role="radio" aria-checked={editVisibility === 'public'} className={`vis-option ${editVisibility === 'public' ? 'active' : ''}`} onClick={() => setEditVisibility('public')}>
                <strong>🌐 {t('createSession.public')}</strong>
              </button>
              <button type="button" role="radio" aria-checked={editVisibility === 'private'} className={`vis-option ${editVisibility === 'private' ? 'active' : ''}`} onClick={() => setEditVisibility('private')}>
                <strong>🔒 {t('createSession.private')}</strong>
              </button>
            </div>
            <div className="chapter-inputs">
              {Array.from({ length: editN }, (_, i) => (
                <div key={i} className="chapter-input">
                  <span className="chapter-num">{i + 1}</span>
                  <input
                    maxLength={120}
                    placeholder={t('session.chapterN', { n: i + 1 })}
                    value={editTitles[i] ?? ''}
                    onChange={(e) => {
                      const next = [...editTitles]
                      next[i] = e.target.value
                      setEditTitles(next)
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="form-actions host-actions">
              <button type="button" className="btn btn-danger btn-sm" onClick={deleteSession}>{t('session.deleteSession')}</button>
              <div className="row">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingSession(false)}>{t('common.cancel')}</button>
                <button className="btn btn-primary btn-sm" disabled={savingSession}>{savingSession ? t('common.saving') : t('session.saveSession')}</button>
              </div>
            </div>
          </form>
        </section>
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
                      {isHost && p.user_id !== session.host_id && (
                        <button type="button" className="link-btn danger small reader-kick" onClick={() => removeParticipant(p)}>
                          {t('session.removeReader')}
                        </button>
                      )}
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
            <div className="thread-head">
              <h3>{t('session.discussion')}</h3>
              {me && (
                <label className="check small">
                  <input type="checkbox" checked={hideSpoilers} onChange={(e) => setHideSpoilers(e.target.checked)} />
                  {t('session.hideSpoilers', { n: me.chapters_completed })}
                </label>
              )}
            </div>
            {me ? (
              <form className="composer" onSubmit={post}>
                {replyTo && (
                  <div className="reply-banner">
                    <span className="small">
                      ↩ {t('session.replyingTo', { name: replyTo.author?.display_name ?? t('common.deletedUser') })}
                    </span>
                    <button type="button" className="link-btn" onClick={() => setReplyTo(null)}>{t('common.cancel')}</button>
                  </div>
                )}
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
                  <div className="composer-meta">
                    <select
                      className="chapter-select"
                      aria-label={t('session.chapterTagNone')}
                      value={chapterRef}
                      onChange={(e) => setChapterRef(e.target.value)}
                    >
                      <option value="">{t('session.chapterTagNone')}</option>
                      {chapters.map((c) => (
                        <option key={c.position} value={c.position}>
                          {t('session.chapterTag', { n: c.position })}{c.title ? ` — ${c.title}` : ''}
                        </option>
                      ))}
                    </select>
                    <span className="muted small">{body.length}/2000</span>
                  </div>
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
                      replyTarget={c.reply_to_id ? commentsById[c.reply_to_id] : null}
                      canReact={!!me}
                      canModerate={isHost}
                      hideSpoilers={hideSpoilers}
                      myProgress={me?.chapters_completed ?? 0}
                      onToggleReaction={toggleReaction}
                      onReply={setReplyTo}
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
