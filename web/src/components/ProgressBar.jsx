import { useI18n } from '../i18n'

export default function ProgressBar({ done, total, label = true, size = 'md' }) {
  const { t } = useI18n()
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div className={`progress progress-${size}`}>
      <div
        className="progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={t('progress.ariaText', { done, total })}
      >
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {label && (
        <span className="progress-label">
          {t('progress.label', { done, total, pct })}
        </span>
      )}
    </div>
  )
}
