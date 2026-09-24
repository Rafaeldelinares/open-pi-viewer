import assert from 'node:assert';
import test from 'node:test';

import type { CustomProvidersMap } from '@core/types/providers';
import type { ModelInfo } from '@core/types/models';
import {
  qualifyModelId,
  splitQualifiedModelId,
  extractModelBaseId,
  isModelAllowed,
  extractApprovedProviderModels,
  findModelInCatalog,
} from '@features/profiles/lib/approvedModels';
import {
  resolveCompatibleEffort,
  clampThinkingLevelToSupported,
} from '@features/profiles/lib/effort';

test('qualifyModelId and splitQualifiedModelId: handle identifiers with slashes unambiguously', () => {
  // Simple provider and model
  assert.strictEqual(qualifyModelId('anthropic', 'claude-sonnet-4-5'), 'anthropic/claude-sonnet-4-5');
  assert.deepStrictEqual(splitQualifiedModelId('anthropic/claude-sonnet-4-5'), {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-5',
  });

  // Model ID already qualified with provider
  assert.strictEqual(qualifyModelId('anthropic', 'anthropic/claude-sonnet-4-5'), 'anthropic/claude-sonnet-4-5');

  // Multi-slash model ID from provider like OpenRouter (e.g. openrouter/anthropic/claude-3.5-sonnet)
  const openrouterId = qualifyModelId('openrouter', 'anthropic/claude-3.5-sonnet');
  assert.strictEqual(openrouterId, 'openrouter/anthropic/claude-3.5-sonnet');
  assert.deepStrictEqual(splitQualifiedModelId('openrouter/anthropic/claude-3.5-sonnet'), {
    provider: 'openrouter',
    modelId: 'anthropic/claude-3.5-sonnet',
  });

  // Edge cases: blank provider or model
  assert.strictEqual(qualifyModelId('', 'gpt-4o'), 'gpt-4o');
  assert.strictEqual(qualifyModelId('openai', ''), 'openai');
  assert.deepStrictEqual(splitQualifiedModelId('plain-model'), {
    provider: '',
    modelId: 'plain-model',
  });
});

test('extractModelBaseId: strips namespaces and prefixes', () => {
  assert.strictEqual(extractModelBaseId('openai/gpt-4o'), 'gpt-4o');
  assert.strictEqual(extractModelBaseId('openrouter/anthropic/claude-3.5-sonnet'), 'claude-3.5-sonnet');
  assert.strictEqual(extractModelBaseId('models/gemini-2.5-pro'), 'gemini-2.5-pro');
  assert.strictEqual(extractModelBaseId('plain-model'), 'plain-model');
  assert.strictEqual(extractModelBaseId(''), '');
});

test('isModelAllowed: respects includedModels and excludedModels with absolute precedence', () => {
  const policyBoth = {
    includedModels: ['gpt-4o', 'claude-*'],
    excludedModels: ['gpt-4o', 'claude-haiku'],
  };
  // includedModels takes absolute precedence
  assert.strictEqual(isModelAllowed('gpt-4o', policyBoth), true);
  assert.strictEqual(isModelAllowed('claude-3.5-sonnet', policyBoth), true);
  assert.strictEqual(isModelAllowed('claude-haiku', policyBoth), true);
  assert.strictEqual(isModelAllowed('llama3:8b', policyBoth), false);

  const policyExcludedOnly = {
    excludedModels: ['gpt-3.5-turbo', 'dall-e*'],
  };
  assert.strictEqual(isModelAllowed('gpt-4o', policyExcludedOnly), true);
  assert.strictEqual(isModelAllowed('gpt-3.5-turbo', policyExcludedOnly), false);
  assert.strictEqual(isModelAllowed('dall-e-3', policyExcludedOnly), false);
  assert.strictEqual(isModelAllowed('openai/dall-e-3', policyExcludedOnly), false);

  // Wildcards and empty policies
  assert.strictEqual(isModelAllowed('any-model', undefined), true);
  assert.strictEqual(isModelAllowed('any-model', {}), true);
  assert.strictEqual(isModelAllowed('', policyBoth), false);
});

