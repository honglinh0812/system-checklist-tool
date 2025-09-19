import React from 'react';
import Modal from './Modal';
import { useTranslation } from '../../i18n/useTranslation';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'primary' | 'danger' | 'warning' | 'success';
  isLoading?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  confirmVariant = 'primary',
  isLoading = false,
}) => {
  const { t } = useTranslation();
  
  const handleConfirm = () => {
    onConfirm();
  };

  const footer = (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={onClose}
        disabled={isLoading}
      >
        {cancelText || t('cancel')}
      </button>
      <button
        type="button"
        className={`btn btn-${confirmVariant} ml-2`}
        onClick={handleConfirm}
        disabled={isLoading}
      >
        {isLoading && (
          <span className="spinner-border spinner-border-sm mr-2" role="status" aria-hidden="true"></span>
        )}
        {confirmText || t('confirm')}
      </button>
    </>
  );

  return (
    <Modal
      show={isOpen}
      onHide={onClose}
      title={title}
      footer={footer}
    >
      <p>{message}</p>
    </Modal>
  );
};

export default ConfirmDialog;