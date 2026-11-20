import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { theme } from '../theme'
import {
  addSessionUrl,
  formatSize,
  getExt,
  normalizeResourceUrl,
  pickResourceFiles,
  titleFromFilename,
  uploadSessionFile,
  type QueuedMobileFile,
} from '../resources'
import { Button, Card, ErrorText, Field, styles } from '../components/ui'

export default function CreateSessionScreen({ navigation }: any) {
  const { user } = useAuth()
  const { t } = useI18n()
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [count, setCount] = useState('10')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [named, setNamed] = useState(false)
  const [titles, setTitles] = useState<string[]>([])
  const [queuedFiles, setQueuedFiles] = useState<QueuedMobileFile[]>([])
  const [queuedUrls, setQueuedUrls] = useState<{ id: string; url: string; title: string }[]>([])
  const [showUrlForm, setShowUrlForm] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [urlTitle, setUrlTitle] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const n = Math.min(200, Math.max(1, Number(count) || 1))

  async function onPickFiles() {
    setError('')
    const { files, error: pickErr } = await pickResourceFiles(t)
    if (pickErr) setError(pickErr)
    if (files.length) {
      setQueuedFiles((prev) => [...prev, ...files])
      if (!title.trim()) setTitle(titleFromFilename(files[0].name))
    }
  }

  function addQueuedUrl() {
    const res = normalizeResourceUrl(urlInput, urlTitle, t)
    if ('error' in res && res.error) return setError(res.error)
    setError('')
    setQueuedUrls((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, url: res.url!, title: res.title! }])
    setUrlInput('')
    setUrlTitle('')
    setShowUrlForm(false)
  }

  async function submit() {
    if (!title.trim() || !author.trim()) return setError(t('createSession.requiredError'))
    setBusy(true)
    setError('')
    setStatus(t('createSession.creating'))
    const chapters = Array.from({ length: n }, (_, i) => (named ? (titles[i] ?? '').trim() : ''))
    const { data: sessionId, error: createErr } = await supabase.rpc('create_session', {
      p_title: title,
      p_author: author,
      p_chapters: chapters,
      p_visibility: visibility,
    })
    if (createErr) {
      setError(createErr.message)
      setBusy(false)
      setStatus('')
      return
    }

    if (queuedFiles.length || queuedUrls.length) {
      setStatus(t('createSession.uploadingFiles'))
      try {
        for (const file of queuedFiles) {
          await uploadSessionFile({ sessionId, userId: user!.id, file, t })
        }
        for (const item of queuedUrls) {
          await addSessionUrl({ sessionId, url: item.url, title: item.title })
        }
      } catch (err) {
        console.error('Attachment upload failed:', err)
      }
    }

    navigation.replace('Session', { id: sessionId })
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={[styles.muted, { marginBottom: 12 }]}>{t('createSession.subtitle')}</Text>
        <Card>
          <Field label={t('createSession.bookTitle')} maxLength={200} value={title} onChangeText={setTitle} placeholder={t('createSession.bookTitlePlaceholder')} />
          <Field label={t('createSession.author')} maxLength={200} value={author} onChangeText={setAuthor} placeholder={t('createSession.authorPlaceholder')} />
          <Field label={`${t('createSession.chapterCount')} (1–200)`} keyboardType="number-pad" maxLength={3} value={count} onChangeText={setCount} />

          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text, marginBottom: 6 }}>{t('createSession.visibility')}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            {(['public', 'private'] as const).map((v) => {
              const active = visibility === v
              return (
                <Pressable
                  key={v}
                  onPress={() => setVisibility(v)}
                  style={{
                    flex: 1,
                    padding: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: active ? theme.accent : theme.border,
                    backgroundColor: active ? theme.accentSoft : '#fff',
                  }}
                >
                  <Text style={{ fontWeight: '700', color: theme.text }}>
                    {v === 'public' ? `🌐 ${t('createSession.public')}` : `🔒 ${t('createSession.private')}`}
                  </Text>
                  <Text style={[styles.small, { marginTop: 2 }]}>
                    {v === 'public' ? t('createSession.publicDesc') : t('createSession.privateDesc')}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ color: theme.text }}>{t('createSession.nameChapters')}</Text>
            <Switch value={named} onValueChange={setNamed} trackColor={{ true: theme.accent }} />
          </View>
          {named &&
            Array.from({ length: n }, (_, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Text style={{ width: 28, textAlign: 'right', color: theme.muted }}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Field
                    label={t('session.chapterN', { n: i + 1 })}
                    maxLength={120}
                    placeholder={t('session.chapterN', { n: i + 1 })}
                    value={titles[i] ?? ''}
                    onChangeText={(v) => {
                      const next = [...titles]
                      next[i] = v
                      setTitles(next)
                    }}
                  />
                </View>
              </View>
            ))}

          <View style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.border, backgroundColor: '#fffdf9', marginTop: 6, marginBottom: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text, marginBottom: 4 }}>
              📎 {t('createSession.attachmentsTitle')}
            </Text>
            <Text style={[styles.small, { marginBottom: 8 }]}>{t('createSession.attachmentsHint')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Button small disabled={busy} title={`+ ${t('resources.uploadFile')}`} onPress={onPickFiles} />
              <Button small variant="ghost" disabled={busy} title={`🔗 ${t('resources.addUrl')}`} onPress={() => setShowUrlForm((v) => !v)} />
            </View>

            {showUrlForm && (
              <View style={{ backgroundColor: '#fbf6ee', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.border, marginTop: 10 }}>
                <Field
                  label={t('resources.urlLabel')}
                  placeholder={t('resources.urlPlaceholder')}
                  autoCapitalize="none"
                  keyboardType="url"
                  value={urlInput}
                  onChangeText={setUrlInput}
                />
                <Field
                  label={t('resources.titleLabel')}
                  placeholder={t('resources.titlePlaceholder')}
                  maxLength={200}
                  value={urlTitle}
                  onChangeText={setUrlTitle}
                />
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                  <Button small variant="ghost" title={t('common.cancel')} onPress={() => setShowUrlForm(false)} />
                  <Button small variant="primary" title={t('resources.add')} disabled={!urlInput.trim()} onPress={addQueuedUrl} />
                </View>
              </View>
            )}

            {queuedFiles.map((file) => (
              <View key={file.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', color: theme.text }} numberOfLines={1}>📄 {file.name}</Text>
                  <Text style={styles.small}>
                    {getExt(file.name).toUpperCase()}{file.size ? ` · ${formatSize(file.size)}` : ''}
                  </Text>
                </View>
                <Text style={{ color: theme.danger, fontSize: 12 }} onPress={() => setQueuedFiles((prev) => prev.filter((x) => x.id !== file.id))}>
                  {t('profile.removePhoto')}
                </Text>
              </View>
            ))}

            {queuedUrls.map((item) => (
              <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', color: theme.text }} numberOfLines={1}>🔗 {item.title}</Text>
                  <Text style={styles.small} numberOfLines={1}>{item.url}</Text>
                </View>
                <Text style={{ color: theme.danger, fontSize: 12 }} onPress={() => setQueuedUrls((prev) => prev.filter((x) => x.id !== item.id))}>
                  {t('profile.removePhoto')}
                </Text>
              </View>
            ))}
          </View>

          <ErrorText>{error}</ErrorText>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="ghost" title={t('common.cancel')} disabled={busy} onPress={() => navigation.goBack()} />
            <Button variant="primary" title={busy ? status || t('createSession.creating') : t('createSession.submit')} disabled={busy} onPress={submit} />
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
