import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useI18n } from '../i18n'

export default function CreateSession() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [count, setCount] = useState(10)
  const [visibility, setVisibility] = useState('public')
  const [named, setNamed] = useState(false)
  const [titles, setTitles] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const n = Math.min(200, Math.max(1, Number(count) || 1))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const chapters = Array.from({ length: n }, (_, i) => (named ? (titles[i] ?? '').trim() : ''))
    const { data, error } = await supabase.rpc('create_session', {
      p_title: title,
      p_author: author,
      p_chapters: chapters,
      p_visibility: visibility,
    })
    if (error) {
      setError(error.message)
      setBusy(false)
    } else navigate(`/s/${data}`)
  }

  return (
    <div className="narrow">
      <h1>{t('createSession.title')}</h1>
      <p className="muted">{t('createSession.subtitle')}</p>
      <form className="card form" onSubmit={submit}>
        <label>
          {t('createSession.bookTitle')}
          <input required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('createSession.bookTitlePlaceholder')} />
        </label>
        <label>
          {t('createSession.author')}
          <input required maxLength={200} value={author} onChange={(e) => setAuthor(e.target.value)} placeholder={t('createSession.authorPlaceholder')} />
        </label>
        <label>
          {t('createSession.chapterCount')}
          <input type="number" required min={1} max={200} value={count} onChange={(e) => setCount(e.target.value)} />
        </label>
        <div className="field-group">
          <span className="field-label">{t('createSession.visibility')}</span>
          <div className="vis-grid" role="radiogroup" aria-label={t('createSession.visibility')}>
            <button
              type="button"
              role="radio"
              aria-checked={visibility === 'public'}
              className={`vis-option ${visibility === 'public' ? 'active' : ''}`}
              onClick={() => setVisibility('public')}
            >
              <strong>🌐 {t('createSession.public')}</strong>
              <span className="muted small">{t('createSession.publicDesc')}</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={visibility === 'private'}
              className={`vis-option ${visibility === 'private' ? 'active' : ''}`}
              onClick={() => setVisibility('private')}
            >
              <strong>🔒 {t('createSession.private')}</strong>
              <span className="muted small">{t('createSession.privateDesc')}</span>
            </button>
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={named} onChange={(e) => setNamed(e.target.checked)} />
          {t('createSession.nameChapters')}
        </label>
        {named && (
          <div className="chapter-inputs">
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className="chapter-input">
                <span className="chapter-num">{i + 1}</span>
                <input
                  maxLength={120}
                  placeholder={t('session.chapterN', { n: i + 1 })}
                  value={titles[i] ?? ''}
                  onChange={(e) => {
                    const next = [...titles]
                    next[i] = e.target.value
                    setTitles(next)
                  }}
                />
              </div>
            ))}
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>{t('common.cancel')}</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? t('createSession.creating') : t('createSession.submit')}</button>
        </div>
      </form>
    </div>
  )
}
