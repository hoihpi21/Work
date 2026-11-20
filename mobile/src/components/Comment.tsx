import { useState } from 'react'
import { Alert, Pressable, Text, TextInput, View } from 'react-native'
import { useAuth } from '../auth'
import { theme } from '../theme'
import { timeAgo } from '../utils'
import Avatar from './Avatar'
import EmojiSheet from './EmojiSheet'
import { Button, styles } from './ui'

export type CommentRow = {
  id: string
  body: string
  created_at: string
  edited_at: string | null
  author_id: string | null
  author: { display_name: string; avatar_url: string | null } | null
  reactions: { emoji: string; user_id: string; user: { display_name: string } | null }[]
}

export default function Comment({
  comment,
  canReact,
  onToggleReaction,
  onEdit,
  onDelete,
}: {
  comment: CommentRow
  canReact: boolean
  onToggleReaction: (c: CommentRow, emoji: string) => void
  onEdit: (id: string, body: string) => Promise<void>
  onDelete: (id: string) => void
}) {
  const { user } = useAuth()
  const isMine = comment.author_id === user?.id
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const [picker, setPicker] = useState(false)

  const groups: { emoji: string; users: CommentRow['reactions'] }[] = []
  for (const r of comment.reactions ?? []) {
    let g = groups.find((x) => x.emoji === r.emoji)
    if (!g) groups.push((g = { emoji: r.emoji, users: [] }))
    g.users.push(r)
  }

  const name = comment.author?.display_name ?? 'Deleted user'

  async function saveEdit() {
    const body = draft.trim()
    if (!body) return
    await onEdit(comment.id, body)
    setEditing(false)
  }

  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.border }}>
      <Avatar name={name} url={comment.author?.avatar_url} size={36} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <Text style={{ fontWeight: '700', color: theme.text }}>{name}</Text>
          <Text style={styles.small}>
            {timeAgo(comment.created_at)}
            {comment.edited_at ? ' · edited' : ''}
          </Text>
        </View>

        {editing ? (
          <View>
            <TextInput style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]} multiline maxLength={2000} value={draft} onChangeText={setDraft} />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
              <Button small variant="ghost" title="Cancel" onPress={() => { setEditing(false); setDraft(comment.body) }} />
              <Button small variant="primary" title="Save" onPress={saveEdit} />
            </View>
          </View>
        ) : (
          <Text style={{ color: theme.text, marginTop: 2, lineHeight: 21 }}>{comment.body}</Text>
        )}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
          {groups.map((g) => {
            const reacted = g.users.some((u) => u.user_id === user?.id)
            const who = g.users.map((u) => u.user?.display_name ?? 'Someone').join(', ')
            return (
              <Pressable
                key={g.emoji}
                accessibilityLabel={`${g.emoji} ${g.users.length}: ${who}`}
                disabled={!canReact}
                onPress={() => onToggleReaction(comment, g.emoji)}
                onLongPress={() => Alert.alert(`${g.emoji} reacted by`, who)}
                style={{
                  flexDirection: 'row',
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: reacted ? theme.accent : theme.border,
                  backgroundColor: reacted ? theme.accentSoft : '#fff',
                }}
              >
                <Text>{g.emoji} {g.users.length}</Text>
              </Pressable>
            )
          })}
          {canReact && (
            <Pressable accessibilityLabel="Add reaction" onPress={() => setPicker(true)} style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 14, borderWidth: 1, borderColor: theme.border }}>
              <Text>☺ +</Text>
            </Pressable>
          )}
          {isMine && !editing && (
            <View style={{ flexDirection: 'row', gap: 12, marginLeft: 6 }}>
              <Text style={{ color: theme.muted }} onPress={() => setEditing(true)} accessibilityRole="button">Edit</Text>
              <Text
                style={{ color: theme.danger }}
                accessibilityRole="button"
                onPress={() =>
                  Alert.alert('Delete this comment?', undefined, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => onDelete(comment.id) },
                  ])
                }
              >
                Delete
              </Text>
            </View>
          )}
        </View>
      </View>
      <EmojiSheet visible={picker} onClose={() => setPicker(false)} onPick={(e) => { setPicker(false); onToggleReaction(comment, e) }} />
    </View>
  )
}
