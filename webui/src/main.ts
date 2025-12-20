import './style.css'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

interface BeginRegistrationResponse {
  options: PublicKeyCredentialCreationOptions
  session: string
}

interface FinishRegistrationResponse {
  success: boolean
  message?: string
  username?: string
  token?: string
}

interface BeginLoginResponse {
  options: PublicKeyCredentialRequestOptions
  session: string
}

interface FinishLoginResponse {
  success: boolean
  message?: string
  username?: string
  token?: string
}

interface AuthTestResponse {
  success: boolean
  message: string
}

interface OnboardHeadscaleResponse {
  success: boolean
  message: string
  onboarded: boolean
}

// Auth state
let isAuthenticated = false
let currentUsername = ''
let isHeadscaleOnboarded = false

// Convert base64url to ArrayBuffer
function base64URLToArrayBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

// Convert ArrayBuffer to base64url
function arrayBufferToBase64URL(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

// Convert PublicKeyCredentialCreationOptions from server format to WebAuthn format
function convertCreateOptions(options: any): PublicKeyCredentialCreationOptions {
  if (!options) {
    throw new Error('Options are required')
  }
  
  if (!options.challenge) {
    throw new Error('Challenge is required in options')
  }
  
  if (!options.user || !options.user.id) {
    throw new Error('User ID is required in options')
  }

  return {
    challenge: base64URLToArrayBuffer(options.challenge),
    rp: options.rp,
    user: {
      id: base64URLToArrayBuffer(options.user.id),
      name: options.user.name,
      displayName: options.user.displayName,
    },
    pubKeyCredParams: options.pubKeyCredParams,
    timeout: options.timeout,
    attestation: options.attestation,
    excludeCredentials: options.excludeCredentials?.map((cred: any) => ({
      id: base64URLToArrayBuffer(cred.id),
      type: cred.type,
      transports: cred.transports,
    })),
    authenticatorSelection: options.authenticatorSelection,
    extensions: options.extensions,
  }
}

// Convert credential to server format (for registration)
function convertCredential(credential: PublicKeyCredential): any {
  const response = credential.response as AuthenticatorAttestationResponse
  return {
    id: credential.id,
    rawId: arrayBufferToBase64URL(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: arrayBufferToBase64URL(response.clientDataJSON),
      attestationObject: arrayBufferToBase64URL(response.attestationObject),
    },
  }
}

// Convert assertion to server format (for login)
function convertAssertion(credential: PublicKeyCredential): any {
  const response = credential.response as AuthenticatorAssertionResponse
  return {
    id: credential.id,
    rawId: arrayBufferToBase64URL(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: arrayBufferToBase64URL(response.clientDataJSON),
      authenticatorData: arrayBufferToBase64URL(response.authenticatorData),
      signature: arrayBufferToBase64URL(response.signature),
      userHandle: response.userHandle ? arrayBufferToBase64URL(response.userHandle) : null,
    },
  }
}

// Check authentication status
async function checkAuthStatus(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/v1/auth/test`, {
      method: 'GET',
      credentials: 'include', // Include cookies
    })
    
    if (response.ok) {
      const data: AuthTestResponse = await response.json()
      return data.success
    }
    return false
  } catch (error) {
    console.error('Auth check error:', error)
    return false
  }
}

// Update UI based on auth state
function updateUI() {
  const app = document.querySelector<HTMLDivElement>('#app')!
  
  if (isAuthenticated) {
    const onboardButtonHTML = isHeadscaleOnboarded 
      ? '<button id="onboard-btn" type="button" class="onboard-btn" disabled>Already Onboarded to Headscale</button>'
      : '<button id="onboard-btn" type="button" class="onboard-btn">Onboard to Headscale</button>'
    
    app.innerHTML = `
      <div class="container">
        <h1>Lanscape</h1>
        <p class="subtitle">Welcome, ${currentUsername}!</p>
        <div class="card">
          <div id="status" class="status"></div>
          <div class="button-group">
            ${onboardButtonHTML}
            <button id="logout-btn" type="button" class="logout-btn">Logout</button>
          </div>
        </div>
        <p class="info-text">
          You are authenticated. Your JWT token is stored in a cookie.
        </p>
      </div>
    `
    
    const logoutBtn = document.getElementById('logout-btn')!
    logoutBtn.addEventListener('click', handleLogout)
    
    const onboardBtn = document.getElementById('onboard-btn')!
    if (!isHeadscaleOnboarded) {
      onboardBtn.addEventListener('click', handleOnboardHeadscale)
    }
  } else {
    app.innerHTML = `
      <div class="container">
        <h1>Lanscape</h1>
        <p class="subtitle">WebAuthn Authentication</p>
        <div class="card">
          <div class="form-group">
            <label for="username">Username</label>
            <input type="text" id="username" placeholder="Enter your username" />
          </div>
          <div class="button-group">
            <button id="register-btn" type="button">Register</button>
            <button id="login-btn" type="button">Login</button>
          </div>
          <div id="status" class="status"></div>
        </div>
        <p class="info-text">
          Register a new account or login with an existing one using WebAuthn.
        </p>
      </div>
    `
    
    const registerButton = document.getElementById('register-btn')!
    const loginButton = document.getElementById('login-btn')!
    const usernameInput = document.getElementById('username') as HTMLInputElement
    
    registerButton.addEventListener('click', () => {
      registerUser(usernameInput.value.trim())
    })
    
    loginButton.addEventListener('click', () => {
      loginUser(usernameInput.value.trim())
    })
    
    usernameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        // Default to register on Enter, user can click login explicitly
        registerUser(usernameInput.value.trim())
      }
    })
  }
}

// Logout handler
function handleLogout() {
  // Clear the JWT cookie by setting it to expire
  document.cookie = 'jwt=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  isAuthenticated = false
  currentUsername = ''
  isHeadscaleOnboarded = false
  updateUI()
  
  const statusEl = document.getElementById('status')!
  statusEl.textContent = 'Logged out successfully'
  statusEl.className = 'success'
}

// Onboard to Headscale handler
async function handleOnboardHeadscale(): Promise<void> {
  const statusEl = document.getElementById('status')!
  const onboardBtn = document.getElementById('onboard-btn') as HTMLButtonElement

  try {
    statusEl.textContent = 'Creating user in Headscale...'
    statusEl.className = 'info'
    onboardBtn.disabled = true

    const response = await fetch(`${API_BASE_URL}/v1/headscale/onboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include cookies for JWT
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to onboard: ${errorText}`)
    }

    const data: OnboardHeadscaleResponse = await response.json()

    if (data.success) {
      statusEl.textContent = data.message || 'Successfully onboarded to Headscale!'
      statusEl.className = 'success'
      isHeadscaleOnboarded = data.onboarded
      
      // Update UI to reflect onboarding status
      setTimeout(() => {
        updateUI()
      }, 1000)
    } else {
      throw new Error(data.message || 'Onboarding failed')
    }
  } catch (error) {
    console.error('Onboarding error:', error)
    statusEl.textContent = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
    statusEl.className = 'error'
    onboardBtn.disabled = false
  }
}

async function registerUser(username: string): Promise<void> {
  const statusEl = document.getElementById('status')!
  const usernameInput = document.getElementById('username') as HTMLInputElement
  const registerButton = document.getElementById('register-btn') as HTMLButtonElement

  if (!username || username.trim() === '') {
    statusEl.textContent = 'Please enter a username'
    statusEl.className = 'error'
    return
  }

  try {
    statusEl.textContent = 'Starting registration...'
    statusEl.className = 'info'
    registerButton.disabled = true
    usernameInput.disabled = true

    // Step 1: Begin registration
    const beginResponse = await fetch(`${API_BASE_URL}/v1/webauthn/register/begin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ username }),
    })

    if (!beginResponse.ok) {
      const error = await beginResponse.text()
      throw new Error(`Failed to begin registration: ${error}`)
    }

    const beginData: BeginRegistrationResponse = await beginResponse.json()
    statusEl.textContent = 'Please use your authenticator device...'
    statusEl.className = 'info'

    // Step 2: Create credential using WebAuthn API
    // The server returns options with a nested publicKey structure
    const optionsAny = beginData.options as any
    const publicKeyOptions = optionsAny.publicKey || optionsAny
    const createOptions = convertCreateOptions(publicKeyOptions)
    const credential = (await navigator.credentials.create({
      publicKey: createOptions,
    })) as PublicKeyCredential | null

    if (!credential) {
      throw new Error('Failed to create credential')
    }

    statusEl.textContent = 'Completing registration...'
    statusEl.className = 'info'

    // Step 3: Finish registration
    const credentialData = convertCredential(credential)
    const finishResponse = await fetch(`${API_BASE_URL}/v1/webauthn/register/finish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        username,
        session: beginData.session,
        response: credentialData,
      }),
    })

    if (!finishResponse.ok) {
      const error = await finishResponse.text()
      throw new Error(`Failed to finish registration: ${error}`)
    }

    const finishData: FinishRegistrationResponse = await finishResponse.json()

    if (finishData.success) {
      statusEl.textContent = `Registration successful! Welcome, ${finishData.username}!`
      statusEl.className = 'success'
      
      // Update auth state
      isAuthenticated = true
      currentUsername = finishData.username || ''
      
      // Wait a moment to show success message, then update UI
      setTimeout(() => {
        updateUI()
      }, 1000)
    } else {
      throw new Error(finishData.message || 'Registration failed')
    }
  } catch (error) {
    console.error('Registration error:', error)
    statusEl.textContent = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
    statusEl.className = 'error'
    registerButton.disabled = false
    usernameInput.disabled = false
  }
}

// Login user function
async function loginUser(username: string): Promise<void> {
  const statusEl = document.getElementById('status')!
  const usernameInput = document.getElementById('username') as HTMLInputElement
  const loginButton = document.getElementById('login-btn') as HTMLButtonElement
  const registerButton = document.getElementById('register-btn') as HTMLButtonElement

  if (!username || username.trim() === '') {
    statusEl.textContent = 'Please enter a username'
    statusEl.className = 'error'
    return
  }

  try {
    statusEl.textContent = 'Starting login...'
    statusEl.className = 'info'
    loginButton.disabled = true
    registerButton.disabled = true
    usernameInput.disabled = true

    // Step 1: Begin login
    const beginResponse = await fetch(`${API_BASE_URL}/v1/webauthn/login/begin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ username }),
    })

    if (!beginResponse.ok) {
      const error = await beginResponse.text()
      throw new Error(`Failed to begin login: ${error}`)
    }

    const beginData: BeginLoginResponse = await beginResponse.json()
    statusEl.textContent = 'Please use your authenticator device...'
    statusEl.className = 'info'

    // Step 2: Get credential using WebAuthn API
    const optionsAny = beginData.options as any
    const publicKeyOptions = optionsAny.publicKey || optionsAny
    const getOptions: PublicKeyCredentialRequestOptions = {
      challenge: base64URLToArrayBuffer(publicKeyOptions.challenge),
      timeout: publicKeyOptions.timeout,
      rpId: publicKeyOptions.rpId,
      allowCredentials: publicKeyOptions.allowCredentials?.map((cred: any) => ({
        id: base64URLToArrayBuffer(cred.id),
        type: cred.type,
        transports: cred.transports,
      })),
      userVerification: publicKeyOptions.userVerification,
    }

    const credential = (await navigator.credentials.get({
      publicKey: getOptions,
    })) as PublicKeyCredential | null

    if (!credential) {
      throw new Error('Failed to get credential')
    }

    statusEl.textContent = 'Completing login...'
    statusEl.className = 'info'

    // Step 3: Finish login
    const assertionData = convertAssertion(credential)
    const finishResponse = await fetch(`${API_BASE_URL}/v1/webauthn/login/finish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        username,
        session: beginData.session,
        response: assertionData,
      }),
    })

    if (!finishResponse.ok) {
      const error = await finishResponse.text()
      throw new Error(`Failed to finish login: ${error}`)
    }

    const finishData: FinishLoginResponse = await finishResponse.json()

    if (finishData.success) {
      statusEl.textContent = `Login successful! Welcome back, ${finishData.username}!`
      statusEl.className = 'success'
      
      // Update auth state
      isAuthenticated = true
      currentUsername = finishData.username || ''
      
      // Wait a moment to show success message, then update UI
      setTimeout(() => {
        updateUI()
      }, 1000)
    } else {
      throw new Error(finishData.message || 'Login failed')
    }
  } catch (error) {
    console.error('Login error:', error)
    statusEl.textContent = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
    statusEl.className = 'error'
    loginButton.disabled = false
    registerButton.disabled = false
    usernameInput.disabled = false
  }
}

// Initialize app
async function init() {
  // Check if user is already authenticated
  isAuthenticated = await checkAuthStatus()
  
  if (isAuthenticated) {
    // Try to get username from cookie or make a request
    // For now, we'll just show authenticated state
    currentUsername = 'User'
  }
  
  updateUI()
}

// Start the app
init()
