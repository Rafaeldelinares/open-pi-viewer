import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWorkspaceKey,
  cloneSnapshot,
  getWorkspaceSnapshot,
  updateWorkspaceSnapshot,
  hasWorkspaceSnapshot,
  deleteWorkspaceSnapshot,
  clearWorkspaceCache,
  subscribeWorkspaceCache,
  refreshWorkspaceCache,
  type WorkspaceCacheSnapshot,
} from '@features/workspace/workspace-cache';
import type { WorkspaceEntry, WorkspaceGitStatus } from '@core/types/workspace';

test('normalizeWorkspaceKey: normalizes POSIX, Windows, and empty paths consistently', () => {
  assert.strictEqual(normalizeWorkspaceKey(''), '');
  assert.strictEqual(normalizeWorkspaceKey(null), '');
  assert.strictEqual(normalizeWorkspaceKey(undefined), '');

  // POSIX paths
  assert.strictEqual(normalizeWorkspaceKey('/home/user/project/'), '/home/user/project');
  assert.strictEqual(normalizeWorkspaceKey('/var//log//'), '/var/log');

  // Windows paths: forward slashes, case-insensitivity
  const win1 = normalizeWorkspaceKey('C:\\Users\\Personal\\project');
  const win2 = normalizeWorkspaceKey('c:/users/personal/project/');
  assert.strictEqual(win1, win2);
  assert.strictEqual(win1, 'c:/users/personal/project');
});

test('cloneSnapshot: deep-clones mutable Sets, objects, and arrays to prevent leaks', () => {
  const original: WorkspaceCacheSnapshot = {
    rootEntries: [
      { name: 'src', relativePath: 'src', isDir: true },
      { name: 'package.json', relativePath: 'package.json', isDir: false, size: 1024 },
    ],
    gitStatus: {
      isRepo: true,
      repoName: 'pi-viewer',
      branch: 'main',
      modifiedFiles: ['src/App.tsx'],
      addedFiles: ['new.ts'],
      untrackedFiles: ['temp.log'],
    },
    expandedDirs: new Set(['src', 'src/features']),
    dirChildren: {
      src: [{ name: 'index.ts', relativePath: 'src/index.ts', isDir: false }],
    },
    loaded: true,
    timestamp: 123456789,
  };

  const cloned = cloneSnapshot(original);

  // Values should be equal
  assert.deepStrictEqual(cloned.rootEntries, original.rootEntries);
  assert.deepStrictEqual(cloned.gitStatus, original.gitStatus);
  assert.deepStrictEqual(Array.from(cloned.expandedDirs), Array.from(original.expandedDirs));
  assert.deepStrictEqual(cloned.dirChildren, original.dirChildren);
  assert.strictEqual(cloned.loaded, original.loaded);
  assert.strictEqual(cloned.timestamp, original.timestamp);

  // References should NOT be identical
  assert.notStrictEqual(cloned.expandedDirs, original.expandedDirs);
  assert.notStrictEqual(cloned.dirChildren, original.dirChildren);
  assert.notStrictEqual(cloned.rootEntries, original.rootEntries);
  assert.notStrictEqual(cloned.gitStatus, original.gitStatus);
  assert.notStrictEqual(cloned.gitStatus?.modifiedFiles, original.gitStatus?.modifiedFiles);

  // Mutating the clone should NOT affect the original
  cloned.expandedDirs.add('new-dir');
  assert.strictEqual(original.expandedDirs.has('new-dir'), false);

  cloned.dirChildren['src'].push({ name: 'other.ts', relativePath: 'src/other.ts', isDir: false });
  assert.strictEqual(original.dirChildren['src'].length, 1);

  cloned.rootEntries.pop();
  assert.strictEqual(original.rootEntries.length, 2);

  cloned.gitStatus?.modifiedFiles?.push('extra.ts');
  assert.strictEqual(original.gitStatus?.modifiedFiles?.length, 1);
});

