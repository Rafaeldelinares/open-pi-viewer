/**
 * OAuth types and payloads for built-in Pi provider account authentication.
 */

/**
 * Capability and authentication status of a built-in Pi OAuth provider.
 */
export interface BuiltinOAuthProviderStatus {
  id: string;
  name: string;
  oauthName?: string | null;
  loginLabel?: string | null;
  isSubscription: boolean;
  configured: boolean;
  hasStoredOAuth: boolean;
  oauthReady: boolean;
  ambientApiKey: boolean;
  source?: string | null;
  status: string;
}

/**
 * Payload for querying built-in OAuth providers.
 */
export interface GetBuiltinOAuthProvidersPayload {}

/**
 * Payload to start an OAuth login flow.
 */
export interface StartOAuthLoginPayload {
  providerId: string;
}

/**
 * Result returned from start_oauth_login.
 */
export interface StartOAuthLoginResult {
  started: boolean;
  providerId: string;
  message?: string | null;
}

/**
 * Payload to cancel an active OAuth login process.
 */
export interface CancelOAuthLoginPayload {
  providerId?: string | null;
}

/**
 * Result returned from cancel_oauth_login.
 */
export interface CancelOAuthLoginResult {
  cancelled: boolean;
  message?: string | null;
}

/**
 * Option in an interactive OAuth prompt (e.g. account selection).
 */
export interface OAuthPromptOption {
  id: string;
  label: string;
  description?: string | null;
}

/**
 * Supported prompt types from the Pi OAuth helper.
 */
export type OAuthPromptType = 'select' | 'text' | 'secret' | 'manual_code' | string;

/**
 * Safe interactive prompt emitted by the OAuth backend helper.
 */
export interface OAuthSafePrompt {
  promptId: string;
  promptType: OAuthPromptType;
  message: string;
  placeholder?: string | null;
  options?: OAuthPromptOption[] | null;
}

/**
 * Payload to respond to an interactive OAuth prompt.
 */
export interface SendOAuthPromptResponsePayload {
  promptId: string;
  response: string;
}

/**
 * Result returned from send_oauth_prompt_response.
 */
export interface SendOAuthPromptResponseResult {
  sent: boolean;
  message?: string | null;
}

/**
 * Payload to log out of a built-in OAuth provider.
 */
export interface LogoutOAuthProviderPayload {
  providerId: string;
}

/**
 * Result returned from logout_oauth_provider.
 */
export interface LogoutOAuthProviderResult {
  success: boolean;
  providerId: string;
  message?: string | null;
}

/**
 * Safe link emitted in OAuth info events.
 */
export interface OAuthSafeInfoLink {
  url: string;
  label?: string | null;
}

/**
 * Allowlisted safe OAuth sub-events emitted inside kind: "event".
 */
export type OAuthSafeEvent =
  | {
      type: 'auth_url';
      url: string;
      instructions?: string | null;
    }
  | {
      type: 'device_code';
      userCode: string;
      verificationUri: string;
      intervalSeconds?: number | null;
      expiresInSeconds?: number | null;
    }
  | {
      type: 'progress';
      message: string;
    }
  | {
      type: 'info';
      message: string;
      links?: OAuthSafeInfoLink[] | null;
    };

/**
 * Payload for prompt_cancelled event.
 */
export interface OAuthPromptCancelledEvent {
  promptId: string;
}

/**
 * Status payload emitted on terminal transitions or status updates.
 */
export interface OAuthStatusEvent {
  state: 'starting' | 'completed' | 'cancelled' | 'failed' | string;
  message?: string | null;
  error?: string | null;
}

/**
 * Full envelope emitted over the "pi://oauth-event" Tauri event channel.
 */
export interface OAuthEventEnvelope {
  providerId: string;
  kind: 'event' | 'prompt' | 'prompt_cancelled' | 'status' | string;
  data: OAuthSafeEvent | OAuthSafePrompt | OAuthPromptCancelledEvent | OAuthStatusEvent | any;
}
