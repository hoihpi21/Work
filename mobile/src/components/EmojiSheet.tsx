import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { theme } from '../theme'

const EMOJI = (
  '👍 ❤️ 😂 😮 🤔 😢 😍 🙏 👏 🎉 🔥 💯 😊 😎 🤯 😭 😅 🥹 🤩 😴 ' +
  '📚 📖 📕 📗 📘 📙 🔖 ✍️ 💡 🧠 ⭐ 🌟 ✨ 💖 💔 💀 👀 🙌 💪 🤝 ' +
  '👎 😡 🙄 😬 🤣 😇 🥰 😘 😉 🤗 🫶 ☕ 🌙 ☀️ 🌈 🍀 🌹 🎭 🕵️ 🧙'
).split(' ')

export default function EmojiSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (e: string) => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={onClose} accessibilityLabel="Close emoji picker" />
      <View style={{ backgroundColor: '#fff', padding: 14, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: 360 }}>
        <Text style={{ fontWeight: '700', color: theme.text, marginBottom: 8 }}>React with…</Text>
        <ScrollView>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {EMOJI.map((e) => (
              <Pressable key={e} accessibilityLabel={`React ${e}`} onPress={() => onPick(e)} style={{ width: '12.5%', alignItems: 'center', paddingVertical: 8 }}>
                <Text style={{ fontSize: 26 }}>{e}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}
