import { Text, View } from 'react-native'
import { useI18n } from '../i18n'
import { theme } from '../theme'

export default function ProgressBar({ done, total, small }: { done: number; total: number; small?: boolean }) {
  const { t } = useI18n()
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('progress.ariaText', { done, total })}
      accessibilityValue={{ min: 0, max: total, now: done, text: t('progress.ariaText', { done, total }) }}
      style={{ flex: 1 }}
    >
      <View style={{ height: small ? 6 : 10, backgroundColor: '#efe6da', borderRadius: 6, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: pct === 100 ? theme.green : theme.accent }} />
      </View>
      <Text style={{ fontSize: 12, color: theme.muted, marginTop: 3 }}>
        {t('progress.label', { done, total, pct })}
      </Text>
    </View>
  )
}
