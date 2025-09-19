import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const AccessDenied: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const fromPath = (location.state && (location.state as any).from) || location.pathname;

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-xl w-full text-center">
        <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
          <span className="text-2xl text-red-600">!</span>
        </div>
        <h1 className="text-2xl font-semibold mb-2">Access Denied</h1>
        <p className="text-gray-600 mb-4">
          Bạn không có quyền truy cập trang này.
        </p>
        <p className="text-gray-500 text-sm mb-6 break-all">
          Trang: {fromPath}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => navigate(-1)} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300">Quay lại</button>
          <button onClick={() => navigate('/dashboard')} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">Về trang chủ</button>
        </div>
        <div className="mt-6 text-sm text-gray-500">
          Nếu bạn nghĩ đây là nhầm lẫn, vui lòng liên hệ quản trị viên.
        </div>
      </div>
    </div>
  );
};

export default AccessDenied;


