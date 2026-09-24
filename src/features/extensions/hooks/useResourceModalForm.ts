import { useCallback, useState } from 'react';
import type {
  PiResourceEntry,
  PiResourceScope,
  SavePiResourcePayload,
} from '@core/types/extensions';
import { validateResourceSource } from '@core/types/extensions';
import type { TranslationKey } from '@shared/i18n';
import {
  EMPTY_RESOURCE_FORM,
  type ResourceFormData,
  formDataToSavePayload,
  resourceToFormData,
} from '../types';

/**
 * Validates resource form input against kind-specific source constraints.
 */
export function validateResourceForm(
  formData: ResourceFormData,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): string | null {
  const trimmed = formData.source.trim();
  if (!trimmed) {
    return t('extensions.error_source_required');
  }

  const validation = validateResourceSource(formData.kind, trimmed);
  if (!validation.valid) {
    return validation.error || t('extensions.error_source_invalid');
  }

  return null;
}

export interface UseResourceModalFormResult {
  isModalOpen: boolean;
  isEditing: boolean;
  isSaving: boolean;
  originalResource: PiResourceEntry | null;
  formData: ResourceFormData;
  formError: string | null;
  setFormData: React.Dispatch<React.SetStateAction<ResourceFormData>>;
  setFormError: (error: string | null) => void;
  openAddModal: (defaultScope?: PiResourceScope) => void;
  openEditModal: (resource: PiResourceEntry) => void;
  closeModal: () => void;
  updateFormField: <K extends keyof ResourceFormData>(
    field: K,
    value: ResourceFormData[K]
  ) => void;
  handleSave: (
    saveFn: (
      payload: SavePiResourcePayload,
      original?: PiResourceEntry | null
    ) => Promise<boolean>,
    t: (key: TranslationKey, params?: Record<string, string | number>) => string,
    cwd?: string
  ) => Promise<boolean>;
}

export function useResourceModalForm(): UseResourceModalFormResult {
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [originalResource, setOriginalResource] =
    useState<PiResourceEntry | null>(null);
  const [formData, setFormData] =
    useState<ResourceFormData>(EMPTY_RESOURCE_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const openAddModal = useCallback(
    (defaultScope: PiResourceScope = 'global') => {
      setFormData({
        ...EMPTY_RESOURCE_FORM,
        scope: defaultScope,
      });
      setOriginalResource(null);
      setIsEditing(false);
      setFormError(null);
      setIsModalOpen(true);
    },
    []
  );

  const openEditModal = useCallback((resource: PiResourceEntry) => {
    setFormData(resourceToFormData(resource));
    setOriginalResource(resource);
    setIsEditing(true);
    setFormError(null);
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setFormError(null);
    setOriginalResource(null);
    setIsSaving(false);
  }, []);

  const updateFormField = useCallback(
    <K extends keyof ResourceFormData>(
      field: K,
      value: ResourceFormData[K]
    ) => {
      setFormData((prev) => ({
        ...prev,
        [field]: value,
      }));
      setFormError(null);
    },
    []
  );

  const handleSave = useCallback(
    async (
      saveFn: (
        payload: SavePiResourcePayload,
        original?: PiResourceEntry | null
      ) => Promise<boolean>,
      t: (key: TranslationKey, params?: Record<string, string | number>) => string,
      cwd?: string
    ): Promise<boolean> => {
      const errorMsg = validateResourceForm(formData, t);
      if (errorMsg) {
        setFormError(errorMsg);
        return false;
      }

      setIsSaving(true);
      setFormError(null);

      try {
        const payload = formDataToSavePayload(formData, originalResource, cwd);
        const success = await saveFn(payload, originalResource);
        if (success) {
          closeModal();
          return true;
        }
        return false;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setFormError(message);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [formData, originalResource, closeModal]
  );

  return {
    isModalOpen,
    isEditing,
    isSaving,
    originalResource,
    formData,
    formError,
    setFormData,
    setFormError,
    openAddModal,
    openEditModal,
    closeModal,
    updateFormField,
    handleSave,
  };
}
