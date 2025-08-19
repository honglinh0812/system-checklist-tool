import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';
import ErrorMessage from '../../components/common/ErrorMessage';
import type { RegisterCredentials } from '../../types/auth';

const Register: React.FC = () => {
  const [formData, setFormData] = useState<RegisterCredentials>({
    username: '',
    email: '',
    full_name: '',
    password: '',
    confirm_password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const { register } = useAuth();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateForm = (): boolean => {
    if (formData.password !== formData.confirm_password) {
      setError('Passwords do not match');
      return false;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (!validateForm()) {
      setLoading(false);
      return;
    }

    try {
      const response = await register(formData);
      setSuccess(response.message || 'Registration successful! Please wait for admin approval.');
      setFormData({
        username: '',
        email: '',
        full_name: '',
        password: '',
        confirm_password: ''
      });
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="hold-transition register-page">
      <div className="register-box">
        <div className="card card-outline card-primary">
          <div className="card-header text-center">
            <a href="#" className="h1">
              <i className="fas fa-clipboard-check"></i> System Checklist
            </a>
          </div>
          <div className="card-body">
            <p className="login-box-msg">Register a new account</p>

            {error && (
              <ErrorMessage
                message={error}
                type="danger"
                dismissible
                onDismiss={() => setError(null)}
              />
            )}

            {success && (
              <ErrorMessage
                message={success}
                type="info"
                dismissible
                onDismiss={() => setSuccess(null)}
              />
            )}

            <form onSubmit={handleSubmit}>
              <div className="input-group mb-3">
                <input 
                  type="text" 
                  name="full_name" 
                  className="form-control" 
                  placeholder="Full Name" 
                  value={formData.full_name}
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
                  type="text" 
                  name="username" 
                  className="form-control" 
                  placeholder="Username" 
                  value={formData.username}
                  onChange={handleInputChange}
                  required 
                />
                <div className="input-group-append">
                  <div className="input-group-text">
                    <span className="fas fa-user-circle"></span>
                  </div>
                </div>
              </div>
              
              <div className="input-group mb-3">
                <input 
                  type="email" 
                  name="email" 
                  className="form-control" 
                  placeholder="Email" 
                  value={formData.email}
                  onChange={handleInputChange}
                  required 
                />
                <div className="input-group-append">
                  <div className="input-group-text">
                    <span className="fas fa-envelope"></span>
                  </div>
                </div>
              </div>
              
              <div className="input-group mb-3">
                <input 
                  type="password" 
                  name="password" 
                  className="form-control" 
                  placeholder="Password" 
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
              
              <div className="input-group mb-3">
                <input 
                  type="password" 
                  name="confirm_password" 
                  className="form-control" 
                  placeholder="Confirm Password" 
                  value={formData.confirm_password}
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
                  <div className="text-muted small">
                    By registering, you agree that your account will be reviewed by an administrator before activation.
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
                        Registering...
                      </>
                    ) : (
                      'Register'
                    )}
                  </button>
                </div>
              </div>
            </form>

            <div className="text-center mt-3">
              <Link to="/login" className="text-center">
                Already have an account? Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;