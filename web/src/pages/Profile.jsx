import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { supabase } from '../supabase'
import Avatar from '../components/Avatar'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { resizeImage } from '../utils'

export default function Profile() {
  const { user, profile, refreshProfile, signOut } = useAuth()
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    if (profile) setName(profile.display_name)
  }, [profile])

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    setError('')
    const { error } = await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', user.id)
    if (error) setError(error.message)
    else {
      setMsg(t('profile.saved'))
      refreshProfile()
    }
    setBusy(false)
  }

  async function removeOldAvatars() {
    const { data } = await supabase.storage.from('avatars').list(user.id)
    if (data?.length) await supabase.storage.from('avatars').remove(data.map((f) => `${user.id}/${f.name}`))
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return setError(t('profile.imageOnlyError'))
    setUploading(true)
    setError('')
    setMsg('')
    try {
      const blob = await resizeImage(file)
      await removeOldAvatars()
      const path = `${user.id}/avatar-${Date.now()}.webp`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/webp' })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const { error } = await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', user.id)
      if (error) throw error
      setMsg(t('profile.photoUpdated'))
      refreshProfile()
    } catch (err) {
      setError(err.message || t('profile.uploadFailed'))
    }
    setUploading(false)
  }

  async function removeAvatar() {
    setUploading(true)
    setError('')
    await removeOldAvatars()
    const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id)
    if (error) setError(error.message)
    else refreshProfile()
    setUploading(false)
  }

  async function deleteAccount() {
    setBusy(true)
    setError('')
    await removeOldAvatars()
    const { error } = await supabase.rpc('delete_my_account')
    if (error) {
      setError(error.message)
      setBusy(false)
    } else {
      await signOut()
    }
  }

  return (
    <div className="narrow">
      <h1>{t('profile.title')}</h1>
      <form className="card form" onSubmit={save}>
        <div className="profile-head">
          <Avatar name={name} url={profile?.avatar_url} size={72} />
          <div className="profile-info">
            <strong>{profile?.display_name}</strong>
            <p className="muted">{user.email}</p>
            <div className="row">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
              <button type="button" className="btn btn-sm" disabled={uploading} onClick={() => fileRef.current.click()}>
                {uploading ? t('profile.working') : profile?.avatar_url ? t('profile.changePhoto') : t('profile.uploadPhoto')}
              </button>
              {profile?.avatar_url && (
                <button type="button" className="btn btn-ghost btn-sm" disabled={uploading} onClick={removeAvatar}>{t('profile.removePhoto')}</button>
              )}
            </div>
          </div>
        </div>
        <label>
          {t('auth.displayName')}
          <input required minLength={2} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {t('profile.language')}
          <div>
            <LanguageSwitcher />
          </div>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        {msg && <p className="notice" role="status">{msg}</p>}
        <div className="form-actions">
          <button className="btn btn-primary" disabled={busy}>{busy ? t('common.saving') : t('profile.saveChanges')}</button>
        </div>
      </form>

      <section className="card form danger-zone">
        <h3>{t('profile.deleteAccountTitle')}</h3>
        <p className="muted small">
          {t('profile.deleteAccountDesc')}
        </p>
        <label>
          <span>
            {t('profile.deleteConfirmBefore')}
            <strong>DELETE</strong>
            {t('profile.deleteConfirmAfter')}
          </span>
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
        </label>
        <div className="form-actions">
          <button type="button" className="btn btn-danger" disabled={confirmText !== 'DELETE' || busy} onClick={deleteAccount}>
            {t('profile.deleteAccountBtn')}
          </button>
        </div>
      </section>
    </div>
  )
}
