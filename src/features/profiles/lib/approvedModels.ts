import type { ModelInfo, ThinkingLevel } from '@core/types/models';
import type { CustomProvidersMap } from '@core/types/providers';

/**
 * Strips any leading 'models/' and any 'provider/' namespace prefix from an ID.
 */
export function extractModelBaseId(id: string): string {
  if (!id || typeof id !== 'string') return '';
  let clean = id.trim();
  if (clean.startsWith('models/')) {
    clean = clean.slice(7);
  }
  const slashIdx = clean.lastIndexOf('/');
  if (slashIdx !== -1) {
    clean = clean.slice(slashIdx + 1);
  }
  return clean;
}

/**
 * Ensures a model ID is qualified with its provider ID unambiguously.
 * If modelId already starts with `${providerId}/`, it is returned unchanged.
 */
export function qualifyModelId(providerId: string, modelId: string): string {
  const cleanProv = (providerId || '').trim();
  const cleanModel = (modelId || '').trim();
  if (!cleanProv) return cleanModel;
  if (!cleanModel) return cleanProv;

  if (cleanModel.startsWith(`${cleanProv}/`)) {
    return cleanModel;
  }
  return `${cleanProv}/${cleanModel}`;
}

/**
 * Splits a potentially provider-qualified model ID into provider and modelId.
 * Only splits on the first slash, keeping multi-slash model IDs (e.g. from OpenRouter) intact.
 */
export function splitQualifiedModelId(id: string): { provider: string; modelId: string } {
  if (!id || typeof id !== 'string') return { provider: '', modelId: '' };
  const clean = id.trim();
  const firstSlash = clean.indexOf('/');
  if (firstSlash === -1) {
    return { provider: '', modelId: clean };
  }
  return {
    provider: clean.slice(0, firstSlash),
    modelId: clean.slice(firstSlash + 1),
  };
}

function matchSinglePattern(targetId: string, rawPattern: string): boolean {
  const pattern = rawPattern.trim();
  if (!pattern) return false;

  // 1. Delimited regex: /pattern/flags
  const slashMatch = pattern.match(/^\/(.+)\/([a-z]*)$/);
  if (slashMatch) {
    try {
      const flags = slashMatch[2] ? slashMatch[2] : 'i';
      const regex = new RegExp(slashMatch[1], flags);
      return regex.test(targetId);
    } catch {
      // Ignore invalid regex and continue
    }
  }

  // 2. Unslashed regex: explicit anchors or alternations
  if (/[\^$|()]/.test(pattern) && !pattern.startsWith('*') && !pattern.endsWith('*')) {
    try {
      const regex = new RegExp(pattern, 'i');
      return regex.test(targetId);
    } catch {
      // Ignore invalid regex and continue
    }
  }

  // 3. Case-insensitive wildcard or exact comparison
  const cleanPattern = pattern.toLowerCase();
  const lowerId = targetId.toLowerCase();

  if (cleanPattern === lowerId) return true;

  if (cleanPattern.startsWith('*') && !cleanPattern.slice(1).includes('*')) {
    return lowerId.endsWith(cleanPattern.slice(1));
  }
  if (cleanPattern.endsWith('*') && !cleanPattern.slice(0, -1).includes('*')) {
    return lowerId.startsWith(cleanPattern.slice(0, -1));
  }
  if (cleanPattern.includes('*')) {
    const escaped = cleanPattern
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    try {
      return new RegExp(`^${escaped}$`, 'i').test(lowerId);
    } catch {
      return false;
    }
  }

  return false;
}

export function isModelExcluded(modelId: string, excludedList?: string[]): boolean {
  if (!modelId || !Array.isArray(excludedList) || excludedList.length === 0) {
    return false;
  }
  const cleanId = modelId.trim();
  if (!cleanId) return false;
  const baseId = extractModelBaseId(cleanId);

  return excludedList.some((pattern) => {
    if (typeof pattern !== 'string') return false;
    return (
      matchSinglePattern(cleanId, pattern) ||
      (baseId && baseId !== cleanId && matchSinglePattern(baseId, pattern))
    );
  });
}

