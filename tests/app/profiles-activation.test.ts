import assert from 'node:assert';
import test from 'node:test';

import {
  applyProfileRuntime,
  PROFILE_ACTIVATED_EVENT,
  PROFILE_CLEARED_EVENT,
  type ProfileSummary,
  type ProfileActivationEventDetail,
  type ProfileClearActiveEventDetail,
} from '@core/types/profiles';
import type { ModelInfo } from '@core/types/models';

test('app-level profile activation events: event composition and live session updates', async () => {
  const catalog: ModelInfo[] = [
    { id: 'gpt-4o', provider: 'openai' },
    { id: 'anthropic/claude-3.5-sonnet', provider: 'openrouter' },
  ];

  assert.strictEqual(PROFILE_ACTIVATED_EVENT, 'pi:profile-activated');
  assert.strictEqual(PROFILE_CLEARED_EVENT, 'pi:profile-cleared');

  const appliedCalls: string[] = [];
  const mockSelectModel = async (provider: string, modelId: string) => {
    appliedCalls.push(`model:${provider}/${modelId}`);
  };
  const mockSelectThinkingLevel = async (level: string) => {
    appliedCalls.push(`effort:${level}`);
  };

  const projectProfile: ProfileSummary = {
    name: 'project-specialized',
    scope: 'project',
    agent_count: 3,
    is_active: true,
    default_model: 'openrouter/anthropic/claude-3.5-sonnet',
    default_effort: 'high',
  };

  const globalFallbackProfile: ProfileSummary = {
    name: 'global-standard',
    scope: 'global',
    agent_count: 5,
    is_active: false,
    default_model: 'openai/gpt-4o',
    default_effort: 'medium',
  };

  // Simulating the App listener for PROFILE_ACTIVATED_EVENT
  const handleProfileActivatedEvent = async (detail: ProfileActivationEventDetail, isConnected: boolean, isBusy: boolean) => {
    if (isConnected && !isBusy && detail.profile) {
      await applyProfileRuntime(detail.profile, {
        isConnected,
        availableModels: catalog,
        onSelectModel: mockSelectModel,
        onSelectThinkingLevel: mockSelectThinkingLevel,
      });
    }
  };

  // 1. Activation when connected and idle: live-applies model + effort
  await handleProfileActivatedEvent(
    { profile: projectProfile, scope: 'project' },
    true,
    false
  );
  assert.deepStrictEqual(appliedCalls, [
    'model:openrouter/anthropic/claude-3.5-sonnet',
    'effort:high',
  ]);

  // 2. Activation when busy: does not disrupt generation
  appliedCalls.length = 0;
  await handleProfileActivatedEvent(
    { profile: projectProfile, scope: 'project' },
    true,
    true // busy!
  );
  assert.strictEqual(appliedCalls.length, 0);

  // 3. Activation when disconnected: does not attempt RPC
  appliedCalls.length = 0;
  await handleProfileActivatedEvent(
    { profile: projectProfile, scope: 'project' },
    false, // disconnected!
    false
  );
  assert.strictEqual(appliedCalls.length, 0);

  // Simulating the App listener for PROFILE_CLEARED_EVENT
  const handleProfileClearedEvent = async (
    _detail: ProfileClearActiveEventDetail,
    globalActiveProfile: ProfileSummary | null,
    isConnected: boolean,
    isBusy: boolean
  ) => {
    if (isConnected && !isBusy && globalActiveProfile) {
      await applyProfileRuntime(globalActiveProfile, {
        isConnected,
        availableModels: catalog,
        onSelectModel: mockSelectModel,
        onSelectThinkingLevel: mockSelectThinkingLevel,
      });
    }
  };

  // 4. Clearing project profile when global active exists: applies global profile
  appliedCalls.length = 0;
  await handleProfileClearedEvent(
    { scope: 'project' },
    globalFallbackProfile,
    true,
    false
  );
  assert.deepStrictEqual(appliedCalls, [
    'model:openai/gpt-4o',
    'effort:medium',
  ]);

  // 5. Clearing project profile when NO global active exists: no RPC calls made
  appliedCalls.length = 0;
  await handleProfileClearedEvent(
    { scope: 'project' },
    null,
    true,
    false
  );
  assert.strictEqual(appliedCalls.length, 0);
});
