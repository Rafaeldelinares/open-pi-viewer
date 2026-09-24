import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PiResourceEntry } from '@core/types/extensions';
import { ResourceModalLayout } from '@features/extensions/components/ResourceModalLayout';
import { ExtensionSearchBar } from '@features/extensions/components/ExtensionSearchBar';
import { ResourceSearchBar } from '@features/extensions/components/ResourceSearchBar';
import {
  filterResources,
  computeResourceCounts,
  resourceToFormData,
  formDataToSavePayload,
  calculateToggledResourceState,
  calculateSavedResourceState,
  calculateDeletedResourceState,
  type ResourceFormData,
} from '@features/extensions/types';
import { validateResourceForm } from '@features/extensions/hooks/useResourceModalForm';
import {
  executeResourceToggle,
} from '@features/extensions/hooks/usePiResources';
import { translate } from '@shared/i18n';

const sampleResources: PiResourceEntry[] = [
  {
    id: 'global:extension:./tools/my-tool.ts',
    name: 'my-tool.ts',
    kind: 'extension',
    source: './tools/my-tool.ts',
    scope: 'global',
    enabled: true,
    configPath: '~/.pi/agent/settings.json',
  },
  {
    id: 'project:extension:!./disabled-ext.ts',
    name: 'disabled-ext.ts',
    kind: 'extension',
    source: '!./disabled-ext.ts',
    scope: 'project',
    enabled: false,
    configPath: '/workspace/.pi/settings.json',
  },
  {
    id: 'global:package:npm:@pi/code-review',
    name: '@pi/code-review',
    kind: 'package',
    source: 'npm:@pi/code-review',
    scope: 'global',
    enabled: true,
    configPath: '~/.pi/agent/settings.json',
  },
  {
    id: 'project:package:git:github.com/user/helper-repo@v2',
    name: 'helper-repo',
    kind: 'package',
    source: 'git:github.com/user/helper-repo@v2',
    scope: 'project',
    enabled: false,
    configPath: '/workspace/.pi/settings.json',
  },
];

test('extensions view: filterResources handles empty and whitespace queries', () => {
  assert.equal(filterResources(sampleResources, '').length, 4);
  assert.equal(filterResources(sampleResources, '   ').length, 4);
});

test('extensions view: filterResources filters by name, source, kind, and scope case-insensitively', () => {
  // By name
  const byName = filterResources(sampleResources, 'my-tool');
  assert.equal(byName.length, 1);
  assert.equal(byName[0].id, 'global:extension:./tools/my-tool.ts');

  // By source
  const bySource = filterResources(sampleResources, 'github.com');
  assert.equal(bySource.length, 1);
  assert.equal(bySource[0].id, 'project:package:git:github.com/user/helper-repo@v2');

  // By kind
  const byKind = filterResources(sampleResources, 'package');
  assert.equal(byKind.length, 2);

  // By scope
  const byScope = filterResources(sampleResources, 'PROJECT');
  assert.equal(byScope.length, 2);

  // Non-matching
  const noMatch = filterResources(sampleResources, 'non-existent-xyz');
  assert.equal(noMatch.length, 0);
});

test('extensions view: computeResourceCounts accurately computes total, active, extensions, and packages', () => {
  const counts = computeResourceCounts(sampleResources);
  assert.strictEqual(counts.total, 4);
  assert.strictEqual(counts.active, 2);
  assert.strictEqual(counts.extensions, 2);
  assert.strictEqual(counts.packages, 2);

  // Empty list
  const emptyCounts = computeResourceCounts([]);
  assert.strictEqual(emptyCounts.total, 0);
  assert.strictEqual(emptyCounts.active, 0);
  assert.strictEqual(emptyCounts.extensions, 0);
  assert.strictEqual(emptyCounts.packages, 0);
});

