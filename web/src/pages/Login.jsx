import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useI18n } from '../i18n'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function Login() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <div className="auth-page">
      <LanguageSwitcher className="auth-lang" />
      <form className="card auth-card" onSubmit={submit}>
        <div className="auth-logo">📖</div>
        <h1>{t('auth.loginTitle')}</h1>
        <p className="muted">{t('auth.loginSubtitle')}</p>
        <label>
          {t('auth.email')}
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          {t('auth.password')}
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <Link to="/forgot" className="small right">{t('auth.forgotPassword')}</Link>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? t('auth.loggingIn') : t('auth.login')}</button>
        <p className="muted center">
          {t('auth.newHere')} <Link to="/register">{t('auth.createAccount')}</Link>
        </p>
      </form>
    </div>
  )
}
