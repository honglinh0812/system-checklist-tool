import os
from datetime import timedelta

class Config:
    # Basic Flask config
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-key-please-change-in-production'
    
    # Database
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or \
        'postgresql://postgres:postgres@localhost/system_checklist'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Upload config
    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max file size
    
    # Logs config
    LOG_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')
    
    # Reports config
    REPORT_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'reports')
    
    # Session config
    PERMANENT_SESSION_LIFETIME = timedelta(days=1)
    
    # Ensure upload folders exist
    @staticmethod
    def init_app(app):
        os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
        os.makedirs(Config.LOG_FOLDER, exist_ok=True)
        os.makedirs(Config.REPORT_FOLDER, exist_ok=True)
        
        # Create upload subfolders
        os.makedirs(os.path.join(Config.UPLOAD_FOLDER, 'pdf'), exist_ok=True)
        os.makedirs(os.path.join(Config.UPLOAD_FOLDER, 'appendix'), exist_ok=True)

class DevelopmentConfig(Config):
    DEBUG = True
    
class ProductionConfig(Config):
    DEBUG = False
    # In production, ensure to set these environment variables
    SECRET_KEY = os.environ.get('SECRET_KEY')
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL')

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}