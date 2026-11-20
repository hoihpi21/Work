import { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { theme } from '../theme'
import { timeAgo } from '../utils'
import ProgressBar from '../components/ProgressBar'
import { Button, Card, ErrorText, Loading, styles } from '../components/ui'

const PAGE = 12

export default function HomeScreen({ navigation }: any) {
  const { user } = useAuth()
  const [tab, setTab] = useState<'discover' | 'mine'>('discover')
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(
    async (offset = 0) => {
      setLoading(true)
      setError('')
      let q = supabase
        .from('sessions')
        .select('*, host:profiles!sessions_host_id_fkey(display_name), participants(user_id, chapters_completed)')
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE - 1)
      if (tab === 'mine') {
        const { data: rows, error: e1 } = await supabase.from('participants').select('session_id').eq('user_id', user!.id)
        if (e1) {
          setError(e1.message)
          setLoading(false)
          return
        }
        q = q.in('id', rows.map((r) => r.session_id))
      }
      const { data, error } = await q
      if (error) setError(error.message)
      else {
        setItems((prev) => (offset ? [...prev, ...data] : data))
        setMore(data.length === PAGE)
      }
      setLoading(false)
    },
    [tab, user],
  )

  // reload whenever the screen regains focus (e.g. after creating/joining a session) or the tab changes
  useFocusEffect(
    useCallback(() => {
      load(0)
    }, [load]),
  )

  useEffect(() => {
    setItems([])
  }, [tab])

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <FlatList
        data={items}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <View>
            <Text style={styles.h1}>Reading sessions</Text>
            <Text style={[styles.muted, { marginBottom: 12 }]}>Pick a book, join friends, and read along.</Text>
            <View style={{ flexDirection: 'row', marginBottom: 12, backgroundColor: '#efe6da', borderRadius: 10, padding: 3 }} accessibilityRole="tablist">
              {(['discover', 'mine'] as const).map((t) => (
                <Pressable
                  key={t}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === t }}
                  onPress={() => setTab(t)}
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: tab === t ? '#fff' : 'transparent' }}
                >
                  <Text style={{ fontWeight: '600', color: tab === t ? theme.accent : theme.muted }}>{t === 'discover' ? 'Discover' : 'Mine'}</Text>
                </Pressable>
              ))}
            </View>
            <ErrorText>{error}</ErrorText>
          </View>
        }
        renderItem={({ item: s }) => {
          const mine = s.participants.find((p: any) => p.user_id === user!.id)
          return (
            <Pressable onPress={() => navigation.navigate('Session', { id: s.id })} accessibilityRole="button" accessibilityLabel={`${s.book_title} by ${s.book_author}`}>
              <Card>
                <Text style={styles.h3}>📕 {s.book_title}</Text>
                <Text style={styles.muted}>by {s.book_author}</Text>
                <Text style={[styles.small, { marginTop: 4 }]}>
                  {s.chapter_count} chapters · hosted by {s.host?.display_name ?? 'someone'} · {timeAgo(s.created_at)}
                </Text>
                <View style={{ marginTop: 8, gap: 8 }}>
                  <Text style={{ color: theme.text }}>👥 {s.participants.length} {s.participants.length === 1 ? 'reader' : 'readers'}</Text>
                  {mine && (
                    <View style={{ flexDirection: 'row' }}>
                      <ProgressBar done={mine.chapters_completed} total={s.chapter_count} small />
                    </View>
                  )}
                </View>
              </Card>
            </Pressable>
          )
        }}
        ListEmptyComponent={
          loading || error ? undefined : (
            <Card style={{ alignItems: 'center', padding: 24 }}>
              <Text style={{ fontSize: 36 }}>🪄</Text>
              <Text style={styles.h3}>{tab === 'mine' ? "You haven't joined any session yet" : 'No sessions yet'}</Text>
              <Text style={[styles.muted, { marginBottom: 12 }]}>Start the first one and invite your friends.</Text>
              <Button variant="primary" title="Create a session" onPress={() => navigation.navigate('New')} />
            </Card>
          )
        }
        ListFooterComponent={
          loading ? <Loading /> : more ? <Button title="Load more" onPress={() => load(items.length)} /> : undefined
        }
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New session"
        onPress={() => navigation.navigate('New')}
        style={{ position: 'absolute', right: 20, bottom: 24, backgroundColor: theme.accent, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 28, elevation: 4 }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>+ New session</Text>
      </Pressable>
    </View>
  )
}
