import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyOptimisticToggle,
  revertOptimisticToggle,
  executeMcpToggle,
} from '@features/mcp/hooks/useMcpServers';
import { computeMcpServerCounts } from '@features/mcp/McpView';
import type {
  McpServerConfig,
  ToggleMcpServerPayload,
  ToggleMcpServerResult,
} from '@core/types/mcp';
import { translate } from '@shared/i18n';

const sampleServers: McpServerConfig[] = [
  {
    name: 'filesystem-server',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp/files'],
    serverType: 'stdio',
    envKeys: ['FS_ROOT'],
    disabled: false,
    enabled: true,
    scope: 'project',
    configPath: '/workspace/.pi/agent/mcp.json',
  },
  {
    name: 'git-tools',
    command: 'node',
    args: ['/opt/mcp/git-server.js'],
    serverType: 'stdio',
    envKeys: [],
    disabled: true,
    enabled: false,
    scope: 'global',
    configPath: '~/.pi/agent/mcp.json',
  },
  {
    name: 'remote-database',
    url: 'https://db.internal.net/mcp/v1',
    serverType: 'remote',
    envKeys: ['DB_SECRET', 'DB_HOST'],
    disabled: false,
    enabled: true,
    scope: 'global',
    configPath: '~/.pi/agent/mcp.json',
  },
  {
    name: 'sse-streaming-service',
    url: 'http://localhost:3001/events',
    serverType: 'sse',
    envKeys: [],
    disabled: true,
    enabled: false,
    scope: 'project',
    configPath: '/workspace/.pi/agent/mcp.json',
  },
];

// ---------------------------------------------------------------------------
// 1. Server Counting Tests
// ---------------------------------------------------------------------------

test('useMcpServers: computeMcpServerCounts accurately sums total and active servers', () => {
  const counts = computeMcpServerCounts(sampleServers);
  assert.strictEqual(counts.total, 4);
  assert.strictEqual(counts.active, 2);

  const emptyCounts = computeMcpServerCounts([]);
  assert.strictEqual(emptyCounts.total, 0);
  assert.strictEqual(emptyCounts.active, 0);

  const allActive = computeMcpServerCounts(
    sampleServers.map((s) => ({ ...s, enabled: true, disabled: false }))
  );
  assert.strictEqual(allActive.total, 4);
  assert.strictEqual(allActive.active, 4);

  const allInactive = computeMcpServerCounts(
    sampleServers.map((s) => ({ ...s, enabled: false, disabled: true }))
  );
  assert.strictEqual(allInactive.total, 4);
  assert.strictEqual(allInactive.active, 0);
});

// ---------------------------------------------------------------------------
// 2. Optimistic Toggle State Calculation Tests
// ---------------------------------------------------------------------------

test('useMcpServers: applyOptimisticToggle updates enabled and disabled properties immutably', () => {
  // Disable active server
  const updated1 = applyOptimisticToggle(sampleServers, 'filesystem-server', false);
  const target1 = updated1.find((s) => s.name === 'filesystem-server');
  assert.strictEqual(target1?.enabled, false);
  assert.strictEqual(target1?.disabled, true);

  // Original array remains untouched
  assert.strictEqual(sampleServers[0].enabled, true);
  assert.strictEqual(sampleServers[0].disabled, false);

  // Enable inactive server
  const updated2 = applyOptimisticToggle(sampleServers, 'git-tools', true);
  const target2 = updated2.find((s) => s.name === 'git-tools');
  assert.strictEqual(target2?.enabled, true);
  assert.strictEqual(target2?.disabled, false);

  // Non-target servers remain untouched
  assert.strictEqual(updated2[0], sampleServers[0]);
  assert.strictEqual(updated2[2], sampleServers[2]);
  assert.strictEqual(updated2[3], sampleServers[3]);
});

test('useMcpServers: revertOptimisticToggle restores server state accurately', () => {
  // Optimistically toggle git-tools to true
  const optimisticallyUpdated = applyOptimisticToggle(sampleServers, 'git-tools', true);
  assert.strictEqual(optimisticallyUpdated.find((s) => s.name === 'git-tools')?.enabled, true);

  // Revert git-tools to original false
  const reverted = revertOptimisticToggle(optimisticallyUpdated, 'git-tools', false);
  const target = reverted.find((s) => s.name === 'git-tools');
  assert.strictEqual(target?.enabled, false);
  assert.strictEqual(target?.disabled, true);
});

// ---------------------------------------------------------------------------
// 3. executeMcpToggle Flow & Error Handling Tests
// ---------------------------------------------------------------------------

