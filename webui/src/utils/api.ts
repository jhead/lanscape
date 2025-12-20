import type {
  BeginRegistrationResponse,
  FinishRegistrationResponse,
  BeginLoginResponse,
  FinishLoginResponse,
  AuthTestResponse,
  OnboardHeadscaleResponse,
  Network,
  CreateNetworkRequest,
  ListNetworksResponse,
} from '../types'
import {
  convertCreateOptions,
  convertCredential,
  convertAssertion,
  base64URLToArrayBuffer,
} from './webauthn'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

// Check authentication status
export async function checkAuthStatus(): Promise<boolean> {
  try {
    console.log('[API] Checking authentication status...')
    const response = await fetch(`${API_BASE_URL}/v1/auth/test`, {
      method: 'GET',
      credentials: 'include',
    })
    
    if (response.ok) {
      const data: AuthTestResponse = await response.json()
      console.log('[API] Auth status:', data.success)
      return data.success
    }
    console.log('[API] Auth check failed:', response.status)
    return false
  } catch (error) {
    console.error('[API] Auth check error:', error)
    return false
  }
}

// Register user
export async function registerUser(username: string): Promise<FinishRegistrationResponse> {
  console.log('[API] Starting registration for user:', username)
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
  console.log('[API] Registration begin successful, creating credential...')

  // Step 2: Create credential using WebAuthn API
  const optionsAny = beginData.options as any
  const publicKeyOptions = optionsAny.publicKey || optionsAny
  const createOptions = convertCreateOptions(publicKeyOptions)
  const credential = (await navigator.credentials.create({
    publicKey: createOptions,
  })) as PublicKeyCredential | null

  if (!credential) {
    throw new Error('Failed to create credential')
  }
  console.log('[API] Credential created, finishing registration...')

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

  const result = await finishResponse.json()
  console.log('[API] Registration completed:', result.success)
  return result
}

// Login user
export async function loginUser(username: string): Promise<FinishLoginResponse> {
  console.log('[API] Starting login for user:', username)
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
  console.log('[API] Login begin successful, getting credential...')

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
  console.log('[API] Credential retrieved, finishing login...')

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

  const result = await finishResponse.json()
  console.log('[API] Login completed:', result.success)
  return result
}

// Fetch networks
export async function fetchNetworks(): Promise<Network[]> {
  console.log('[API] Fetching networks...')
  const response = await fetch(`${API_BASE_URL}/v1/networks`, {
    method: 'GET',
    credentials: 'include',
  })
  
  if (!response.ok) {
    throw new Error('Failed to fetch networks')
  }
  
  const data: ListNetworksResponse = await response.json()
  console.log('[API] Fetched', data.networks.length, 'networks')
  return data.networks
}

// Create network
export async function createNetwork(name: string, endpoint: string, apiKey: string): Promise<void> {
  console.log('[API] Creating network:', name)
  const response = await fetch(`${API_BASE_URL}/v1/networks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      name,
      headscale_endpoint: endpoint,
      api_key: apiKey,
    } as CreateNetworkRequest),
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || 'Failed to create network')
  }
  console.log('[API] Network created successfully')
}

// Join network
export async function joinNetwork(networkId: number): Promise<void> {
  console.log('[API] Joining network:', networkId)
  const response = await fetch(`${API_BASE_URL}/v1/networks/${networkId}/join`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || 'Failed to join network')
  }
  console.log('[API] Successfully joined network:', networkId)
}

// Delete network
export async function deleteNetwork(networkId: number): Promise<void> {
  console.log('[API] Deleting network:', networkId)
  const response = await fetch(`${API_BASE_URL}/v1/networks/${networkId}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || 'Failed to delete network')
  }
  console.log('[API] Network deleted successfully:', networkId)
}

// Onboard to Headscale
export async function onboardHeadscale(): Promise<OnboardHeadscaleResponse> {
  console.log('[API] Onboarding to Headscale...')
  const response = await fetch(`${API_BASE_URL}/v1/headscale/onboard`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to onboard: ${errorText}`)
  }

  const result = await response.json()
  console.log('[API] Onboarding completed:', result.success)
  return result
}
