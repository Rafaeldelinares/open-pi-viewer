import React from 'react';
import type { TranslationKey } from '@shared/i18n';
import type {
  PiResourceEntry,
  SavePiResourcePayload,
} from '@core/types/extensions';
import type { UseResourceModalFormResult } from '../hooks/useResourceModalForm';
import { ResourceModalLayout } from './ResourceModalLayout';

export interface ResourceModalProps {
  modalForm: UseResourceModalFormResult;
  onSave: (
    payload: SavePiResourcePayload,
    original?: PiResourceEntry | null
  ) => Promise<boolean>;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  cwd?: string;
}

export const ResourceModal: React.FC<ResourceModalProps> = ({
  modalForm,
  onSave,
  t,
  cwd,
}) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void modalForm.handleSave(onSave, t, cwd);
  };

  const isExtension = modalForm.formData.kind === 'extension';

  const kindLabel = isExtension
    ? t('extensions.badge_extension')
    : t('extensions.badge_package');

  const title = modalForm.isEditing
    ? t('extensions.modal_edit_title', {
        kind: kindLabel,
        name: modalForm.originalResource?.name || modalForm.formData.source,
      })
    : t('extensions.modal_add_title');

  const footer = (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={modalForm.closeModal}
        disabled={modalForm.isSaving}
      >
        {t('action.cancel')}
      </button>
      <button
        type="submit"
        className="btn btn-primary"
        disabled={modalForm.isSaving}
      >
        {modalForm.isSaving
          ? t('action.saving')
          : t('extensions.btn_save')}
      </button>
    </>
  );

  return (
    <ResourceModalLayout
      titleId="modal-resource-title"
      title={title}
      isOpen={modalForm.isModalOpen}
      onClose={modalForm.closeModal}
      onSubmit={handleSubmit}
      error={modalForm.formError}
      footer={footer}
    >
      {/* Fieldset: Kind selection */}
      <fieldset className="form-fieldset">
        <legend className="form-legend">
          {t('extensions.field_kind')}
        </legend>
        <div className="ext-radio-grid">
          <label
            className={`ext-radio-card ${modalForm.formData.kind === 'extension' ? 'selected' : ''}`}
          >
            <input
              type="radio"
              name="resource-kind"
              value="extension"
              checked={modalForm.formData.kind === 'extension'}
              onChange={() => modalForm.updateFormField('kind', 'extension')}
              disabled={modalForm.isSaving}
            />
            <div className="ext-radio-card-content">
              <span className="ext-radio-card-title">
                {t('extensions.kind_extension')}
              </span>
              <span className="ext-radio-card-desc">
                {t('extensions.kind_extension_desc')}
              </span>
            </div>
          </label>

          <label
            className={`ext-radio-card ${modalForm.formData.kind === 'package' ? 'selected' : ''}`}
          >
            <input
              type="radio"
              name="resource-kind"
              value="package"
              checked={modalForm.formData.kind === 'package'}
              onChange={() => modalForm.updateFormField('kind', 'package')}
              disabled={modalForm.isSaving}
            />
            <div className="ext-radio-card-content">
              <span className="ext-radio-card-title">
                {t('extensions.kind_package')}
              </span>
              <span className="ext-radio-card-desc">
                {t('extensions.kind_package_desc')}
              </span>
            </div>
          </label>
        </div>
      </fieldset>

      {/* Fieldset: Scope selection */}
      <fieldset className="form-fieldset">
        <legend className="form-legend">
          {t('extensions.field_scope')}
        </legend>
        <div className="ext-radio-grid">
          <label
            className={`ext-radio-card ${modalForm.formData.scope === 'global' ? 'selected' : ''}`}
          >
            <input
              type="radio"
              name="resource-scope"
              value="global"
              checked={modalForm.formData.scope === 'global'}
              onChange={() => modalForm.updateFormField('scope', 'global')}
              disabled={modalForm.isSaving}
            />
            <div className="ext-radio-card-content">
              <span className="ext-radio-card-title">
                {t('extensions.scope_global')}
              </span>
              <span className="ext-radio-card-desc">
                {t('extensions.scope_global_desc')}
              </span>
            </div>
          </label>

          <label
            className={`ext-radio-card ${modalForm.formData.scope === 'project' ? 'selected' : ''} ${!cwd ? 'disabled' : ''}`}
            title={!cwd ? t('extensions.scope_project_disabled') : undefined}
          >
            <input
              type="radio"
              name="resource-scope"
              value="project"
              checked={modalForm.formData.scope === 'project'}
              onChange={() => modalForm.updateFormField('scope', 'project')}
              disabled={!cwd || modalForm.isSaving}
            />
            <div className="ext-radio-card-content">
              <span className="ext-radio-card-title">
                {t('extensions.scope_project')}
              </span>
              <span className="ext-radio-card-desc">
                {cwd
                  ? t('extensions.scope_project_desc')
                  : t('extensions.scope_project_disabled')}
              </span>
            </div>
          </label>
        </div>
      </fieldset>

      {/* Fieldset: Source & Settings */}
      <fieldset className="form-fieldset">
        <legend className="form-legend">
          {t('extensions.field_source')}
        </legend>

        <div className="field-group">
          <label htmlFor="resource-input-source" className="field-label">
            {t('extensions.field_source')}
          </label>
          <input
            id="resource-input-source"
            type="text"
            className="field-input ext-source-input"
            value={modalForm.formData.source}
            onChange={(e) =>
              modalForm.updateFormField('source', e.target.value)
            }
            placeholder={
              isExtension
                ? t('extensions.field_source_extension_placeholder')
                : t('extensions.field_source_package_placeholder')
            }
            autoFocus
            disabled={modalForm.isSaving}
            required
          />
          <span className="field-subtext">
            {isExtension
              ? t('extensions.field_source_extension_hint')
              : t('extensions.field_source_package_hint')}
          </span>
        </div>

        <div className="field-group ext-enabled-field-group">
          <label
            className={`ext-checkbox-card ${modalForm.formData.enabled ? 'checked' : ''} ${modalForm.isSaving ? 'disabled' : ''}`}
            htmlFor="resource-input-enabled"
          >
            <input
              id="resource-input-enabled"
              type="checkbox"
              checked={modalForm.formData.enabled}
              onChange={(e) =>
                modalForm.updateFormField('enabled', e.target.checked)
              }
              disabled={modalForm.isSaving}
            />
            <div className="ext-checkbox-card-content">
              <span className="ext-checkbox-card-title">
                {t('extensions.field_enabled')}
              </span>
              <span className="ext-checkbox-card-desc">
                {t('extensions.field_enabled_hint')}
              </span>
            </div>
          </label>
        </div>
      </fieldset>
    </ResourceModalLayout>
  );
};
