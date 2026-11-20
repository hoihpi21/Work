import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native'
import { supabase } from '../supabase'
import { useI18n } from '../i18n'
import { theme } from '../theme'
import { Button, Card, ErrorText, Field, styles } from '../components/ui'

export default function CreateSessionScreen({ navigation }: any) {
  const { t } = useI18n()
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [count, setCount] = useState('10')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [named, setNamed] = useState(false)
  const [titles, setTitles] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const n = Math.min(200, Math.max(1, Number(count) || 1))

  async function submit() {
    if (!title.trim() || !author.trim()) return setError(t('createSession.requiredError'))
    setBusy(true)
    setError('')
    const chapters = Array.from({ length: n }, (_, i) => (named ? (titles[i] ?? '').trim() : ''))
    const { data, error } = await supabase.rpc('create_session', {
      p_title: title,
      p_author: author,
      p_chapters: chapters,
      p_visibility: visibility,
    })
    if (error) {
      setError(error.message)
      setBusy(false)
    } else navigation.replace('Session', { id: data })
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
          <ErrorText>{error}</ErrorText>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="ghost" title={t('common.cancel')} onPress={() => navigation.goBack()} />
            <Button variant="primary" title={busy ? t('createSession.creating') : t('createSession.submit')} disabled={busy} onPress={submit} />
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
