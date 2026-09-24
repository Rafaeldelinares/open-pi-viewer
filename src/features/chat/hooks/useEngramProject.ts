import { useState, useEffect, useCallback } from 'react';
import { getEngramProjectPi, getEngramCloudStatusPi, enrollEngramProjectPi, type EngramCloudStatus } from '@infra/bridge';

export interface UseEngramProjectOptions {
  cwd?: string;
}

export interface UseEngramProjectReturn {
  engramProject: string | null;
  refreshEngramProject: () => Promise<void>;
  cloudStatus: EngramCloudStatus | null;
  isCheckingCloud: boolean;
  checkCloudStatus: () => Promise<EngramCloudStatus | null>;
  isEnrolling: boolean;
  enrollProject: () => Promise<boolean>;
}

export function useEngramProject({ cwd }: UseEngramProjectOptions = {}): UseEngramProjectReturn {
  const [engramProject, setEngramProject] = useState<string | null>(null);
  const [cloudStatus, setCloudStatus] = useState<EngramCloudStatus | null>(null);
  const [isCheckingCloud, setIsCheckingCloud] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);

  const checkCloudStatus = useCallback(async (): Promise<EngramCloudStatus | null> => {
    setIsCheckingCloud(true);
    try {
      const status = await getEngramCloudStatusPi(engramProject ?? undefined, cwd);
      if (!status) {
        setCloudStatus(null);
        return null;
      }

      let merged: EngramCloudStatus = { ...status };

      if (status.daemonRunning) {
        try {
          const port = status.daemonPort || 7437;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1500);
          const projectParam = engramProject ? `?project=${encodeURIComponent(engramProject)}` : '';
          const res = await fetch(`http://127.0.0.1:${port}/sync/status${projectParam}`, {
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (res.ok) {
            const data = await res.json();
            if (data && typeof data === 'object') {
              merged = {
                ...merged,
                phase: data.phase ?? merged.phase,
                lastSyncAt: data.last_sync_at ?? merged.lastSyncAt,
                lastError: data.last_error ?? data.reason_message ?? merged.lastError,
                reasonCode: data.reason_code ?? merged.reasonCode,
              };
            }
          }
        } catch {
          // Daemon fetch failed or timed out; keep CLI status
        }
      }

      setCloudStatus(merged);
      return merged;
    } catch {
      setCloudStatus(null);
      return null;
    } finally {
      setIsCheckingCloud(false);
    }
  }, [engramProject, cwd]);

  const refreshEngramProject = useCallback(async () => {
    try {
      const project = await getEngramProjectPi(cwd);
      setEngramProject(project);
    } catch {
      setEngramProject(null);
    }
  }, [cwd]);

  const enrollProject = useCallback(async (): Promise<boolean> => {
    if (!engramProject) {
      return false;
    }
    setIsEnrolling(true);
    try {
      const ok = await enrollEngramProjectPi(engramProject, cwd);
      if (ok) {
        await checkCloudStatus();
      }
      return ok;
    } catch {
      return false;
    } finally {
      setIsEnrolling(false);
    }
  }, [engramProject, cwd, checkCloudStatus]);

  useEffect(() => {
    let cancelled = false;
    setCloudStatus(null);
    void (async () => {
      try {
        const project = await getEngramProjectPi(cwd);
        if (!cancelled) {
          setEngramProject(project);
        }
      } catch {
        if (!cancelled) {
          setEngramProject(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  return {
    engramProject,
    refreshEngramProject,
    cloudStatus,
    isCheckingCloud,
    checkCloudStatus,
    isEnrolling,
    enrollProject,
  };
}