test('extractApprovedProviderModels: filters only accepted models from ~/.pi/agent/models.json', () => {
  const providersConfig: CustomProvidersMap = {
    anthropic: {
      name: 'Anthropic Official',
      baseUrl: 'https://api.anthropic.com',
      api: 'anthropic',
      models: [
        {
          id: 'claude-sonnet-4-5',
          name: 'Claude 4.5 Sonnet',
          reasoning: true,
          reasoningEfforts: ['low', 'medium', 'high'],
        },
        {
          id: 'claude-deprecated',
          name: 'Deprecated Model',
        },
      ],
      excludedModels: ['claude-deprecated'],
    },
    openrouter: {
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api',
      api: 'openai',
      models: [
        {
          id: 'anthropic/claude-3.5-sonnet',
          name: 'Claude 3.5 Sonnet (OpenRouter)',
          reasoning: true,
          thinkingLevelMap: {
            off: 'off',
            low: 'low',
            high: 'high',
            max: null,
          },
        },
        {
          id: 'meta-llama/llama-3-70b',
          name: 'Llama 3 70B',
          reasoning: false,
        },
      ],
      includedModels: ['anthropic/*', 'meta-llama/llama-3-70b'],
    },
  };

  const approved = extractApprovedProviderModels(providersConfig);

  // Check count: 1 from anthropic (claude-deprecated excluded), 2 from openrouter
  assert.strictEqual(approved.length, 3);

  // 1. Anthropic model has qualified ID and reasoning metadata preserved
  const sonnet = approved.find((m) => m.id === 'anthropic/claude-sonnet-4-5');
  assert.ok(sonnet, 'Expected anthropic/claude-sonnet-4-5 to be present');
  assert.strictEqual(sonnet.provider, 'anthropic');
  assert.strictEqual(sonnet.name, 'Claude 4.5 Sonnet');
  assert.strictEqual(sonnet.reasoning, true);
  assert.deepStrictEqual(sonnet.reasoningEfforts, ['low', 'medium', 'high']);

  // Excluded model is absent
  assert.strictEqual(approved.some((m) => Boolean(m.id && m.id.includes('deprecated'))), false);

  // 2. OpenRouter model preserves slash in raw model ID
  const orSonnet = approved.find((m) => m.id === 'openrouter/anthropic/claude-3.5-sonnet');
  assert.ok(orSonnet, 'Expected openrouter/anthropic/claude-3.5-sonnet to be present');
  assert.strictEqual(orSonnet.provider, 'openrouter');
  assert.deepStrictEqual(orSonnet.thinkingLevelMap, {
    off: 'off',
    low: 'low',
    high: 'high',
    max: null,
  });

  // 3. Off-only / reasoning: false model
  const llama = approved.find((m) => m.id === 'openrouter/meta-llama/llama-3-70b');
  assert.ok(llama);
  assert.strictEqual(llama.reasoning, false);

  // Empty / undefined map
  assert.deepStrictEqual(extractApprovedProviderModels(undefined), []);
  assert.deepStrictEqual(extractApprovedProviderModels({}), []);
});

test('findModelInCatalog: locates models by qualified ID, raw ID with provider, or name', () => {
  const catalog: ModelInfo[] = [
    {
      id: 'anthropic/claude-sonnet-4-5',
      name: 'Claude 4.5 Sonnet',
      provider: 'anthropic',
    },
    {
      id: 'openrouter/anthropic/claude-3.5-sonnet',
      name: 'Claude 3.5 Sonnet (OpenRouter)',
      provider: 'openrouter',
    },
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      provider: 'openai',
    },
  ];

  // Exact qualified ID
  assert.strictEqual(findModelInCatalog(catalog, 'anthropic/claude-sonnet-4-5')?.provider, 'anthropic');
  assert.strictEqual(findModelInCatalog(catalog, 'openrouter/anthropic/claude-3.5-sonnet')?.provider, 'openrouter');

  // Match when catalog ID was un-prefixed
  assert.strictEqual(findModelInCatalog(catalog, 'openai/gpt-4o')?.id, 'gpt-4o');

  // Match by name
  assert.strictEqual(findModelInCatalog(catalog, 'Claude 4.5 Sonnet')?.id, 'anthropic/claude-sonnet-4-5');

  // Not found
  assert.strictEqual(findModelInCatalog(catalog, 'nonexistent-model'), null);
  assert.strictEqual(findModelInCatalog(catalog, ''), null);
  assert.strictEqual(findModelInCatalog(catalog, null), null);
});

test('extractApprovedProviderModels: preserves thinkingLevel and defaultThinkingLevel without metadata loss', () => {
  const providersConfig: CustomProvidersMap = {
    cpam: {
      name: 'CLIProxyAPI',
      baseUrl: 'http://localhost:8080',
      api: 'openai-completions',
      models: [
        {
          id: 'agy',
          name: 'Agy (Reasoning)',
          reasoning: true,
          defaultThinkingLevel: 'high',
          thinkingLevel: 'high',
          thinkingLevelMap: {
            off: 'off',
            low: 'low',
            medium: 'medium',
            high: 'high',
          },
        },
      ],
    },
  };

  const approved = extractApprovedProviderModels(providersConfig);
  assert.strictEqual(approved.length, 1);
  const agy = approved[0];
  assert.strictEqual(agy.id, 'cpam/agy');
  assert.strictEqual(agy.provider, 'cpam');
  assert.strictEqual(agy.thinkingLevel, 'high');
  assert.strictEqual(agy.defaultThinkingLevel, 'high');
});