test('workspace cache: getWorkspaceSnapshot returns cloned instance and does not leak mutations', () => {
  clearWorkspaceCache();

  const cwd = '/home/user/app';
  assert.strictEqual(getWorkspaceSnapshot(cwd), null);
  assert.strictEqual(hasWorkspaceSnapshot(cwd), false);

  const initialEntries: WorkspaceEntry[] = [
    { name: 'README.md', relativePath: 'README.md', isDir: false },
  ];
  const initialExpanded = new Set(['docs']);
  const initialChildren: Record<string, WorkspaceEntry[]> = {
    docs: [{ name: 'intro.md', relativePath: 'docs/intro.md', isDir: false }],
  };

  updateWorkspaceSnapshot(cwd, {
    rootEntries: initialEntries,
    expandedDirs: initialExpanded,
    dirChildren: initialChildren,
    loaded: true,
  });

  assert.strictEqual(hasWorkspaceSnapshot(cwd), true);
  const snap1 = getWorkspaceSnapshot(cwd);
  assert.ok(snap1);
  assert.strictEqual(snap1.loaded, true);
  assert.strictEqual(snap1.rootEntries.length, 1);

  // Mutate retrieved snapshot
  snap1.expandedDirs.add('mutated');
  snap1.rootEntries.push({ name: 'leak.ts', relativePath: 'leak.ts', isDir: false });

  // Next get should not see those mutations
  const snap2 = getWorkspaceSnapshot(cwd);
  assert.ok(snap2);
  assert.strictEqual(snap2.expandedDirs.has('mutated'), false);
  assert.strictEqual(snap2.rootEntries.length, 1);
});

test('workspace cache: updateWorkspaceSnapshot merges partial updates preserving existing fields', () => {
  clearWorkspaceCache();

  const cwd = '/home/user/project-x';
  updateWorkspaceSnapshot(cwd, {
    rootEntries: [{ name: 'a.txt', relativePath: 'a.txt', isDir: false }],
    loaded: true,
  });

  const gitStatus: WorkspaceGitStatus = {
    isRepo: true,
    repoName: 'repo-x',
    branch: 'feat',
    modifiedFiles: ['a.txt'],
    addedFiles: [],
    untrackedFiles: [],
  };

  updateWorkspaceSnapshot(cwd, {
    gitStatus,
  });

  const updated = getWorkspaceSnapshot(cwd);
  assert.ok(updated);
  assert.strictEqual(updated.loaded, true);
  assert.strictEqual(updated.rootEntries.length, 1);
  assert.strictEqual(updated.rootEntries[0].name, 'a.txt');
  assert.deepStrictEqual(updated.gitStatus, gitStatus);
});

test('workspace cache: subscribeWorkspaceCache receives clones and cleans up properly', () => {
  clearWorkspaceCache();

  const cwdA = '/home/user/repo-a';
  const cwdB = '/home/user/repo-b';

  const notificationsA: WorkspaceCacheSnapshot[] = [];
  const unsubscribeA = subscribeWorkspaceCache(cwdA, (snapshot) => {
    notificationsA.push(snapshot);
  });

  const notificationsB: WorkspaceCacheSnapshot[] = [];
  const unsubscribeB = subscribeWorkspaceCache(cwdB, (snapshot) => {
    notificationsB.push(snapshot);
  });

  updateWorkspaceSnapshot(cwdA, {
    rootEntries: [{ name: 'a.ts', relativePath: 'a.ts', isDir: false }],
    loaded: true,
  });

  assert.strictEqual(notificationsA.length, 1);
  assert.strictEqual(notificationsB.length, 0);
  assert.strictEqual(notificationsA[0].rootEntries[0].name, 'a.ts');

  // Updating repo B only notifies B
  updateWorkspaceSnapshot(cwdB, {
    rootEntries: [{ name: 'b.ts', relativePath: 'b.ts', isDir: false }],
    loaded: true,
  });

  assert.strictEqual(notificationsA.length, 1);
  assert.strictEqual(notificationsB.length, 1);
  assert.strictEqual(notificationsB[0].rootEntries[0].name, 'b.ts');

  // Unsubscribe stops notifications
  unsubscribeA();
  updateWorkspaceSnapshot(cwdA, {
    loaded: false,
  });
  assert.strictEqual(notificationsA.length, 1);

  unsubscribeB();
});