test('extensions view: calculateToggledResourceState updates enabled immutably', () => {
  const next = calculateToggledResourceState(
    sampleResources,
    'global:extension:./tools/my-tool.ts',
    false
  );
  assert.notStrictEqual(next, sampleResources);
  assert.strictEqual(next.find((r) => r.id === 'global:extension:./tools/my-tool.ts')?.enabled, false);
  assert.strictEqual(sampleResources[0].enabled, true); // Original unmodified

  // Package toggling updates autoload
  const nextPkg = calculateToggledResourceState(
    sampleResources,
    'project:package:git:github.com/user/helper-repo@v2',
    true
  );
  const updatedPkg = nextPkg.find((r) => r.id === 'project:package:git:github.com/user/helper-repo@v2');
  assert.strictEqual(updatedPkg?.enabled, true);
  assert.strictEqual(updatedPkg?.autoload, true);
});

test('extensions view: calculateSavedResourceState appends or updates entry immutably', () => {
  const updatedEntry: PiResourceEntry = {
    ...sampleResources[0],
    source: './tools/my-tool-v2.ts',
    name: 'my-tool-v2.ts',
  };

  const replaced = calculateSavedResourceState(
    sampleResources,
    updatedEntry,
    'global:extension:./tools/my-tool.ts'
  );
  assert.strictEqual(replaced.length, 4);
  assert.strictEqual(replaced[0].source, './tools/my-tool-v2.ts');

  const newEntry: PiResourceEntry = {
    id: 'global:package:npm:brand-new',
    name: 'brand-new',
    kind: 'package',
    source: 'npm:brand-new',
    scope: 'global',
    enabled: true,
    configPath: '~/.pi/agent/settings.json',
  };

  const added = calculateSavedResourceState(sampleResources, newEntry);
  assert.strictEqual(added.length, 5);
  assert.strictEqual(added[4].id, 'global:package:npm:brand-new');
});

test('extensions view: calculateDeletedResourceState removes targeted resource', () => {
  const remaining = calculateDeletedResourceState(
    sampleResources,
    'global:extension:./tools/my-tool.ts'
  );
  assert.strictEqual(remaining.length, 3);
  assert.strictEqual(remaining.some((r) => r.id === 'global:extension:./tools/my-tool.ts'), false);
});

test('extensions view: resourceToFormData and formDataToSavePayload roundtrip correctly', () => {
  const resource = sampleResources[0];
  const formData = resourceToFormData(resource);

  assert.deepStrictEqual(formData, {
    kind: 'extension',
    scope: 'global',
    source: './tools/my-tool.ts',
    enabled: true,
  });

  const payload = formDataToSavePayload(formData, resource, '/some/cwd');
  assert.strictEqual(payload.kind, 'extension');
  assert.strictEqual(payload.source, './tools/my-tool.ts');
  assert.strictEqual(payload.oldSource, './tools/my-tool.ts');
  assert.strictEqual(payload.scope, 'global');
  assert.strictEqual(payload.enabled, true);
  assert.strictEqual(payload.cwd, undefined); // global does not pass cwd

  // Project scope passes cwd
  const projectFormData: ResourceFormData = {
    kind: 'package',
    scope: 'project',
    source: 'npm:@scope/lib',
    enabled: false,
  };
  const projectPayload = formDataToSavePayload(projectFormData, null, '/some/cwd');
  assert.strictEqual(projectPayload.scope, 'project');
  assert.strictEqual(projectPayload.cwd, '/some/cwd');
  assert.strictEqual(projectPayload.oldSource, undefined);
});

test('extensions view: validateResourceForm validates empty source and syntax', () => {
  const t = (k: any, p?: any) => translate('en', k, p);

  // Empty source
  assert.strictEqual(
    validateResourceForm({ kind: 'extension', scope: 'global', source: '', enabled: true }, t),
    'Source is required'
  );

  // Valid extension source
  assert.strictEqual(
    validateResourceForm({ kind: 'extension', scope: 'global', source: './my-ext.ts', enabled: true }, t),
    null
  );

  // Valid package source
  assert.strictEqual(
    validateResourceForm({ kind: 'package', scope: 'project', source: 'npm:@scope/my-pkg', enabled: true }, t),
    null
  );

  // Invalid package source
  const invalidPkg = validateResourceForm(
    { kind: 'package', scope: 'project', source: 'invalid::bad package source', enabled: true },
    t
  );
  assert.notStrictEqual(invalidPkg, null);
});

