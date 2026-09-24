import { normalizeWorkingDirectory, isWindowsPath } from '@core/session';
import { listWorkspaceDirPi, getWorkspaceGitStatusPi } from '@infra/bridge';
import type { WorkspaceEntry, WorkspaceGitStatus } from '@core/types/workspace';

export interface WorkspaceCacheSnapshot {
  rootEntries: WorkspaceEntry[];
  gitStatus: WorkspaceGitStatus | null;
  expandedDirs: Set<string>;
  dirChildren: Record<string, WorkspaceEntry[]>;
  loaded: boolean;
  timestamp: number;
}

export type WorkspaceCacheListener = (snapshot: WorkspaceCacheSnapshot) => void;

/**
 * Normalizes a working directory to create a consistent cache key.
 * On Windows, normalizes path separators and drive casing, then performs case-insensitive keying.
 */
export function normalizeWorkspaceKey(cwd?: string | null): string {
  if (!cwd) return '';
  const norm = normalizeWorkingDirectory(cwd);
  const collapsed = norm.replace(/\/{2,}/g, '/');
  return isWindowsPath(collapsed) ? collapsed.toLowerCase() : collapsed;
}

/**
 * Pure helper to update dirChildren state given previous children and settled scan results.
 */
export function updateDirChildrenOnRefresh(
  prevChildren: Record<string, WorkspaceEntry[]>,
  results: Array<{ dirPath: string; children?: WorkspaceEntry[] }>
): Record<string, WorkspaceEntry[]> {
  const next = { ...prevChildren };
  for (const item of results) {
    if (item.children) {
      next[item.dirPath] = item.children;
    } else {
      delete next[item.dirPath];
    }
  }
  return next;
}

/**
 * Pure helper to prune expandedDirs set when directories fail to scan or no longer exist.
 */
export function pruneExpandedDirsOnRefresh(
  prevDirs: Set<string>,
  results: Array<{ dirPath: string; success: boolean }>
): Set<string> {
  let changed = false;
  const next = new Set(prevDirs);
  for (const item of results) {
    if (!item.success && next.has(item.dirPath)) {
      next.delete(item.dirPath);
      changed = true;
    }
  }
  return changed ? next : prevDirs;
}

/**
 * Deep clones a snapshot so internal cache state cannot be accidentally mutated outside.
 */
export function cloneSnapshot(snapshot: WorkspaceCacheSnapshot): WorkspaceCacheSnapshot {
  const clonedDirChildren: Record<string, WorkspaceEntry[]> = {};
  for (const [key, entries] of Object.entries(snapshot.dirChildren)) {
    clonedDirChildren[key] = [...entries];
  }

  return {
    rootEntries: [...snapshot.rootEntries],
    gitStatus: snapshot.gitStatus
      ? {
          ...snapshot.gitStatus,
          modifiedFiles: snapshot.gitStatus.modifiedFiles ? [...snapshot.gitStatus.modifiedFiles] : [],
          addedFiles: snapshot.gitStatus.addedFiles ? [...snapshot.gitStatus.addedFiles] : [],
          untrackedFiles: snapshot.gitStatus.untrackedFiles ? [...snapshot.gitStatus.untrackedFiles] : [],
        }
      : null,
    expandedDirs: new Set(snapshot.expandedDirs),
    dirChildren: clonedDirChildren,
    loaded: snapshot.loaded,
    timestamp: snapshot.timestamp,
  };
}

interface InFlightRefreshState {
  promise: Promise<WorkspaceCacheSnapshot>;
  hasRevalidateExpanded: boolean;
}

const cacheStore = new Map<string, WorkspaceCacheSnapshot>();
const listeners = new Map<string, Set<WorkspaceCacheListener>>();
const inFlightRefreshes = new Map<string, InFlightRefreshState>();

/**
 * Retrieves the snapshot for a given working directory, or null if none exists.
 * Always returns a cloned copy to prevent external mutations from leaking into the cache.
 */
export function getWorkspaceSnapshot(cwd?: string | null): WorkspaceCacheSnapshot | null {
  const key = normalizeWorkspaceKey(cwd);
  if (!key) return null;
  const snap = cacheStore.get(key);
  return snap ? cloneSnapshot(snap) : null;
}

/**
 * Checks if a valid snapshot exists for the given working directory.
 */
export function hasWorkspaceSnapshot(cwd?: string | null): boolean {
  const key = normalizeWorkspaceKey(cwd);
  if (!key) return false;
  return cacheStore.has(key);
}