test('findModelInCatalog: handles duplicate base IDs across providers and nested slash IDs unambiguously', () => {
  const catalog: ModelInfo[] = [
    {
      id: 'cpam/gpt-4o',
      name: 'GPT-4o (CPAM Proxy)',
      provider: 'cpam',
      defaultThinkingLevel: 'high',
    },
    {
      id: 'openai/gpt-4o',
      name: 'GPT-4o (Official OpenAI)',
      provider: 'openai',
    },
    {
      id: 'openrouter/anthropic/claude-3.5-sonnet',
      name: 'Claude 3.5 Sonnet (OpenRouter)',
      provider: 'openrouter',
    },
    {
      id: 'anthropic/claude-3.5-sonnet',
      name: 'Claude 3.5 Sonnet (Direct)',
      provider: 'anthropic',
    },
    {
      id: 'cpam/astra',
      name: 'Astra (Reasoning)',
      provider: 'cpam',
      thinkingLevelMap: {
        off: null,
        low: 'low',
        medium: 'medium',
        high: 'high',
      },
    },
  ];

  // 1. Qualified exact match for duplicate base IDs
  const cpamGpt = findModelInCatalog(catalog, 'cpam/gpt-4o');
  assert.strictEqual(cpamGpt?.provider, 'cpam');
  assert.strictEqual(cpamGpt?.defaultThinkingLevel, 'high');

  const openaiGpt = findModelInCatalog(catalog, 'openai/gpt-4o');
  assert.strictEqual(openaiGpt?.provider, 'openai');
  assert.strictEqual(openaiGpt?.defaultThinkingLevel, undefined);

  // 2. Unqualified duplicate base ID does not silently select wrong provider
  assert.strictEqual(findModelInCatalog(catalog, 'gpt-4o'), null);
  // But if preferredProvider is specified, resolves correctly
  assert.strictEqual(findModelInCatalog(catalog, 'gpt-4o', 'cpam')?.provider, 'cpam');
  assert.strictEqual(findModelInCatalog(catalog, 'gpt-4o', 'openai')?.provider, 'openai');

  // 3. Nested slash IDs
  const orSonnet = findModelInCatalog(catalog, 'openrouter/anthropic/claude-3.5-sonnet');
  assert.strictEqual(orSonnet?.provider, 'openrouter');
  assert.strictEqual(orSonnet?.name, 'Claude 3.5 Sonnet (OpenRouter)');

  const dirSonnet = findModelInCatalog(catalog, 'anthropic/claude-3.5-sonnet');
  assert.strictEqual(dirSonnet?.provider, 'anthropic');
  assert.strictEqual(dirSonnet?.name, 'Claude 3.5 Sonnet (Direct)');

  // 4. Unambiguous base ID resolution
  const astra = findModelInCatalog(catalog, 'astra');
  assert.strictEqual(astra?.provider, 'cpam');
  assert.strictEqual(astra?.id, 'cpam/astra');
});

test('clampThinkingLevelToSupported: clamps to nearest supported level or fallback', () => {
  // Already supported
  assert.strictEqual(clampThinkingLevelToSupported('medium', ['low', 'medium', 'high']), 'medium');

  // Higher than max supported
  assert.strictEqual(clampThinkingLevelToSupported('high', ['low', 'medium']), 'medium');

  // Lower than min supported
  assert.strictEqual(clampThinkingLevelToSupported('minimal', ['medium', 'high']), 'medium');

  // Off only
  assert.strictEqual(clampThinkingLevelToSupported('high', ['off']), 'off');

  // Empty supported levels fallback
  assert.strictEqual(clampThinkingLevelToSupported('high', []), 'medium');
});

