export interface ModelInfo {
  id?: string;
  name?: string;
  provider?: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  reasoningEfforts?: string[];
  thinkingLevelMap?: Record<string, string | null | undefined>;
  thinkingLevel?: ThinkingLevel;
  defaultThinkingLevel?: ThinkingLevel;
  input?: string[];
  input_modalities?: string[];
  [key: string]: unknown;
}

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const EXTENDED_THINKING_LEVELS: readonly ThinkingLevel[] = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;

export const DEFAULT_REASONING_LEVELS: readonly ThinkingLevel[] = [
  'low',
  'medium',
  'high',
] as const;

/**
 * Determine supported reasoning effort / thinking levels for a model.
 * 1. If model.thinkingLevelMap exists: filter EXTENDED_THINKING_LEVELS where map[level] !== null
 *    (xhigh and max require non-null entry).
 * 2. Else if model.reasoningEfforts exists: filter EXTENDED_THINKING_LEVELS where reasoningEfforts has level.
 * 3. Else if model.reasoning === false: return ['off'].
 * 4. Otherwise default to DEFAULT_REASONING_LEVELS (['low', 'medium', 'high']).
 */
export function getSupportedReasoningEffortsForModel(
  model: ModelInfo | null | undefined
): ThinkingLevel[] {
  if (model?.thinkingLevelMap && typeof model.thinkingLevelMap === 'object') {
    const map = model.thinkingLevelMap as Record<string, unknown>;
    const supported = EXTENDED_THINKING_LEVELS.filter((level) => {
      const mapped = map[level];
      if (mapped === null) return false;
      if (level === 'xhigh' || level === 'max') return mapped !== undefined;
      return true;
    });
    if (supported.length > 0) return supported;
  }

  if (Array.isArray(model?.reasoningEfforts) && model.reasoningEfforts.length > 0) {
    const effortSet = new Set(
      model.reasoningEfforts
        .filter((e): e is string => typeof e === 'string')
        .map((e) => e.toLowerCase())
    );
    const supported = EXTENDED_THINKING_LEVELS.filter((level) => effortSet.has(level));
    if (supported.length > 0) return supported;
  }

  if (model && model.reasoning === false) {
    return ['off'];
  }

  return [...DEFAULT_REASONING_LEVELS];
}

/**
 * Clamp a thinking level to a list of supported levels.
 */
export function clampThinkingLevelToSupported(
  level: ThinkingLevel,
  supportedLevels: readonly ThinkingLevel[]
): ThinkingLevel {
  if (!supportedLevels || supportedLevels.length === 0) return 'medium';
  if (supportedLevels.includes(level)) return level;
  const reqIdx = EXTENDED_THINKING_LEVELS.indexOf(level);
  if (reqIdx !== -1) {
    for (let i = reqIdx; i < EXTENDED_THINKING_LEVELS.length; i++) {
      if (supportedLevels.includes(EXTENDED_THINKING_LEVELS[i])) {
        return EXTENDED_THINKING_LEVELS[i];
      }
    }
    for (let i = reqIdx - 1; i >= 0; i--) {
      if (supportedLevels.includes(EXTENDED_THINKING_LEVELS[i])) {
        return EXTENDED_THINKING_LEVELS[i];
      }
    }
  }
  if (supportedLevels.includes('medium')) return 'medium';
  return supportedLevels[0] || 'medium';
}

/**
 * Resolves the default thinking effort for a given model.
 * Priority:
 * 1. settings.json mapping (modelThinkingLevels["<provider>/<modelId>"] or modelThinkingLevels["<modelId>"])
 * 2. model.thinkingLevel
 * 3. model.defaultThinkingLevel
 * 4. Fallback to 'medium'
 *
 * If availableLevels is provided and non-empty, ensures the returned level is supported.
 */
export function resolveModelDefaultThinkingLevel(
  model: ModelInfo | null | undefined,
  modelThinkingLevels?: ModelThinkingLevelsMap,
  availableLevels?: readonly ThinkingLevel[]
): ThinkingLevel {
  if (!model?.id) return 'medium';

  const provider = model.provider || '';
  const modelId = model.id;
  const isPrefixed = Boolean(provider && modelId.startsWith(`${provider}/`));
  const compoundKey = provider ? (isPrefixed ? modelId : `${provider}/${modelId}`) : modelId;
  const unPrefixedKey = isPrefixed ? modelId.slice(provider.length + 1) : modelId;

  const rawModel = model as Record<string, unknown>;

  const candidateFromSettings: ThinkingLevel | undefined =
    (compoundKey && modelThinkingLevels?.[compoundKey]) ||
    (modelThinkingLevels?.[modelId]) ||
    (unPrefixedKey && modelThinkingLevels?.[unPrefixedKey]) ||
    undefined;

  const candidateFromModel: ThinkingLevel | undefined =
    (rawModel.thinkingLevel as ThinkingLevel) ||
    (rawModel.defaultThinkingLevel as ThinkingLevel) ||
    undefined;

  const resolved: ThinkingLevel =
    candidateFromSettings ||
    candidateFromModel ||
    'medium';

  if (availableLevels && availableLevels.length > 0 && !availableLevels.includes(resolved)) {
    if (availableLevels.includes('medium')) return 'medium';
    return availableLevels[0] || 'medium';
  }

  return resolved;
}

export type ModelThinkingLevelsMap = Record<string, ThinkingLevel>;

export interface TokenUsageStats {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  total: number;
}

export interface ContextUsageStats {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
}

export interface SessionStats {
  sessionId?: string;
  sessionFile?: string;
  userMessages?: number;
  assistantMessages?: number;
  toolCalls?: number;
  toolResults?: number;
  totalMessages?: number;
  tokens?: TokenUsageStats;
  cost?: number;
  contextUsage?: ContextUsageStats | null;
}
