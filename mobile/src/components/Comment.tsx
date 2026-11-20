import { useState } from 'react'
import { Alert, Pressable, Text, TextInput, View } from 'react-native'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { theme } from '../theme'
import { timeAgo } from '../utils'
import Avatar from './Avatar'
import EmojiSheet from './EmojiSheet'
import { Button, styles } from './ui'

export type CommentRow = {
  id: string
  body: string
  chapter_ref?: number | null
  reply_to_id?: string | null
  created_at: string
  edited_at: string | null
  author_id: string | null
  author: { display_name: string; avatar_url: string | null } | null
  reactions: { emoji: string; user_id: string; user: { display_name: string } | null }[]
}

export default function Comment({
  comment,
  replyTarget,
  canReact,
  canModerate,
  hideSpoilers,
  myProgress = 0,
  onToggleReaction,
  onReply,
  onEdit,
  onDelete,
}: {
  comment: CommentRow
  replyTarget?: CommentRow | null
  canReact: boolean
  canModerate?: boolean
  hideSpoilers?: boolean
  myProgress?: number
  onToggleReaction: (c: CommentRow, emoji: string) => void
  onReply?: (c: CommentRow) => void
  onEdit: (id: string, body: string) => Promise<void>
  onDelete: (id: string) => void
}) {
  const { user } = useAuth()
  const { t } = useI18n()
  const isMine = comment.author_id === user?.id
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const [picker, setPicker] = useState(false)
  const [revealed, setRevealed] = useState(false)

  const groups: { emoji: string; users: CommentRow['reactions'] }[] = []
  for (const r of comment.reactions ?? []) {
    let g = groups.find((x) => x.emoji === r.emoji)
    if (!g) groups.push((g = { emoji: r.emoji, users: [] }))
    g.users.push(r)
  }

  const name = comment.author?.display_name ?? t('common.deletedUser')
  const isSpoiler = !isMine && !!hideSpoilers && !!comment.chapter_ref && comment.chapter_ref > myProgress
  const hidden = isSpoiler && !revealed

  async function saveEdit() {
    const body = draft.trim()
    if (!body) return
    await onEdit(comment.id, body)
    setEditing(false)
  }

  function confirmDelete() {
    const title = isMine ? t('comment.deleteConfirm') : t('comment.deleteAsHostConfirm')
    Alert.alert(title, undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('comment.delete'), style: 'destructive', onPress: () => onDelete(comment.id) },
    ])
  }

  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.border }}>
      <Avatar name={name} url={comment.author?.avatar_url} size={36} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Text style={{ fontWeight: '700', color: theme.text }}>{name}</Text>
          {!!comment.chapter_ref && (
            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.accent, backgroundColor: theme.accentSoft, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 10 }}>
              {t('comment.chapterBadge', { n: comment.chapter_ref })}
            </Text>
          )}
          <Text style={styles.small}>
            {timeAgo(comment.created_at, t)}
            {comment.edited_at ? t('comment.edited') : ''}
          </Text>
        </View>

        {replyTarget && (
          <View style={{ borderLeftWidth: 3, borderLeftColor: theme.accent, backgroundColor: '#faf3e8', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: theme.muted }}>
              ↩ {t('comment.repliedTo', { name: replyTarget.author?.display_name ?? t('common.deletedUser') })}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 12, color: theme.text }}>{replyTarget.body}</Text>
          </View>
        )}

        {editing ? (
          <View style={{ marginTop: 4 }}>
            <TextInput style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]} multiline maxLength={2000} value={draft} onChangeText={setDraft} />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
              <Button small variant="ghost" title={t('common.cancel')} onPress={() => { setEditing(false); setDraft(comment.body) }} />
              <Button small variant="primary" title={t('common.save')} onPress={saveEdit} />
            </View>
          </View>
        ) : hidden ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, padding: 10, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.border, backgroundColor: '#f8f1e6' }}>
            <Text style={{ color: theme.muted, flex: 1 }}>🙈 {t('comment.spoilerHidden', { n: comment.chapter_ref! })}</Text>
            <Button small title={t('comment.revealSpoiler')} onPress={() => setRevealed(true)} />
          </View>
        ) : (
          <View>
            <Text style={{ color: theme.text, marginTop: 2, lineHeight: 21 }}>{comment.body}</Text>
            {isSpoiler && revealed && (
              <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }} onPress={() => setRevealed(false)}>
                {t('comment.hideSpoiler')}
              </Text>
            )}
          </View>
        )}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
          {groups.map((g) => {
            const reacted = g.users.some((u) => u.user_id === user?.id)
            const who = g.users.map((u) => u.user?.display_name ?? t('common.someoneCap')).join(', ')
            return (
              <Pressable
                key={g.emoji}
                accessibilityLabel={`${g.emoji} ${g.users.length}: ${who}`}
                disabled={!canReact}
                onPress={() => onToggleReaction(comment, g.emoji)}
                onLongPress={() => Alert.alert(g.emoji, who)}
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
            <Pressable accessibilityLabel={t('comment.addReaction')} onPress={() => setPicker(true)} style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 14, borderWidth: 1, borderColor: theme.border }}>
              <Text>☺ +</Text>
            </Pressable>
          )}
          {!editing && (
            <View style={{ flexDirection: 'row', gap: 12, marginLeft: 6 }}>
              {canReact && onReply && (
                <Text style={{ color: theme.muted }} onPress={() => onReply(comment)} accessibilityRole="button">
                  {t('comment.reply')}
                </Text>
              )}
              {isMine && (
                <Text style={{ color: theme.muted }} onPress={() => setEditing(true)} accessibilityRole="button">
                  {t('comment.edit')}
                </Text>
              )}
              {(isMine || canModerate) && (
                <Text style={{ color: theme.danger }} accessibilityRole="button" onPress={confirmDelete}>
                  {t('comment.delete')}
                </Text>
              )}
            </View>
          )}
        </View>
      </View>
      <EmojiSheet visible={picker} onClose={() => setPicker(false)} onPick={(e) => { setPicker(false); onToggleReaction(comment, e) }} />
    </View>
  )
}