/**
 * Sets or updates snapshot fields for a given working directory.
 * Clones all input collections and notifies subscribers for the directory.
 */
export function updateWorkspaceSnapshot(
  cwd: string,
  update: Partial<WorkspaceCacheSnapshot>
): WorkspaceCacheSnapshot {
  const key = normalizeWorkspaceKey(cwd);
  if (!key) {
    throw new Error('Cannot update workspace snapshot without a valid working directory');
  }

  const prev = cacheStore.get(key);
  const base: WorkspaceCacheSnapshot = prev
    ? cloneSnapshot(prev)
    : {
        rootEntries: [],
        gitStatus: null,
        expandedDirs: new Set(),
        dirChildren: {},
        loaded: false,
        timestamp: Date.now(),
      };

  if (update.rootEntries !== undefined) {
    base.rootEntries = [...update.rootEntries];
  }
  if (update.gitStatus !== undefined) {
    base.gitStatus = update.gitStatus
      ? {
          ...update.gitStatus,
          modifiedFiles: update.gitStatus.modifiedFiles ? [...update.gitStatus.modifiedFiles] : [],
          addedFiles: update.gitStatus.addedFiles ? [...update.gitStatus.addedFiles] : [],
          untrackedFiles: update.gitStatus.untrackedFiles ? [...update.gitStatus.untrackedFiles] : [],
        }
      : null;
  }
  if (update.expandedDirs !== undefined) {
    base.expandedDirs = new Set(update.expandedDirs);
  }
  if (update.dirChildren !== undefined) {
    const nextChildren: Record<string, WorkspaceEntry[]> = {};
    for (const [k, v] of Object.entries(update.dirChildren)) {
      nextChildren[k] = [...v];
    }
    base.dirChildren = nextChildren;
  }
  if (update.loaded !== undefined) {
    base.loaded = update.loaded;
  }
  base.timestamp = update.timestamp ?? Date.now();

  cacheStore.set(key, base);

  // Notify listeners with an independent clone
  const subscriberSet = listeners.get(key);
  if (subscriberSet) {
    for (const listener of subscriberSet) {
      listener(cloneSnapshot(base));
    }
  }

  return cloneSnapshot(base);
}

/**
 * Subscribes a listener to snapshot changes for a specific working directory.
 */
export function subscribeWorkspaceCache(
  cwd: string,
  listener: WorkspaceCacheListener
): () => void {
  const key = normalizeWorkspaceKey(cwd);
  if (!key) return () => {};

  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);

  return () => {
    const currentSet = listeners.get(key);
    if (currentSet) {
      currentSet.delete(listener);
      if (currentSet.size === 0) {
        listeners.delete(key);
      }
    }
  };
}

/**
 * Clears all entries and in-flight promises from the module cache.
 */
export function clearWorkspaceCache(): void {
  cacheStore.clear();
  inFlightRefreshes.clear();
  listeners.clear();
}

/**
 * Deletes snapshot for a specific working directory.
 */
export function deleteWorkspaceSnapshot(cwd: string): boolean {
  const key = normalizeWorkspaceKey(cwd);
  if (!key) return false;
  return cacheStore.delete(key);
}

export interface RefreshWorkspaceOptions {
  revalidateExpanded?: boolean;
  listDirFn?: (payload?: { workingDirectory?: string; relativePath?: string }) => Promise<WorkspaceEntry[]>;
  gitStatusFn?: (workingDirectory?: string) => Promise<WorkspaceGitStatus>;
}

async function scanExpandedDirectories(
  workingDirectory: string,
  key: string,
  listDir: (payload?: { workingDirectory?: string; relativePath?: string }) => Promise<WorkspaceEntry[]>
): Promise<{ nextDirChildren: Record<string, WorkspaceEntry[]>; nextExpandedDirs: Set<string> }> {
  const currentSnapshot = cacheStore.get(key);
  let nextDirChildren = currentSnapshot?.dirChildren ? { ...currentSnapshot.dirChildren } : {};
  let nextExpandedDirs = currentSnapshot?.expandedDirs ? new Set(currentSnapshot.expandedDirs) : new Set<string>();

  if (nextExpandedDirs.size > 0) {
    const currentExpanded = Array.from(nextExpandedDirs);
    const scanResults = await Promise.allSettled(
      currentExpanded.map(async (dirPath) => {
        const children = await listDir({
          workingDirectory,
          relativePath: dirPath,
        });
        return { dirPath, children };
      })
    );

    const childrenUpdates: Array<{ dirPath: string; children?: WorkspaceEntry[] }> = [];
    const pruneItems: Array<{ dirPath: string; success: boolean }> = [];

    for (let i = 0; i < scanResults.length; i++) {
      const res = scanResults[i];
      const dirPath = currentExpanded[i];
      if (res.status === 'fulfilled') {
        childrenUpdates.push({ dirPath, children: res.value.children });
        pruneItems.push({ dirPath, success: true });
      } else {
        childrenUpdates.push({ dirPath, children: undefined });
        pruneItems.push({ dirPath, success: false });
      }
    }

    nextDirChildren = updateDirChildrenOnRefresh(nextDirChildren, childrenUpdates);
    nextExpandedDirs = pruneExpandedDirsOnRefresh(nextExpandedDirs, pruneItems);
  }

  return { nextDirChildren, nextExpandedDirs };
}

