export interface NotificationPreferences {
  enabled: boolean;
  sound: boolean;
  suppressWhenFocused: boolean;
  onTaskComplete: boolean;
  onWaitingInput: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  sound: true,
  suppressWhenFocused: true,
  onTaskComplete: true,
  onWaitingInput: true,
};

export type NotificationEventType = 'task_complete' | 'waiting_input' | 'error';

export interface ShouldDeliverNotificationParams {
  eventType: NotificationEventType;
  preferences: NotificationPreferences;
  isWindowFocused: boolean;
  lastDeliveredAt?: number;
  now?: number;
  debounceMs?: number;
}

export interface NotificationDeliveryDecision {
  shouldShowPopup: boolean;
  shouldPlaySound: boolean;
}

/**
 * Pure decision logic evaluating whether a desktop popup and/or audio chime
 * should be dispatched for a given event, factoring in user preferences,
 * window focus state, and delivery debounce thresholds.
 */
export function shouldDeliverNotification(
  params: ShouldDeliverNotificationParams
): NotificationDeliveryDecision {
  const { preferences, eventType, isWindowFocused } = params;

  if (!preferences.enabled) {
    return { shouldShowPopup: false, shouldPlaySound: false };
  }

  const debounceMs = params.debounceMs ?? 1000;
  const now = params.now ?? Date.now();
  if (params.lastDeliveredAt !== undefined && now - params.lastDeliveredAt < debounceMs) {
    return { shouldShowPopup: false, shouldPlaySound: false };
  }

  if (eventType === 'task_complete' && !preferences.onTaskComplete) {
    return { shouldShowPopup: false, shouldPlaySound: false };
  }

  if (eventType === 'waiting_input' && !preferences.onWaitingInput) {
    return { shouldShowPopup: false, shouldPlaySound: false };
  }

  const shouldShowPopup = !(preferences.suppressWhenFocused && isWindowFocused);
  const shouldPlaySound =
    preferences.sound && (!preferences.suppressWhenFocused || !isWindowFocused);

  return { shouldShowPopup, shouldPlaySound };
}

/**
 * Validates and sanitizes arbitrary input into a strictly compliant NotificationPreferences object.
 * Replaces missing, non-boolean, or invalid fields with safe defaults.
 */
export function validateNotificationPreferences(input: unknown): NotificationPreferences {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }

  const record = input as Record<string, unknown>;

  return {
    enabled:
      typeof record.enabled === 'boolean'
        ? record.enabled
        : DEFAULT_NOTIFICATION_PREFERENCES.enabled,
    sound:
      typeof record.sound === 'boolean'
        ? record.sound
        : DEFAULT_NOTIFICATION_PREFERENCES.sound,
    suppressWhenFocused:
      typeof record.suppressWhenFocused === 'boolean'
        ? record.suppressWhenFocused
        : DEFAULT_NOTIFICATION_PREFERENCES.suppressWhenFocused,
    onTaskComplete:
      typeof record.onTaskComplete === 'boolean'
        ? record.onTaskComplete
        : DEFAULT_NOTIFICATION_PREFERENCES.onTaskComplete,
    onWaitingInput:
      typeof record.onWaitingInput === 'boolean'
        ? record.onWaitingInput
        : DEFAULT_NOTIFICATION_PREFERENCES.onWaitingInput,
  };
}