test('useMcpServers: executeMcpToggle succeeds and passes parameters to bridge toggle', async () => {
  const recordedCalls: ToggleMcpServerPayload[] = [];
  const mockToggleFn = async (payload: ToggleMcpServerPayload): Promise<ToggleMcpServerResult> => {
    recordedCalls.push(payload);
    return {
      success: true,
      name: payload.name,
      enabled: payload.enabled,
      path: '/path/to/mcp.json',
    };
  };

  const serverToToggle = sampleServers[1]; // git-tools, currently false
  const result = await executeMcpToggle({
    servers: sampleServers,
    server: serverToToggle,
    enabled: true,
    cwd: '/custom/cwd',
    toggleFn: mockToggleFn,
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.error, undefined);
  assert.strictEqual(recordedCalls.length, 1);
  assert.deepStrictEqual(recordedCalls[0], {
    name: 'git-tools',
    enabled: true,
    cwd: '/custom/cwd',
    scope: 'global',
  });

  const toggledServer = result.nextServers.find((s) => s.name === 'git-tools');
  assert.strictEqual(toggledServer?.enabled, true);
  assert.strictEqual(toggledServer?.disabled, false);
});

test('useMcpServers: executeMcpToggle with explicit scope: project passes project scope to bridge when server.scope is global', async () => {
  const recordedCalls: ToggleMcpServerPayload[] = [];
  const mockToggleFn = async (payload: ToggleMcpServerPayload): Promise<ToggleMcpServerResult> => {
    recordedCalls.push(payload);
    return {
      success: true,
      name: payload.name,
      enabled: payload.enabled,
      path: '/workspace/.pi/agent/mcp.json',
    };
  };

  const globalServer = sampleServers[1]; // git-tools, scope: 'global'
  assert.strictEqual(globalServer.scope, 'global');

  const result = await executeMcpToggle({
    servers: sampleServers,
    server: globalServer,
    enabled: true,
    cwd: '/workspace',
    scope: 'project',
    toggleFn: mockToggleFn,
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(recordedCalls.length, 1);
  assert.strictEqual(globalServer.scope, 'global');
  assert.deepStrictEqual(recordedCalls[0], {
    name: 'git-tools',
    enabled: true,
    cwd: '/workspace',
    scope: 'project',
  });

  const toggledServer = result.nextServers.find((s) => s.name === 'git-tools');
  assert.strictEqual(toggledServer?.enabled, true);
});

test('useMcpServers: executeMcpToggle with explicit scope: global passes global scope and cwd: undefined to bridge', async () => {
  const recordedCalls: ToggleMcpServerPayload[] = [];
  const mockToggleFn = async (payload: ToggleMcpServerPayload): Promise<ToggleMcpServerResult> => {
    recordedCalls.push(payload);
    return {
      success: true,
      name: payload.name,
      enabled: payload.enabled,
      path: '~/.pi/agent/mcp.json',
    };
  };

  const projectServer = sampleServers[0]; // filesystem-server, scope: 'project'
  assert.strictEqual(projectServer.scope, 'project');

  const result = await executeMcpToggle({
    servers: sampleServers,
    server: projectServer,
    enabled: false,
    cwd: undefined,
    scope: 'global',
    toggleFn: mockToggleFn,
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(recordedCalls.length, 1);
  assert.deepStrictEqual(recordedCalls[0], {
    name: 'filesystem-server',
    enabled: false,
    cwd: undefined,
    scope: 'global',
  });

  const toggledServer = result.nextServers.find((s) => s.name === 'filesystem-server');
  assert.strictEqual(toggledServer?.enabled, false);
  assert.strictEqual(toggledServer?.disabled, true);
});

test('useMcpServers: executeMcpToggle rolls back optimistic update when bridge reports failure', async () => {
  const mockToggleFn = async (payload: ToggleMcpServerPayload): Promise<ToggleMcpServerResult> => {
    return {
      success: false,
      name: payload.name,
      enabled: payload.enabled,
      path: '',
    };
  };

  const serverToToggle = sampleServers[0]; // filesystem-server, currently enabled: true
  const result = await executeMcpToggle({
    servers: sampleServers,
    server: serverToToggle,
    enabled: false,
    cwd: '/workspace',
    toggleFn: mockToggleFn,
  });

  assert.strictEqual(result.success, false);
  assert.match(result.error ?? '', /Failed to toggle MCP server "filesystem-server"/);

  // Rolled back to original state
  const revertedServer = result.nextServers.find((s) => s.name === 'filesystem-server');
  assert.strictEqual(revertedServer?.enabled, true);
  assert.strictEqual(revertedServer?.disabled, false);
});

test('useMcpServers: executeMcpToggle rolls back optimistic update when bridge throws exception', async () => {
  const mockToggleFn = async (): Promise<ToggleMcpServerResult> => {
    throw new Error('IPC connection timeout');
  };

  const serverToToggle = sampleServers[2]; // remote-database, currently enabled: true
  const result = await executeMcpToggle({
    servers: sampleServers,
    server: serverToToggle,
    enabled: false,
    cwd: '/workspace',
    toggleFn: mockToggleFn,
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'IPC connection timeout');

  // Rolled back to original state
  const revertedServer = result.nextServers.find((s) => s.name === 'remote-database');
  assert.strictEqual(revertedServer?.enabled, true);
  assert.strictEqual(revertedServer?.disabled, false);
});

// ---------------------------------------------------------------------------
// 4. PromptControls & MCP Localization Key Tests
// ---------------------------------------------------------------------------

test('useMcpServers: i18n keys for PromptControls MCP button and popover translate and interpolate properly', () => {
  // English
  const enTitle = translate('en', 'prompt_controls.mcp_title', { active: 3, total: 5 });
  assert.strictEqual(enTitle, 'MCP Servers (3 active of 5)');

  const enHeader = translate('en', 'mcp.popover_header', { active: 3, total: 5 });
  assert.strictEqual(enHeader, 'MCP Servers (3/5 active)');

  const enEnable = translate('en', 'mcp.action_enable');
  assert.strictEqual(enEnable, 'Enable server');

  const enDisable = translate('en', 'mcp.action_disable');
  assert.strictEqual(enDisable, 'Disable server');

  // Spanish
  const esTitle = translate('es', 'prompt_controls.mcp_title', { active: 3, total: 5 });
  assert.strictEqual(esTitle, 'Servidores MCP (3 activos de 5)');

  const esHeader = translate('es', 'mcp.popover_header', { active: 3, total: 5 });
  assert.strictEqual(esHeader, 'Servidores MCP (3/5 activos)');

  const esEnable = translate('es', 'mcp.action_enable');
  assert.strictEqual(esEnable, 'Activar servidor');

  const esDisable = translate('es', 'mcp.action_disable');
  assert.strictEqual(esDisable, 'Desactivar servidor');
});
