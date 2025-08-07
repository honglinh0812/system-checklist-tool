import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Server } from '../types';
import { API_BASE_URL } from '../config';

interface FileUploadProps {
  onUpload: (servers: Server[]) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onUpload }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setIsUploading(true);
    setUploadStatus('idle');
    setErrorMessage('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE_URL}/api/upload/servers`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setUploadStatus('success');
        onUpload(data.servers);
      } else {
        setUploadStatus('error');
        setErrorMessage(data.error || 'Lỗi khi upload file');
      }
    } catch (error) {
      setUploadStatus('error');
      setErrorMessage('Lỗi kết nối server');
    } finally {
      setIsUploading(false);
    }
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
      'text/plain': ['.txt']
    },
    multiple: false
  });

  return (
    <div className="file-upload">
      <div
        {...getRootProps()}
        className={`dropzone ${isDragActive ? 'active' : ''} ${uploadStatus}`}
      >
        <input {...getInputProps()} />
        
        {isUploading ? (
          <div className="upload-content">
            <div className="spinner"></div>
            <p>Đang xử lý file...</p>
          </div>
        ) : uploadStatus === 'success' ? (
          <div className="upload-content">
            <span className="icon success">✅</span>
            <p>Upload thành công!</p>
          </div>
        ) : uploadStatus === 'error' ? (
          <div className="upload-content">
            <span className="icon error">❌</span>
            <p>Upload thất bại</p>
            {errorMessage && <p className="error-message">{errorMessage}</p>}
          </div>
        ) : (
          <div className="upload-content">
            <span className="icon">📁</span>
            <p>
              {isDragActive
                ? 'Thả file vào đây...'
                : 'Kéo thả file vào đây hoặc click để chọn file'
              }
            </p>
            <p className="file-types">
              Hỗ trợ: .xlsx, .xls, .csv, .txt
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUpload; 