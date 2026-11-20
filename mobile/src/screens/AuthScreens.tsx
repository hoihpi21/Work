import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native'
import * as Linking from 'expo-linking'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { theme } from '../theme'
import { Button, Card, ErrorText, Field, Notice, styles } from '../components/ui'

function Shell({ emoji, title, subtitle, children }: { emoji: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 20, flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
        <Card style={{ padding: 20 }}>
          <Text style={{ fontSize: 40, textAlign: 'center' }}>{emoji}</Text>
          <Text style={[styles.h1, { textAlign: 'center', marginBottom: 4 }]}>{title}</Text>
          {subtitle && <Text style={[styles.muted, { textAlign: 'center', marginBottom: 14 }]}>{subtitle}</Text>}
          {children}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const link = { color: theme.accent, fontWeight: '600' as const }

export function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <Shell emoji="📚" title="Books & Friends" subtitle="Read together, chapter by chapter.">
      <Field label="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Field label="Password" secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} />
      <Text style={[link, { textAlign: 'right', marginBottom: 10 }]} onPress={() => navigation.navigate('Forgot')}>Forgot password?</Text>
      <ErrorText>{error}</ErrorText>
      <Button variant="primary" title={busy ? 'Logging in…' : 'Log in'} disabled={busy || !email || !password} onPress={submit} />
      <Text style={[styles.muted, { textAlign: 'center', marginTop: 14 }]}>
        New here? <Text style={link} onPress={() => navigation.navigate('Register')}>Create an account</Text>
      </Text>
    </Shell>
  )
}

export function RegisterScreen({ navigation }: any) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const n = name.trim()
    if (n.length < 2 || n.length > 40) return setError('Display name must be 2–40 characters.')
    if (password.length < 6) return setError('Password must be at least 6 characters.')
    setBusy(true)
    setError('')
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: n } },
    })
    if (error) setError(error.message)
    else if (!data.session) setNotice('Almost there! Check your email to confirm your account, then log in.')
    setBusy(false)
  }

  return (
    <Shell emoji="📚" title="Join Books & Friends" subtitle="Read together, chapter by chapter.">
      {notice ? (
        <Notice>{notice}</Notice>
      ) : (
        <>
          <Field label="Display name" maxLength={40} autoComplete="nickname" value={name} onChangeText={setName} />
          <Field label="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <Field label="Password" secureTextEntry autoComplete="new-password" value={password} onChangeText={setPassword} />
          <ErrorText>{error}</ErrorText>
          <Button variant="primary" title={busy ? 'Creating…' : 'Create account'} disabled={busy || !name || !email || !password} onPress={submit} />
        </>
      )}
      <Text style={[styles.muted, { textAlign: 'center', marginTop: 14 }]}>
        Already a member? <Text style={link} onPress={() => navigation.navigate('Login')}>Log in</Text>
      </Text>
    </Shell>
  )
}

export function ForgotScreen({ navigation }: any) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: Linking.createURL('reset'), // booksandfriends://reset in builds, exp://… in Expo Go
    })
    if (error) setError(error.message)
    else setSent(true)
    setBusy(false)
  }

  return (
    <Shell emoji="🔑" title="Reset password" subtitle="We'll email you a link to choose a new password.">
      {sent ? (
        <Notice>If that email has an account, a reset link is on its way. Open it on this device.</Notice>
      ) : (
        <>
          <Field label="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <ErrorText>{error}</ErrorText>
          <Button variant="primary" title={busy ? 'Sending…' : 'Send reset link'} disabled={busy || !email} onPress={submit} />
        </>
      )}
      <Text style={[link, { textAlign: 'center', marginTop: 14 }]} onPress={() => navigation.navigate('Login')}>Back to log in</Text>
    </Shell>
  )
}

export function ResetScreen({ navigation }: any) {
  const { user, loading } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (password.length < 6) return setError('Password must be at least 6 characters.')
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setBusy(false)
    } else navigation.reset({ index: 0, routes: [{ name: 'Home' }] })
  }

  return (
    <Shell emoji="🔒" title="Choose a new password">
      {loading ? (
        <Text style={styles.muted}>Checking your link…</Text>
      ) : !user ? (
        <View>
          <ErrorText>This reset link is invalid or has expired.</ErrorText>
          <Button title="Request a new link" onPress={() => navigation.navigate('Forgot')} />
        </View>
      ) : (
        <>
          <Field label="New password" secureTextEntry autoComplete="new-password" value={password} onChangeText={setPassword} />
          <ErrorText>{error}</ErrorText>
          <Button variant="primary" title={busy ? 'Saving…' : 'Update password'} disabled={busy || !password} onPress={submit} />
        </>
      )}
    </Shell>
  )
}