test('workspace cache: deleteWorkspaceSnapshot and clearWorkspaceCache manage entries cleanly', () => {
  clearWorkspaceCache();

  updateWorkspaceSnapshot('/path/1', { loaded: true });
  updateWorkspaceSnapshot('/path/2', { loaded: true });

  assert.strictEqual(hasWorkspaceSnapshot('/path/1'), true);
  assert.strictEqual(hasWorkspaceSnapshot('/path/2'), true);

  assert.strictEqual(deleteWorkspaceSnapshot('/path/1'), true);
  assert.strictEqual(hasWorkspaceSnapshot('/path/1'), false);
  assert.strictEqual(hasWorkspaceSnapshot('/path/2'), true);

  clearWorkspaceCache();
  assert.strictEqual(hasWorkspaceSnapshot('/path/2'), false);
});

test('workspace cache: refreshWorkspaceCache coalesces concurrent requests to avoid duplicate IPC', async () => {
  clearWorkspaceCache();
  const cwd = '/home/user/coalesce-test';

  let listCalls = 0;
  let gitCalls = 0;

  const mockListDir = async () => {
    listCalls++;
    // Simulate slight delay to allow concurrent calls to join
    await new Promise((resolve) => setTimeout(resolve, 20));
    return [
      { name: 'index.ts', relativePath: 'index.ts', isDir: false },
    ];
  };

  const mockGitStatus = async () => {
    gitCalls++;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return {
      isRepo: true,
      repoName: 'coalesce-test',
      branch: 'main',
      modifiedFiles: [],
      addedFiles: [],
      untrackedFiles: [],
    };
  };

  // Launch 3 simultaneous refreshes
  const [res1, res2, res3] = await Promise.all([
    refreshWorkspaceCache(cwd, { listDirFn: mockListDir, gitStatusFn: mockGitStatus }),
    refreshWorkspaceCache(cwd, { listDirFn: mockListDir, gitStatusFn: mockGitStatus }),
    refreshWorkspaceCache(cwd, { listDirFn: mockListDir, gitStatusFn: mockGitStatus }),
  ]);

  // IPC methods should have been called exactly once!
  assert.strictEqual(listCalls, 1, 'listWorkspaceDir called only once across concurrent requests');
  assert.strictEqual(gitCalls, 1, 'getWorkspaceGitStatus called only once across concurrent requests');

  // All 3 callers receive the resolved snapshot
  assert.strictEqual(res1.loaded, true);
  assert.strictEqual(res2.loaded, true);
  assert.strictEqual(res3.loaded, true);
  assert.strictEqual(res1.rootEntries.length, 1);
  assert.strictEqual(res2.rootEntries[0].name, 'index.ts');
  assert.strictEqual(res3.gitStatus?.repoName, 'coalesce-test');

  // Cached state is also updated
  const cached = getWorkspaceSnapshot(cwd);
  assert.ok(cached);
  assert.strictEqual(cached.loaded, true);
  assert.strictEqual(cached.rootEntries.length, 1);
});

