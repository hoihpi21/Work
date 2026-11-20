import * as DocumentPicker from 'expo-document-picker'
import { supabase } from './supabase'
import type { TFunc } from './i18n'

export const MAX_RESOURCE_BYTES = 25 * 1024 * 1024

export const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xml: 'application/xml',
}

export const PICKER_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/xml',
  'text/xml',
  'text/plain',
]

export type QueuedMobileFile = {
  id: string
  uri: string
  name: string
  size?: number
  contentType: string
}

export function getExt(name = '') {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

export function formatSize(bytes?: number | null) {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function titleFromFilename(name = '') {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 200)
}

export function normalizeResourceUrl(rawInput: string, rawTitle: string, t: TFunc) {
  let raw = rawInput.trim()
  if (!raw) return { error: t('resources.invalidUrl') }
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('invalid')
    const title =
      rawTitle.trim() || `${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`.slice(0, 200)
    return { url: parsed.toString(), title }
  } catch {
    return { error: t('resources.invalidUrl') }
  }
}

export async function pickResourceFiles(t: TFunc): Promise<{ files: QueuedMobileFile[]; error?: string }> {
  const res = await DocumentPicker.getDocumentAsync({
    type: PICKER_MIME_TYPES,
    multiple: true,
    copyToCacheDirectory: true,
  })
  if (res.canceled || !res.assets?.length) return { files: [] }
  const files: QueuedMobileFile[] = []
  let error: string | undefined
  for (const asset of res.assets) {
    const ext = getExt(asset.name)
    const contentType = EXT_TO_MIME[ext]
    if (!contentType) {
      error = t('resources.invalidType')
      continue
    }
    if (asset.size && asset.size > MAX_RESOURCE_BYTES) {
      error = t('resources.tooLarge')
      continue
    }
    files.push({
      id: `${Date.now()}-${Math.random()}`,
      uri: asset.uri,
      name: asset.name,
      size: asset.size,
      contentType,
    })
  }
  return { files, error }
}

export async function uploadSessionFile({
  sessionId,
  userId,
  file,
  t,
}: {
  sessionId: string
  userId: string
  file: QueuedMobileFile
  t: TFunc
}) {
  const bytes = await (await fetch(file.uri)).arrayBuffer()
  if (bytes.byteLength > MAX_RESOURCE_BYTES) throw new Error(t('resources.tooLarge'))
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${sessionId}/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${safeName}`
  const { error: upErr } = await supabase.storage.from('session-files').upload(path, bytes, { contentType: file.contentType })
  if (upErr) throw upErr
  const { error: dbErr } = await supabase.from('session_resources').insert({
    session_id: sessionId,
    kind: 'file',
    title: file.name.slice(0, 200),
    storage_path: path,
    file_name: file.name,
    mime_type: file.contentType,
    file_size: bytes.byteLength,
  })
  if (dbErr) {
    await supabase.storage.from('session-files').remove([path])
    throw dbErr
  }
}

export async function addSessionUrl({ sessionId, url, title }: { sessionId: string; url: string; title: string }) {
  const { error } = await supabase.from('session_resources').insert({
    session_id: sessionId,
    kind: 'url',
    title,
    url,
  })
  if (error) throw error
}
