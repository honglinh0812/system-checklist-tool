import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from '../../i18n/useTranslation';
import ErrorMessage from '../../components/common/ErrorMessage';

const Login: React.FC = () => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    remember: false
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { login, user, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect if already logged in
  useEffect(() => {
    if (!isLoading && user) {
      const from = (location.state as any)?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    }
  }, [user, isLoading, navigate, location]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(formData.username, formData.password, formData.remember);
      // Don't navigate here, let useEffect handle it
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="hold-transition login-page">
      <div className="login-box">
        <div className="card card-outline card-primary">
          <div className="card-header text-center">
            <a href="#" className="h1">
              <i className="fas fa-clipboard-check"></i> {t('systemChecklist')}
            </a>
          </div>
          <div className="card-body">
            <p className="login-box-msg">{t('signInToStartSession')}</p>

            {error && (
              <ErrorMessage
                message={error}
                type="danger"
                dismissible
                onDismiss={() => setError(null)}
              />
            )}

            <form onSubmit={handleSubmit}>
              <div className="input-group mb-3">
                <input 
                  type="text" 
                  name="username" 
                  className="form-control" 
                  placeholder={t('usernamePlaceholder')} 
                  value={formData.username}
                  onChange={handleInputChange}
                  required 
                />
                <div className="input-group-append">
                  <div className="input-group-text">
                    <span className="fas fa-user"></span>
                  </div>
                </div>
              </div>
              <div className="input-group mb-3">
                <input 
                  type="password" 
                  name="password" 
                  className="form-control" 
                  placeholder={t('passwordPlaceholder')} 
                  value={formData.password}
                  onChange={handleInputChange}
                  required 
                />
                <div className="input-group-append">
                  <div className="input-group-text">
                    <span className="fas fa-lock"></span>
                  </div>
                </div>
              </div>
              <div className="row">
                <div className="col-8">
                  <div className="icheck-primary">
                    <input 
                      type="checkbox" 
                      id="remember" 
                      name="remember"
                      checked={formData.remember}
                      onChange={handleInputChange}
                    />
                    <label htmlFor="remember">
                      {t('rememberMe')}
                    </label>
                  </div>
                </div>
                <div className="col-4">
                  <button 
                    type="submit" 
                    className="btn btn-primary btn-block"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        {t('signingIn')}
                      </>
                    ) : (
                      t('signIn')
                    )}
                  </button>
                </div>
              </div>
            </form>

            <p className="mb-1">
              <a href="#">{t('forgotPassword')}</a>
            </p>
            <div className="text-center mt-3">
              <a href="/register" className="text-center">
                {t('noAccountRegister')}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;