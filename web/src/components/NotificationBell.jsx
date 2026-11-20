import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { timeAgo } from '../utils'

export default function NotificationBell() {
  const { user } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const load = useCallback(async () => {
    if (!user) return
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, session_id, emoji, read_at, created_at, actor:profiles!notifications_actor_id_fkey(display_name), session:sessions(book_title)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
    if (!error && data) setItems(data)
  }, [user])

  useEffect(() => {
    load()
    if (!user) return
    const channel = supabase
      .channel(`notifs-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, load])

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const unread = items.filter((n) => !n.read_at).length

  async function markAllRead() {
    const now = new Date().toISOString()
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })))
    await supabase.from('notifications').update({ read_at: now }).eq('user_id', user.id).is('read_at', null)
  }

  async function openItem(n) {
    setOpen(false)
    if (!n.read_at) {
      const now = new Date().toISOString()
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: now } : x)))
      await supabase.from('notifications').update({ read_at: now }).eq('id', n.id)
    }
    navigate(`/s/${n.session_id}`)
  }

  function labelFor(n) {
    const actor = n.actor?.display_name ?? t('common.someoneCap')
    const book = n.session?.book_title ?? ''
    if (n.type === 'reply') return t('notifications.reply', { actor, book })
    if (n.type === 'reaction') return t('notifications.reaction', { actor, emoji: n.emoji ?? '👍', book })
    return t('notifications.comment', { actor, book })
  }

  return (
    <div className="notif-wrap" ref={ref}>
      <button
        type="button"
        className="btn btn-ghost btn-sm notif-btn"
        aria-label={t('nav.notifications')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-pop" role="dialog" aria-label={t('notifications.title')}>
          <div className="notif-head">
            <strong>{t('notifications.title')}</strong>
            {unread > 0 && (
              <button type="button" className="link-btn" onClick={markAllRead}>
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="muted small center pad">{t('notifications.empty')}</p>
          ) : (
            <ul className="notif-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`notif-item ${!n.read_at ? 'unread' : ''}`}
                    onClick={() => openItem(n)}
                  >
                    <span>{labelFor(n)}</span>
                    <span className="muted small">{timeAgo(n.created_at, t)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
