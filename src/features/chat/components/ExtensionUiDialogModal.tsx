import React from 'react';
import {
  ExtensionUiPromptBar,
  type ExtensionUiPromptBarProps,
} from './ExtensionUiPromptBar';

export interface ExtensionUiDialogModalProps
  extends Omit<ExtensionUiPromptBarProps, 'onMultiSelectSubmit'> {
  onMultiSelectSubmit?: (itemKey: string, desiredToggled: boolean[]) => void;
}

/**
 * Backward-compatibility wrapper for ExtensionUiPromptBar.
 * Note: The floating modal overlay has been superseded by the in-place ExtensionUiPromptBar
 * embedded directly into the chat footer.
 */
export const ExtensionUiDialogModal: React.FC<ExtensionUiDialogModalProps> = ({
  onMultiSelectSubmit = () => {},
  ...props
}) => {
  return (
    <ExtensionUiPromptBar
      onMultiSelectSubmit={onMultiSelectSubmit}
      {...props}
    />
  );
};

export { ExtensionUiPromptBar, type ExtensionUiPromptBarProps };
export default ExtensionUiDialogModal;
