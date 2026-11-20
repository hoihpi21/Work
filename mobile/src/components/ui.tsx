import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native'
import { theme } from '../theme'

export function Button({
  title,
  onPress,
  variant = 'default',
  disabled,
  small,
  style,
}: {
  title: string
  onPress: () => void
  variant?: 'default' | 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  small?: boolean
  style?: ViewStyle
}) {
  const bg = variant === 'primary' ? theme.accent : variant === 'danger' ? theme.danger : variant === 'ghost' ? 'transparent' : theme.card
  const color = variant === 'primary' || variant === 'danger' ? '#fff' : variant === 'ghost' ? theme.muted : theme.text
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        variant === 'default' && { borderWidth: 1, borderColor: theme.border },
        style,
      ]}
    >
      <Text style={{ color, fontWeight: '600', fontSize: small ? 13 : 15 }}>{title}</Text>
    </Pressable>
  )
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor="#b0a597" style={styles.input} accessibilityLabel={label} {...props} />
    </View>
  )
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function ErrorText({ children, onPress }: { children?: string; onPress?: () => void }) {
  if (!children) return null
  return (
    <Text accessibilityRole="alert" onPress={onPress} style={{ color: theme.danger, marginBottom: 10 }}>
      {children}
    </Text>
  )
}

export function Notice({ children }: { children?: string }) {
  if (!children) return null
  return <Text style={styles.notice}>{children}</Text>
}

export function Loading({ text = 'Loading…' }: { text?: string }) {
  return (
    <View style={{ padding: 24, alignItems: 'center' }}>
      <ActivityIndicator color={theme.accent} />
      <Text style={{ color: theme.muted, marginTop: 8 }}>{text}</Text>
    </View>
  )
}

export const styles = StyleSheet.create({
  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { paddingVertical: 7, paddingHorizontal: 12 },
  label: { fontSize: 13, fontWeight: '600', color: theme.muted, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: theme.text,
  },
  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
    marginBottom: 12,
  },
  notice: { backgroundColor: theme.accentSoft, color: theme.text, padding: 10, borderRadius: 10, marginBottom: 10, overflow: 'hidden' },
  h1: { fontSize: 24, fontWeight: '700', color: theme.text },
  h3: { fontSize: 17, fontWeight: '700', color: theme.text, marginBottom: 6 },
  muted: { color: theme.muted },
  small: { fontSize: 12, color: theme.muted },
})
