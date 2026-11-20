import { useCallback, useEffect, useState } from 'react'
import { Pressable, View, Text, ActivityIndicator } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { NavigationContainer, createNavigationContainerRef, type LinkingOptions } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import * as Linking from 'expo-linking'
import { AuthProvider, useAuth } from './src/auth'
import { I18nProvider, useI18n } from './src/i18n'
import { supabase } from './src/supabase'
import { theme } from './src/theme'
import Avatar from './src/components/Avatar'
import { ForgotScreen, LoginScreen, RegisterScreen, ResetScreen } from './src/screens/AuthScreens'
import HomeScreen from './src/screens/HomeScreen'
import CreateSessionScreen from './src/screens/CreateSessionScreen'
import SessionScreen from './src/screens/SessionScreen'
import ProfileScreen from './src/screens/ProfileScreen'
import InviteScreen from './src/screens/InviteScreen'
import NotificationsScreen from './src/screens/NotificationsScreen'

const Stack = createNativeStackNavigator()
const navRef = createNavigationContainerRef<any>()

// Deep links: booksandfriends://session/:id, booksandfriends://invite/:code, booksandfriends://reset
const linking: LinkingOptions<any> = {
  prefixes: [Linking.createURL('/'), 'booksandfriends://'],
  config: { screens: { Session: 'session/:id', Invite: 'invite/:code', Reset: 'reset' } },
}

/** Handle Supabase password-recovery links (PKCE `code` or implicit `#access_token`). */
async function handleAuthUrl(url: string | null) {
  if (!url || !url.includes('reset')) return
  const parsed = Linking.parse(url)
  const frag = new URLSearchParams(url.split('#')[1] ?? '')
  const code = parsed.queryParams?.code as string | undefined
  const access = frag.get('access_token')
  const refresh = frag.get('refresh_token')
  if (code) await supabase.auth.exchangeCodeForSession(code)
  else if (access && refresh) await supabase.auth.setSession({ access_token: access, refresh_token: refresh })
}

function Root() {
  const { user, profile, loading } = useAuth()
  const { t } = useI18n()
  const [unreadCount, setUnreadCount] = useState(0)

  const loadUnread = useCallback(async () => {
    if (!user) return setUnreadCount(0)
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null)
    setUnreadCount(count ?? 0)
  }, [user])

  useEffect(() => {
    Linking.getInitialURL().then(handleAuthUrl)
    const sub = Linking.addEventListener('url', (e) => handleAuthUrl(e.url))
    return () => sub.remove()
  }, [])

  useEffect(() => {
    loadUnread()
    if (!user) return
    const channel = supabase
      .channel(`unread-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, loadUnread)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, loadUnread])

  if (loading)
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    )

  return (
    <NavigationContainer ref={navRef} linking={linking}>
      <Stack.Navigator
        screenOptions={{ headerStyle: { backgroundColor: theme.bg }, headerTintColor: theme.text, headerShadowVisible: false, contentStyle: { backgroundColor: theme.bg } }}
      >
        {user ? (
          <>
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={({ navigation }) => ({
                title: `📚 ${t('app.name')}`,
                headerRight: () => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Pressable
                      onPress={() => navigation.navigate('Notifications')}
                      accessibilityRole="button"
                      accessibilityLabel={t('nav.notifications')}
                      style={{ position: 'relative', padding: 4 }}
                    >
                      <Text style={{ fontSize: 18 }}>🔔</Text>
                      {unreadCount > 0 && (
                        <View
                          style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            minWidth: 16,
                            height: 16,
                            borderRadius: 8,
                            backgroundColor: theme.accent,
                            alignItems: 'center',
                            justifyContent: 'center',
                            paddingHorizontal: 3,
                          }}
                        >
                          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                    <Pressable onPress={() => navigation.navigate('Profile')} accessibilityRole="button" accessibilityLabel={t('nav.profile')}>
                      <Avatar name={profile?.display_name} url={profile?.avatar_url} size={30} />
                    </Pressable>
                  </View>
                ),
              })}
            />
            <Stack.Screen name="New" component={CreateSessionScreen} options={{ title: t('createSession.title') }} />
            <Stack.Screen name="Session" component={SessionScreen} options={{ title: t('nav.sessions') }} />
            <Stack.Screen name="Invite" component={InviteScreen} options={{ title: t('invite.joining') }} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: t('notifications.title') }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: t('profile.title') }} />
            <Stack.Screen name="Reset" component={ResetScreen} options={{ headerShown: false }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Forgot" component={ForgotScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Reset" component={ResetScreen} options={{ headerShown: false }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <Root />
        </AuthProvider>
      </I18nProvider>
    </SafeAreaProvider>
  )
}