test('workspace cache: refreshWorkspaceCache revalidates expanded directories', async () => {
  clearWorkspaceCache();
  const cwd = '/home/user/revalidate-test';

  // Seed cache with an expanded directory
  updateWorkspaceSnapshot(cwd, {
    rootEntries: [{ name: 'src', relativePath: 'src', isDir: true }],
    expandedDirs: new Set(['src']),
    loaded: true,
  });

  const dirScans: string[] = [];
  const mockListDir = async (payload?: { workingDirectory?: string; relativePath?: string }) => {
    if (payload?.relativePath) {
      dirScans.push(payload.relativePath);
      return [
        { name: 'App.tsx', relativePath: 'src/App.tsx', isDir: false },
      ];
    }
    return [{ name: 'src', relativePath: 'src', isDir: true }];
  };

  const snapshot = await refreshWorkspaceCache(cwd, {
    revalidateExpanded: true,
    listDirFn: mockListDir,
  });

  assert.strictEqual(dirScans.length, 1);
  assert.strictEqual(dirScans[0], 'src');
  assert.ok(snapshot.dirChildren['src']);
  assert.strictEqual(snapshot.dirChildren['src'].length, 1);
  assert.strictEqual(snapshot.dirChildren['src'][0].name, 'App.tsx');
});

test('workspace cache: concurrent revalidateExpanded upgrades root-only in-flight refresh without duplicate IPC', async () => {
  clearWorkspaceCache();
  const cwd = '/home/user/upgrade-test';

  // Seed cache with an expanded directory
  updateWorkspaceSnapshot(cwd, {
    rootEntries: [{ name: 'src', relativePath: 'src', isDir: true }],
    expandedDirs: new Set(['src']),
    loaded: true,
  });

  let rootListCalls = 0;
  let gitCalls = 0;
  const dirScans: string[] = [];

  const mockListDir = async (payload?: { workingDirectory?: string; relativePath?: string }) => {
    if (payload?.relativePath) {
      dirScans.push(payload.relativePath);
      return [
        { name: 'App.tsx', relativePath: 'src/App.tsx', isDir: false },
      ];
    }
    rootListCalls++;
    // Delay to simulate in-flight root query
    await new Promise((resolve) => setTimeout(resolve, 30));
    return [{ name: 'src', relativePath: 'src', isDir: true }];
  };

  const mockGitStatus = async () => {
    gitCalls++;
    await new Promise((resolve) => setTimeout(resolve, 30));
    return {
      isRepo: true,
      repoName: 'upgrade-test',
      branch: 'main',
      modifiedFiles: [],
      addedFiles: [],
      untrackedFiles: [],
    };
  };

  // 1. Start root-only refresh (revalidateExpanded: false)
  const pRoot = refreshWorkspaceCache(cwd, {
    revalidateExpanded: false,
    listDirFn: mockListDir,
    gitStatusFn: mockGitStatus,
  });

  // 2. Concurrently while pRoot is in flight, request with revalidateExpanded: true
  const pExpanded = refreshWorkspaceCache(cwd, {
    revalidateExpanded: true,
    listDirFn: mockListDir,
    gitStatusFn: mockGitStatus,
  });

  // 3. Await both
  const [resRoot, resExpanded] = await Promise.all([pRoot, pExpanded]);

  assert.strictEqual(resRoot.loaded, true, 'Root-only response loaded');
  assert.strictEqual(resRoot.rootEntries.length, 1);

  // Root list & git status must have been invoked ONLY ONCE across both calls
  assert.strictEqual(rootListCalls, 1, 'Root directory listed only once');
  assert.strictEqual(gitCalls, 1, 'Git status checked only once');

  // The expanded directory must have been scanned!
  assert.strictEqual(dirScans.length, 1, 'Expanded directory was scanned');
  assert.strictEqual(dirScans[0], 'src');

  // resExpanded must have dirChildren populated for 'src'
  assert.ok(resExpanded.dirChildren['src'], 'Expanded directory children are present in result');
  assert.strictEqual(resExpanded.dirChildren['src'].length, 1);
  assert.strictEqual(resExpanded.dirChildren['src'][0].name, 'App.tsx');

  // Cache is updated with the expanded scan
  const cached = getWorkspaceSnapshot(cwd);
  assert.ok(cached?.dirChildren['src']);
  assert.strictEqual(cached?.dirChildren['src'].length, 1);
});
