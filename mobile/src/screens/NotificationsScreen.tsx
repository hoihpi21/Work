import { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { theme } from '../theme'
import { timeAgo } from '../utils'
import { Button, Card, Loading, styles } from '../components/ui'

export default function NotificationsScreen({ navigation }: any) {
  const { user } = useAuth()
  const { t } = useI18n()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, session_id, emoji, read_at, created_at, actor:profiles!notifications_actor_id_fkey(display_name), session:sessions(book_title)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(40)
    if (!error && data) setItems(data)
    setLoading(false)
  }, [user])

  useEffect(() => {
    load()
    if (!user) return
    const channel = supabase
      .channel(`notifs-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, load])

  const unread = items.filter((n) => !n.read_at).length

  async function markAllRead() {
    if (!user) return
    const now = new Date().toISOString()
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })))
    await supabase.from('notifications').update({ read_at: now }).eq('user_id', user.id).is('read_at', null)
  }

  async function openItem(n: any) {
    if (!n.read_at) {
      const now = new Date().toISOString()
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: now } : x)))
      await supabase.from('notifications').update({ read_at: now }).eq('id', n.id)
    }
    navigation.navigate('Session', { id: n.session_id })
  }

  function labelFor(n: any) {
    const actor = n.actor?.display_name ?? t('common.someoneCap')
    const book = n.session?.book_title ?? ''
    if (n.type === 'reply') return t('notifications.reply', { actor, book })
    if (n.type === 'reaction') return t('notifications.reaction', { actor, emoji: n.emoji ?? '👍', book })
    return t('notifications.comment', { actor, book })
  }

  if (loading) return <Loading />

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          unread > 0 ? (
            <View style={{ alignItems: 'flex-end', marginBottom: 10 }}>
              <Button small title={t('notifications.markAllRead')} onPress={markAllRead} />
            </View>
          ) : undefined
        }
        renderItem={({ item: n }) => (
          <Pressable onPress={() => openItem(n)} accessibilityRole="button">
            <Card style={!n.read_at ? { backgroundColor: '#fff5ee', borderColor: theme.accent } : undefined}>
              <Text style={{ color: theme.text, fontWeight: !n.read_at ? '700' : '400', marginBottom: 4 }}>{labelFor(n)}</Text>
              <Text style={styles.small}>{timeAgo(n.created_at, t)}</Text>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={
          <Card style={{ alignItems: 'center', padding: 24 }}>
            <Text style={{ fontSize: 32, marginBottom: 6 }}>🔔</Text>
            <Text style={styles.muted}>{t('notifications.empty')}</Text>
          </Card>
        }
      />
    </View>
  )
}
