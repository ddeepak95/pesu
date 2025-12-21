'use client'

import { useState, useEffect, Suspense, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const { signIn, signInWithGoogle, user, loading: authLoading } = useAuth()
  const searchParams = useSearchParams()
  const hasRedirected = useRef(false)
  
  // Get redirect URL from query params
  const redirectUrl = searchParams.get('redirect')
  const code = searchParams.get('code')

  // Handle OAuth callback if code is present
  useEffect(() => {
    if (code && !authLoading) {
      // If there's a code in the URL, redirect to the callback handler
      const finalDestination = redirectUrl 
        ? decodeURIComponent(redirectUrl.split('?')[0]) // Remove any query params from redirect
        : '/teacher'
      window.location.href = `/api/auth/callback?code=${code}&next=${encodeURIComponent(finalDestination)}`
    }
  }, [code, authLoading, redirectUrl])

  // If already logged in, redirect appropriately
  useEffect(() => {
    if (!authLoading && user && !hasRedirected.current && !code) {
      hasRedirected.current = true
      const destination = redirectUrl ? decodeURIComponent(redirectUrl.split('?')[0]) : '/teacher'
      // Use window.location for reliable redirect
      window.location.href = destination
    }
  }, [user, authLoading, redirectUrl, code])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await signIn(email, password)

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      // Redirect to the return URL if provided, otherwise go to teacher dashboard
      const destination = redirectUrl ? decodeURIComponent(redirectUrl) : '/teacher'
      // Use window.location for reliable redirect
      window.location.href = destination
    }
  }

  const handleGoogleSignIn = async () => {
    setError('')
    setGoogleLoading(true)
    
    const destination = redirectUrl 
      ? `${window.location.origin}${decodeURIComponent(redirectUrl)}`
      : `${window.location.origin}/teacher`
    
    const { error } = await signInWithGoogle(destination)
    
    if (error) {
      setError(error.message)
      setGoogleLoading(false)
    }
    // Note: OAuth redirect will happen automatically, so we don't need to handle success case
  }

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  // If already logged in, show redirecting message
  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <p className="text-muted-foreground">Redirecting...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Speak2Learn</CardTitle>
          <CardDescription className="text-center">
            Sign in to your teacher account
          </CardDescription>
          {redirectUrl && (
            <p className="text-sm text-center text-muted-foreground pt-2">
              Sign in to continue to the requested page
            </p>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogleSignIn}
              disabled={loading || googleLoading}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              {googleLoading ? 'Signing in...' : 'Continue with Google'}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or continue with email
                </span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="teacher@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading || googleLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading || googleLoading}
                />
              </div>
              {error && (
                <div className="p-3 text-sm rounded-md bg-destructive/10 text-destructive border border-destructive/20">
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading || googleLoading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}

