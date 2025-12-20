export interface BeginRegistrationResponse {
  options: PublicKeyCredentialCreationOptions
  session: string
}

export interface FinishRegistrationResponse {
  success: boolean
  message?: string
  username?: string
  token?: string
}

export interface BeginLoginResponse {
  options: PublicKeyCredentialRequestOptions
  session: string
}

export interface FinishLoginResponse {
  success: boolean
  message?: string
  username?: string
  token?: string
}

export interface AuthTestResponse {
  success: boolean
  message: string
}

export interface OnboardHeadscaleResponse {
  success: boolean
  message: string
  onboarded: boolean
}

export interface Network {
  id: number
  name: string
  headscale_endpoint: string
  created_at: string
}

export interface CreateNetworkRequest {
  name: string
  headscale_endpoint: string
  api_key: string
}

export interface ListNetworksResponse {
  networks: Network[]
}

export type StatusType = 'info' | 'success' | 'error' | null