test('extensions view: executeResourceToggle applies optimistic update and rolls back on failure', async () => {
  const resource = sampleResources[0];

  // Success case
  const successResult = await executeResourceToggle({
    resources: sampleResources,
    resource,
    enabled: false,
    toggleFn: async (payload) => ({
      success: true,
      id: resource.id,
      kind: resource.kind,
      source: resource.source,
      scope: resource.scope,
      enabled: payload.enabled,
      configPath: resource.configPath,
      requiresReload: true,
    }),
  });

  assert.strictEqual(successResult.success, true);
  assert.strictEqual(successResult.nextResources[0].enabled, false);

  // Failure response rollback
  const failResult = await executeResourceToggle({
    resources: sampleResources,
    resource,
    enabled: false,
    toggleFn: async () => ({
      success: false,
      id: resource.id,
      kind: resource.kind,
      source: resource.source,
      scope: resource.scope,
      enabled: true,
      configPath: resource.configPath,
      requiresReload: true,
    }),
  });

  assert.strictEqual(failResult.success, false);
  assert.strictEqual(failResult.nextResources[0].enabled, true); // Reverted

  // Exception thrown rollback
  const exceptionResult = await executeResourceToggle({
    resources: sampleResources,
    resource,
    enabled: false,
    toggleFn: async () => {
      throw new Error('IPC failed');
    },
  });

  assert.strictEqual(exceptionResult.success, false);
  assert.strictEqual(exceptionResult.error, 'IPC failed');
  assert.strictEqual(exceptionResult.nextResources[0].enabled, true); // Reverted
});

test('extensions view: calculateToggledResourceState sets hasProjectOverride when toggling in project scope', () => {
  const next = calculateToggledResourceState(
    sampleResources,
    'global:extension:./tools/my-tool.ts',
    false,
    'project'
  );
  const updated = next.find((r) => r.id === 'global:extension:./tools/my-tool.ts')!;
  assert.strictEqual(updated.enabled, false);
  assert.strictEqual(updated.hasProjectOverride, true);

  // Without scope or global scope, hasProjectOverride is preserved
  const nextGlobal = calculateToggledResourceState(
    sampleResources,
    'global:extension:./tools/my-tool.ts',
    true,
    'global'
  );
  const updatedGlobal = nextGlobal.find((r) => r.id === 'global:extension:./tools/my-tool.ts')!;
  assert.strictEqual(updatedGlobal.enabled, true);
  assert.strictEqual(updatedGlobal.hasProjectOverride, undefined);
});

test('extensions view: executeResourceToggle with explicit targetScope passes project scope and cwd to toggleFn', async () => {
  let passedPayload: any = null;

  const res = await executeResourceToggle({
    resources: sampleResources,
    resource: sampleResources[0],
    enabled: false,
    cwd: '/workspace/dir',
    targetScope: 'project',
    toggleFn: async (payload) => {
      passedPayload = payload;
      return {
        success: true,
        id: sampleResources[0].id,
        kind: sampleResources[0].kind,
        source: sampleResources[0].source,
        scope: 'project',
        enabled: false,
        configPath: '/workspace/dir/.pi/settings.json',
        requiresReload: true,
      };
    },
  });

  assert.strictEqual(res.success, true);
  assert.deepStrictEqual(passedPayload, {
    kind: 'extension',
    source: './tools/my-tool.ts',
    enabled: false,
    scope: 'project',
    cwd: '/workspace/dir',
  });
  assert.strictEqual(res.nextResources[0].hasProjectOverride, true);
});

