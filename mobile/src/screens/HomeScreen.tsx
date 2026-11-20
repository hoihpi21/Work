import { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { theme } from '../theme'
import { timeAgo } from '../utils'
import ProgressBar from '../components/ProgressBar'
import { Button, Card, ErrorText, Loading, styles } from '../components/ui'

const PAGE = 12
type FilterKey = 'all' | 'active' | 'finished' | 'private'

export default function HomeScreen({ navigation }: any) {
  const { user } = useAuth()
  const { t } = useI18n()
  const [tab, setTab] = useState<'discover' | 'mine'>('discover')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [joiningCode, setJoiningCode] = useState(false)
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 250)
    return () => clearTimeout(id)
  }, [searchInput])

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
        const ids = rows.map((r) => r.session_id)
        if (!ids.length) {
          setItems([])
          setMore(false)
          setLoading(false)
          return
        }
        q = q.in('id', ids)
      }
      if (search) {
        const escaped = search.replace(/,/g, ' ')
        q = q.or(`book_title.ilike.%${escaped}%,book_author.ilike.%${escaped}%`)
      }
      if (filter === 'private') {
        q = q.eq('visibility', 'private')
      }
      const { data, error } = await q
      if (error) setError(error.message)
      else {
        setItems((prev) => (offset ? [...prev, ...data] : data))
        setMore(data.length === PAGE)
      }
      setLoading(false)
    },
    [tab, search, filter, user],
  )

  useFocusEffect(
    useCallback(() => {
      load(0)
    }, [load]),
  )

  useEffect(() => {
    setItems([])
  }, [tab])

  async function joinWithCode() {
    const code = inviteCode.trim()
    if (!code) return
    setJoiningCode(true)
    setError('')
    const { data, error } = await supabase.rpc('join_by_invite', { p_code: code })
    if (error) {
      setError(error.message)
      setJoiningCode(false)
    } else {
      setInviteCode('')
      setJoiningCode(false)
      navigation.navigate('Session', { id: data })
    }
  }

  const visibleItems = items.filter((s) => {
    if (filter === 'active') {
      const mine = s.participants.find((p: any) => p.user_id === user!.id)
      return mine ? mine.chapters_completed < s.chapter_count : true
    }
    if (filter === 'finished') {
      const mine = s.participants.find((p: any) => p.user_id === user!.id)
      return mine ? mine.chapters_completed >= s.chapter_count : false
    }
    return true
  })

  const hasFilterOrSearch = !!search || filter !== 'all'

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <FlatList
        data={visibleItems}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        ListHeaderComponent={
          <View>
            <Text style={styles.h1}>{t('home.title')}</Text>
            <Text style={[styles.muted, { marginBottom: 12 }]}>{t('home.subtitle')}</Text>
            <View style={{ flexDirection: 'row', marginBottom: 10, backgroundColor: '#efe6da', borderRadius: 10, padding: 3 }} accessibilityRole="tablist">
              {(['discover', 'mine'] as const).map((tb) => (
                <Pressable
                  key={tb}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === tb }}
                  onPress={() => setTab(tb)}
                  style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: tab === tb ? '#fff' : 'transparent' }}
                >
                  <Text style={{ fontWeight: '600', color: tab === tb ? theme.accent : theme.muted }}>
                    {tb === 'discover' ? t('home.tabDiscover') : t('home.tabMine')}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={[styles.input, { marginBottom: 8 }]}
              placeholder={t('home.searchPlaceholder')}
              placeholderTextColor={theme.muted}
              value={searchInput}
              onChangeText={setSearchInput}
              returnKeyType="search"
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 10 }}>
              {(['all', 'active', 'finished', 'private'] as FilterKey[]).map((f) => {
                const active = filter === f
                const label =
                  f === 'all'
                    ? t('home.filterAll')
                    : f === 'active'
                      ? t('home.filterActive')
                      : f === 'finished'
                        ? t('home.filterFinished')
                        : t('home.filterPrivate')
                return (
                  <Pressable
                    key={f}
                    onPress={() => setFilter(f)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: active ? theme.accent : theme.border,
                      backgroundColor: active ? theme.accentSoft : '#fff',
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: active ? theme.accent : theme.muted }}>{label}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder={t('home.inviteCodePlaceholder')}
                placeholderTextColor={theme.muted}
                autoCapitalize="characters"
                maxLength={32}
                value={inviteCode}
                onChangeText={setInviteCode}
              />
              <Button small title={t('home.joinCodeBtn')} disabled={joiningCode || !inviteCode.trim()} onPress={joinWithCode} />
            </View>

            <ErrorText onPress={() => setError('')}>{error}</ErrorText>
          </View>
        }
        renderItem={({ item: s }) => {
          const mine = s.participants.find((p: any) => p.user_id === user!.id)
          const readerCount = s.participants.length
          return (
            <Pressable onPress={() => navigation.navigate('Session', { id: s.id })} accessibilityRole="button" accessibilityLabel={`${s.book_title} ${s.book_author}`}>
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <Text style={[styles.h3, { flex: 1 }]}>
                    {s.visibility === 'private' ? '🔐' : '📕'} {s.book_title}
                  </Text>
                  {s.visibility === 'private' && (
                    <Text style={{ fontSize: 11, fontWeight: '700', color: theme.accent, backgroundColor: theme.accentSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                      {t('home.privateBadge')}
                    </Text>
                  )}
                </View>
                <Text style={styles.muted}>{t('session.byAuthor', { author: s.book_author })}</Text>
                <Text style={[styles.small, { marginTop: 4 }]}>
                  {t('home.sessionMeta', {
                    count: s.chapter_count,
                    host: s.host?.display_name ?? t('common.someone'),
                    time: timeAgo(s.created_at, t),
                  })}
                </Text>
                <View style={{ marginTop: 8, gap: 8 }}>
                  <Text style={{ color: theme.text }}>
                    👥 {t(readerCount === 1 ? 'session.readerOne' : 'session.readerMany', { count: readerCount })}
                  </Text>
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
              <Text style={{ fontSize: 36 }}>{hasFilterOrSearch ? '🔎' : '🪄'}</Text>
              <Text style={styles.h3}>
                {hasFilterOrSearch ? t('home.noMatches') : tab === 'mine' ? t('home.emptyMine') : t('home.emptyAll')}
              </Text>
              <Text style={[styles.muted, { marginBottom: 12, textAlign: 'center' }]}>
                {hasFilterOrSearch ? t('home.noMatchesSub') : t('home.emptySubtitle')}
              </Text>
              {!hasFilterOrSearch && <Button variant="primary" title={t('home.createSession')} onPress={() => navigation.navigate('New')} />}
            </Card>
          )
        }
        ListFooterComponent={
          loading ? <Loading /> : more ? <Button title={t('home.loadMore')} onPress={() => load(items.length)} /> : undefined
        }
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('nav.newSession')}
        onPress={() => navigation.navigate('New')}
        style={{ position: 'absolute', right: 20, bottom: 24, backgroundColor: theme.accent, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 28, elevation: 4 }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>{t('home.newSession')}</Text>
      </Pressable>
    </View>
  )
}
