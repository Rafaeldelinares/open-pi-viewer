import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS_CONFIG,
  formatWindowTitle,
  generateFaviconSvg,
  type AppStatusState,
} from '@core/icon-status';

test('STATUS_CONFIG: contains expected color, labelKey, and optional symbols for all states', () => {
  assert.equal(STATUS_CONFIG.idle.color, '#2da44e');
  assert.equal(STATUS_CONFIG.idle.labelKey, 'status.idle');
  assert.equal(STATUS_CONFIG.idle.symbol, undefined);

  assert.equal(STATUS_CONFIG.busy.color, '#1f6feb');
  assert.equal(STATUS_CONFIG.busy.labelKey, 'status.busy');
  assert.equal(STATUS_CONFIG.busy.symbol, '●');

  assert.equal(STATUS_CONFIG.waiting.color, '#d29922');
  assert.equal(STATUS_CONFIG.waiting.labelKey, 'status.waiting');
  assert.equal(STATUS_CONFIG.waiting.symbol, '!');

  assert.equal(STATUS_CONFIG.error.color, '#cf222e');
  assert.equal(STATUS_CONFIG.error.labelKey, 'status.error');
  assert.equal(STATUS_CONFIG.error.symbol, '✕');

  assert.equal(STATUS_CONFIG.disconnected.color, '#8b949e');
  assert.equal(STATUS_CONFIG.disconnected.labelKey, 'status.disconnected');
  assert.equal(STATUS_CONFIG.disconnected.symbol, undefined);
});

test('formatWindowTitle: formats busy state with symbol and label or fallback', () => {
  assert.equal(
    formatWindowTitle('Pi Viewer', 'busy', 'Trabajando'),
    '(● Trabajando) Pi Viewer'
  );
  assert.equal(
    formatWindowTitle('Pi Viewer', 'busy'),
    '(● Busy) Pi Viewer'
  );
});

test('formatWindowTitle: formats waiting state with symbol and label or fallback', () => {
  assert.equal(
    formatWindowTitle('Pi Viewer', 'waiting', 'Esperando respuesta'),
    '(! Esperando respuesta) Pi Viewer'
  );
  assert.equal(
    formatWindowTitle('Pi Viewer', 'waiting'),
    '(! Waiting) Pi Viewer'
  );
});

test('formatWindowTitle: formats error state with symbol and label or fallback', () => {
  assert.equal(
    formatWindowTitle('Pi Viewer', 'error', 'Error de conexión'),
    '(✕ Error de conexión) Pi Viewer'
  );
  assert.equal(
    formatWindowTitle('Pi Viewer', 'error'),
    '(✕ Error) Pi Viewer'
  );
});

test('formatWindowTitle: returns unmodified baseTitle for idle and disconnected states', () => {
  assert.equal(formatWindowTitle('Pi Viewer', 'idle', 'Listo'), 'Pi Viewer');
  assert.equal(formatWindowTitle('Pi Viewer', 'disconnected', 'Desconectado'), 'Pi Viewer');
});

test('generateFaviconSvg: generates valid SVG with dark background, pi text, and status circle', () => {
  const states: AppStatusState[] = ['idle', 'busy', 'waiting', 'error', 'disconnected'];

  for (const status of states) {
    const svg = generateFaviconSvg(status);
    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.includes('viewBox="0 0 32 32"'));
    assert.ok(svg.includes('fill="#0d1117"')); // base dark badge
    assert.ok(svg.includes('>π<')); // greek letter Pi
    assert.ok(svg.includes(`fill="${STATUS_CONFIG[status].color}"`)); // indicator circle
    assert.ok(svg.includes('cx="24" cy="24" r="5"'));
    assert.ok(svg.endsWith('</svg>'));
  }
});
