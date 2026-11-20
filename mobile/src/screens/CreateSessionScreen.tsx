import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Switch, Text, View } from 'react-native'
import { supabase } from '../supabase'
import { theme } from '../theme'
import { Button, Card, ErrorText, Field, styles } from '../components/ui'

export default function CreateSessionScreen({ navigation }: any) {
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [count, setCount] = useState('10')
  const [named, setNamed] = useState(false)
  const [titles, setTitles] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const n = Math.min(200, Math.max(1, Number(count) || 1))

  async function submit() {
    if (!title.trim() || !author.trim()) return setError('Title and author are required.')
    setBusy(true)
    setError('')
    const chapters = Array.from({ length: n }, (_, i) => (named ? (titles[i] ?? '').trim() : ''))
    const { data, error } = await supabase.rpc('create_session', { p_title: title, p_author: author, p_chapters: chapters })
    if (error) {
      setError(error.message)
      setBusy(false)
    } else navigation.replace('Session', { id: data })
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={[styles.muted, { marginBottom: 12 }]}>One book, one session. Everyone can join and read along.</Text>
        <Card>
          <Field label="Book title" maxLength={200} value={title} onChangeText={setTitle} placeholder="e.g. The Little Prince" />
          <Field label="Author" maxLength={200} value={author} onChangeText={setAuthor} placeholder="e.g. Antoine de Saint-Exupéry" />
          <Field label="Number of chapters (1–200)" keyboardType="number-pad" maxLength={3} value={count} onChangeText={setCount} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ color: theme.text }}>Give chapters names (optional)</Text>
            <Switch value={named} onValueChange={setNamed} trackColor={{ true: theme.accent }} />
          </View>
          {named &&
            Array.from({ length: n }, (_, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Text style={{ width: 28, textAlign: 'right', color: theme.muted }}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Field
                    label={`Chapter ${i + 1} name`}
                    maxLength={120}
                    placeholder={`Chapter ${i + 1}`}
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
            <Button variant="ghost" title="Cancel" onPress={() => navigation.goBack()} />
            <Button variant="primary" title={busy ? 'Creating…' : 'Create session'} disabled={busy} onPress={submit} />
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
