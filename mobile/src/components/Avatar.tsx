import { Image, Text, View } from 'react-native'
import { colorFor } from '../utils'

export default function Avatar({ name, url, size = 36 }: { name?: string | null; url?: string | null; size?: number }) {
  const style = { width: size, height: size, borderRadius: size / 2 }
  if (url) return <Image source={{ uri: url }} style={style} accessibilityLabel={name ?? 'avatar'} />
  return (
    <View style={[style, { backgroundColor: colorFor(name ?? ''), alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.42 }}>{(name ?? '?').trim().charAt(0).toUpperCase() || '?'}</Text>
    </View>
  )
}
