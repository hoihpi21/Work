import { useEffect, useState } from 'react'
import { Alert, ScrollView, Text, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { theme } from '../theme'
import { resizeAvatar } from '../utils'
import Avatar from '../components/Avatar'
import { Button, Card, ErrorText, Field, Notice, styles } from '../components/ui'

export default function ProfileScreen() {
  const { user, profile, refreshProfile, signOut } = useAuth()
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
    if (n.length < 2 || n.length > 40) return setError('Display name must be 2–40 characters.')
    setBusy(true)
    setMsg('')
    setError('')
    const { error } = await supabase.from('profiles').update({ display_name: n }).eq('id', uid)
    if (error) setError(error.message)
    else {
      setMsg('Saved!')
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
    if (!perm.granted) return setError('Photo library permission is required to choose an avatar.')
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true, // native square crop UI
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
      setMsg('Photo updated!')
      refreshProfile()
    } catch (err: any) {
      setError(err.message || 'Upload failed.')
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
    Alert.alert('Delete account?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: deleteAccount },
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
              <Button small disabled={uploading} title={uploading ? 'Working…' : profile?.avatar_url ? 'Change photo' : 'Upload photo'} onPress={pickPhoto} />
              {profile?.avatar_url && <Button small variant="ghost" disabled={uploading} title="Remove" onPress={removeAvatar} />}
            </View>
          </View>
        </View>
        <Field label="Display name" maxLength={40} value={name} onChangeText={setName} />
        <ErrorText>{error}</ErrorText>
        <Notice>{msg}</Notice>
        <Button variant="primary" title={busy ? 'Saving…' : 'Save changes'} disabled={busy} onPress={save} />
      </Card>

      <Button title="Log out" onPress={() => signOut()} style={{ marginBottom: 16 }} />

      <Card>
        <Text style={[styles.h3, { color: theme.danger }]}>Delete account</Text>
        <Text style={[styles.small, { marginBottom: 10 }]}>
          This removes your profile, progress and reactions. Your comments stay and show as “Deleted user”. This cannot be undone.
        </Text>
        <Field label="Type DELETE to confirm" autoCapitalize="characters" value={confirmText} onChangeText={setConfirmText} />
        <Button variant="danger" title="Delete my account" disabled={confirmText !== 'DELETE' || busy} onPress={confirmDelete} />
      </Card>
    </ScrollView>
  )
}
