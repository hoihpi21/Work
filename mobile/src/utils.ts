import { Platform } from 'react-native'
import * as ImageManipulator from 'expo-image-manipulator'

const COLORS = ['#c2552d', '#3f7d6b', '#7a5aa6', '#b8860b', '#2f6f9f', '#a8456b', '#5d7a2e']

export function colorFor(str = '') {
  let h = 0
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return COLORS[h % COLORS.length]
}

export function timeAgo(iso: string) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [unit, secs] of steps) {
    if (Math.abs(diff) >= secs) {
      const n = Math.round(diff / secs)
      const abs = Math.abs(n)
      return n < 0 ? `${abs} ${unit}${abs > 1 ? 's' : ''} ago` : `in ${abs} ${unit}${abs > 1 ? 's' : ''}`
    }
  }
  return 'just now'
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
