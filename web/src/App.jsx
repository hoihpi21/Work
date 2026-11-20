import { Navigate, Outlet, Route, Routes, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from './auth'
import { useI18n } from './i18n'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Home from './pages/Home'
import CreateSession from './pages/CreateSession'
import SessionDetail from './pages/SessionDetail'
import Profile from './pages/Profile'
import InviteJoin from './pages/InviteJoin'

function safeNext(raw) {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
}

function Protected() {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const loc = useLocation()
  if (loading) return <div className="splash">{t('common.loading')}</div>
  if (!user) {
    const next = loc.pathname !== '/' ? `?next=${encodeURIComponent(loc.pathname + loc.search)}` : ''
    return <Navigate to={`/login${next}`} replace />
  }
  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}

function PublicOnly() {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const [params] = useSearchParams()
  if (loading) return <div className="splash">{t('common.loading')}</div>
  if (user) return <Navigate to={safeNext(params.get('next'))} replace />
  return <Outlet />
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot" element={<ForgotPassword />} />
      </Route>
      <Route path="/reset" element={<ResetPassword />} />
      <Route element={<Protected />}>
        <Route path="/" element={<Home />} />
        <Route path="/new" element={<CreateSession />} />
        <Route path="/s/:id" element={<SessionDetail />} />
        <Route path="/invite/:code" element={<InviteJoin />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