/**
 * Coalesced async fetcher: fetches root entries and git status (and optionally revalidates expanded directories).
 * If a fetch is already in flight for this directory, returns the existing promise to avoid duplicate IPC calls.
 * If a root-only fetch is in flight and a stronger request arrives with revalidateExpanded: true, chains
 * expanded directory scanning onto root completion without repeating root or git IPC.
 */
export async function refreshWorkspaceCache(
  workingDirectory: string,
  options?: RefreshWorkspaceOptions
): Promise<WorkspaceCacheSnapshot> {
  const key = normalizeWorkspaceKey(workingDirectory);
  if (!key) {
    throw new Error('Cannot refresh workspace cache without a working directory');
  }

  const wantsExpanded = Boolean(options?.revalidateExpanded);
  const existing = inFlightRefreshes.get(key);

  if (existing) {
    if (existing.hasRevalidateExpanded || !wantsExpanded) {
      return existing.promise;
    }

    const listDir = options?.listDirFn ?? listWorkspaceDirPi;
    const runUpgrade = async (): Promise<WorkspaceCacheSnapshot> => {
      await existing.promise;
      const { nextDirChildren, nextExpandedDirs } = await scanExpandedDirectories(
        workingDirectory,
        key,
        listDir
      );
      return updateWorkspaceSnapshot(workingDirectory, {
        dirChildren: nextDirChildren,
        expandedDirs: nextExpandedDirs,
      });
    };

    const upgradedPromise: Promise<WorkspaceCacheSnapshot> = runUpgrade().finally(() => {
      if (inFlightRefreshes.get(key)?.promise === upgradedPromise) {
        inFlightRefreshes.delete(key);
      }
    });

    inFlightRefreshes.set(key, {
      promise: upgradedPromise,
      hasRevalidateExpanded: true,
    });

    return upgradedPromise;
  }

  const listDir = options?.listDirFn ?? listWorkspaceDirPi;
  const getGitStatus = options?.gitStatusFn ?? getWorkspaceGitStatusPi;

  const runFetch = async (): Promise<WorkspaceCacheSnapshot> => {
    const [entries, git] = await Promise.all([
      listDir({ workingDirectory }),
      getGitStatus(workingDirectory).catch(() => ({
        isRepo: false,
        repoName: null,
        branch: null,
        modifiedFiles: [],
        addedFiles: [],
        untrackedFiles: [],
      })),
    ]);

    let nextDirChildren: Record<string, WorkspaceEntry[]> = {};
    let nextExpandedDirs: Set<string> = new Set<string>();

    const currentSnapshot = cacheStore.get(key);
    if (currentSnapshot?.dirChildren) {
      nextDirChildren = { ...currentSnapshot.dirChildren };
    }
    if (currentSnapshot?.expandedDirs) {
      nextExpandedDirs = new Set(currentSnapshot.expandedDirs);
    }

    if (wantsExpanded && nextExpandedDirs.size > 0) {
      const scanRes = await scanExpandedDirectories(workingDirectory, key, listDir);
      nextDirChildren = scanRes.nextDirChildren;
      nextExpandedDirs = scanRes.nextExpandedDirs;
    }

    return updateWorkspaceSnapshot(workingDirectory, {
      rootEntries: entries,
      gitStatus: git,
      dirChildren: nextDirChildren,
      expandedDirs: nextExpandedDirs,
      loaded: true,
      timestamp: Date.now(),
    });
  };

  const fetchPromise: Promise<WorkspaceCacheSnapshot> = runFetch().finally(() => {
    if (inFlightRefreshes.get(key)?.promise === fetchPromise) {
      inFlightRefreshes.delete(key);
    }
  });

  inFlightRefreshes.set(key, {
    promise: fetchPromise,
    hasRevalidateExpanded: wantsExpanded,
  });

  return fetchPromise;
}
