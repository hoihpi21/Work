import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native'
import * as Linking from 'expo-linking'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { LanguageSwitcher, useI18n } from '../i18n'
import { theme } from '../theme'
import { Button, Card, ErrorText, Field, Notice, styles } from '../components/ui'

function Shell({ emoji, title, subtitle, children }: { emoji: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 20, flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'flex-end', marginBottom: 12 }}>
          <LanguageSwitcher />
        </View>
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
  const { t } = useI18n()
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
    <Shell emoji="📚" title={t('app.name')} subtitle={t('auth.loginSubtitle')}>
      <Field label={t('auth.email')} autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Field label={t('auth.password')} secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} />
      <Text style={[link, { textAlign: 'right', marginBottom: 10 }]} onPress={() => navigation.navigate('Forgot')}>{t('auth.forgotPassword')}</Text>
      <ErrorText>{error}</ErrorText>
      <Button variant="primary" title={busy ? t('auth.loggingIn') : t('auth.login')} disabled={busy || !email || !password} onPress={submit} />
      <Text style={[styles.muted, { textAlign: 'center', marginTop: 14 }]}>
        {t('auth.newHere')} <Text style={link} onPress={() => navigation.navigate('Register')}>{t('auth.createAccount')}</Text>
      </Text>
    </Shell>
  )
}

export function RegisterScreen({ navigation }: any) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const n = name.trim()
    if (n.length < 2 || n.length > 40) return setError(t('auth.displayNameLengthError'))
    if (password.length < 6) return setError(t('auth.passwordLengthError'))
    setBusy(true)
    setError('')
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: n } },
    })
    if (error) setError(error.message)
    else if (!data.session) setNotice(t('auth.confirmEmailNotice'))
    setBusy(false)
  }

  return (
    <Shell emoji="📚" title={t('auth.registerTitle')} subtitle={t('auth.registerSubtitle')}>
      {notice ? (
        <Notice>{notice}</Notice>
      ) : (
        <>
          <Field label={t('auth.displayName')} maxLength={40} autoComplete="nickname" value={name} onChangeText={setName} />
          <Field label={t('auth.email')} autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <Field label={t('auth.password')} secureTextEntry autoComplete="new-password" value={password} onChangeText={setPassword} />
          <ErrorText>{error}</ErrorText>
          <Button variant="primary" title={busy ? t('auth.creatingAccount') : t('auth.createAccountBtn')} disabled={busy || !name || !email || !password} onPress={submit} />
        </>
      )}
      <Text style={[styles.muted, { textAlign: 'center', marginTop: 14 }]}>
        {t('auth.alreadyMember')} <Text style={link} onPress={() => navigation.navigate('Login')}>{t('auth.login')}</Text>
      </Text>
    </Shell>
  )
}

export function ForgotScreen({ navigation }: any) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: Linking.createURL('reset'),
    })
    if (error) setError(error.message)
    else setSent(true)
    setBusy(false)
  }

  return (
    <Shell emoji="🔑" title={t('auth.forgotTitle')} subtitle={t('auth.forgotSubtitle')}>
      {sent ? (
        <Notice>{t('auth.resetLinkSent')}</Notice>
      ) : (
        <>
          <Field label={t('auth.email')} autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <ErrorText>{error}</ErrorText>
          <Button variant="primary" title={busy ? t('auth.sending') : t('auth.sendResetLink')} disabled={busy || !email} onPress={submit} />
        </>
      )}
      <Text style={[link, { textAlign: 'center', marginTop: 14 }]} onPress={() => navigation.navigate('Login')}>{t('auth.backToLogin')}</Text>
    </Shell>
  )
}

export function ResetScreen({ navigation }: any) {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (password.length < 6) return setError(t('auth.passwordLengthError'))
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setBusy(false)
    } else navigation.reset({ index: 0, routes: [{ name: 'Home' }] })
  }

  return (
    <Shell emoji="🔒" title={t('auth.resetTitle')}>
      {loading ? (
        <Text style={styles.muted}>{t('auth.checkingLink')}</Text>
      ) : !user ? (
        <View>
          <ErrorText>{t('auth.invalidResetLink')}</ErrorText>
          <Button title={t('auth.requestNewLink')} onPress={() => navigation.navigate('Forgot')} />
        </View>
      ) : (
        <>
          <Field label={t('auth.newPassword')} secureTextEntry autoComplete="new-password" value={password} onChangeText={setPassword} />
          <ErrorText>{error}</ErrorText>
          <Button variant="primary" title={busy ? t('common.saving') : t('auth.updatePassword')} disabled={busy || !password} onPress={submit} />
        </>
      )}
    </Shell>
  )
}
