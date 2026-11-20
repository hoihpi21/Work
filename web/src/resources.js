import { supabase } from './supabase'

export const MAX_RESOURCE_BYTES = 25 * 1024 * 1024

export const EXT_TO_MIME = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xml: 'application/xml',
}

export const ACCEPT_ATTR =
  '.pdf,.doc,.docx,.xml,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/xml,text/xml'

export function getExt(name = '') {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

export function formatSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function titleFromFilename(name = '') {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 200)
}

export function validateResourceFile(file, t) {
  const ext = getExt(file.name)
  const contentType = EXT_TO_MIME[ext]
  if (!contentType) return { error: t('resources.invalidType') }
  if (file.size > MAX_RESOURCE_BYTES) return { error: t('resources.tooLarge') }
  return { contentType, ext }
}

export function normalizeResourceUrl(rawInput, rawTitle, t) {
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

export async function uploadSessionFile({ sessionId, userId, file, contentType }) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${sessionId}/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${safeName}`
  const { error: upErr } = await supabase.storage.from('session-files').upload(path, file, { contentType })
  if (upErr) throw upErr
  const { error: dbErr } = await supabase.from('session_resources').insert({
    session_id: sessionId,
    kind: 'file',
    title: file.name.slice(0, 200),
    storage_path: path,
    file_name: file.name,
    mime_type: contentType,
    file_size: file.size,
  })
  if (dbErr) {
    await supabase.storage.from('session-files').remove([path])
    throw dbErr
  }
}

export async function addSessionUrl({ sessionId, url, title }) {
  const { error } = await supabase.from('session_resources').insert({
    session_id: sessionId,
    kind: 'url',
    title,
    url,
  })
  if (error) throw error
}
