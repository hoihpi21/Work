import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useI18n } from '../i18n'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function Register() {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: name.trim() } },
    })
    if (error) setError(error.message)
    else if (!data.session) setNotice(t('auth.confirmEmailNotice'))
    setBusy(false)
  }

  return (
    <div className="auth-page">
      <LanguageSwitcher className="auth-lang" />
      <form className="card auth-card" onSubmit={submit}>
        <div className="auth-logo">📚</div>
        <h1>{t('auth.registerTitle')}</h1>
        <p className="muted">{t('auth.registerSubtitle')}</p>
        {notice ? (
          <p className="notice" role="status">{notice}</p>
        ) : (
          <>
            <label>
              {t('auth.displayName')}
              <input required minLength={2} maxLength={40} autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              {t('auth.email')}
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              {t('auth.password')}
              <input type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? t('auth.creatingAccount') : t('auth.createAccountBtn')}</button>
          </>
        )}
        <p className="muted center">
          {t('auth.alreadyMember')} <Link to="/login">{t('auth.login')}</Link>
        </p>
      </form>
    </div>
  )
}
