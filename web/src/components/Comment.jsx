import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import Avatar from './Avatar'
import { timeAgo } from '../utils'

const EmojiPicker = lazy(() => import('emoji-picker-react'))
const QUICK = ['👍', '❤️', '😂', '😮', '🤔']

export default function Comment({ comment, canReact, onToggleReaction, onEdit, onDelete }) {
  const { user } = useAuth()
  const { t } = useI18n()
  const isMine = comment.author_id === user.id
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const [picker, setPicker] = useState(false)
  const pickerRef = useRef(null)

  useEffect(() => {
    if (!picker) return
    const close = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setPicker(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [picker])

  // group reactions by emoji
  const groups = []
  for (const r of comment.reactions ?? []) {
    let g = groups.find((x) => x.emoji === r.emoji)
    if (!g) groups.push((g = { emoji: r.emoji, users: [] }))
    g.users.push(r)
  }

  const name = comment.author?.display_name ?? t('common.deletedUser')

  async function saveEdit() {
    const body = draft.trim()
    if (!body) return
    await onEdit(comment.id, body)
    setEditing(false)
  }

  return (
    <li className={`comment ${isMine ? 'comment-mine' : ''}`}>
      <Avatar name={name} url={comment.author?.avatar_url} size={36} />
      <div className="comment-main">
        <div className="comment-head">
          <strong>{name}</strong>
          <span className="muted small">
            {timeAgo(comment.created_at, t)}
            {comment.edited_at && t('comment.edited')}
          </span>
        </div>

        {editing ? (
          <div className="edit-box">
            <textarea value={draft} maxLength={2000} rows={3} onChange={(e) => setDraft(e.target.value)} />
            <div className="form-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setDraft(comment.body) }}>{t('common.cancel')}</button>
              <button className="btn btn-primary btn-sm" onClick={saveEdit}>{t('common.save')}</button>
            </div>
          </div>
        ) : (
          <p className="comment-body">{comment.body}</p>
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
          {isMine && !editing && (
            <span className="comment-actions">
              <button className="link-btn" onClick={() => setEditing(true)}>{t('comment.edit')}</button>
              <button className="link-btn danger" onClick={() => window.confirm(t('comment.deleteConfirm')) && onDelete(comment.id)}>{t('comment.delete')}</button>
            </span>
          )}
        </div>
      </div>
    </li>
  )
}
