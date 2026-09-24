import enJson from './locales/en.json';
import esJson from './locales/es.json';
import type { AgentActivity } from '@core/types/messages';
import type { ConnectionState } from '@core/types/connection';

export type SupportedLocale = 'en' | 'es';

export const DEFAULT_LOCALE: SupportedLocale = 'en';

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ['en', 'es'] as const;

export type TranslationKey = keyof typeof enJson;

export const dictionaries: Record<SupportedLocale, Record<string, string>> = {
  en: enJson,
  es: esJson,
};

/**
 * Validates whether a value is a supported locale code.
 */
export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (value === 'en' || value === 'es');
}

/**
 * Pure translation lookup with English fallback and safe string interpolation.
 * No HTML is ever rendered or injected.
 */
export function translate(
  locale: SupportedLocale,
  key: TranslationKey,
  params?: Record<string, string | number>
): string {
  const activeDict = dictionaries[locale] || dictionaries.en;
  let text = activeDict[key];

  // Fall back to English dictionary if translation is missing or purely whitespace
  if (typeof text !== 'string' || text.trim() === '') {
    text = dictionaries.en[key];
  }

  // Fall back to the key identifier if missing even from the English base dictionary
  if (typeof text !== 'string') {
    return String(key);
  }

  if (params && Object.keys(params).length > 0) {
    return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, paramKey) => {
      if (paramKey in params && params[paramKey] !== undefined && params[paramKey] !== null) {
        return String(params[paramKey]);
      }
      return match;
    });
  }

  return text;
}

/**
 * Synchronizes the HTML document `lang` attribute with the active UI locale.
 */
export function setDocumentLanguage(locale: SupportedLocale): void {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = locale;
  }
}

/**
 * Presentation mapping from internal reducer connection status and agent activity
 * to localized display strings. Reducer internal RPC/state contracts are preserved.
 */
export function formatLocalizedStatus(
  connectionStatus: ConnectionState,
  agentActivity: AgentActivity,
  locale: SupportedLocale
): string {
  switch (connectionStatus) {
    case 'connecting':
      return translate(locale, 'status.connecting');
    case 'connected':
      return agentActivity === 'busy'
        ? translate(locale, 'status.busy')
        : translate(locale, 'status.connected');
    case 'error':
      return translate(locale, 'status.error');
    case 'disconnected':
    default:
      return translate(locale, 'status.disconnected');
  }
}

/**
 * Presentation mapping for known status detail descriptions with parameter interpolation.
 * Technical diagnostics and custom error strings are preserved verbatim without corruption.
 */
export function formatLocalizedStatusDetail(
  detail: string,
  locale: SupportedLocale
): string {
  if (!detail) {
    return '';
  }

  if (detail === 'Pi RPC process offline — configure and click Connect') {
    return translate(locale, 'status.detail_offline');
  }

  if (detail === 'Spawning Pi RPC subprocess...') {
    return translate(locale, 'status.detail_spawning');
  }

  if (detail === 'Connected to fresh session') {
    return translate(locale, 'status.detail_fresh_session');
  }

  const resumedMatch = /^Resumed session \((\d+) messages\)$/.exec(detail);
  if (resumedMatch) {
    return translate(locale, 'status.detail_resumed_session', {
      count: resumedMatch[1],
    });
  }

  // Preserve external technical diagnostics and unknown error details verbatim
  return detail;
}

/**
 * Presentation mapping for predictable app-owned validation errors and storage warnings.
 * Preserves original external error details in parameterized tokens.
 * External arbitrary technical diagnostics (Native/Pi errors, bridge panics) are returned verbatim.
 */
