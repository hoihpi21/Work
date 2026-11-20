import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { supabase } from '../supabase'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function ResetPassword() {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setBusy(false)
    } else navigate('/', { replace: true })
  }

  return (
    <div className="auth-page">
      <LanguageSwitcher className="auth-lang" />
      <form className="card auth-card" onSubmit={submit}>
        <div className="auth-logo">🔒</div>
        <h1>{t('auth.resetTitle')}</h1>
        {loading ? (
          <p className="muted center">{t('auth.checkingLink')}</p>
        ) : !user ? (
          <>
            <p className="error">{t('auth.invalidResetLink')}</p>
            <Link className="btn btn-block" to="/forgot">{t('auth.requestNewLink')}</Link>
          </>
        ) : (
          <>
            <label>
              {t('auth.newPassword')}
              <input type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? t('common.saving') : t('auth.updatePassword')}</button>
          </>
        )}
      </form>
    </div>
  )
}
