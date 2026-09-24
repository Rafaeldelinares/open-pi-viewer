import type {
  PiResourceEntry,
  PiResourceKind,
  PiResourceScope,
  SavePiResourcePayload,
} from '@core/types/extensions';

export interface ResourceFormData {
  kind: PiResourceKind;
  scope: PiResourceScope;
  source: string;
  enabled: boolean;
}

export const EMPTY_RESOURCE_FORM: ResourceFormData = {
  kind: 'extension',
  scope: 'global',
  source: '',
  enabled: true,
};

/**
 * Filter resources by query matching name, source, kind, or scope.
 */
export function filterResources(
  resources: PiResourceEntry[],
  query: string
): PiResourceEntry[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return resources;
  }
  return resources.filter((resource) => {
    if (resource.name.toLowerCase().includes(trimmed)) {
      return true;
    }
    if (resource.source.toLowerCase().includes(trimmed)) {
      return true;
    }
    if (resource.kind.toLowerCase().includes(trimmed)) {
      return true;
    }
    if (resource.scope.toLowerCase().includes(trimmed)) {
      return true;
    }
    return false;
  });
}

/**
 * Compute resource counts: total, active, extensions, and packages.
 */
export function computeResourceCounts(resources: PiResourceEntry[]): {
  total: number;
  active: number;
  extensions: number;
  packages: number;
} {
  let active = 0;
  let extensions = 0;
  let packages = 0;
  for (const r of resources) {
    if (r.enabled) active += 1;
    if (r.kind === 'extension') extensions += 1;
    else if (r.kind === 'package') packages += 1;
  }
  return {
    total: resources.length,
    active,
    extensions,
    packages,
  };
}

/**
 * Convert a resource entry into modal form data for editing.
 */
export function resourceToFormData(resource: PiResourceEntry): ResourceFormData {
  return {
    kind: resource.kind,
    scope: resource.scope,
    source: resource.source,
    enabled: resource.enabled,
  };
}

/**
 * Convert modal form data to SavePiResourcePayload.
 */
export function formDataToSavePayload(
  formData: ResourceFormData,
  original?: PiResourceEntry | null,
  cwd?: string
): SavePiResourcePayload {
  return {
    kind: formData.kind,
    source: formData.source.trim(),
    oldSource: original ? original.source : undefined,
    scope: formData.scope,
    enabled: formData.enabled,
    cwd: formData.scope === 'project' ? cwd : undefined,
    raw: original?.raw,
  };
}

/**
 * Immutably calculate state after toggling a resource.
 */
export function calculateToggledResourceState(
  resources: PiResourceEntry[],
  targetId: string,
  nextEnabled: boolean,
  scope?: PiResourceScope
): PiResourceEntry[] {
  return resources.map((r) => {
    if (r.id === targetId) {
      return {
        ...r,
        enabled: nextEnabled,
        autoload: r.kind === 'package' ? nextEnabled : r.autoload,
        hasProjectOverride: scope === 'project' ? true : r.hasProjectOverride,
      };
    }
    return r;
  });
}

/**
 * Immutably calculate state after saving or updating a resource.
 */
export function calculateSavedResourceState(
  resources: PiResourceEntry[],
  entry: PiResourceEntry,
  oldId?: string
): PiResourceEntry[] {
  const targetId = oldId || entry.id;
  const existingIndex = resources.findIndex((r) => r.id === targetId);

  if (existingIndex >= 0) {
    const next = [...resources];
    next[existingIndex] = entry;
    return next;
  }

  return [...resources, entry];
}

/**
 * Immutably calculate state after deleting a resource.
 */
export function calculateDeletedResourceState(
  resources: PiResourceEntry[],
  targetId: string
): PiResourceEntry[] {
  return resources.filter((r) => r.id !== targetId);
}
