from models import db
from datetime import datetime, timezone, timedelta
from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean
from sqlalchemy.orm import validates
import re

# GMT+7 timezone
GMT_PLUS_7 = timezone(timedelta(hours=7))

class Server(db.Model):
    """Model for storing server information"""
    __tablename__ = 'servers'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=True)  # Optional server name
    ip = Column(String(45), nullable=False, unique=True)  # Support IPv4 and IPv6
    ssh_port = Column(Integer, default=22)  # SSH port
    admin_username = Column(String(100), nullable=False)  # SSH username
    admin_password = Column(Text, nullable=False)  # SSH password (encrypted)
    root_username = Column(String(100), nullable=False)  # Sudo username
    root_password = Column(Text, nullable=False)  # Sudo password (encrypted)
    description = Column(Text, nullable=True)  # Optional description
    is_active = Column(Boolean, default=True)  # Server status
    created_at = Column(DateTime, default=lambda: datetime.now(GMT_PLUS_7))
    updated_at = Column(DateTime, default=lambda: datetime.now(GMT_PLUS_7), onupdate=lambda: datetime.now(GMT_PLUS_7))
    created_by = Column(Integer, nullable=False)  # User ID who created this server
    
    @validates('ip')
    def validate_ip(self, key, ip):
        """Validate IP address format"""
        if not ip:
            raise ValueError('IP address is required')
        
        # Basic IP validation (IPv4)
        ipv4_pattern = r'^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$'
        if not re.match(ipv4_pattern, ip):
            raise ValueError('Invalid IP address format')
        
        return ip
    
    @validates('ssh_port')
    def validate_ssh_port(self, key, port):
        """Validate SSH port"""
        if port is None:
            return 22
        
        # Convert to integer if it's a string
        if isinstance(port, str):
            if not port.isdigit():
                raise ValueError('SSH port must be a valid port number (1-65535)')
            port = int(port)
        
        if not isinstance(port, int) or not (1 <= port <= 65535):
            raise ValueError('SSH port must be a valid port number (1-65535)')
        return port
    
    @validates('admin_username', 'root_username')
    def validate_username(self, key, username):
        """Validate username"""
        if not username or not username.strip():
            raise ValueError(f'{key} is required')
        
        if len(username.strip()) < 1:
            raise ValueError(f'{key} must not be empty')
        
        return username.strip()
    
    @validates('admin_password', 'root_password')
    def validate_password(self, key, password):
        """Validate password"""
        if not password:
            raise ValueError(f'{key} is required')
        
        if len(password) < 1:
            raise ValueError(f'{key} must not be empty')
        
        return password
    
    def to_dict(self):
        """Convert server to dictionary"""
        return {
            'id': self.id,
            'name': self.name,
            'ip': self.ip,
            'ssh_port': self.ssh_port,
            'admin_username': self.admin_username,
            'admin_password': self.admin_password,
            'root_username': self.root_username,
            'root_password': self.root_password,
            'description': self.description,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'created_by': self.created_by
        }
    
    def to_dict_safe(self):
        """Convert server to dictionary without sensitive information"""
        return {
            'id': self.id,
            'name': self.name,
            'ip': self.ip,
            'ssh_port': self.ssh_port,
            'admin_username': self.admin_username,
            'root_username': self.root_username,
            'description': self.description,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'created_by': self.created_by
        }
    
    def __repr__(self):
        return f'<Server {self.ip} ({self.name or "Unnamed"})>'