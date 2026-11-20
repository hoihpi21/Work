import { Platform } from 'react-native'
import * as ImageManipulator from 'expo-image-manipulator'
import type { TFunc } from './i18n'

const COLORS = ['#c2552d', '#3f7d6b', '#7a5aa6', '#b8860b', '#2f6f9f', '#a8456b', '#5d7a2e']

export function colorFor(str = '') {
  let h = 0
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return COLORS[h % COLORS.length]
}

export function timeAgo(iso: string, t?: TFunc) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  const steps: [string, string, number][] = [
    ['yearAgo', 'yearsAgo', 31536000],
    ['monthAgo', 'monthsAgo', 2592000],
    ['dayAgo', 'daysAgo', 86400],
    ['hourAgo', 'hoursAgo', 3600],
    ['minuteAgo', 'minutesAgo', 60],
  ]
  for (const [one, many, secs] of steps) {
    if (diff >= secs) {
      const n = Math.round(diff / secs)
      if (t) return t(`time.${n === 1 ? one : many}`, { n })
      const unit = one.replace('Ago', '')
      return `${n} ${unit}${n > 1 ? 's' : ''} ago`
    }
  }
  return t ? t('time.justNow') : 'just now'
}

/** Downscale a (already square-cropped) picked image to 256px. WebP on Android, JPEG on iOS (no WebP encoder). */
export async function resizeAvatar(uri: string, size = 256) {
  const webp = Platform.OS === 'android'
  const ctx = ImageManipulator.ImageManipulator.manipulate(uri)
  ctx.resize({ width: size, height: size })
  const image = await ctx.renderAsync()
  const out = await image.saveAsync({
    format: webp ? ImageManipulator.SaveFormat.WEBP : ImageManipulator.SaveFormat.JPEG,
    compress: 0.85,
  })
  return { uri: out.uri, ext: webp ? 'webp' : 'jpg', contentType: webp ? 'image/webp' : 'image/jpeg' }
}
