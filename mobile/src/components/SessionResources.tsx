import { useState } from 'react'
import { Alert, Linking, Text, View } from 'react-native'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { theme } from '../theme'
import { timeAgo } from '../utils'
import {
  addSessionUrl,
  formatSize,
  getExt,
  normalizeResourceUrl,
  pickResourceFiles,
  uploadSessionFile,
} from '../resources'
import { Button, Card, Field, styles } from './ui'

export type ResourceRow = {
  id: string
  kind: 'file' | 'url'
  title: string
  url: string | null
  storage_path: string | null
  file_name: string | null
  mime_type: string | null
  file_size: number | null
  created_at: string
  uploader_id: string | null
  uploader: { display_name: string } | null
}

function iconFor(r: ResourceRow) {
  if (r.kind === 'url') return '🔗'
  const ext = getExt(r.file_name || r.title)
  if (ext === 'pdf') return '📄'
  if (ext === 'doc' || ext === 'docx') return '📝'
  if (ext === 'xml') return '🧩'
  return '📎'
}

function badgeFor(r: ResourceRow) {
  if (r.kind === 'url') return 'URL'
  return getExt(r.file_name || r.title).toUpperCase() || 'FILE'
}

export default function SessionResources({
  sessionId,
  resources,
  canUpload,
  isHost,
  onChanged,
  onError,
}: {
  sessionId: string
  resources: ResourceRow[]
  canUpload: boolean
  isHost: boolean
  onChanged: () => void
  onError: (msg: string) => void
}) {
  const { user } = useAuth()
  const { t } = useI18n()
  const [uploading, setUploading] = useState(false)
  const [showUrlForm, setShowUrlForm] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [urlTitle, setUrlTitle] = useState('')
  const [savingUrl, setSavingUrl] = useState(false)

  async function pickFile() {
    onError('')
    const { files, error: pickErr } = await pickResourceFiles(t)
    if (pickErr) onError(pickErr)
    if (!files.length) return

    setUploading(true)
    try {
      for (const file of files) {
        await uploadSessionFile({ sessionId, userId: user!.id, file, t })
      }
      onChanged()
    } catch (err: any) {
      onError(err.message || t('profile.uploadFailed'))
    }
    setUploading(false)
  }

  async function submitUrl() {
    const res = normalizeResourceUrl(urlInput, urlTitle, t)
    if ('error' in res && res.error) return onError(res.error)
    setSavingUrl(true)
    onError('')
    try {
      await addSessionUrl({ sessionId, url: res.url!, title: res.title! })
      setUrlInput('')
      setUrlTitle('')
      setShowUrlForm(false)
      onChanged()
    } catch (err: any) {
      onError(err.message)
    }
    setSavingUrl(false)
  }

  async function openResource(r: ResourceRow) {
    if (r.kind === 'url' && r.url) {
      await Linking.openURL(r.url)
      return
    }
    if (!r.storage_path) return
    const { data, error } = await supabase.storage.from('session-files').createSignedUrl(r.storage_path, 3600)
    if (error) return onError(error.message)
    await Linking.openURL(data.signedUrl)
  }

  function confirmDelete(r: ResourceRow) {
    Alert.alert(t('resources.deleteConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('comment.delete'),
        style: 'destructive',
        onPress: async () => {
          if (r.kind === 'file' && r.storage_path) {
            await supabase.storage.from('session-files').remove([r.storage_path])
          }
          const { error } = await supabase.from('session_resources').delete().eq('id', r.id)
          if (error) onError(error.message)
          else onChanged()
        },
      },
    ])
  }

  return (
    <Card>
      <Text style={styles.h3}>📎 {t('resources.title')}</Text>
      <Text style={[styles.small, { marginBottom: 10 }]}>{t('resources.supportedTypes')}</Text>

      {canUpload && (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <Button small disabled={uploading} title={uploading ? t('resources.uploading') : `+ ${t('resources.uploadFile')}`} onPress={pickFile} />
          <Button small variant="ghost" title={`🔗 ${t('resources.addUrl')}`} onPress={() => setShowUrlForm((v) => !v)} />
        </View>
      )}

      {showUrlForm && canUpload && (
        <View style={{ backgroundColor: '#fbf6ee', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.border, marginBottom: 12 }}>
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
            <Button small variant="primary" title={t('resources.add')} disabled={savingUrl || !urlInput.trim()} onPress={submitUrl} />
          </View>
        </View>
      )}

      {resources.length === 0 ? (
        <Text style={styles.muted}>{t('resources.empty')}</Text>
      ) : (
        resources.map((r) => {
          const canDelete = isHost || r.uploader_id === user?.id
          return (
            <View key={r.id} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text>{iconFor(r)}</Text>
                <Text style={{ fontWeight: '700', color: theme.text, flexShrink: 1 }}>{r.title}</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: theme.accent, backgroundColor: theme.accentSoft, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 10 }}>
                  {badgeFor(r)}
                </Text>
                {!!r.file_size && <Text style={styles.small}>{formatSize(r.file_size)}</Text>}
              </View>
              <Text style={[styles.small, { marginTop: 2 }]}>
                {t('resources.addedBy', {
                  name: r.uploader?.display_name ?? t('common.deletedUser'),
                  time: timeAgo(r.created_at, t),
                })}
              </Text>
              <View style={{ flexDirection: 'row', gap: 14, marginTop: 6 }}>
                <Text style={{ color: theme.accent, fontWeight: '600' }} onPress={() => openResource(r)} accessibilityRole="button">
                  {r.kind === 'url' ? t('resources.open') : t('resources.download')}
                </Text>
                {canDelete && (
                  <Text style={{ color: theme.danger }} onPress={() => confirmDelete(r)} accessibilityRole="button">
                    {t('comment.delete')}
                  </Text>
                )}
              </View>
            </View>
          )
        })
      )}
    </Card>
  )
}
