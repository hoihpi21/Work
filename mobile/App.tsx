import { useEffect } from 'react'
import { Pressable, View, Text, ActivityIndicator } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { NavigationContainer, createNavigationContainerRef, type LinkingOptions } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import * as Linking from 'expo-linking'
import { AuthProvider, useAuth } from './src/auth'
import { supabase } from './src/supabase'
import { theme } from './src/theme'
import Avatar from './src/components/Avatar'
import { ForgotScreen, LoginScreen, RegisterScreen, ResetScreen } from './src/screens/AuthScreens'
import HomeScreen from './src/screens/HomeScreen'
import CreateSessionScreen from './src/screens/CreateSessionScreen'
import SessionScreen from './src/screens/SessionScreen'
import ProfileScreen from './src/screens/ProfileScreen'

const Stack = createNativeStackNavigator()
const navRef = createNavigationContainerRef<any>()

// Deep links: booksandfriends://session/:id and booksandfriends://reset
const linking: LinkingOptions<any> = {
  prefixes: [Linking.createURL('/'), 'booksandfriends://'],
  config: { screens: { Session: 'session/:id', Reset: 'reset' } },
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

  useEffect(() => {
    Linking.getInitialURL().then(handleAuthUrl)
    const sub = Linking.addEventListener('url', (e) => handleAuthUrl(e.url))
    return () => sub.remove()
  }, [])

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
                title: '📚 Books & Friends',
                headerRight: () => (
                  <Pressable onPress={() => navigation.navigate('Profile')} accessibilityRole="button" accessibilityLabel="Profile">
                    <Avatar name={profile?.display_name} url={profile?.avatar_url} size={30} />
                  </Pressable>
                ),
              })}
            />
            <Stack.Screen name="New" component={CreateSessionScreen} options={{ title: 'New reading session' }} />
            <Stack.Screen name="Session" component={SessionScreen} options={{ title: 'Session' }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Your profile' }} />
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
      <AuthProvider>
        <StatusBar style="dark" />
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  )
}