test('extensions view: PromptControls and resource override locale keys translate accurately in en and es', () => {
  const tEn = (k: any, p?: any) => translate('en', k, p);
  const tEs = (k: any, p?: any) => translate('es', k, p);

  // prompt_controls.ext_title
  assert.strictEqual(
    tEn('prompt_controls.ext_title', { active: 2, total: 4 }),
    'Extensions (2/4)'
  );
  assert.strictEqual(
    tEs('prompt_controls.ext_title', { active: 2, total: 4 }),
    'Extensiones (2/4)'
  );

  // prompt_controls.select_ext_title
  assert.strictEqual(
    tEn('prompt_controls.select_ext_title'),
    'Extensions & packages'
  );
  assert.strictEqual(
    tEs('prompt_controls.select_ext_title'),
    'Extensiones y paquetes'
  );

  // extensions.popover_header
  assert.strictEqual(
    tEn('extensions.popover_header', { active: 3, total: 6 }),
    'Active extensions & packages (3/6)'
  );
  assert.strictEqual(
    tEs('extensions.popover_header', { active: 3, total: 6 }),
    'Extensiones y paquetes activos (3/6)'
  );

  // extensions.search_placeholder
  assert.strictEqual(tEn('extensions.search_placeholder'), 'Filter extensions...');
  assert.strictEqual(tEs('extensions.search_placeholder'), 'Filtrar extensiones...');

  // extensions.empty_title
  assert.strictEqual(
    tEn('extensions.empty_title'),
    'No extensions or packages configured'
  );
  assert.strictEqual(
    tEs('extensions.empty_title'),
    'No hay extensiones ni paquetes configurados'
  );

  // extensions.badge_override
  assert.strictEqual(tEn('extensions.badge_override'), 'Project override');
  assert.strictEqual(tEs('extensions.badge_override'), 'Override de proyecto');

  // extensions.action_enable & action_disable
  assert.strictEqual(tEn('extensions.action_enable'), 'Enable for project');
  assert.strictEqual(tEs('extensions.action_enable'), 'Activar para el proyecto');
  assert.strictEqual(tEn('extensions.action_disable'), 'Disable for project');
  assert.strictEqual(tEs('extensions.action_disable'), 'Desactivar para el proyecto');
});

test('extensions view: filterResources matches auto-discovered directory-based extensions by folder name', () => {
  const autoResources: PiResourceEntry[] = [
    {
      id: 'global:extension:extensions/cpamc-auto-switcher/index.ts',
      name: 'cpamc-auto-switcher',
      kind: 'extension',
      source: 'extensions/cpamc-auto-switcher/index.ts',
      scope: 'global',
      enabled: true,
      configPath: '/home/.pi/agent/extensions/cpamc-auto-switcher/index.ts',
    },
    {
      id: 'global:extension:extensions/quick-tool.ts',
      name: 'quick-tool.ts',
      kind: 'extension',
      source: 'extensions/quick-tool.ts',
      scope: 'global',
      enabled: true,
      configPath: '/home/.pi/agent/extensions/quick-tool.ts',
    },
  ];

  // Filtering by folder display name
  const matched = filterResources(autoResources, 'switcher');
  assert.strictEqual(matched.length, 1);
  assert.strictEqual(matched[0].name, 'cpamc-auto-switcher');

  // Filtering by file name
  const matchedTool = filterResources(autoResources, 'quick');
  assert.strictEqual(matchedTool.length, 1);
  assert.strictEqual(matchedTool[0].name, 'quick-tool.ts');
});

test('ResourceModalLayout: component exists, imports cleanly, and handles closed and open instantiation', () => {
  assert.strictEqual(typeof ResourceModalLayout, 'function');

  // Closed state returns null and renders nothing
  const closedMarkup = renderToStaticMarkup(
    React.createElement(ResourceModalLayout, {
      titleId: 'test-modal-title',
      title: 'Test Modal',
      isOpen: false,
      onClose: () => {},
      onSubmit: () => {},
      children: null,
    })
  );
  assert.strictEqual(closedMarkup, '');

  // Open state instantiates a valid React element and renders expected layout
  const openMarkup = renderToStaticMarkup(
    React.createElement(
      ResourceModalLayout,
      {
        titleId: 'test-modal-title',
        title: 'Active Modal',
        isOpen: true,
        onClose: () => {},
        onSubmit: () => {},
        error: 'Sample error banner',
        className: 'custom-class',
        footer: React.createElement('button', { type: 'button' }, 'Submit'),
        children: React.createElement('div', { id: 'modal-child' }, 'Modal Body Content'),
      }
    )
  );

  assert.ok(openMarkup.includes('modal-overlay'));
  assert.ok(openMarkup.includes('modal-container ext-modal custom-class'));
  assert.ok(openMarkup.includes('id="test-modal-title"'));
  assert.ok(openMarkup.includes('Active Modal'));
  assert.ok(openMarkup.includes('aria-label="Close"'));
  assert.ok(openMarkup.includes('Sample error banner'));
  assert.ok(openMarkup.includes('Modal Body Content'));
  assert.ok(openMarkup.includes('modal-footer'));
  assert.ok(openMarkup.includes('Submit'));
});