test('resolveCompatibleEffort: enforces effort compatibility rules cleanly', () => {
  // Rule 1: Empty effort means inherit / default — ALWAYS preserved across all models
  assert.strictEqual(resolveCompatibleEffort('', ['off']), '');
  assert.strictEqual(resolveCompatibleEffort('', ['low', 'medium', 'high']), '');
  assert.strictEqual(resolveCompatibleEffort(undefined, ['low', 'medium']), '');

  // Rule 2: Valid off-only choice is preserved and never indiscriminately disabled
  assert.strictEqual(resolveCompatibleEffort('off', ['off']), 'off');
  assert.strictEqual(resolveCompatibleEffort('off', ['off', 'low', 'high']), 'off');

  // Rule 3: Switching to an off-only model clamps non-empty efforts to 'off'
  assert.strictEqual(resolveCompatibleEffort('high', ['off']), 'off');
  assert.strictEqual(resolveCompatibleEffort('medium', ['off']), 'off');
  assert.strictEqual(resolveCompatibleEffort('low', ['off']), 'off');

  // Rule 4: Switching to reasoning model preserves supported effort
  assert.strictEqual(resolveCompatibleEffort('high', ['low', 'medium', 'high']), 'high');
  assert.strictEqual(resolveCompatibleEffort('low', ['low', 'medium', 'high']), 'low');

  // Rule 5: Switching from 'off' to reasoning-only model clamps to supported ('low')
  assert.strictEqual(resolveCompatibleEffort('off', ['low', 'medium', 'high']), 'low');

  // Rule 6: Clamping out-of-range efforts to nearest supported level
  assert.strictEqual(resolveCompatibleEffort('high', ['low', 'medium']), 'medium');
  assert.strictEqual(resolveCompatibleEffort('max', ['low', 'medium', 'high']), 'high');
});

test('effort compatibility transition: adjusts main model and inheriting agents while preserving overrides', () => {
  // Scenario: Profile has main model supporting ['low', 'medium', 'high'] with default_effort 'high'.
  // Agent 1 inherits main model and has explicit effort 'high'.
  // Agent 2 inherits main model and has empty effort '' (inherit).
  // Agent 3 has an explicit model override 'openai/o3-mini' with effort 'high'.
  const initialForm = {
    default_model: 'anthropic/claude-sonnet-4-5',
    default_effort: 'high',
    model_profiles: {
      'sdd-orchestrator': { model: '', effort: 'high' },
      'sdd-spec': { model: '', effort: '' },
      'sdd-reviewer': { model: 'openai/o3-mini', effort: 'high' },
    },
  };

  // Main model is changed to an off-only model (e.g. reasoning: false)
  const offOnlyModel: ModelInfo = {
    id: 'openai/gpt-4o-mini',
    provider: 'openai',
    reasoning: false,
  };
  const nextSupported = ['off'] as const;
  assert.strictEqual(offOnlyModel.reasoning, false);

  // 1. Default effort must adjust to 'off'
  const nextDefaultEffort = resolveCompatibleEffort(initialForm.default_effort, nextSupported);
  assert.strictEqual(nextDefaultEffort, 'off');

  // 2. Inheriting agent with explicit effort adjusts to 'off'
  const agent1Effort = resolveCompatibleEffort(
    initialForm.model_profiles['sdd-orchestrator'].effort,
    nextSupported
  );
  assert.strictEqual(agent1Effort, 'off');

  // 3. Inheriting agent with empty effort remains '' (inherit/default)
  const agent2Effort = resolveCompatibleEffort(
    initialForm.model_profiles['sdd-spec'].effort,
    nextSupported
  );
  assert.strictEqual(agent2Effort, '');

  // 4. Overridden agent's effort is NOT constrained by main model's supported efforts
  assert.strictEqual(initialForm.model_profiles['sdd-reviewer'].effort, 'high');
  assert.strictEqual(initialForm.model_profiles['sdd-reviewer'].model, 'openai/o3-mini');
});

test('preserve stored profiles: unavailable existing models are not migrated into approved catalog', () => {
  const approvedCatalog = extractApprovedProviderModels({
    anthropic: {
      baseUrl: 'https://api.anthropic.com',
      api: 'anthropic',
      models: [{ id: 'claude-sonnet-4-5' }],
    },
  });

  // Approved catalog only has the configured model
  assert.strictEqual(approvedCatalog.length, 1);
  assert.strictEqual(approvedCatalog[0].id, 'anthropic/claude-sonnet-4-5');

  // Stored legacy profile has an unavailable model
  const legacyProfile = {
    name: 'legacy-profile',
    default_model: 'deprecated-provider/old-model',
    model_profiles: {
      'agent-a': { model: 'discontinued/v1' },
    },
  };

  // Catalog remains strictly the approved models (no leakage of legacy-profile models)
  assert.strictEqual(
    approvedCatalog.some((m) => m.id === legacyProfile.default_model),
    false
  );
  assert.strictEqual(
    approvedCatalog.some((m) => m.id === legacyProfile.model_profiles['agent-a'].model),
    false
  );

  // Stored profile values are preserved verbatim without mutation
  assert.strictEqual(legacyProfile.default_model, 'deprecated-provider/old-model');
  assert.strictEqual(legacyProfile.model_profiles['agent-a'].model, 'discontinued/v1');
});
