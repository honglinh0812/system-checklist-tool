import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_ENDPOINTS, USER_ROLES } from '../utils/constants';
import { useTranslation } from '../i18n/useTranslation';
import ErrorMessage from '../components/common/ErrorMessage';

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const Settings: React.FC = () => {
  const { user } = useAuth();
  const { language, changeLanguage, t } = useTranslation();
  const [darkMode, setDarkMode] = useState(false);
  const [passwordForm, setPasswordForm] = useState<PasswordForm>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load saved preferences from localStorage
  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    
    setDarkMode(savedDarkMode);
    
    // Apply dark mode to body
    if (savedDarkMode) {
      document.body.classList.add('dark-mode');
    }
  }, []);

  const showAlert = (type: 'success' | 'error', message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

  // Handle dark mode toggle
  const handleDarkModeToggle = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    localStorage.setItem('darkMode', newDarkMode.toString());
    
    if (newDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    const mode = newDarkMode ? t('darkMode') : t('lightMode');
    showAlert('success', `${t('themeChanged')}: ${mode.toLowerCase()}`);
  };

  // Handle language change
  const handleLanguageChange = (newLanguage: 'vi' | 'en') => {
    changeLanguage(newLanguage);
    const languageName = newLanguage === 'vi' ? t('vietnamese') : t('english');
    showAlert('success', `${t('languageChanged')}: ${languageName}`);
  };

  // Handle password form change
  const handlePasswordFormChange = (field: keyof PasswordForm, value: string) => {
    setPasswordForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Validate password
  const validatePassword = (password: string): boolean => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    return password.length >= minLength && hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar;
  };

  // Handle password change
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!passwordForm.currentPassword) {
      showAlert('error', t('currentPasswordRequired'));
      return;
    }
    
    if (!passwordForm.newPassword) {
      showAlert('error', t('newPasswordRequired'));
      return;
    }
    
    if (!validatePassword(passwordForm.newPassword)) {
      showAlert('error', t('passwordValidationError'));
      return;
    }
    
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showAlert('error', t('passwordMismatch'));
      return;
    }
    
    setIsChangingPassword(true);
    
    try {
      const response = await fetch(API_ENDPOINTS.USERS.CHANGE_PASSWORD, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          current_password: passwordForm.currentPassword,
          new_password: passwordForm.newPassword
        })
      });
      
      if (response.ok) {
        showAlert('success', t('passwordChanged'));
        setPasswordForm({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
      } else {
        const errorData = await response.json();
        showAlert('error', errorData.message || t('passwordChangeFailed'));
      }
    } catch (error) {
      console.error('Password change error:', error);
      showAlert('error', t('passwordChangeError'));
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="content-header">
      <div className="container-fluid">
        <div className="row mb-2">
          <div className="col-sm-6">
            <h1 className="m-0">{t('settingsTitle')}</h1>
          </div>
          <div className="col-sm-6">
            <ol className="breadcrumb float-sm-right">
              <li className="breadcrumb-item"><a href="#">{t('home')}</a></li>
              <li className="breadcrumb-item active">{t('settings')}</li>
            </ol>
          </div>
        </div>
      </div>
      
      <section className="content">
        <div className="container-fluid">
          <div className="row">
            <div className="col-md-8">
              {alert && (
                <ErrorMessage 
                  message={alert.message} 
                  type={alert.type === 'error' ? 'danger' : alert.type === 'success' ? 'info' : 'warning'}
                  dismissible={true}
                  onDismiss={() => setAlert(null)}
                />
              )}
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">{t('themeSettings')}</h3>
                </div>
                <div className="card-body">
                  {/* Dark Mode Toggle */}
                  <div className="form-group row">
                    <label className="col-sm-3 col-form-label">{t('darkMode')}</label>
                    <div className="col-sm-9">
                      <div className="custom-control custom-switch">
                        <input
                          type="checkbox"
                          className="custom-control-input"
                          id="darkModeSwitch"
                          checked={darkMode}
                          onChange={handleDarkModeToggle}
                        />
                        <label className="custom-control-label" htmlFor="darkModeSwitch">
                          {darkMode ? t('on') : t('off')}
                        </label>
                      </div>
                      <small className="form-text text-muted">
                        {t('darkModeDescription')}
                      </small>
                    </div>
                  </div>
                  
                  {/* Language Selection */}
                  <div className="form-group row">
                    <label className="col-sm-3 col-form-label">{t('languageSettings')}</label>
                    <div className="col-sm-9">
                      <div className="form-check form-check-inline">
                        <input
                          className="form-check-input"
                          type="radio"
                          name="language"
                          id="languageVi"
                          value="vi"
                          checked={language === 'vi'}
                          onChange={(e) => handleLanguageChange(e.target.value as 'vi' | 'en')}
                        />
                        <label className="form-check-label" htmlFor="languageVi">
                          {t('vietnamese')}
                        </label>
                      </div>
                      <div className="form-check form-check-inline">
                        <input
                          className="form-check-input"
                          type="radio"
                          name="language"
                          id="languageEn"
                          value="en"
                          checked={language === 'en'}
                          onChange={(e) => handleLanguageChange(e.target.value as 'vi' | 'en')}
                        />
                        <label className="form-check-label" htmlFor="languageEn">
                          {t('english')}
                        </label>
                      </div>
                      <small className="form-text text-muted">
                        {t('selectLanguage')}
                      </small>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Change Password Card */}
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">{t('passwordSettings')}</h3>
                </div>
                <div className="card-body">
                  <form onSubmit={handlePasswordChange}>
                    <div className="form-group">
                      <label htmlFor="currentPassword">{t('currentPassword')}</label>
                      <input
                        type="password"
                        className="form-control"
                        id="currentPassword"
                        value={passwordForm.currentPassword}
                        onChange={(e) => handlePasswordFormChange('currentPassword', e.target.value)}
                        required
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="newPassword">{t('newPassword')}</label>
                      <input
                        type="password"
                        className="form-control"
                        id="newPassword"
                        value={passwordForm.newPassword}
                        onChange={(e) => handlePasswordFormChange('newPassword', e.target.value)}
                        required
                      />
                      <small className="form-text text-muted">
                        {t('passwordRequirements')}
                      </small>
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="confirmPassword">{t('confirmPassword')}</label>
                      <input
                        type="password"
                        className="form-control"
                        id="confirmPassword"
                        value={passwordForm.confirmPassword}
                        onChange={(e) => handlePasswordFormChange('confirmPassword', e.target.value)}
                        required
                      />
                    </div>
                    
                    <button
                      type="submit" 
                      className="btn btn-primary"
                      disabled={isChangingPassword}
                    >
                      {isChangingPassword ? (
                        <>
                          <i className="fas fa-spinner fa-spin mr-2"></i>
                          {t('changingPassword')}
                        </>
                      ) : (
                        <>
                          <i className="fas fa-key mr-2"></i>
                          {t('changePassword')}
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </div>
            </div>
            
            {/* User Info Sidebar */}
            <div className="col-md-4">
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">{t('accountInfo')}</h3>
                </div>
                <div className="card-body">
                  <div className="text-center mb-3">
                    <i className="fas fa-user-circle" style={{ fontSize: '4rem', color: '#6c757d' }}></i>
                  </div>
                  <table className="table table-borderless">
                    <tbody>
                      <tr>
                        <td><strong>{t('username')}:</strong></td>
                        <td>{user?.username}</td>
                      </tr>
                      <tr>
                        <td><strong>{t('fullName')}:</strong></td>
                        <td>{user?.full_name || t('notUpdated')}</td>
                      </tr>
                      <tr>
                        <td><strong>{t('email')}:</strong></td>
                        <td>{user?.email || t('notUpdated')}</td>
                      </tr>
                      <tr>
                        <td><strong>{t('role')}:</strong></td>
                        <td>
                          <span className={`badge ${
                            user?.role === USER_ROLES.ADMIN ? 'badge-danger' :
                            user?.role === USER_ROLES.USER ? 'badge-primary' : 'badge-secondary'
                          }`}>
                            {user?.role === USER_ROLES.ADMIN ? t('admin') : user?.role === USER_ROLES.USER ? t('user') : user?.role}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Settings;