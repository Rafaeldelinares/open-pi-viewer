import { useState, useCallback, useEffect, useRef } from 'react';
import type { WorkspaceFileContent, WorkspaceGitStatus } from '@core/types/workspace';
import { computeTotalGitChanges } from '../FileTree';
import {
  getWorkspaceSnapshot,
  subscribeWorkspaceCache,
  refreshWorkspaceCache,
} from '../workspace-cache';

export interface UseWorkspaceViewOptions {
  workingDirectory?: string;
  refreshInterval?: number;
}

export interface UseWorkspaceViewResult {
  viewingFile: WorkspaceFileContent | null;
  openFile: (file: WorkspaceFileContent) => void;
  closeFile: () => void;
  fileTreeRefreshTrigger: number;
  requestFileTreeRefresh: () => void;
  gitChangesCount: number;
  handleGitStatusChange: (status: WorkspaceGitStatus | null) => void;
}

/**
 * Owns workspace file-viewer modal state, background polling, and per-workspace git changes count.
 * Preloads root entries and git status as soon as an active project working directory is set,
 * and maintains background polling/visibility refresh even when FileTree is unmounted.
 */
export function useWorkspaceView(
  workingDirectoryOrOptions?: string | UseWorkspaceViewOptions,
  refreshIntervalArg?: number
): UseWorkspaceViewResult {
  const workingDirectory =
    typeof workingDirectoryOrOptions === 'object' && workingDirectoryOrOptions !== null
      ? workingDirectoryOrOptions.workingDirectory
      : workingDirectoryOrOptions;

  const refreshInterval =
    typeof workingDirectoryOrOptions === 'object' && workingDirectoryOrOptions !== null
      ? workingDirectoryOrOptions.refreshInterval
      : refreshIntervalArg;

  const [viewingFile, setViewingFile] = useState<WorkspaceFileContent | null>(null);
  const [fileTreeRefreshTrigger, setFileTreeRefreshTrigger] = useState<number>(0);
  const [gitChangesCount, setGitChangesCount] = useState<number>(() => {
    const cached = getWorkspaceSnapshot(workingDirectory);
    return cached?.gitStatus ? computeTotalGitChanges(cached.gitStatus) : 0;
  });

  const cwdRef = useRef(workingDirectory);
  cwdRef.current = workingDirectory;

  const openFile = (file: WorkspaceFileContent) => {
    setViewingFile(file);
  };

  const closeFile = () => {
    setViewingFile(null);
  };

  const requestFileTreeRefresh = useCallback(() => {
    setFileTreeRefreshTrigger((prev) => prev + 1);
    if (cwdRef.current) {
      void refreshWorkspaceCache(cwdRef.current, { revalidateExpanded: true }).catch(() => {});
    }
  }, []);

  const handleGitStatusChange = useCallback((status: WorkspaceGitStatus | null) => {
    setGitChangesCount(computeTotalGitChanges(status));
  }, []);

  // Preload and synchronize git count when workingDirectory changes
  useEffect(() => {
    if (!workingDirectory) {
      setGitChangesCount(0);
      return;
    }

    // Hydrate gitChangesCount synchronously from cache to avoid showing stale prior project data
    const cached = getWorkspaceSnapshot(workingDirectory);
    if (cached) {
      setGitChangesCount(computeTotalGitChanges(cached.gitStatus));
    } else {
      setGitChangesCount(0);
    }

    // Preload root entries and git status immediately
    void refreshWorkspaceCache(workingDirectory)
      .then((snapshot) => {
        if (cwdRef.current === workingDirectory) {
          setGitChangesCount(computeTotalGitChanges(snapshot.gitStatus));
        }
      })
      .catch(() => {});

    // Subscribe to cache updates (e.g. from FileTree interactions or background refresh)
    const unsubscribe = subscribeWorkspaceCache(workingDirectory, (snapshot) => {
      if (cwdRef.current === workingDirectory) {
        setGitChangesCount(computeTotalGitChanges(snapshot.gitStatus));
      }
    });

    return () => {
      unsubscribe();
    };
  }, [workingDirectory]);

  // Background polling and visibility refresh
  const effectiveInterval =
    typeof refreshInterval === 'number' && refreshInterval >= 0
      ? refreshInterval
      : 15;

  useEffect(() => {
    if (!workingDirectory || effectiveInterval <= 0) return;

    const intervalMs = effectiveInterval * 1000;
    const timer = setInterval(() => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      ) {
        return;
      }
      void refreshWorkspaceCache(workingDirectory, { revalidateExpanded: true }).catch(() => {});
    }, intervalMs);

    const handleVisibilityChange = () => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible'
      ) {
        void refreshWorkspaceCache(workingDirectory, { revalidateExpanded: true }).catch(() => {});
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      clearInterval(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [workingDirectory, effectiveInterval]);

  return {
    viewingFile,
    openFile,
    closeFile,
    fileTreeRefreshTrigger,
    requestFileTreeRefresh,
    gitChangesCount,
    handleGitStatusChange,
  };
}
