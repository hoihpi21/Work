import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import Avatar from './Avatar'
import LanguageSwitcher from './LanguageSwitcher'
import NotificationBell from './NotificationBell'

export default function Layout({ children }) {
  const { profile, signOut } = useAuth()
  const { t } = useI18n()
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden>📖</span>
            <span className="brand-name">{t('app.name')}</span>
          </Link>
          <nav className="nav">
            <NavLink to="/" end>{t('nav.sessions')}</NavLink>
            <Link to="/new" className="btn btn-primary btn-sm">+ <span className="hide-xs">{t('nav.newSession')}</span></Link>
            <NotificationBell />
            <LanguageSwitcher />
            <NavLink to="/profile" className="nav-profile" aria-label={t('nav.profile')}>
              <Avatar name={profile?.display_name} url={profile?.avatar_url} size={32} />
            </NavLink>
            <button className="btn btn-ghost btn-sm" onClick={signOut}>{t('nav.logout')}</button>
          </nav>
        </div>
      </header>
      <main className="container">{children}</main>
    </div>
  )
}
