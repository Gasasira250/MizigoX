import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as api from './api'
import type { User } from './types'

type AuthState = {
  user: User | null
  ready: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setReady(true)
      return
    }
    api
      .me()
      .then(setUser)
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setReady(true))
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user,
      ready,
      signIn: async (email, password) => {
        const token = await api.login(email, password)
        localStorage.setItem('token', token.access_token)
        setUser(await api.me())
      },
      signUp: async (payload: { email: string; password: string; name: string; role: string; phone?: string }) => {
        const token = await api.register(payload)
        localStorage.setItem('token', token.access_token)
        setUser(await api.me())
      },
      signOut: () => {
        localStorage.removeItem('token')
        setUser(null)
      },
    }),
    [user, ready],
  )

  return createElement(AuthContext.Provider, { value }, children)
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
