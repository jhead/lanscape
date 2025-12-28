// OIDC Configuration
export interface OIDCConfig {
  clientId: string
  authorizationUrl: string
  tokenUrl: string
  userinfoUrl: string
  logoutUrl: string
  certificateUrl: string
  oidcDiscoveryUrl?: string
  redirectUri: string
  pkce: boolean
  requiresReAuth: boolean
  scopes?: string[]
}

// Default OIDC configuration
const DEFAULT_CONFIG: OIDCConfig = {
  clientId: 'ce2af913-7542-4c4c-b652-f39dfa40a367',
  authorizationUrl: 'https://auth.lanscape.jxh.io/authorize',
  tokenUrl: 'https://auth.lanscape.jxh.io/api/oidc/token',
  userinfoUrl: 'https://auth.lanscape.jxh.io/api/oidc/userinfo',
  logoutUrl: 'https://auth.lanscape.jxh.io/api/oidc/end-session',
  certificateUrl: 'https://auth.lanscape.jxh.io/.well-known/jwks.json',
  oidcDiscoveryUrl: 'https://auth.lanscape.jxh.io/.well-known/openid-configuration',
  redirectUri: 'http://localhost:8081/oidc/callback',
  pkce: true,
  requiresReAuth: false,
  scopes: ['openid', 'profile', 'email'],
}

// Load configuration from environment or localStorage
export function getOIDCConfig(): OIDCConfig {
  // Try to load from localStorage first
  const stored = localStorage.getItem('oidc_config')
  if (stored) {
    try {
      const parsed = JSON.parse(stored)
      // Merge with defaults to ensure all fields are present
      return { ...DEFAULT_CONFIG, ...parsed }
    } catch (e) {
      console.warn('[OIDC] Failed to parse stored config, using defaults', e)
    }
  }

  // Check environment variables
  const envConfig: Partial<OIDCConfig> = {}
  if (import.meta.env.VITE_OIDC_CLIENT_ID) {
    envConfig.clientId = import.meta.env.VITE_OIDC_CLIENT_ID
  }
  if (import.meta.env.VITE_OIDC_AUTHORIZATION_URL) {
    envConfig.authorizationUrl = import.meta.env.VITE_OIDC_AUTHORIZATION_URL
  }
  if (import.meta.env.VITE_OIDC_TOKEN_URL) {
    envConfig.tokenUrl = import.meta.env.VITE_OIDC_TOKEN_URL
  }
  if (import.meta.env.VITE_OIDC_USERINFO_URL) {
    envConfig.userinfoUrl = import.meta.env.VITE_OIDC_USERINFO_URL
  }
  if (import.meta.env.VITE_OIDC_LOGOUT_URL) {
    envConfig.logoutUrl = import.meta.env.VITE_OIDC_LOGOUT_URL
  }
  if (import.meta.env.VITE_OIDC_CERTIFICATE_URL) {
    envConfig.certificateUrl = import.meta.env.VITE_OIDC_CERTIFICATE_URL
  }
  if (import.meta.env.VITE_OIDC_REDIRECT_URI) {
    envConfig.redirectUri = import.meta.env.VITE_OIDC_REDIRECT_URI
  }

  return { ...DEFAULT_CONFIG, ...envConfig }
}

// Save configuration to localStorage
export function saveOIDCConfig(config: Partial<OIDCConfig>): void {
  const current = getOIDCConfig()
  const updated = { ...current, ...config }
  localStorage.setItem('oidc_config', JSON.stringify(updated))
  console.log('[OIDC] Configuration saved')
}

// Generate PKCE code verifier and challenge
export async function generatePKCE(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  // Generate a random code verifier
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  const codeVerifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')

  // Generate code challenge using SHA256
  const encoder = new TextEncoder()
  const data = encoder.encode(codeVerifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')

  return { codeVerifier, codeChallenge }
}

// Generate state parameter for CSRF protection
export function generateState(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

// Build authorization URL
export async function buildAuthorizationUrl(config: OIDCConfig): Promise<{
  url: string
  codeVerifier?: string
  state: string
}> {
  const state = generateState()
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: (config.scopes || ['openid', 'profile', 'email']).join(' '),
    state,
  })

  if (config.pkce) {
    const pkce = await generatePKCE()
    params.set('code_challenge', pkce.codeChallenge)
    params.set('code_challenge_method', 'S256')
    const url = `${config.authorizationUrl}?${params.toString()}`
    return { url, codeVerifier: pkce.codeVerifier, state }
  }

  const url = `${config.authorizationUrl}?${params.toString()}`
  return { url, state }
}

