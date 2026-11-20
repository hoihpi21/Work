import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native'
import * as Linking from 'expo-linking'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { theme } from '../theme'
import Avatar from '../components/Avatar'
import ProgressBar from '../components/ProgressBar'
import Comment, { type CommentRow } from '../components/Comment'
import { Button, Card, ErrorText, Loading, Notice, styles } from '../components/ui'

export default function SessionScreen({ route, navigation }: any) {
  const { id } = route.params
  const { user } = useAuth()
  const uid = user!.id
  const [session, setSession] = useState<any>(null)
  const [chapters, setChapters] = useState<{ position: number; title: string | null }[]>([])
  const [participants, setParticipants] = useState<any[]>([])
  const [comments, setComments] = useState<CommentRow[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [tab, setTab] = useState<'discussion' | 'readers'>('discussion')
  const [limit, setLimit] = useState(50)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const me = participants.find((p) => p.user_id === uid)

  const load = useCallback(async () => {
    const [s, c, p, m] = await Promise.all([
      supabase.from('sessions').select('*, host:profiles!sessions_host_id_fkey(display_name)').eq('id', id).maybeSingle(),
      supabase.from('chapters').select('position, title').eq('session_id', id).order('position'),
      supabase
        .from('participants')
        .select('user_id, chapters_completed, joined_at, profile:profiles!participants_user_id_fkey(display_name, avatar_url)')
        .eq('session_id', id)
        .order('joined_at'),
      supabase
        .from('comments')
        .select('id, body, created_at, edited_at, author_id, author:profiles!comments_author_id_fkey(display_name, avatar_url), reactions(emoji, user_id, user:profiles!reactions_user_id_fkey(display_name))')
        .eq('session_id', id)
        .order('created_at', { ascending: false })
        .limit(limit),
    ])
    const err = s.error || c.error || p.error || m.error
    if (err) setError(err.message)
    else if (!s.data) setError('Session not found.')
    else {
      setSession(s.data)
      setChapters(c.data)
      setParticipants(p.data)
      setComments([...(m.data as any[])].reverse())
    }
    setLoading(false)
  }, [id, limit])

  useEffect(() => {
    load()
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(load, 250)
    }
    const channel = supabase
      .channel(`session-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `session_id=eq.${id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `session_id=eq.${id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, refresh)
      .subscribe()
    return () => {
      if (timer.current) clearTimeout(timer.current)
      supabase.removeChannel(channel)
    }
  }, [id, load])

  useEffect(() => {
    if (session) navigation.setOptions({ title: session.book_title })
  }, [session, navigation])

  async function join() {
    const { error } = await supabase.from('participants').insert({ session_id: id })
    if (error) setError(error.message)
    else load()
  }

  function leave() {
    Alert.alert('Leave this session?', 'Your progress will be removed (your comments stay).', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('participants').delete().eq('session_id', id).eq('user_id', uid)
          if (error) setError(error.message)
          else load()
        },
      },
    ])
  }

  async function setProgress(n: number) {
    setParticipants((ps) => ps.map((p) => (p.user_id === uid ? { ...p, chapters_completed: n } : p)))
    const { error } = await supabase.from('participants').update({ chapters_completed: n }).eq('session_id', id).eq('user_id', uid)
    if (error) setError(error.message)
    load()
  }

  async function post() {
    const text = body.trim()
    if (!text) return
    setPosting(true)
    const { error } = await supabase.from('comments').insert({ session_id: id, body: text })
    if (error) setError(error.message)
    else {
      setBody('')
      load()
    }
    setPosting(false)
  }

  async function editComment(cid: string, text: string) {
    const { error } = await supabase.from('comments').update({ body: text }).eq('id', cid)
    if (error) setError(error.message)
    else load()
  }

  async function deleteComment(cid: string) {
    const { error } = await supabase.from('comments').delete().eq('id', cid)
    if (error) setError(error.message)
    else load()
  }

  async function toggleReaction(comment: CommentRow, emoji: string) {
    const has = comment.reactions.some((r) => r.emoji === emoji && r.user_id === uid)
    const { error } = has
      ? await supabase.from('reactions').delete().eq('comment_id', comment.id).eq('user_id', uid).eq('emoji', emoji)
      : await supabase.from('reactions').insert({ comment_id: comment.id, emoji })
    if (error) setError(error.message)
    else load()
  }

  function share() {
    const url = Linking.createURL(`session/${id}`)
    Share.share({ message: `Join me reading "${session.book_title}" by ${session.book_author} on Books & Friends: ${url}`, url })
  }

  if (loading) return <Loading />
  if (!session)
    return (
      <View style={{ padding: 20 }}>
        <Card>
          <Text style={styles.h3}>{error || 'Session not found.'}</Text>
          <Button title="Back to sessions" onPress={() => navigation.navigate('Home')} />
        </Card>
      </View>
    )

  const total: number = session.chapter_count
  const avg = participants.length ? Math.round((participants.reduce((a, p) => a + p.chapters_completed, 0) / participants.length / total) * 100) : 0

  const header = (
    <View>
      <Card>
        <Text style={styles.h1}>📖 {session.book_title}</Text>
        <Text style={styles.muted}>by {session.book_author}</Text>
        <Text style={[styles.small, { marginTop: 4 }]}>
          {total} chapters · hosted by {session.host?.display_name ?? 'someone'} · {participants.length} reader{participants.length !== 1 && 's'} · avg {avg}%
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {me ? <Button small variant="ghost" title="Leave session" onPress={leave} /> : <Button variant="primary" title="Join this session" onPress={join} />}
          <Button small title="Share" onPress={share} />
        </View>
      </Card>

      <ErrorText onPress={() => setError('')}>{error}</ErrorText>

      {me && (
        <Card>
          <Text style={styles.h3}>Your progress</Text>
          <View style={{ flexDirection: 'row' }}>
            <ProgressBar done={me.chapters_completed} total={total} />
          </View>
        </Card>
      )}

      <View style={{ flexDirection: 'row', marginBottom: 12, backgroundColor: '#efe6da', borderRadius: 10, padding: 3 }} accessibilityRole="tablist">
        {(['discussion', 'readers'] as const).map((t) => (
          <Pressable
            key={t}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            onPress={() => setTab(t)}
            style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: tab === t ? '#fff' : 'transparent' }}
          >
            <Text style={{ fontWeight: '600', color: tab === t ? theme.accent : theme.muted }}>{t === 'discussion' ? 'Discussion' : 'Progress'}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'readers' && (
        <View>
          {me && (
            <Card>
              <Text style={styles.h3}>Update your progress</Text>
              <Text style={[styles.small, { marginBottom: 8 }]}>Tap a chapter you've finished.</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {chapters.map((c) => {
                  const done = c.position <= me.chapters_completed
                  return (
                    <Pressable
                      key={c.position}
                      accessibilityLabel={c.title || `Chapter ${c.position}`}
                      accessibilityState={{ selected: done }}
                      onPress={() => setProgress(me.chapters_completed === c.position ? c.position - 1 : c.position)}
                      style={{
                        minWidth: 38,
                        paddingVertical: 8,
                        alignItems: 'center',
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: done ? theme.green : theme.border,
                        backgroundColor: done ? theme.green : '#fff',
                      }}
                    >
                      <Text style={{ color: done ? '#fff' : theme.text, fontWeight: '600' }}>{c.position}</Text>
                    </Pressable>
                  )
                })}
              </View>
              {me.chapters_completed < total ? (
                <Button
                  title={`✓ Finished chapter ${me.chapters_completed + 1}${chapters[me.chapters_completed]?.title ? `: ${chapters[me.chapters_completed].title}` : ''}`}
                  onPress={() => setProgress(me.chapters_completed + 1)}
                />
              ) : (
                <Notice>🎉 You finished the book!</Notice>
              )}
            </Card>
          )}
          <Card>
            <Text style={styles.h3}>Readers</Text>
            {participants.map((p) => (
              <View key={p.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                <Avatar name={p.profile?.display_name} url={p.profile?.avatar_url} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', color: theme.text, marginBottom: 3 }}>
                    {p.profile?.display_name ?? 'Deleted user'}
                    {p.user_id === session.host_id ? '  · host' : ''}
                  </Text>
                  <View style={{ flexDirection: 'row' }}>
                    <ProgressBar done={p.chapters_completed} total={total} small />
                  </View>
                </View>
              </View>
            ))}
          </Card>
        </View>
      )}

      {tab === 'discussion' && comments.length >= limit && (
        <View style={{ marginBottom: 8 }}>
          <Button small title="Load earlier comments" onPress={() => setLimit((l) => l + 50)} />
        </View>
      )}
      {tab === 'discussion' && comments.length === 0 && <Text style={[styles.muted, { textAlign: 'center', padding: 16 }]}>No comments yet. Start the conversation! 💬</Text>}
    </View>
  )

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <FlatList
        data={tab === 'discussion' ? comments : []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 16 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <Comment comment={item} canReact={!!me} onToggleReaction={toggleReaction} onEdit={editComment} onDelete={deleteComment} />
        )}
      />
      {tab === 'discussion' &&
        (me ? (
          <View style={{ padding: 10, borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: '#fff' }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
              <TextInput
                style={[styles.input, { flex: 1, maxHeight: 110 }]}
                multiline
                maxLength={2000}
                placeholder="Share a thought about the book…"
                value={body}
                onChangeText={setBody}
                accessibilityLabel="Write a comment"
              />
              <Button variant="primary" title="Post" disabled={posting || !body.trim()} onPress={post} />
            </View>
            {body.length > 1800 && <Text style={styles.small}>{body.length}/2000</Text>}
          </View>
        ) : (
          <View style={{ padding: 10, backgroundColor: '#fff' }}>
            <Notice>Join this session to take part in the discussion.</Notice>
          </View>
        ))}
    </KeyboardAvoidingView>
  )
}
