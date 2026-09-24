import React, { useState } from 'react';
import type { ProfileCardProps } from '../types';

export const ProfileCard: React.FC<ProfileCardProps> = ({
  profile,
  isActive,
  effectiveScope: _effectiveScope,
  cwd,
  isActivating = false,
  isDeleting = false,
  onActivate,
  onClearActive,
  onEdit,
  onDuplicate,
  onDelete,
}) => {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const scopeLabel =
    profile.scope === 'project'
      ? 'Proyecto'
      : 'Global';

  const activeBadgeLabel =
    profile.active_scope === 'project'
      ? 'Activo (Proyecto)'
      : profile.active_scope === 'global'
        ? 'Activo (Global)'
        : 'Activo';

  return (
    <article
      className={`profile-card ${isActive ? 'profile-card-active' : ''}`}
      aria-label={`Perfil ${profile.name}`}
    >
      <div className="profile-card-header">
        <div className="profile-card-identity">
          <div className="profile-card-title-row">
            <h3 className="profile-card-name" title={profile.name}>
              {profile.name}
            </h3>
            <div className="profile-card-badges">
              <span
                className={`profile-badge profile-badge-scope profile-badge-${profile.scope}`}
                title={`Ámbito: ${scopeLabel}`}
              >
                {scopeLabel}
              </span>
              {isActive && (
                <span
                  className="profile-badge profile-badge-status-active"
                  title={activeBadgeLabel}
                >
                  <span className="profile-status-dot" aria-hidden="true" />
                  {activeBadgeLabel}
                </span>
              )}
            </div>
          </div>

          <p className="profile-card-desc">
            {profile.description || 'Sin descripción especificada'}
          </p>
        </div>
      </div>

      {/* Model highlights */}
      <div className="profile-card-details">
        <div className="profile-highlight-box">
          <div className="profile-highlight-label">
            <svg
              className="profile-icon"
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
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <rect x="9" y="9" width="6" height="6" />
              <line x1="9" y1="1" x2="9" y2="4" />
              <line x1="15" y1="1" x2="15" y2="4" />
              <line x1="9" y1="20" x2="9" y2="23" />
              <line x1="15" y1="20" x2="15" y2="23" />
              <line x1="20" y1="9" x2="23" y2="9" />
              <line x1="20" y1="14" x2="23" y2="14" />
              <line x1="1" y1="9" x2="4" y2="9" />
              <line x1="1" y1="14" x2="4" y2="14" />
            </svg>
            <span>Modelo principal / Orquestador</span>
          </div>
          <div className="profile-highlight-value-row">
            <span className="profile-model-name" title={profile.default_model || 'No configurado'}>
              {profile.default_model || 'Por defecto'}
            </span>
            {profile.default_effort && (
              <span
                className="profile-effort-badge"
                title={`Nivel de razonamiento: ${profile.default_effort}`}
              >
                razonamiento: {profile.default_effort}
              </span>
            )}
          </div>
        </div>

        <div className="profile-agents-summary">
          <svg
            className="profile-icon"
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
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
          <span className="profile-agents-count">
            <strong>{profile.agent_count}</strong> subagentes con configuración dedicada
          </span>
        </div>
      </div>

      {/* Card Actions */}
      <div className="profile-card-actions">
        <div className="profile-activate-buttons">
          {isActive ? (
            profile.active_scope === 'project' && onClearActive ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm profile-clear-active-btn"
                onClick={() => onClearActive('project')}
                title="Quitar asignación específica del proyecto para heredar el perfil global"
              >
                Restablecer a global
              </button>
            ) : (
              <span className="profile-current-active-tag">
                ✓ Activo actualmente
              </span>
            )
          ) : (
            <>
              {cwd ? (
                <>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm profile-btn-activate"
                    onClick={() => onActivate(profile, 'project')}
                    disabled={isActivating || isDeleting}
                    title="Activar este perfil exclusivamente para este proyecto"
                  >
                    Activar (Proyecto)
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm profile-btn-activate-global"
                    onClick={() => onActivate(profile, 'global')}
                    disabled={isActivating || isDeleting}
                    title="Activar este perfil como predeterminado global"
                  >
                    Activar (Global)
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm profile-btn-activate"
                  onClick={() => onActivate(profile, 'global')}
                  disabled={isActivating || isDeleting}
                  title="Activar este perfil globalmente"
                >
                  Activar
                </button>
              )}
            </>
          )}
        </div>

        <div className="profile-standard-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm profile-action-btn"
            onClick={() => onEdit(profile)}
            disabled={isActivating || isDeleting}
            title="Editar perfil"
          >
            Editar
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm profile-action-btn"
            onClick={() => onDuplicate(profile)}
            disabled={isActivating || isDeleting}
            title="Crear una copia editable de este perfil"
          >
            Duplicar
          </button>

          {isConfirmingDelete ? (
            <div className="profile-delete-confirm-group">
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => {
                  setIsConfirmingDelete(false);
                  onDelete(profile);
                }}
                disabled={isDeleting}
              >
                {isDeleting ? 'Eliminando...' : 'Confirmar'}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setIsConfirmingDelete(false)}
                disabled={isDeleting}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-danger btn-sm profile-action-btn profile-delete-btn"
              onClick={() => setIsConfirmingDelete(true)}
              disabled={isActivating || isDeleting}
              title="Eliminar perfil"
            >
              Eliminar
            </button>
          )}
        </div>
      </div>
    </article>
  );
};
