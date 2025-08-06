import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'your-secret-key-here')
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'postgresql://checklist_user:checklist_password@localhost:5432/checklist_db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
    
    ANSIBLE_PLAYBOOK_PATH = os.getenv('ANSIBLE_PLAYBOOK_PATH', './ansible/playbooks')
    ANSIBLE_INVENTORY_PATH = os.getenv('ANSIBLE_INVENTORY_PATH', './ansible/inventory')
    
    UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', './uploads')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB
    
    DCIM_API_URL = os.getenv('DCIM_API_URL', 'http://localhost:8080/api')
    DCIM_API_TOKEN = os.getenv('DCIM_API_TOKEN', '')
    
    PROMETHEUS_API_URL = os.getenv('PROMETHEUS_API_URL', 'http://localhost:9090/api/v1')
    PROMETHEUS_API_TOKEN = os.getenv('PROMETHEUS_API_TOKEN', '')
    
    REPORT_OUTPUT_DIR = os.getenv('REPORT_OUTPUT_DIR', './reports')
    
    CELERY_BROKER_URL = os.getenv('CELERY_BROKER_URL', 'redis://localhost:6379/1')
    CELERY_RESULT_BACKEND = os.getenv('CELERY_RESULT_BACKEND', 'redis://localhost:6379/1')

class DevelopmentConfig(Config):
    DEBUG = True

class ProductionConfig(Config):
    DEBUG = False

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
} 