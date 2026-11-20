import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import Avatar from './Avatar'
import { timeAgo } from '../utils'

const EmojiPicker = lazy(() => import('emoji-picker-react'))
const QUICK = ['👍', '❤️', '😂', '😮', '🤔']

export default function Comment({
  comment,
  replyTarget,
  canReact,
  canModerate,
  hideSpoilers,
  myProgress = 0,
  onToggleReaction,
  onReply,
  onEdit,
  onDelete,
}) {
  const { user } = useAuth()
  const { t } = useI18n()
  const isMine = comment.author_id === user.id
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const [picker, setPicker] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const pickerRef = useRef(null)

  useEffect(() => {
    if (!picker) return
    const close = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setPicker(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [picker])

  const groups = []
  for (const r of comment.reactions ?? []) {
    let g = groups.find((x) => x.emoji === r.emoji)
    if (!g) groups.push((g = { emoji: r.emoji, users: [] }))
    g.users.push(r)
  }

  const name = comment.author?.display_name ?? t('common.deletedUser')
  const isSpoiler = !isMine && hideSpoilers && comment.chapter_ref && comment.chapter_ref > myProgress
  const hidden = isSpoiler && !revealed

  async function saveEdit() {
    const body = draft.trim()
    if (!body) return
    await onEdit(comment.id, body)
    setEditing(false)
  }

  function handleDelete() {
    const msg = isMine ? t('comment.deleteConfirm') : t('comment.deleteAsHostConfirm')
    if (window.confirm(msg)) onDelete(comment.id)
  }

  return (
    <li id={`comment-${comment.id}`} className={`comment ${isMine ? 'comment-mine' : ''}`}>
      <Avatar name={name} url={comment.author?.avatar_url} size={36} />
      <div className="comment-main">
        <div className="comment-head">
          <strong>{name}</strong>
          {comment.chapter_ref && (
            <span className="pill pill-sm">{t('comment.chapterBadge', { n: comment.chapter_ref })}</span>
          )}
          <span className="muted small">
            {timeAgo(comment.created_at, t)}
            {comment.edited_at && t('comment.edited')}
          </span>
        </div>

        {replyTarget && (
          <a href={`#comment-${replyTarget.id}`} className="reply-quote">
            <span className="reply-quote-author">
              ↩ {t('comment.repliedTo', { name: replyTarget.author?.display_name ?? t('common.deletedUser') })}
            </span>
            <span className="reply-quote-body">{replyTarget.body}</span>
          </a>
        )}

        {editing ? (
          <div className="edit-box">
            <textarea value={draft} maxLength={2000} rows={3} onChange={(e) => setDraft(e.target.value)} />
            <div className="form-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setDraft(comment.body) }}>{t('common.cancel')}</button>
              <button className="btn btn-primary btn-sm" onClick={saveEdit}>{t('common.save')}</button>
            </div>
          </div>
        ) : hidden ? (
          <div className="spoiler-box">
            <span>🙈 {t('comment.spoilerHidden', { n: comment.chapter_ref })}</span>
            <button type="button" className="btn btn-sm" onClick={() => setRevealed(true)}>
              {t('comment.revealSpoiler')}
            </button>
          </div>
        ) : (
          <div>
            <p className="comment-body">{comment.body}</p>
            {isSpoiler && revealed && (
              <button type="button" className="link-btn small" onClick={() => setRevealed(false)}>
                {t('comment.hideSpoiler')}
              </button>
            )}
          </div>
        )}

        <div className="reactions">
          {groups.map((g) => {
            const reacted = g.users.some((u) => u.user_id === user.id)
            const who = g.users.map((u) => u.user?.display_name ?? t('common.someoneCap')).join(', ')
            return (
              <button
                key={g.emoji}
                className={`reaction ${reacted ? 'reacted' : ''}`}
                title={who}
                aria-label={`${g.emoji} ${g.users.length}: ${who}`}
                disabled={!canReact}
                onClick={() => onToggleReaction(comment, g.emoji)}
              >
                <span>{g.emoji}</span> {g.users.length}
              </button>
            )
          })}
          {canReact && (
            <span className="react-add" ref={pickerRef}>
              <button className="reaction reaction-add" aria-label={t('comment.addReaction')} onClick={() => setPicker((v) => !v)}>
                ☺ +
              </button>
              {picker && (
                <div className="picker-pop">
                  <div className="quick">
                    {QUICK.map((e) => (
                      <button key={e} onClick={() => { onToggleReaction(comment, e); setPicker(false) }}>{e}</button>
                    ))}
                  </div>
                  <Suspense fallback={<div className="pad muted small">{t('common.loading')}</div>}>
                    <EmojiPicker
                      width="100%"
                      height={340}
                      lazyLoadEmojis
                      previewConfig={{ showPreview: false }}
                      onEmojiClick={(d) => { onToggleReaction(comment, d.emoji); setPicker(false) }}
                    />
                  </Suspense>
                </div>
              )}
            </span>
          )}
          {!editing && (
            <span className="comment-actions">
              {canReact && onReply && (
                <button className="link-btn" onClick={() => onReply(comment)}>{t('comment.reply')}</button>
              )}
              {isMine && (
                <button className="link-btn" onClick={() => setEditing(true)}>{t('comment.edit')}</button>
              )}
              {(isMine || canModerate) && (
                <button className="link-btn danger" onClick={handleDelete}>{t('comment.delete')}</button>
              )}
            </span>
          )}
        </div>
      </div>
    </li>
  )
}
