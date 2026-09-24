import React from 'react';
import type { TranslationKey } from '@shared/i18n';
import type { PiResourceEntry } from '@core/types/extensions';

export interface ResourceCardProps {
  resource: PiResourceEntry;
  onToggle: (resource: PiResourceEntry, nextEnabled: boolean) => void;
  isToggling?: boolean;
  onEdit?: (resource: PiResourceEntry) => void;
  onDelete?: (resource: PiResourceEntry) => void;
  isDeleting?: boolean;
  deletingId?: string | null;
  onSetDeletingId?: (id: string | null) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export const ResourceCard: React.FC<ResourceCardProps> = ({
  resource,
  onToggle,
  isToggling = false,
  onEdit,
  onDelete,
  isDeleting = false,
  deletingId = null,
  onSetDeletingId,
  t,
}) => {
  const scopeLabel =
    resource.scope === 'global'
      ? t('extensions.scope_global')
      : t('extensions.scope_project');

  const kindLabel =
    resource.kind === 'extension'
      ? t('extensions.badge_extension')
      : t('extensions.badge_package');

  const statusLabel = resource.enabled
    ? t('extensions.status_active')
    : t('extensions.status_inactive');
  const toggleAriaLabel = `${resource.name}: ${statusLabel}`;

  const isCurrentDeleting = deletingId === resource.id;

  return (
    <article
      className={`ext-card ${resource.enabled ? 'ext-card-enabled' : 'ext-card-disabled'}`}
      data-resource-id={resource.id}
    >
      <div className="ext-card-header">
        <div className="ext-card-identity">
          <h3 className="ext-card-name">{resource.name}</h3>
          <div className="ext-card-badges">
            <span
              className={`ext-badge ext-badge-scope ext-badge-scope-${resource.scope}`}
            >
              {scopeLabel}
            </span>
            <span
              className={`ext-badge ext-badge-kind ext-badge-kind-${resource.kind}`}
            >
              {kindLabel}
            </span>
            {resource.hasProjectOverride && (
              <span className="ext-badge ext-badge-override">
                {t('extensions.badge_override')}
              </span>
            )}
          </div>
        </div>

        <div className="ext-card-actions">
          <div className="ext-toggle-area">
            <label
              className={`ext-toggle-label ${isToggling ? 'ext-toggling' : ''}`}
              htmlFor={`ext-toggle-${resource.id}`}
            >
              <span
                className={`ext-status-pill ${resource.enabled ? 'active' : 'inactive'}`}
              >
                {statusLabel}
              </span>
              <input
                id={`ext-toggle-${resource.id}`}
                type="checkbox"
                className="ext-toggle-checkbox"
                checked={resource.enabled}
                disabled={isToggling || isDeleting}
                aria-label={toggleAriaLabel}
                onChange={() => onToggle(resource, !resource.enabled)}
              />
              <span className="ext-toggle-slider" aria-hidden="true" />
            </label>
          </div>

          {onEdit && (
            <button
              type="button"
              className="btn btn-secondary btn-sm ext-edit-btn"
              onClick={() => onEdit(resource)}
              disabled={isToggling || isDeleting}
            >
              {t('action.edit')}
            </button>
          )}

          {onDelete &&
            (isCurrentDeleting ? (
              <div className="ext-delete-confirm">
                <button
                  type="button"
                  className="btn btn-danger btn-sm ext-confirm-delete-btn"
                  onClick={() => onDelete(resource)}
                  disabled={isDeleting}
                >
                  {isDeleting ? t('action.saving') : t('extensions.confirm_delete')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm ext-cancel-delete-btn"
                  onClick={() => onSetDeletingId?.(null)}
                  disabled={isDeleting}
                >
                  {t('action.cancel')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-icon-danger btn-sm ext-delete-btn"
                onClick={() => onSetDeletingId?.(resource.id)}
                disabled={isToggling || isDeleting}
                title={t('action.delete')}
                aria-label={t('action.delete')}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            ))}
        </div>
      </div>

      <div className="ext-card-body">
        <div className="ext-card-source">
          <span className="ext-source-label">{t('extensions.field_source')}:</span>
          <code className="ext-code-block">{resource.source}</code>
        </div>
        {resource.configPath && (
          <div className="ext-card-path">
            <span className="ext-path-text">{resource.configPath}</span>
          </div>
        )}
      </div>
    </article>
  );
};
