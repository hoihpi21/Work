import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import ProgressBar from '../components/ProgressBar'
import { timeAgo } from '../utils'

const PAGE = 12

export default function Home() {
  const { user } = useAuth()
  const { t } = useI18n()
  const [tab, setTab] = useState('discover')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(
    async (offset = 0) => {
      setLoading(true)
      setError('')
      let q = supabase
        .from('sessions')
        .select('*, host:profiles!sessions_host_id_fkey(display_name), participants(user_id, chapters_completed)')
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE - 1)
      if (tab === 'mine') {
        const { data: mineRows, error: e1 } = await supabase.from('participants').select('session_id').eq('user_id', user.id)
        if (e1) {
          setError(e1.message)
          setLoading(false)
          return
        }
        q = q.in('id', mineRows.map((r) => r.session_id))
      }
      const { data, error } = await q
      if (error) setError(error.message)
      else {
        setItems((prev) => (offset ? [...prev, ...data] : data))
        setMore(data.length === PAGE)
      }
      setLoading(false)
    },
    [tab, user.id],
  )

  useEffect(() => {
    load(0)
  }, [load])

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t('home.title')}</h1>
          <p className="muted">{t('home.subtitle')}</p>
        </div>
        <Link to="/new" className="btn btn-primary">{t('home.newSession')}</Link>
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'discover'} className={tab === 'discover' ? 'active' : ''} onClick={() => setTab('discover')}>{t('home.tabDiscover')}</button>
        <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>{t('home.tabMine')}</button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="grid">
        {items.map((s) => {
          const mine = s.participants.find((p) => p.user_id === user.id)
          const readerCount = s.participants.length
          return (
            <Link key={s.id} to={`/s/${s.id}`} className="card session-card">
              <div className="book-spine" aria-hidden>📕</div>
              <div className="session-card-body">
                <h3>{s.book_title}</h3>
                <p className="muted">{t('session.byAuthor', { author: s.book_author })}</p>
                <p className="meta">
                  {t('home.sessionMeta', {
                    count: s.chapter_count,
                    host: s.host?.display_name ?? t('common.someone'),
                    time: timeAgo(s.created_at, t),
                  })}
                </p>
                <div className="session-card-foot">
                  <span className="pill">
                    👥 {t(readerCount === 1 ? 'session.readerOne' : 'session.readerMany', { count: readerCount })}
                  </span>
                  {mine && <ProgressBar done={mine.chapters_completed} total={s.chapter_count} size="sm" />}
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {loading && <p className="muted center pad">{t('common.loading')}</p>}
      {!loading && !items.length && !error && (
        <div className="empty card">
          <div className="empty-emoji">🪄</div>
          <h3>{tab === 'mine' ? t('home.emptyMine') : t('home.emptyAll')}</h3>
          <p className="muted">{t('home.emptySubtitle')}</p>
          <Link to="/new" className="btn btn-primary">{t('home.createSession')}</Link>
        </div>
      )}
      {!loading && more && (
        <div className="center pad">
          <button className="btn" onClick={() => load(items.length)}>{t('home.loadMore')}</button>
        </div>
      )}
    </div>
  )
}
