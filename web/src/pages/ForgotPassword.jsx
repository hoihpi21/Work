import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useI18n } from '../i18n'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function ForgotPassword() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset`,
    })
    if (error) setError(error.message)
    else setSent(true)
    setBusy(false)
  }

  return (
    <div className="auth-page">
      <LanguageSwitcher className="auth-lang" />
      <form className="card auth-card" onSubmit={submit}>
        <div className="auth-logo">🔑</div>
        <h1>{t('auth.forgotTitle')}</h1>
        <p className="muted">{t('auth.forgotSubtitle')}</p>
        {sent ? (
          <p className="notice" role="status">{t('auth.resetLinkSent')}</p>
        ) : (
          <>
            <label>
              {t('auth.email')}
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? t('auth.sending') : t('auth.sendResetLink')}</button>
          </>
        )}
        <p className="muted center"><Link to="/login">{t('auth.backToLogin')}</Link></p>
      </form>
    </div>
  )
}
