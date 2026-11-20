import { useRef, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { timeAgo } from '../utils'
import {
  ACCEPT_ATTR,
  addSessionUrl,
  formatSize,
  getExt,
  normalizeResourceUrl,
  uploadSessionFile,
  validateResourceFile,
} from '../resources'

function iconFor(r) {
  if (r.kind === 'url') return '🔗'
  const ext = getExt(r.file_name || r.title)
  if (ext === 'pdf') return '📄'
  if (ext === 'doc' || ext === 'docx') return '📝'
  if (ext === 'xml') return '🧩'
  return '📎'
}

function badgeFor(r) {
  if (r.kind === 'url') return 'URL'
  return getExt(r.file_name || r.title).toUpperCase() || 'FILE'
}

export default function SessionResources({ sessionId, resources, canUpload, isHost, onChanged, onError }) {
  const { user } = useAuth()
  const { t } = useI18n()
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [showUrlForm, setShowUrlForm] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [urlTitle, setUrlTitle] = useState('')
  const [savingUrl, setSavingUrl] = useState(false)
  const [preview, setPreview] = useState(null)

  async function onPickFile(e) {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!picked.length) return
    setUploading(true)
    onError('')
    try {
      for (const file of picked) {
        const check = validateResourceFile(file, t)
        if (check.error) {
          onError(check.error)
          continue
        }
        await uploadSessionFile({ sessionId, userId: user.id, file, contentType: check.contentType })
      }
      onChanged()
    } catch (err) {
      onError(err.message || t('profile.uploadFailed'))
    }
    setUploading(false)
  }

  async function submitUrl(e) {
    e.preventDefault()
    const res = normalizeResourceUrl(urlInput, urlTitle, t)
    if (res.error) return onError(res.error)
    setSavingUrl(true)
    onError('')
    try {
      await addSessionUrl({ sessionId, url: res.url, title: res.title })
      setUrlInput('')
      setUrlTitle('')
      setShowUrlForm(false)
      onChanged()
    } catch (err) {
      onError(err.message)
    }
    setSavingUrl(false)
  }

  async function openResource(r) {
    if (r.kind === 'url') {
      window.open(r.url, '_blank', 'noopener,noreferrer')
      return
    }
    const { data, error } = await supabase.storage.from('session-files').createSignedUrl(r.storage_path, 3600)
    if (error) return onError(error.message)
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function previewResource(r) {
    const ext = getExt(r.file_name || r.title)
    const { data, error } = await supabase.storage.from('session-files').createSignedUrl(r.storage_path, 3600)
    if (error) return onError(error.message)
    if (ext === 'pdf') {
      setPreview({ title: r.title, kind: 'pdf', src: data.signedUrl })
    } else if (ext === 'xml') {
      try {
        const res = await fetch(data.signedUrl)
        const text = await res.text()
        setPreview({ title: r.title, kind: 'xml', text })
      } catch (err) {
        onError(err.message)
      }
    }
  }

  async function removeResource(r) {
    if (!window.confirm(t('resources.deleteConfirm'))) return
    if (r.kind === 'file' && r.storage_path) {
      await supabase.storage.from('session-files').remove([r.storage_path])
    }
    const { error } = await supabase.from('session_resources').delete().eq('id', r.id)
    if (error) onError(error.message)
    else onChanged()
  }

  return (
    <div className="card">
      <div className="res-head">
        <h3>📎 {t('resources.title')}</h3>
        {canUpload && (
          <div className="row">
            <input ref={fileRef} type="file" multiple accept={ACCEPT_ATTR} hidden onChange={onPickFile} />
            <button type="button" className="btn btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? t('resources.uploading') : `+ ${t('resources.uploadFile')}`}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowUrlForm((v) => !v)}>
              🔗 {t('resources.addUrl')}
            </button>
          </div>
        )}
      </div>
      <p className="muted small">{t('resources.supportedTypes')}</p>

      {showUrlForm && canUpload && (
        <form className="url-form" onSubmit={submitUrl}>
          <input
            type="url"
            required
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
            <button className="btn btn-primary btn-sm" disabled={savingUrl || !urlInput.trim()}>{t('resources.add')}</button>
          </div>
        </form>
      )}

      {resources.length === 0 ? (
        <p className="muted small">{t('resources.empty')}</p>
      ) : (
        <ul className="res-list">
          {resources.map((r) => {
            const ext = getExt(r.file_name || r.title)
            const canPreview = r.kind === 'file' && (ext === 'pdf' || ext === 'xml')
            const canDelete = isHost || r.uploader_id === user.id
            return (
              <li key={r.id} className="res-item">
                <div className="res-main">
                  <div className="res-title-row">
                    <span aria-hidden>{iconFor(r)}</span>
                    <strong className="res-title">{r.title}</strong>
                    <span className="pill pill-sm">{badgeFor(r)}</span>
                    {r.file_size ? <span className="muted small">{formatSize(r.file_size)}</span> : null}
                  </div>
                  <span className="muted small">
                    {t('resources.addedBy', {
                      name: r.uploader?.display_name ?? t('common.deletedUser'),
                      time: timeAgo(r.created_at, t),
                    })}
                  </span>
                </div>
                <div className="res-actions">
                  {canPreview && (
                    <button type="button" className="link-btn" onClick={() => previewResource(r)}>{t('resources.preview')}</button>
                  )}
                  <button type="button" className="link-btn" onClick={() => openResource(r)}>
                    {r.kind === 'url' ? t('resources.open') : t('resources.download')}
                  </button>
                  {canDelete && (
                    <button type="button" className="link-btn danger" onClick={() => removeResource(r)}>{t('comment.delete')}</button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {preview && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={preview.title} onClick={() => setPreview(null)}>
          <div className="modal-box card" onClick={(e) => e.stopPropagation()}>
            <div className="host-panel-head">
              <h3>{preview.title}</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreview(null)}>{t('common.close')}</button>
            </div>
            {preview.kind === 'pdf' ? (
              <iframe src={preview.src} title={preview.title} className="preview-frame" />
            ) : (
              <pre className="preview-xml">{preview.text}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
