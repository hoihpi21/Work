import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { supabase } from '../supabase'
import { useI18n } from '../i18n'
import { theme } from '../theme'
import { Button, Card, ErrorText, Loading, styles } from '../components/ui'

export default function InviteScreen({ route, navigation }: any) {
  const { code } = route.params ?? {}
  const { t } = useI18n()
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    supabase
      .rpc('join_by_invite', { p_code: code })
      .then(({ data, error }) => {
        if (!active) return
        if (error) setError(error.message)
        else navigation.replace('Session', { id: data })
      })
    return () => {
      active = false
    }
  }, [code, navigation])

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, padding: 20, justifyContent: 'center' }}>
        <Card style={{ alignItems: 'center', padding: 24 }}>
          <Text style={{ fontSize: 36, marginBottom: 8 }}>🔒</Text>
          <Text style={styles.h3}>{t('invite.failed')}</Text>
          <ErrorText>{error}</ErrorText>
          <Button title={t('invite.backHome')} onPress={() => navigation.replace('Home')} />
        </Card>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Loading />
      <Text style={styles.muted}>{t('invite.joining')}</Text>
    </View>
  )
}
