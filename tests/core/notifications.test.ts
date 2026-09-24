import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  shouldDeliverNotification,
  validateNotificationPreferences,
  type NotificationPreferences,
} from '@core/notifications';

test('validateNotificationPreferences: returns default preferences for null or non-object input', () => {
  assert.deepEqual(
    validateNotificationPreferences(null),
    DEFAULT_NOTIFICATION_PREFERENCES
  );
  assert.deepEqual(
    validateNotificationPreferences(undefined),
    DEFAULT_NOTIFICATION_PREFERENCES
  );
  assert.deepEqual(
    validateNotificationPreferences('invalid'),
    DEFAULT_NOTIFICATION_PREFERENCES
  );
  assert.deepEqual(
    validateNotificationPreferences(123),
    DEFAULT_NOTIFICATION_PREFERENCES
  );
  assert.deepEqual(
    validateNotificationPreferences([]),
    DEFAULT_NOTIFICATION_PREFERENCES
  );
});

test('validateNotificationPreferences: preserves valid boolean values and falls back for missing/invalid properties', () => {
  const partial = {
    enabled: false,
    sound: false,
    // suppressWhenFocused missing -> fallback to true
    onTaskComplete: 'not-a-bool', // invalid -> fallback to true
    onWaitingInput: false,
  };

  const validated = validateNotificationPreferences(partial);
  assert.deepEqual(validated, {
    enabled: false,
    sound: false,
    suppressWhenFocused: true,
    onTaskComplete: true,
    onWaitingInput: false,
  });
});

test('shouldDeliverNotification: returns false for both popup and sound when enabled is false', () => {
  const prefs: NotificationPreferences = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    enabled: false,
  };

  const decision = shouldDeliverNotification({
    eventType: 'task_complete',
    preferences: prefs,
    isWindowFocused: false,
  });

  assert.deepEqual(decision, {
    shouldShowPopup: false,
    shouldPlaySound: false,
  });
});

test('shouldDeliverNotification: debounces events when delivered too recently', () => {
  const prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES };
  const now = 10000;
  const lastDeliveredAt = 9500; // 500ms ago < 1000ms debounce

  const decision = shouldDeliverNotification({
    eventType: 'task_complete',
    preferences: prefs,
    isWindowFocused: false,
    lastDeliveredAt,
    now,
    debounceMs: 1000,
  });

  assert.deepEqual(decision, {
    shouldShowPopup: false,
    shouldPlaySound: false,
  });

  // Beyond debounce
  const allowedDecision = shouldDeliverNotification({
    eventType: 'task_complete',
    preferences: prefs,
    isWindowFocused: false,
    lastDeliveredAt: 8000, // 2000ms ago >= 1000ms debounce
    now,
    debounceMs: 1000,
  });

  assert.deepEqual(allowedDecision, {
    shouldShowPopup: true,
    shouldPlaySound: true,
  });
});

test('shouldDeliverNotification: respects onTaskComplete filter', () => {
  const prefs: NotificationPreferences = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    onTaskComplete: false,
  };

  const decision = shouldDeliverNotification({
    eventType: 'task_complete',
    preferences: prefs,
    isWindowFocused: false,
  });

  assert.deepEqual(decision, {
    shouldShowPopup: false,
    shouldPlaySound: false,
  });
});

test('shouldDeliverNotification: respects onWaitingInput filter', () => {
  const prefs: NotificationPreferences = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    onWaitingInput: false,
  };

  const decision = shouldDeliverNotification({
    eventType: 'waiting_input',
    preferences: prefs,
    isWindowFocused: false,
  });

  assert.deepEqual(decision, {
    shouldShowPopup: false,
    shouldPlaySound: false,
  });
});

test('shouldDeliverNotification: suppresses popup and sound when window is focused and suppressWhenFocused is true', () => {
  const prefs: NotificationPreferences = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    suppressWhenFocused: true,
    sound: true,
  };

  const decision = shouldDeliverNotification({
    eventType: 'task_complete',
    preferences: prefs,
    isWindowFocused: true,
  });

  assert.deepEqual(decision, {
    shouldShowPopup: false,
    shouldPlaySound: false,
  });
});

test('shouldDeliverNotification: delivers popup and sound when window is not focused', () => {
  const prefs: NotificationPreferences = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    suppressWhenFocused: true,
    sound: true,
  };

  const decision = shouldDeliverNotification({
    eventType: 'task_complete',
    preferences: prefs,
    isWindowFocused: false,
  });

  assert.deepEqual(decision, {
    shouldShowPopup: true,
    shouldPlaySound: true,
  });
});

test('shouldDeliverNotification: allows popup and sound when focused if suppressWhenFocused is false', () => {
  const prefs: NotificationPreferences = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    suppressWhenFocused: false,
    sound: true,
  };

  const decision = shouldDeliverNotification({
    eventType: 'task_complete',
    preferences: prefs,
    isWindowFocused: true,
  });

  assert.deepEqual(decision, {
    shouldShowPopup: true,
    shouldPlaySound: true,
  });
});

test('shouldDeliverNotification: suppresses sound if sound preference is false', () => {
  const prefs: NotificationPreferences = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    sound: false,
    suppressWhenFocused: false,
  };

  const decision = shouldDeliverNotification({
    eventType: 'task_complete',
    preferences: prefs,
    isWindowFocused: false,
  });

  assert.deepEqual(decision, {
    shouldShowPopup: true,
    shouldPlaySound: false,
  });
});

test('shouldDeliverNotification: handles error event type without onTaskComplete/onWaitingInput filters', () => {
  const prefs: NotificationPreferences = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    onTaskComplete: false,
    onWaitingInput: false,
    sound: true,
  };

  const decision = shouldDeliverNotification({
    eventType: 'error',
    preferences: prefs,
    isWindowFocused: false,
  });

  assert.deepEqual(decision, {
    shouldShowPopup: true,
    shouldPlaySound: true,
  });
});
