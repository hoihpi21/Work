const COLORS = ['#c2552d', '#3f7d6b', '#7a5aa6', '#b8860b', '#2f6f9f', '#a8456b', '#5d7a2e']

export function colorFor(str = '') {
  let h = 0
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return COLORS[h % COLORS.length]
}

// Center-crop to a square and downscale to a small WebP for avatars.
export async function resizeImage(file, size = 256) {
  const bmp = await createImageBitmap(file)
  const s = Math.min(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  canvas.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85))
}

export function timeAgo(iso, t) {
  const diff = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  const steps = [
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
      return `${n} ${unit}${n === 1 ? '' : 's'} ago`
    }
  }
  return t ? t('time.justNow') : 'just now'
}
