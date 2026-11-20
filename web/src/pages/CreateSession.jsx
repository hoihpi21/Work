import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import {
  ACCEPT_ATTR,
  addSessionUrl,
  formatSize,
  getExt,
  normalizeResourceUrl,
  titleFromFilename,
  uploadSessionFile,
  validateResourceFile,
} from '../resources'

export default function CreateSession() {
  const { user } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [count, setCount] = useState(10)
  const [visibility, setVisibility] = useState('public')
  const [named, setNamed] = useState(false)
  const [titles, setTitles] = useState([])
  const [queuedFiles, setQueuedFiles] = useState([]) // [{ id, file, contentType }]
  const [queuedUrls, setQueuedUrls] = useState([]) // [{ id, url, title }]
  const [showUrlForm, setShowUrlForm] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [urlTitle, setUrlTitle] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const n = Math.min(200, Math.max(1, Number(count) || 1))

  function onPickFiles(e) {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!picked.length) return
    setError('')
    const next = []
    for (const file of picked) {
      const check = validateResourceFile(file, t)
      if (check.error) {
        setError(check.error)
        continue
      }
      next.push({ id: `${Date.now()}-${Math.random()}`, file, contentType: check.contentType })
    }
    if (next.length) {
      setQueuedFiles((prev) => [...prev, ...next])
      if (!title.trim()) setTitle(titleFromFilename(next[0].file.name))
    }
  }

  function addQueuedUrl() {
    const res = normalizeResourceUrl(urlInput, urlTitle, t)
    if (res.error) return setError(res.error)
    setError('')
    setQueuedUrls((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, url: res.url, title: res.title }])
    setUrlInput('')
    setUrlTitle('')
    setShowUrlForm(false)
  }

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setStatus(t('createSession.creating'))
    const chapters = Array.from({ length: n }, (_, i) => (named ? (titles[i] ?? '').trim() : ''))
    const { data: sessionId, error: createErr } = await supabase.rpc('create_session', {
      p_title: title,
      p_author: author,
      p_chapters: chapters,
      p_visibility: visibility,
    })
    if (createErr) {
      setError(createErr.message)
      setBusy(false)
      setStatus('')
      return
    }

    if (queuedFiles.length || queuedUrls.length) {
      setStatus(t('createSession.uploadingFiles'))
      try {
        for (const item of queuedFiles) {
          await uploadSessionFile({
            sessionId,
            userId: user.id,
            file: item.file,
            contentType: item.contentType,
          })
        }
        for (const item of queuedUrls) {
          await addSessionUrl({ sessionId, url: item.url, title: item.title })
        }
      } catch (err) {
        // Session was created; still navigate so user isn't stuck, or show error?
        // Navigate to session so they can retry any failed file inside the session.
        console.error('Attachment upload failed:', err)
      }
    }

    navigate(`/s/${sessionId}`)
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

        <div className="attach-box">
          <div className="res-head">
            <span className="field-label">📎 {t('createSession.attachmentsTitle')}</span>
            <div className="row">
              <input ref={fileRef} type="file" multiple accept={ACCEPT_ATTR} hidden onChange={onPickFiles} />
              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                + {t('resources.uploadFile')}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setShowUrlForm((v) => !v)}>
                🔗 {t('resources.addUrl')}
              </button>
            </div>
          </div>
          <p className="muted small">{t('createSession.attachmentsHint')}</p>

          {showUrlForm && (
            <div className="url-form">
              <input
                type="url"
                placeholder={t('resources.urlPlaceholder')}
                aria-label={t('resources.urlLabel')}
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
              />
              <input
                maxLength={200}
                placeholder={t('resources.titlePlaceholder')}
                aria-label={t('resources.titleLabel')}
                value={urlTitle}
                onChange={(e) => setUrlTitle(e.target.value)}
              />
              <div className="form-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowUrlForm(false)}>{t('common.cancel')}</button>
                <button type="button" className="btn btn-primary btn-sm" disabled={!urlInput.trim()} onClick={addQueuedUrl}>{t('resources.add')}</button>
              </div>
            </div>
          )}

          {(queuedFiles.length > 0 || queuedUrls.length > 0) && (
            <ul className="res-list">
              {queuedFiles.map((item) => (
                <li key={item.id} className="res-item queued-item">
                  <div className="res-title-row">
                    <span>📄</span>
                    <strong className="res-title">{item.file.name}</strong>
                    <span className="pill pill-sm">{getExt(item.file.name).toUpperCase()}</span>
                    <span className="muted small">{formatSize(item.file.size)}</span>
                  </div>
                  <button
                    type="button"
                    className="link-btn danger"
                    onClick={() => setQueuedFiles((prev) => prev.filter((x) => x.id !== item.id))}
                  >
                    {t('profile.removePhoto')}
                  </button>
                </li>
              ))}
              {queuedUrls.map((item) => (
                <li key={item.id} className="res-item queued-item">
                  <div className="res-title-row">
                    <span>🔗</span>
                    <strong className="res-title">{item.title}</strong>
                    <span className="pill pill-sm">URL</span>
                  </div>
                  <button
                    type="button"
                    className="link-btn danger"
                    onClick={() => setQueuedUrls((prev) => prev.filter((x) => x.id !== item.id))}
                  >
                    {t('profile.removePhoto')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => navigate(-1)}>{t('common.cancel')}</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? status || t('createSession.creating') : t('createSession.submit')}</button>
        </div>
      </form>
    </div>
  )
}
