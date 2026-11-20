import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, Switch, Text, TextInput, View } from 'react-native'
import * as Linking from 'expo-linking'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { theme } from '../theme'
import Avatar from '../components/Avatar'
import ProgressBar from '../components/ProgressBar'
import Comment, { type CommentRow } from '../components/Comment'
import SessionResources, { type ResourceRow } from '../components/SessionResources'
import { Button, Card, ErrorText, Field, Loading, Notice, styles } from '../components/ui'

export default function SessionScreen({ route, navigation }: any) {
  const { id } = route.params
  const { user } = useAuth()
  const { t } = useI18n()
  const uid = user!.id
  const [session, setSession] = useState<any>(null)
  const [chapters, setChapters] = useState<{ position: number; title: string | null }[]>([])
  const [participants, setParticipants] = useState<any[]>([])
  const [comments, setComments] = useState<CommentRow[]>([])
  const [resources, setResources] = useState<ResourceRow[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [chapterRef, setChapterRef] = useState<number | null>(null)
  const [chapterPickerOpen, setChapterPickerOpen] = useState(false)
  const [replyTo, setReplyTo] = useState<CommentRow | null>(null)
  const [hideSpoilers, setHideSpoilers] = useState(true)
  const [posting, setPosting] = useState(false)
  const [tab, setTab] = useState<'discussion' | 'readers' | 'resources'>('discussion')
  const [limit, setLimit] = useState(50)
  const [hostModal, setHostModal] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editAuthor, setEditAuthor] = useState('')
  const [editCount, setEditCount] = useState('1')
  const [editVisibility, setEditVisibility] = useState<'public' | 'private'>('public')
  const [editTitles, setEditTitles] = useState<string[]>([])
  const [savingHost, setSavingHost] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const me = participants.find((p) => p.user_id === uid)
  const isHost = session?.host_id === uid

  const load = useCallback(async () => {
    const [s, c, p, m, r] = await Promise.all([
      supabase.from('sessions').select('*, host:profiles!sessions_host_id_fkey(display_name)').eq('id', id).maybeSingle(),
      supabase.from('chapters').select('position, title').eq('session_id', id).order('position'),
      supabase
        .from('participants')
        .select('user_id, chapters_completed, muted, joined_at, profile:profiles!participants_user_id_fkey(display_name, avatar_url)')
        .eq('session_id', id)
        .order('joined_at'),
      supabase
        .from('comments')
        .select('id, body, chapter_ref, reply_to_id, created_at, edited_at, author_id, author:profiles!comments_author_id_fkey(display_name, avatar_url), reactions(emoji, user_id, user:profiles!reactions_user_id_fkey(display_name))')
        .eq('session_id', id)
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('session_resources')
        .select('id, kind, title, url, storage_path, file_name, mime_type, file_size, created_at, uploader_id, uploader:profiles!session_resources_uploader_id_fkey(display_name)')
        .eq('session_id', id)
        .order('created_at', { ascending: false }),
    ])
    const err = s.error || c.error || p.error || m.error
    if (err) setError(err.message)
    else if (!s.data) setError(t('session.notFound'))
    else {
      setSession(s.data)
      setChapters(c.data)
      setParticipants(p.data)
      setComments([...(m.data as any[])].reverse())
      if (!r.error && r.data) setResources(r.data as any)
    }
    setLoading(false)
  }, [id, limit, t])

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_resources', filter: `session_id=eq.${id}` }, refresh)
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
    Alert.alert(t('session.leave'), t('session.leaveConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('session.leave'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('participants').delete().eq('session_id', id).eq('user_id', uid)
          if (error) setError(error.message)
          else load()
        },
      },
    ])
  }

  async function toggleMute() {
    if (!me) return
    const next = !me.muted
    setParticipants((ps) => ps.map((p) => (p.user_id === uid ? { ...p, muted: next } : p)))
    const { error } = await supabase.from('participants').update({ muted: next }).eq('session_id', id).eq('user_id', uid)
    if (error) setError(error.message)
    load()
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
    const { error } = await supabase.from('comments').insert({
      session_id: id,
      body: text,
      chapter_ref: chapterRef,
      reply_to_id: replyTo?.id ?? null,
    })
    if (error) setError(error.message)
    else {
      setBody('')
      setReplyTo(null)
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
    const url =
      session.visibility === 'private' && session.invite_code
        ? Linking.createURL(`invite/${session.invite_code}`)
        : Linking.createURL(`session/${id}`)
    const codeNote = session.visibility === 'private' && session.invite_code ? ` (${t('session.inviteCode', { code: session.invite_code })})` : ''
    Share.share({ message: `"${session.book_title}" ${t('session.byAuthor', { author: session.book_author })}${codeNote}: ${url}`, url })
  }

  function regenerateInvite() {
    Alert.alert(t('session.regenerateInvite'), t('session.regenerateConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('session.regenerateInvite'),
        onPress: async () => {
          const { error } = await supabase.rpc('regenerate_invite_code', { p_session_id: id })
          if (error) setError(error.message)
          else load()
        },
      },
    ])
  }

  function openHostModal() {
    setEditTitle(session.book_title)
    setEditAuthor(session.book_author)
    setEditCount(String(session.chapter_count))
    setEditVisibility(session.visibility ?? 'public')
    setEditTitles(chapters.map((c) => c.title ?? ''))
    setHostModal(true)
  }

  async function saveHostEdits() {
    setSavingHost(true)
    const n = Math.min(200, Math.max(1, Number(editCount) || 1))
    const nextChapters = Array.from({ length: n }, (_, i) => (editTitles[i] ?? '').trim())
    const { error } = await supabase.rpc('update_session', {
      p_session_id: id,
      p_title: editTitle,
      p_author: editAuthor,
      p_chapters: nextChapters,
      p_visibility: editVisibility,
    })
    setSavingHost(false)
    if (error) setError(error.message)
    else {
      setHostModal(false)
      load()
    }
  }

  function confirmDeleteSession() {
    Alert.alert(t('session.deleteSession'), t('session.deleteSessionConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('comment.delete'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('delete_session', { p_session_id: id })
          if (error) setError(error.message)
          else {
            setHostModal(false)
            navigation.navigate('Home')
          }
        },
      },
    ])
  }

  function confirmRemoveReader(p: any) {
    const name = p.profile?.display_name ?? t('common.deletedUser')
    Alert.alert(t('session.removeReader'), t('session.removeReaderConfirm', { name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('session.removeReader'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('remove_participant', { p_session_id: id, p_user_id: p.user_id })
          if (error) setError(error.message)
          else load()
        },
      },
    ])
  }

  if (loading) return <Loading />
  if (!session)
    return (
      <View style={{ padding: 20 }}>
        <Card>
          <Text style={styles.h3}>{error || t('session.notFound')}</Text>
          <Button title={t('session.backToSessions')} onPress={() => navigation.navigate('Home')} />
        </Card>
      </View>
    )

  const total: number = session.chapter_count
  const avg = participants.length ? Math.round((participants.reduce((a, p) => a + p.chapters_completed, 0) / participants.length / total) * 100) : 0
  const readersLabel = t(participants.length === 1 ? 'session.readerOne' : 'session.readerMany', { count: participants.length })
  const commentsById: Record<string, CommentRow> = Object.fromEntries(comments.map((c) => [c.id, c]))
  const editN = Math.min(200, Math.max(1, Number(editCount) || 1))

  const header = (
    <View>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={styles.h1}>
            {session.visibility === 'private' ? '🔐' : '📖'} {session.book_title}
          </Text>
          {session.visibility === 'private' && (
            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.accent, backgroundColor: theme.accentSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
              {t('session.privateBadge')}
            </Text>
          )}
        </View>
        <Text style={styles.muted}>{t('session.byAuthor', { author: session.book_author })}</Text>
        <Text style={[styles.small, { marginTop: 4 }]}>
          {t('session.heroMeta', { total, host: session.host?.display_name ?? t('common.someone'), readers: readersLabel, avg })}
        </Text>
        {session.visibility === 'private' && session.invite_code && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <Text style={{ backgroundColor: '#f1e8d9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, fontWeight: '700', color: theme.text }}>
              {t('session.inviteCode', { code: session.invite_code })}
            </Text>
            {isHost && <Button small variant="ghost" title={t('session.regenerateInvite')} onPress={regenerateInvite} />}
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {me ? (
            !isHost && <Button small variant="ghost" title={t('session.leave')} onPress={leave} />
          ) : (
            <Button variant="primary" title={t('session.join')} onPress={join} />
          )}
          <Button small title={t('session.share')} onPress={share} />
          {me && <Button small variant="ghost" title={me.muted ? `🔔 ${t('session.unmute')}` : `🔕 ${t('session.mute')}`} onPress={toggleMute} />}
          {isHost && <Button small title={`⚙ ${t('session.hostSettings')}`} onPress={openHostModal} />}
        </View>
      </Card>

      <ErrorText onPress={() => setError('')}>{error}</ErrorText>

      {me && (
        <Card>
          <Text style={styles.h3}>{t('session.yourProgress')}</Text>
          <View style={{ flexDirection: 'row' }}>
            <ProgressBar done={me.chapters_completed} total={total} />
          </View>
        </Card>
      )}

      <View style={{ flexDirection: 'row', marginBottom: 12, backgroundColor: '#efe6da', borderRadius: 10, padding: 3 }} accessibilityRole="tablist">
        {(['discussion', 'readers', 'resources'] as const).map((tb) => (
          <Pressable
            key={tb}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === tb }}
            onPress={() => setTab(tb)}
            style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: tab === tb ? '#fff' : 'transparent' }}
          >
            <Text style={{ fontWeight: '600', fontSize: 13, color: tab === tb ? theme.accent : theme.muted }}>
              {tb === 'discussion'
                ? t('session.tabDiscussion')
                : tb === 'readers'
                  ? t('session.tabProgress')
                  : `${t('resources.tabResources')}${resources.length ? ` (${resources.length})` : ''}`}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'resources' && (
        <SessionResources
          sessionId={id}
          resources={resources}
          canUpload={!!me}
          isHost={isHost}
          onChanged={load}
          onError={setError}
        />
      )}

      {tab === 'discussion' && me && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={styles.small}>{t('session.hideSpoilers', { n: me.chapters_completed })}</Text>
          <Switch value={hideSpoilers} onValueChange={setHideSpoilers} trackColor={{ true: theme.accent }} />
        </View>
      )}

      {tab === 'readers' && (
        <View>
          {me && (
            <Card>
              <Text style={styles.h3}>{t('session.yourProgress')}</Text>
              <Text style={[styles.small, { marginBottom: 8 }]}>{t('session.tapChapter')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {chapters.map((c) => {
                  const done = c.position <= me.chapters_completed
                  return (
                    <Pressable
                      key={c.position}
                      accessibilityLabel={c.title || t('session.chapterN', { n: c.position })}
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
                  title={
                    chapters[me.chapters_completed]?.title
                      ? t('session.finishedChapterTitled', { n: me.chapters_completed + 1, title: chapters[me.chapters_completed].title! })
                      : t('session.finishedChapter', { n: me.chapters_completed + 1 })
                  }
                  onPress={() => setProgress(me.chapters_completed + 1)}
                />
              ) : (
                <Notice>{t('session.finishedBook')}</Notice>
              )}
            </Card>
          )}
          <Card>
            <Text style={styles.h3}>{t('session.readers')}</Text>
            {participants.map((p) => (
              <View key={p.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                <Avatar name={p.profile?.display_name} url={p.profile?.avatar_url} size={32} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={{ fontWeight: '600', color: theme.text }}>
                      {p.profile?.display_name ?? t('common.deletedUser')}
                      {p.user_id === session.host_id ? ` · ${t('session.hostBadge')}` : ''}
                    </Text>
                    {isHost && p.user_id !== session.host_id && (
                      <Text style={{ color: theme.danger, fontSize: 12 }} onPress={() => confirmRemoveReader(p)}>
                        {t('session.removeReader')}
                      </Text>
                    )}
                  </View>
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
          <Button small title={t('session.loadEarlier')} onPress={() => setLimit((l) => l + 50)} />
        </View>
      )}
      {tab === 'discussion' && comments.length === 0 && (
        <Text style={[styles.muted, { textAlign: 'center', padding: 16 }]}>{t('session.noComments')}</Text>
      )}
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
          <Comment
            comment={item}
            replyTarget={item.reply_to_id ? commentsById[item.reply_to_id] : null}
            canReact={!!me}
            canModerate={isHost}
            hideSpoilers={hideSpoilers}
            myProgress={me?.chapters_completed ?? 0}
            onToggleReaction={toggleReaction}
            onReply={setReplyTo}
            onEdit={editComment}
            onDelete={deleteComment}
          />
        )}
      />

      {tab === 'discussion' &&
        (me ? (
          <View style={{ padding: 10, borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: '#fff' }}>
            {replyTo && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f6efe3', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginBottom: 6 }}>
                <Text style={styles.small}>↩ {t('session.replyingTo', { name: replyTo.author?.display_name ?? t('common.deletedUser') })}</Text>
                <Text style={{ color: theme.accent, fontWeight: '600', fontSize: 12 }} onPress={() => setReplyTo(null)}>{t('common.cancel')}</Text>
              </View>
            )}
            <Pressable
              onPress={() => setChapterPickerOpen(true)}
              style={{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: chapterRef ? theme.accentSoft : '#f1e8d9', marginBottom: 6 }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: chapterRef ? theme.accent : theme.muted }}>
                {chapterRef ? `🏷 ${t('session.chapterTag', { n: chapterRef })}` : `🏷 ${t('session.chapterTagNone')}`}
              </Text>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
              <TextInput
                style={[styles.input, { flex: 1, maxHeight: 110 }]}
                multiline
                maxLength={2000}
                placeholder={t('session.commentPlaceholder')}
                value={body}
                onChangeText={setBody}
                accessibilityLabel={t('session.commentPlaceholder')}
              />
              <Button variant="primary" title={t('session.post')} disabled={posting || !body.trim()} onPress={post} />
            </View>
            {body.length > 1800 && <Text style={styles.small}>{body.length}/2000</Text>}
          </View>
        ) : (
          <View style={{ padding: 10, backgroundColor: '#fff' }}>
            <Notice>{t('session.joinToDiscuss')}</Notice>
          </View>
        ))}

      {/* Chapter tag picker modal */}
      <Modal visible={chapterPickerOpen} transparent animationType="slide" onRequestClose={() => setChapterPickerOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }} onPress={() => setChapterPickerOpen(false)}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '60%', padding: 16 }}>
            <Text style={[styles.h3, { marginBottom: 10 }]}>{t('session.chapterTagNone')}</Text>
            <ScrollView>
              <Pressable
                onPress={() => { setChapterRef(null); setChapterPickerOpen(false) }}
                style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border }}
              >
                <Text style={{ fontWeight: chapterRef === null ? '700' : '400', color: theme.text }}>{t('session.chapterTagNone')}</Text>
              </Pressable>
              {chapters.map((c) => (
                <Pressable
                  key={c.position}
                  onPress={() => { setChapterRef(c.position); setChapterPickerOpen(false) }}
                  style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border }}
                >
                  <Text style={{ fontWeight: chapterRef === c.position ? '700' : '400', color: theme.text }}>
                    {t('session.chapterTag', { n: c.position })}{c.title ? ` — ${c.title}` : ''}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Host settings modal */}
      <Modal visible={hostModal} animationType="slide" onRequestClose={() => setHostModal(false)}>
        <View style={{ flex: 1, backgroundColor: theme.bg }}>
          <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.h1}>{t('session.editSession')}</Text>
              <Button small variant="ghost" title={t('common.close')} onPress={() => setHostModal(false)} />
            </View>
            <Card>
              <Field label={t('createSession.bookTitle')} maxLength={200} value={editTitle} onChangeText={setEditTitle} />
              <Field label={t('createSession.author')} maxLength={200} value={editAuthor} onChangeText={setEditAuthor} />
              <Field label={`${t('createSession.chapterCount')} (1–200)`} keyboardType="number-pad" maxLength={3} value={editCount} onChangeText={setEditCount} />
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                {(['public', 'private'] as const).map((v) => (
                  <Pressable
                    key={v}
                    onPress={() => setEditVisibility(v)}
                    style={{
                      flex: 1,
                      padding: 10,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: editVisibility === v ? theme.accent : theme.border,
                      backgroundColor: editVisibility === v ? theme.accentSoft : '#fff',
                    }}
                  >
                    <Text style={{ fontWeight: '700', color: theme.text }}>
                      {v === 'public' ? `🌐 ${t('createSession.public')}` : `🔒 ${t('createSession.private')}`}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {Array.from({ length: editN }, (_, i) => (
                <Field
                  key={i}
                  label={t('session.chapterN', { n: i + 1 })}
                  maxLength={120}
                  placeholder={t('session.chapterN', { n: i + 1 })}
                  value={editTitles[i] ?? ''}
                  onChangeText={(v) => {
                    const next = [...editTitles]
                    next[i] = v
                    setEditTitles(next)
                  }}
                />
              ))}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Button small variant="danger" title={t('session.deleteSession')} onPress={confirmDeleteSession} />
                <Button small variant="primary" title={savingHost ? t('common.saving') : t('session.saveSession')} disabled={savingHost} onPress={saveHostEdits} />
              </View>
            </Card>
          </ScrollView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}