export function isModelIncluded(modelId: string, includedList?: string[]): boolean {
  if (!modelId || !Array.isArray(includedList) || includedList.length === 0) {
    return false;
  }
  const cleanId = modelId.trim();
  if (!cleanId) return false;
  const baseId = extractModelBaseId(cleanId);

  return includedList.some((pattern) => {
    if (typeof pattern !== 'string') return false;
    return (
      matchSinglePattern(cleanId, pattern) ||
      (baseId && baseId !== cleanId && matchSinglePattern(baseId, pattern))
    );
  });
}

/**
 * Checks if a model ID is allowed by provider policy.
 * Included models filter (if non-empty) takes absolute precedence over excluded models.
 */
export function isModelAllowed(
  modelId: string,
  policy?: { includedModels?: string[]; excludedModels?: string[] }
): boolean {
  if (!modelId) return false;
  if (!policy) return true;

  if (Array.isArray(policy.includedModels) && policy.includedModels.length > 0) {
    return isModelIncluded(modelId, policy.includedModels);
  }

  if (Array.isArray(policy.excludedModels) && policy.excludedModels.length > 0) {
    return !isModelExcluded(modelId, policy.excludedModels);
  }

  return true;
}

/**
 * Extracts all approved models from custom providers configuration (from ~/.pi/agent/models.json).
 * Applies provider isModelAllowed policy and qualifies model IDs unambiguously.
 */
export function extractApprovedProviderModels(
  providersMap?: CustomProvidersMap | Record<string, unknown>
): ModelInfo[] {
  if (!providersMap || typeof providersMap !== 'object') {
    return [];
  }

  const approved: ModelInfo[] = [];
  const seenIds = new Set<string>();

  for (const [provKey, provVal] of Object.entries(providersMap)) {
    if (!provVal || typeof provVal !== 'object') continue;
    const providerConfig = provVal as {
      id?: string;
      name?: string;
      models?: Array<Record<string, unknown>>;
      includedModels?: string[];
      excludedModels?: string[];
    };
    const providerId = (providerConfig.id || provKey).trim();
    if (!providerId) continue;

    const policy = {
      includedModels: Array.isArray(providerConfig.includedModels) ? providerConfig.includedModels : undefined,
      excludedModels: Array.isArray(providerConfig.excludedModels) ? providerConfig.excludedModels : undefined,
    };

    const models = providerConfig.models;
    if (!Array.isArray(models)) continue;

    for (const rawModel of models) {
      if (!rawModel || typeof rawModel !== 'object' || !rawModel.id || typeof rawModel.id !== 'string') {
        continue;
      }
      const rawModelId = rawModel.id.trim();
      if (!rawModelId) continue;

      // Filter against provider policy
      if (!isModelAllowed(rawModelId, policy)) {
        continue;
      }

      const qualifiedId = qualifyModelId(providerId, rawModelId);
      if (seenIds.has(qualifiedId)) {
        continue;
      }
      seenIds.add(qualifiedId);

      const modelName =
        typeof rawModel.name === 'string' && rawModel.name.trim() !== ''
          ? rawModel.name.trim()
          : rawModelId;

      const reasoning =
        typeof rawModel.reasoning === 'boolean'
          ? rawModel.reasoning
          : Array.isArray(rawModel.reasoningEfforts) && rawModel.reasoningEfforts.length > 0
            ? true
            : rawModel.thinkingLevelMap !== undefined
              ? true
              : undefined;

      const reasoningEfforts = Array.isArray(rawModel.reasoningEfforts)
        ? (rawModel.reasoningEfforts as string[])
        : undefined;

      const thinkingLevelMap =
        rawModel.thinkingLevelMap && typeof rawModel.thinkingLevelMap === 'object'
          ? (rawModel.thinkingLevelMap as Record<string, string | null>)
          : undefined;

      const thinkingLevel =
        typeof rawModel.thinkingLevel === 'string'
          ? (rawModel.thinkingLevel as ThinkingLevel)
          : undefined;

      const defaultThinkingLevel =
        typeof rawModel.defaultThinkingLevel === 'string'
          ? (rawModel.defaultThinkingLevel as ThinkingLevel)
          : undefined;

      approved.push({
        id: qualifiedId,
        name: modelName,
        provider: providerId,
        reasoning,
        reasoningEfforts,
        thinkingLevelMap,
        thinkingLevel,
        defaultThinkingLevel,
        contextWindow: typeof rawModel.contextWindow === 'number' ? rawModel.contextWindow : undefined,
        maxTokens: typeof rawModel.maxTokens === 'number' ? rawModel.maxTokens : undefined,
        input: Array.isArray(rawModel.input) ? (rawModel.input as string[]) : undefined,
        input_modalities: Array.isArray(rawModel.input_modalities)
          ? (rawModel.input_modalities as string[])
          : undefined,
      });
    }
  }

  return approved;
}

