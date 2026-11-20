import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import ProgressBar from '../components/ProgressBar'
import { timeAgo } from '../utils'

const PAGE = 12

export default function Home() {
  const { user } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [tab, setTab] = useState('discover')
  const [filter, setFilter] = useState('all') // all | active | finished | private
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [joiningCode, setJoiningCode] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 250)
    return () => clearTimeout(id)
  }, [searchInput])

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
        const ids = mineRows.map((r) => r.session_id)
        if (!ids.length) {
          setItems([])
          setMore(false)
          setLoading(false)
          return
        }
        q = q.in('id', ids)
      }

      if (search) {
        const escaped = search.replaceAll(',', ' ')
        q = q.or(`book_title.ilike.%${escaped}%,book_author.ilike.%${escaped}%`)
      }

      if (filter === 'private') {
        q = q.eq('visibility', 'private')
      }

      const { data, error } = await q
      if (error) setError(error.message)
      else {
        setItems((prev) => (offset ? [...prev, ...data] : data))
        setMore(data.length === PAGE)
      }
      setLoading(false)
    },
    [tab, search, filter, user.id],
  )

  useEffect(() => {
    load(0)
  }, [load])

  async function joinWithCode(e) {
    e.preventDefault()
    const code = inviteCode.trim()
    if (!code) return
    setJoiningCode(true)
    setError('')
    const { data, error } = await supabase.rpc('join_by_invite', { p_code: code })
    if (error) {
      setError(error.message)
      setJoiningCode(false)
    } else {
      navigate(`/s/${data}`)
    }
  }

  const visibleItems = items.filter((s) => {
    if (filter === 'active') {
      const mine = s.participants.find((p) => p.user_id === user.id)
      return mine ? mine.chapters_completed < s.chapter_count : true
    }
    if (filter === 'finished') {
      const mine = s.participants.find((p) => p.user_id === user.id)
      return mine ? mine.chapters_completed >= s.chapter_count : false
    }
    return true
  })

  const hasFilterOrSearch = !!search || filter !== 'all'

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t('home.title')}</h1>
          <p className="muted">{t('home.subtitle')}</p>
        </div>
        <Link to="/new" className="btn btn-primary">{t('home.newSession')}</Link>
      </div>

      <div className="home-controls">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'discover'} className={tab === 'discover' ? 'active' : ''} onClick={() => setTab('discover')}>{t('home.tabDiscover')}</button>
          <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>{t('home.tabMine')}</button>
        </div>

        <form className="invite-inline" onSubmit={joinWithCode}>
          <input
            aria-label={t('home.joinByCode')}
            placeholder={t('home.inviteCodePlaceholder')}
            value={inviteCode}
            maxLength={32}
            onChange={(e) => setInviteCode(e.target.value)}
          />
          <button className="btn btn-sm" disabled={joiningCode || !inviteCode.trim()}>{t('home.joinCodeBtn')}</button>
        </form>
      </div>

      <div className="search-bar">
        <input
          type="search"
          aria-label={t('home.searchPlaceholder')}
          placeholder={t('home.searchPlaceholder')}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <div className="filter-chips" role="group">
          {['all', 'active', 'finished', 'private'].map((f) => (
            <button
              key={f}
              type="button"
              className={`filter-chip ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {t(
                f === 'all'
                  ? 'home.filterAll'
                  : f === 'active'
                    ? 'home.filterActive'
                    : f === 'finished'
                      ? 'home.filterFinished'
                      : 'home.filterPrivate',
              )}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="error" role="alert" onClick={() => setError('')}>{error}</p>}

      <div className="grid">
        {visibleItems.map((s) => {
          const mine = s.participants.find((p) => p.user_id === user.id)
          const readerCount = s.participants.length
          return (
            <Link key={s.id} to={`/s/${s.id}`} className="card session-card">
              <div className="book-spine" aria-hidden>{s.visibility === 'private' ? '🔐' : '📕'}</div>
              <div className="session-card-body">
                <div className="session-card-head">
                  <h3>{s.book_title}</h3>
                  {s.visibility === 'private' && <span className="pill pill-sm">{t('home.privateBadge')}</span>}
                </div>
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
      {!loading && !visibleItems.length && !error && (
        <div className="empty card">
          <div className="empty-emoji">{hasFilterOrSearch ? '🔎' : '🪄'}</div>
          <h3>{hasFilterOrSearch ? t('home.noMatches') : tab === 'mine' ? t('home.emptyMine') : t('home.emptyAll')}</h3>
          <p className="muted">{hasFilterOrSearch ? t('home.noMatchesSub') : t('home.emptySubtitle')}</p>
          {!hasFilterOrSearch && <Link to="/new" className="btn btn-primary">{t('home.createSession')}</Link>}
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
