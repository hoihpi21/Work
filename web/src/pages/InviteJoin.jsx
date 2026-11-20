import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { useI18n } from '../i18n'

export default function InviteJoin() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { t } = useI18n()
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    supabase
      .rpc('join_by_invite', { p_code: code })
      .then(({ data, error }) => {
        if (!active) return
        if (error) setError(error.message)
        else navigate(`/s/${data}`, { replace: true })
      })
    return () => {
      active = false
    }
  }, [code, navigate])

  if (error) {
    return (
      <div className="empty card narrow">
        <div className="empty-emoji">🔒</div>
        <h3>{t('invite.failed')}</h3>
        <p className="error">{error}</p>
        <Link to="/" className="btn">{t('invite.backHome')}</Link>
      </div>
    )
  }

  return <p className="muted center pad">{t('invite.joining')}</p>
}
