import { getOIDCConfig, buildAuthorizationUrl } from './oidc'
import { fetch } from '@tauri-apps/plugin-http'

// Determine API base URL (reuse from api.ts logic)
function getApiBaseUrl(): string {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }
  
  if (typeof window !== 'undefined') {
    if (window.location.protocol === 'file:') {
      return 'https://lanscape.jxh.io'
    } else if (import.meta.env.DEV || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:8080'
    }
  }
  
  return ''
}

const API_BASE_URL = getApiBaseUrl()

// OIDC callback result from Tauri window
export interface OIDCCallback {
  code?: string
  state?: string
  error?: string
  error_description?: string
}

// Token response from OIDC provider
export interface OIDCTokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
  refresh_token?: string
  id_token?: string
  scope?: string
}

// User info from OIDC provider
export interface OIDCUserInfo {
  sub: string
  name?: string
  email?: string
  email_verified?: boolean
  preferred_username?: string
  display_name?: string
  given_name?: string
  family_name?: string
  [key: string]: unknown
}

// Start OIDC callback server and open browser
export async function openOIDCWindow(authUrl: string, redirectUri: string): Promise<OIDCCallback> {
  // Import Tauri APIs dynamically
  const { invoke } = await import('@tauri-apps/api/core')
  const { openUrl } = await import('@tauri-apps/plugin-opener')
  
  console.log('[OIDC] Starting callback server on:', redirectUri)
  
  // Start the callback server (this will wait for the callback)
  const serverPromise = invoke<OIDCCallback>('start_oidc_callback_server', {
    redirectUri,
  })
  
  // Open the system browser
  console.log('[OIDC] Opening browser with URL:', authUrl)
  await openUrl(authUrl)
  
  // Wait for the callback
  const callback = await serverPromise
  console.log('[OIDC] Received callback:', callback)
  return callback
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier?: string,
  state?: string
): Promise<OIDCTokenResponse> {
  const config = getOIDCConfig()
  
  console.log('[OIDC] Exchanging code for tokens...')
  
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
  })

  if (codeVerifier) {
    body.append('code_verifier', codeVerifier)
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[OIDC] Token exchange failed:', errorText)
    throw new Error(`Token exchange failed: ${errorText}`)
  }

  const tokens: OIDCTokenResponse = await response.json()
  console.log('[OIDC] Token exchange successful')
  return tokens
}

// Get user info from OIDC provider
export async function getUserInfo(accessToken: string): Promise<OIDCUserInfo> {
  const config = getOIDCConfig()
  
  console.log('[OIDC] Fetching user info...')
  
  // Use Tauri HTTP plugin for network requests
  
  const response = await fetch(config.userinfoUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[OIDC] Failed to fetch user info:', errorText)
    throw new Error(`Failed to fetch user info: ${errorText}`)
  }

  const userInfo: OIDCUserInfo = await response.json()
  console.log('[OIDC] User info fetched, preferred_username:', userInfo.preferred_username)
  return userInfo
}

// Send OIDC token to backend for session creation
export async function createSessionFromOIDC(
  accessToken: string,
  idToken: string | undefined,
  userInfo: OIDCUserInfo
): Promise<void> {
  console.log('[OIDC] Creating session with backend...')
  
  // Use Tauri HTTP plugin for network requests to ensure cookies work properly
  const { fetch } = await import('@tauri-apps/plugin-http')
  
  const requestBody = {
    access_token: accessToken,
    id_token: idToken,
    user_info: userInfo,
  }
  
  const response = await fetch(`${API_BASE_URL}/v1/auth/oidc/callback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[OIDC] Failed to create session:', errorText)
    throw new Error(`Failed to create session: ${errorText}`)
  }

  // Log response headers to verify cookie is being set
  console.log('[OIDC] Session creation response headers:', {
    'set-cookie': response.headers.get('set-cookie'),
    status: response.status,
    statusText: response.statusText,
  })

  console.log('[OIDC] Session created successfully')
}

// Complete OIDC login flow
export async function loginWithOIDC(): Promise<{ username: string; success: boolean }> {
  try {
    const config = getOIDCConfig()
    
    // Build authorization URL with PKCE
    const { url, codeVerifier, state } = await buildAuthorizationUrl(config)
    
    // Store state and code verifier temporarily
    sessionStorage.setItem('oidc_state', state)
    if (codeVerifier) {
      sessionStorage.setItem('oidc_code_verifier', codeVerifier)
    }
    
    // Open OIDC window and wait for callback
    const callback = await openOIDCWindow(url, config.redirectUri)
    
    // Check for errors
    if (callback.error) {
      throw new Error(callback.error_description || callback.error)
    }
    
    if (!callback.code) {
      throw new Error('No authorization code received')
    }
    
    // Verify state
    const storedState = sessionStorage.getItem('oidc_state')
    if (callback.state !== storedState) {
      throw new Error('State mismatch - possible CSRF attack')
    }
    
    // Clean up stored state
    sessionStorage.removeItem('oidc_state')
    const storedCodeVerifier = sessionStorage.getItem('oidc_code_verifier')
    sessionStorage.removeItem('oidc_code_verifier')
    
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(
      callback.code,
      storedCodeVerifier || undefined,
      callback.state
    )
    
    // Get user info
    const userInfo = await getUserInfo(tokens.access_token)
    console.log('[OIDC] User info received:', userInfo)
    
    // Create session with backend (send user info so backend doesn't need to parse ID token)
    // The backend will set a secure HTTP-only JWT cookie for authentication
    await createSessionFromOIDC(tokens.access_token, tokens.id_token, userInfo)
    
    // Note: We don't store OIDC tokens in localStorage for security reasons.
    // The backend JWT cookie (set by createSessionFromOIDC) is used for authentication.
    // OIDC tokens are only needed during the login flow and are discarded after session creation.
    
    // Extract username for display (backend will use preferred_username from user_info)
    const username = userInfo.preferred_username || userInfo.email || userInfo.name || userInfo.sub
    
    console.log('[OIDC] Login completed successfully for:', username)
    return { username, success: true }
  } catch (error) {
    console.error('[OIDC] Login error:', error)
    // Clean up on error
    sessionStorage.removeItem('oidc_state')
    sessionStorage.removeItem('oidc_code_verifier')
    throw error
  }
}