export function formatLocalizedDiagnostic(
  diagnostic: string,
  locale: SupportedLocale
): string {
  if (!diagnostic) {
    return '';
  }

  // 1. Exact static matches
  switch (diagnostic) {
    case 'Configuration must be a non-null object':
      return translate(locale, 'diagnostic.config_must_be_object');
    case 'Node executable path must be a string':
      return translate(locale, 'diagnostic.node_path_must_be_string');
    case 'Node executable path cannot be empty':
      return translate(locale, 'diagnostic.node_path_required');
    case 'Pi CLI entrypoint path must be a string':
      return translate(locale, 'diagnostic.pi_entry_must_be_string');
    case 'Pi CLI entrypoint path cannot be empty':
      return translate(locale, 'diagnostic.pi_entry_required');
    case 'Working directory path must be a string':
      return translate(locale, 'diagnostic.cwd_must_be_string');
    case 'Working directory path cannot be empty':
      return translate(locale, 'diagnostic.cwd_required');
    case 'Invalid configuration':
      return translate(locale, 'diagnostic.config_invalid');
    case 'Local storage unavailable; using workstation defaults':
      return translate(locale, 'diagnostic.storage_unavailable_defaults');
    case 'Corrupted configuration in storage; falling back to workstation defaults':
      return translate(locale, 'diagnostic.config_corrupted_defaults');
    case 'Stored configuration is not a valid object; using workstation defaults':
      return translate(locale, 'diagnostic.config_not_object_defaults');
    case 'Local storage unavailable; cannot persist configuration':
      return translate(locale, 'diagnostic.storage_unavailable_persist');
    case 'Failed to save configuration to local storage':
      return translate(locale, 'diagnostic.storage_save_failed');
    case 'Preferences payload must be a non-null object':
      return translate(locale, 'diagnostic.prefs_must_be_object');
    case 'Stored UI preferences contained invalid JSON; defaulted to English and dark theme':
      return translate(locale, 'diagnostic.prefs_corrupted_defaults');
    case 'Storage is not available in current environment':
      return translate(locale, 'diagnostic.prefs_storage_unavailable');
    case 'Failed to save UI preferences':
      return translate(locale, 'diagnostic.prefs_save_failed');
    case 'Cannot change settings while generating response':
    case 'Cannot apply configuration while response generation is active':
      return translate(locale, 'settings.save_apply_busy_title');
  }

  // 2. Parameterized regex matches
  let match: RegExpExecArray | null;

  match = /^Pi entrypoint must be an absolute path: '([^']*)'$/.exec(diagnostic);
  if (match) {
    return translate(locale, 'diagnostic.pi_entry_not_absolute', { path: match[1] });
  }

  match = /^Pi entrypoint must have a JavaScript extension \(\.js, \.mjs, \.cjs\), got: '([^']*)'$/.exec(diagnostic);
  if (match) {
    return translate(locale, 'diagnostic.pi_entry_invalid_extension', { path: match[1] });
  }

  match = /^Working directory must be an absolute path: '([^']*)'$/.exec(diagnostic);
  if (match) {
    return translate(locale, 'diagnostic.cwd_not_absolute', { path: match[1] });
  }

  match = /^Storage access failed \((.*)\); using workstation defaults$/.exec(diagnostic);
  if (match) {
    return translate(locale, 'diagnostic.storage_access_failed_defaults', { error: match[1] });
  }

  match = /^Failed to read configuration from storage \((.*)\); using workstation defaults$/.exec(diagnostic);
  if (match) {
    return translate(locale, 'diagnostic.storage_read_failed_defaults', { error: match[1] });
  }

  match = /^Partial configuration in storage missing required fields \(([^)]*)\); using workstation defaults$/.exec(diagnostic);
  if (match) {
    return translate(locale, 'diagnostic.config_partial_defaults', { fields: match[1] });
  }

  match = /^Stored configuration is invalid \((.*)\); using workstation defaults$/.exec(diagnostic);
  if (match) {
    const inner = formatLocalizedDiagnostic(match[1], locale);
    return translate(locale, 'diagnostic.config_invalid_defaults', { error: inner });
  }

  match = /^Storage access failed: (.*)$/.exec(diagnostic);
  if (match) {
    return translate(locale, 'diagnostic.storage_access_failed', { error: match[1] });
  }

  match = /^Failed to persist configuration to storage: (.*)$/.exec(diagnostic);
  if (match) {
    return translate(locale, 'diagnostic.storage_persist_failed', { error: match[1] });
  }

  match = /^Failed to read UI preferences from storage: (.*)$/.exec(diagnostic);
  if (match) {
    return translate(locale, 'diagnostic.prefs_read_failed', { error: match[1] });
  }

  match = /^Failed to persist UI preferences to storage: (.*)$/.exec(diagnostic);
  if (match) {
    return translate(locale, 'diagnostic.prefs_persist_failed', { error: match[1] });
  }

  // 3. Preference validation warnings (single or compound)
  const langMatch = /Invalid language '([^']*)'; defaulted to '([^']*)'/.exec(diagnostic);
  const themeMatch = /Invalid theme '([^']*)'; defaulted to '([^']*)'/.exec(diagnostic);
  if (langMatch || themeMatch) {
    const parts: string[] = [];
    if (langMatch) {
      parts.push(
        translate(locale, 'diagnostic.prefs_invalid_language', {
          value: langMatch[1],
          default: langMatch[2],
        })
      );
    }
    if (themeMatch) {
      parts.push(
        translate(locale, 'diagnostic.prefs_invalid_theme', {
          value: themeMatch[1],
          default: themeMatch[2],
        })
      );
    }
    return parts.join('; ');
  }

  // 4. External arbitrary technical diagnostic returned verbatim
  return diagnostic;
}