/**
 * Resolves a model definition from a catalog by exact ID, qualified ID, nested slash ID, or name.
 * Disambiguates duplicate base IDs across providers and avoids wrong-provider selection.
 */
export function findModelInCatalog(
  catalog: ModelInfo[],
  target: string | null | undefined,
  preferredProvider?: string
): ModelInfo | null {
  if (!target || typeof target !== 'string') return null;
  const clean = target.trim();
  if (!clean) return null;

  // 1. Exact ID match
  const exact = catalog.find((m) => m.id === clean);
  if (exact) return exact;

  // 2. Exact qualified ID match: qualifyModelId(m.provider, m.id) === clean
  const exactQualified = catalog.find(
    (m) => m.provider && qualifyModelId(m.provider, m.id || '') === clean
  );
  if (exactQualified) return exactQualified;

  // 3. Provider-qualified target match: if target specifies a provider (e.g. "provider/modelId")
  if (clean.includes('/')) {
    const { provider: targetProv, modelId: targetModelId } = splitQualifiedModelId(clean);
    if (targetProv && targetModelId) {
      const provModels = catalog.filter((m) => m.provider === targetProv);
      if (provModels.length > 0) {
        const provMatch = provModels.find(
          (m) =>
            m.id === clean ||
            m.id === targetModelId ||
            (m.id && qualifyModelId(targetProv, m.id) === clean) ||
            (m.id && splitQualifiedModelId(m.id).modelId === targetModelId) ||
            extractModelBaseId(m.id || '') === extractModelBaseId(targetModelId)
        );
        if (provMatch) return provMatch;

        const provNameMatch = provModels.find(
          (m) => m.name === targetModelId || m.name === clean
        );
        if (provNameMatch) return provNameMatch;
      }
      // If target had an explicit provider qualifier, do NOT fall through to models of other providers!
      return null;
    }
  }

  // 4. If preferredProvider is given, check for matches within preferredProvider first
  if (preferredProvider) {
    const prefModels = catalog.filter((m) => m.provider === preferredProvider);
    const prefMatch = prefModels.find(
      (m) =>
        m.id === clean ||
        (m.id && splitQualifiedModelId(m.id).modelId === clean) ||
        extractModelBaseId(m.id || '') === extractModelBaseId(clean) ||
        m.name === clean
    );
    if (prefMatch) return prefMatch;
  }

  // 5. Unqualified target lookup (target does not contain slash)
  const candidates = catalog.filter(
    (m) =>
      m.id === clean ||
      (m.id && splitQualifiedModelId(m.id).modelId === clean) ||
      extractModelBaseId(m.id || '') === extractModelBaseId(clean)
  );

  if (candidates.length === 1) {
    return candidates[0];
  }
  if (candidates.length > 1) {
    // Ambiguous: duplicate base IDs across multiple providers.
    if (preferredProvider) {
      const matched = candidates.find((m) => m.provider === preferredProvider);
      if (matched) return matched;
    }
    // Do not silently select from the wrong provider!
    return null;
  }

  // 6. Name match
  const nameMatches = catalog.filter((m) => m.name === clean);
  if (nameMatches.length === 1) {
    return nameMatches[0];
  }
  if (nameMatches.length > 1 && preferredProvider) {
    const matched = nameMatches.find((m) => m.provider === preferredProvider);
    if (matched) return matched;
  }

  return null;
}