test('ExtensionSearchBar and ResourceSearchBar: components exist, are aliased, render empty and query states with accessibility attributes', () => {
  assert.strictEqual(typeof ExtensionSearchBar, 'function');
  assert.strictEqual(ResourceSearchBar, ExtensionSearchBar);

  let changedValue = '';
  const elementEmpty = React.createElement(ExtensionSearchBar, {
    value: '',
    onChange: (val: string) => {
      changedValue = val;
    },
    placeholder: 'Search extensions...',
    clearAriaLabel: 'Clear search',
    className: 'custom-ext-search',
  });

  const emptyMarkup = renderToStaticMarkup(elementEmpty);

  // Outer container and classes
  assert.ok(emptyMarkup.includes('ext-search-box custom-ext-search'));
  // SVG icon
  assert.ok(emptyMarkup.includes('ext-search-icon'));
  assert.ok(emptyMarkup.includes('aria-hidden="true"'));
  // Input attributes
  assert.ok(emptyMarkup.includes('class="ext-search-input"'));
  assert.ok(emptyMarkup.includes('placeholder="Search extensions..."'));
  assert.ok(emptyMarkup.includes('aria-label="Search extensions..."'));
  assert.ok(emptyMarkup.includes('value=""'));
  // Clear button is not rendered when value is empty
  assert.ok(!emptyMarkup.includes('ext-search-clear'));

  // Non-empty value renders clear button with aria-label
  const elementFilled = React.createElement(ExtensionSearchBar, {
    value: 'github-package',
    onChange: (val: string) => {
      changedValue = val;
    },
    placeholder: 'Search extensions...',
    clearAriaLabel: 'Clear resource search',
  });

  const filledMarkup = renderToStaticMarkup(elementFilled);
  assert.ok(filledMarkup.includes('value="github-package"'));
  assert.ok(filledMarkup.includes('class="ext-search-clear"'));
  assert.ok(filledMarkup.includes('aria-label="Clear resource search"'));
  assert.ok(filledMarkup.includes('×'));

  // Disabled state suppresses clear button and sets disabled attribute
  const elementDisabled = React.createElement(ExtensionSearchBar, {
    value: 'disabled-query',
    onChange: () => {},
    placeholder: 'Search extensions...',
    disabled: true,
  });
  const disabledMarkup = renderToStaticMarkup(elementDisabled);
  assert.ok(disabledMarkup.includes('disabled=""') || disabledMarkup.includes('disabled'));
  assert.ok(!disabledMarkup.includes('ext-search-clear'));

  // Direct component tree test for event callback handlers
  const instance = ExtensionSearchBar({
    value: 'active-query',
    onChange: (val: string) => {
      changedValue = val;
    },
    placeholder: 'Search extensions...',
    clearAriaLabel: 'Clear search',
  });

  assert.ok(React.isValidElement(instance));
  assert.strictEqual(instance.props.className, 'ext-search-box');

  const children = React.Children.toArray(instance.props.children);
  const inputEl = children.find(
    (c): c is React.ReactElement => React.isValidElement(c) && c.type === 'input'
  );
  assert.ok(inputEl);
  inputEl.props.onChange({ target: { value: 'new-query' } });
  assert.strictEqual(changedValue, 'new-query');

  const clearBtn = children.find(
    (c): c is React.ReactElement => React.isValidElement(c) && c.type === 'button'
  );
  assert.ok(clearBtn);
  clearBtn.props.onClick();
  assert.strictEqual(changedValue, '');

  // Verify ResourceSearchBar renders identically via alias
  const aliasInstance = ResourceSearchBar({
    value: 'alias-query',
    onChange: () => {},
    placeholder: 'Search...',
  });
  assert.ok(React.isValidElement(aliasInstance));
  assert.strictEqual(aliasInstance.props.className, 'ext-search-box');
});
