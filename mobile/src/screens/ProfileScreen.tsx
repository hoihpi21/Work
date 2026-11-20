import { useEffect, useState } from 'react'
import { Alert, ScrollView, Text, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { LanguageSwitcher, useI18n } from '../i18n'
import { theme } from '../theme'
import { resizeAvatar } from '../utils'
import Avatar from '../components/Avatar'
import { Button, Card, ErrorText, Field, Notice, styles } from '../components/ui'

export default function ProfileScreen() {
  const { user, profile, refreshProfile, signOut } = useAuth()
  const { t } = useI18n()
  const uid = user!.id
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  useEffect(() => {
    if (profile) setName(profile.display_name)
  }, [profile])

  async function save() {
    const n = name.trim()
    if (n.length < 2 || n.length > 40) return setError(t('auth.displayNameLengthError'))
    setBusy(true)
    setMsg('')
    setError('')
    const { error } = await supabase.from('profiles').update({ display_name: n }).eq('id', uid)
    if (error) setError(error.message)
    else {
      setMsg(t('profile.saved'))
      refreshProfile()
    }
    setBusy(false)
  }

  async function removeOldAvatars() {
    const { data } = await supabase.storage.from('avatars').list(uid)
    if (data?.length) await supabase.storage.from('avatars').remove(data.map((f) => `${uid}/${f.name}`))
  }

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) return setError(t('profile.photoPermissionError'))
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    })
    if (res.canceled) return
    setUploading(true)
    setError('')
    setMsg('')
    try {
      const img = await resizeAvatar(res.assets[0].uri)
      const bytes = await (await fetch(img.uri)).arrayBuffer()
      await removeOldAvatars()
      const path = `${uid}/avatar-${Date.now()}.${img.ext}`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, bytes, { contentType: img.contentType })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const { error } = await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', uid)
      if (error) throw error
      setMsg(t('profile.photoUpdated'))
      refreshProfile()
    } catch (err: any) {
      setError(err.message || t('profile.uploadFailed'))
    }
    setUploading(false)
  }

  async function removeAvatar() {
    setUploading(true)
    setError('')
    await removeOldAvatars()
    const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', uid)
    if (error) setError(error.message)
    else refreshProfile()
    setUploading(false)
  }

  async function deleteAccount() {
    setBusy(true)
    setError('')
    await removeOldAvatars()
    const { error } = await supabase.rpc('delete_my_account')
    if (error) {
      setError(error.message)
      setBusy(false)
    } else await signOut()
  }

  function confirmDelete() {
    Alert.alert(t('profile.deleteDialogTitle'), t('profile.deleteDialogDesc'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('comment.delete'), style: 'destructive', onPress: deleteAccount },
    ])
  }

  return (
    <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Card>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', marginBottom: 14 }}>
          <Avatar name={name} url={profile?.avatar_url} size={72} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', fontSize: 17, color: theme.text }}>{profile?.display_name}</Text>
            <Text style={styles.muted}>{user!.email}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Button
                small
                disabled={uploading}
                title={uploading ? t('profile.working') : profile?.avatar_url ? t('profile.changePhoto') : t('profile.uploadPhoto')}
                onPress={pickPhoto}
              />
              {profile?.avatar_url && <Button small variant="ghost" disabled={uploading} title={t('profile.removePhoto')} onPress={removeAvatar} />}
            </View>
          </View>
        </View>
        <Field label={t('auth.displayName')} maxLength={40} value={name} onChangeText={setName} />
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text, marginBottom: 6 }}>{t('profile.language')}</Text>
          <LanguageSwitcher />
        </View>
        <ErrorText>{error}</ErrorText>
        <Notice>{msg}</Notice>
        <Button variant="primary" title={busy ? t('common.saving') : t('profile.saveChanges')} disabled={busy} onPress={save} />
      </Card>

      <Button title={t('nav.logout')} onPress={() => signOut()} style={{ marginBottom: 16 }} />

      <Card>
        <Text style={[styles.h3, { color: theme.danger }]}>{t('profile.deleteAccountTitle')}</Text>
        <Text style={[styles.small, { marginBottom: 10 }]}>{t('profile.deleteAccountDesc')}</Text>
        <Field label={`${t('profile.deleteConfirmBefore')}DELETE${t('profile.deleteConfirmAfter')}`} autoCapitalize="characters" value={confirmText} onChangeText={setConfirmText} />
        <Button variant="danger" title={t('profile.deleteAccountBtn')} disabled={confirmText !== 'DELETE' || busy} onPress={confirmDelete} />
      </Card>
    </ScrollView>
  )
}
