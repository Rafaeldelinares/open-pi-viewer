import assert from 'node:assert/strict';
import test from 'node:test';

import {
  type ModelInfo,
  type ModelThinkingLevelsMap,
  getSupportedReasoningEffortsForModel,
  clampThinkingLevelToSupported,
  resolveModelDefaultThinkingLevel,
} from '@core/types/models';

test('core/models: ModelInfo retains typed thinkingLevel and defaultThinkingLevel', () => {
  const model: ModelInfo = {
    id: 'cpam/agy',
    provider: 'cpam',
    reasoning: true,
    thinkingLevel: 'high',
    defaultThinkingLevel: 'high',
  };

  assert.strictEqual(model.thinkingLevel, 'high');
  assert.strictEqual(model.defaultThinkingLevel, 'high');
});

test('core/models: CPAM astra supports minimal/low/medium/high/xhigh/max but not off', () => {
  const cpamAstra: ModelInfo = {
    id: 'cpam/astra',
    provider: 'cpam',
    reasoning: true,
    thinkingLevelMap: {
      off: null,
      minimal: 'minimal',
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: 'xhigh',
      max: 'max',
    },
  };

  const supported = getSupportedReasoningEffortsForModel(cpamAstra);
  assert.deepStrictEqual(supported, ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
  assert.strictEqual(supported.includes('off'), false);
});

test('core/models: CPAM agy model default high is resolved', () => {
  const cpamAgy: ModelInfo = {
    id: 'cpam/agy',
    provider: 'cpam',
    reasoning: true,
    defaultThinkingLevel: 'high',
    thinkingLevelMap: {
      off: 'off',
      low: 'low',
      medium: 'medium',
      high: 'high',
    },
  };

  const supported = getSupportedReasoningEffortsForModel(cpamAgy);
  const resolved = resolveModelDefaultThinkingLevel(cpamAgy, {}, supported);
  assert.strictEqual(resolved, 'high');
});

test('core/models: OpenAI model supports low/medium/high only and defaults to medium without override', () => {
  const openaiModel: ModelInfo = {
    id: 'openai/o3-mini',
    provider: 'openai',
    reasoning: true,
    reasoningEfforts: ['low', 'medium', 'high'],
  };

  const supported = getSupportedReasoningEffortsForModel(openaiModel);
  assert.deepStrictEqual(supported, ['low', 'medium', 'high']);

  const resolved = resolveModelDefaultThinkingLevel(openaiModel, {}, supported);
  assert.strictEqual(resolved, 'medium');
});

test('core/models: non-reasoning model (reasoning: false) returns off-only and resolves to off', () => {
  const nonReasoningModel: ModelInfo = {
    id: 'openai/gpt-4o-mini',
    provider: 'openai',
    reasoning: false,
  };

  const supported = getSupportedReasoningEffortsForModel(nonReasoningModel);
  assert.deepStrictEqual(supported, ['off']);

  const resolved = resolveModelDefaultThinkingLevel(nonReasoningModel, {}, supported);
  assert.strictEqual(resolved, 'off');
});

test('core/models: settings override takes precedence over model.thinkingLevel and model.defaultThinkingLevel', () => {
  const model: ModelInfo = {
    id: 'cpam/agy',
    provider: 'cpam',
    reasoning: true,
    thinkingLevel: 'high',
    defaultThinkingLevel: 'high',
    thinkingLevelMap: {
      off: 'off',
      low: 'low',
      medium: 'medium',
      high: 'high',
    },
  };

  const supported = getSupportedReasoningEffortsForModel(model);

  // 1. Settings override with compound key 'cpam/cpam/agy' or 'cpam/agy'
  const settings1: ModelThinkingLevelsMap = { 'cpam/agy': 'low' };
  assert.strictEqual(resolveModelDefaultThinkingLevel(model, settings1, supported), 'low');

  // 2. Settings override with base ID 'agy'
  const settings2: ModelThinkingLevelsMap = { 'agy': 'medium' };
  assert.strictEqual(resolveModelDefaultThinkingLevel(model, settings2, supported), 'medium');

  // 3. No settings override -> falls back to model.thinkingLevel ('high')
  assert.strictEqual(resolveModelDefaultThinkingLevel(model, {}, supported), 'high');

  // 4. No settings override, no thinkingLevel -> falls back to defaultThinkingLevel
  const modelWithDefaultOnly: ModelInfo = {
    id: 'cpam/agy',
    provider: 'cpam',
    defaultThinkingLevel: 'high',
  };
  assert.strictEqual(resolveModelDefaultThinkingLevel(modelWithDefaultOnly, {}, supported), 'high');
});

test('core/models: clampThinkingLevelToSupported clamps to nearest or fallback correctly', () => {
  assert.strictEqual(clampThinkingLevelToSupported('max', ['low', 'medium', 'high']), 'high');
  assert.strictEqual(clampThinkingLevelToSupported('minimal', ['low', 'medium', 'high']), 'low');
  assert.strictEqual(clampThinkingLevelToSupported('high', ['off']), 'off');
  assert.strictEqual(clampThinkingLevelToSupported('high', ['minimal', 'low']), 'low');
  assert.strictEqual(clampThinkingLevelToSupported('medium', ['low', 'high']), 'high');
});
