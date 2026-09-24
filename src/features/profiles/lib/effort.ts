import {
  type ThinkingLevel,
  type ModelThinkingLevelsMap,
  clampThinkingLevelToSupported,
  resolveModelDefaultThinkingLevel,
} from '@core/types/models';
import type { ReasoningEffort } from '@core/types/profiles';

export type { ModelThinkingLevelsMap };
export {
  clampThinkingLevelToSupported,
  resolveModelDefaultThinkingLevel,
};

/**
 * Ensures reasoning effort is compatible with the model's supported efforts.
 * - Empty string ('') means inherit / model default: always valid and never forced.
 * - Valid 'off' choice is preserved and never indiscriminately disabled.
 * - If model only supports 'off', non-empty effort becomes 'off'.
 * - Out-of-bounds efforts are clamped to the nearest supported level.
 */
export function resolveCompatibleEffort(
  currentEffort: ReasoningEffort | '' | string | undefined,
  supportedEfforts: readonly (ThinkingLevel | ReasoningEffort)[] | undefined
): ReasoningEffort | '' {
  // Empty effort means inherit / model default: always preserved
  if (!currentEffort || currentEffort === '') {
    return '';
  }

  const efforts =
    supportedEfforts && supportedEfforts.length > 0
      ? supportedEfforts
      : ['low', 'medium', 'high'];

  // Already supported
  if (efforts.includes(currentEffort as ThinkingLevel)) {
    return currentEffort as ReasoningEffort;
  }

  // If model only supports 'off'
  if (efforts.includes('off') && efforts.length === 1) {
    return 'off';
  }

  // Out-of-range: clamp to nearest supported level
  return clampThinkingLevelToSupported(
    currentEffort as ThinkingLevel,
    efforts as ThinkingLevel[]
  ) as ReasoningEffort;
}
