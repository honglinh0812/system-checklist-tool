import logging
import logging.handlers
import os
from datetime import datetime
from typing import Dict, List, Any, Optional
import json
from pathlib import Path

class LoggingSystem:
    def __init__(self, log_dir: str = "logs"):
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(exist_ok=True)
        
        # Log rotation settings
        self.max_bytes = 10 * 1024 * 1024  # 10MB
        self.backup_count = 5
        
        # Initialize loggers
        self.server_logger = self._setup_server_logger()
        self.mop_logger = self._setup_mop_logger()
        self.execution_logger = self._setup_execution_logger()
        self.error_logger = self._setup_error_logger()
    
    def _setup_server_logger(self) -> logging.Logger:
        """Setup logger for server detail logs"""
        logger = logging.getLogger('server_detail')
        logger.setLevel(logging.INFO)
        
        # Prevent duplicate handlers
        if logger.handlers:
            return logger
        
        # File handler with rotation
        log_file = self.log_dir / "server_detail.log"
        handler = logging.handlers.RotatingFileHandler(
            log_file, maxBytes=self.max_bytes, backupCount=self.backup_count
        )
        
        # Formatter
        formatter = logging.Formatter(
            '%(asctime)s - %(levelname)s - %(name)s - %(message)s'
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        
        return logger
    
    def _setup_mop_logger(self) -> logging.Logger:
        """Setup logger for MOP summary logs"""
        logger = logging.getLogger('mop_summary')
        logger.setLevel(logging.INFO)
        
        # Prevent duplicate handlers
        if logger.handlers:
            return logger
        
        # File handler with rotation
        log_file = self.log_dir / "mop_summary.log"
        handler = logging.handlers.RotatingFileHandler(
            log_file, maxBytes=self.max_bytes, backupCount=self.backup_count
        )
        
        # Formatter
        formatter = logging.Formatter(
            '%(asctime)s - %(levelname)s - %(name)s - %(message)s'
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        
        return logger
    
    def _setup_execution_logger(self) -> logging.Logger:
        """Setup logger for execution logs"""
        logger = logging.getLogger('execution')
        logger.setLevel(logging.INFO)
        
        # Prevent duplicate handlers
        if logger.handlers:
            return logger
        
        # File handler with rotation
        log_file = self.log_dir / "execution.log"
        handler = logging.handlers.RotatingFileHandler(
            log_file, maxBytes=self.max_bytes, backupCount=self.backup_count
        )
        
        # Formatter
        formatter = logging.Formatter(
            '%(asctime)s - %(levelname)s - %(name)s - %(message)s'
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        
        return logger
    
    def _setup_error_logger(self) -> logging.Logger:
        """Setup logger for error logs"""
        logger = logging.getLogger('error')
        logger.setLevel(logging.ERROR)
        
        # Prevent duplicate handlers
        if logger.handlers:
            return logger
        
        # File handler with rotation
        log_file = self.log_dir / "error.log"
        handler = logging.handlers.RotatingFileHandler(
            log_file, maxBytes=self.max_bytes, backupCount=self.backup_count
        )
        
        # Formatter
        formatter = logging.Formatter(
            '%(asctime)s - %(levelname)s - %(name)s - %(funcName)s:%(lineno)d - %(message)s'
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        
        return logger
    
    def log_server_detail(self, server_ip: str, command: str, output: str, 
                         stderr: str = "", execution_time: float = 0, 
                         is_valid: bool = False, validation_details: Dict = None):
        """
        Log detailed server execution information
        
        Args:
            server_ip: Server IP address
            command: Command executed
            output: Command output
            stderr: Error output
            execution_time: Execution time in seconds
            is_valid: Whether the command passed validation
            validation_details: Additional validation details
        """
        log_data = {
            'timestamp': datetime.now().isoformat(),
            'server_ip': server_ip,
            'command': command,
            'output': output,
            'stderr': stderr,
            'execution_time': execution_time,
            'is_valid': is_valid,
            'validation_details': validation_details or {}
        }
        
        self.server_logger.info(f"Server Detail: {json.dumps(log_data, indent=2)}")
    
    def log_mop_summary(self, mop_id: int, mop_name: str, execution_type: str,
                       total_servers: int, total_commands: int, passed_commands: int,
                       failed_commands: int, success_rate: float, execution_time: float,
                       executed_by: str, server_results: List[Dict] = None):
        """
        Log MOP execution summary
        
        Args:
            mop_id: MOP ID
            mop_name: MOP name
            execution_type: Type of execution (risk/handover)
            total_servers: Total number of servers
            total_commands: Total number of commands
            passed_commands: Number of passed commands
            failed_commands: Number of failed commands
            success_rate: Success rate percentage
            execution_time: Total execution time
            executed_by: User who executed the MOP
            server_results: List of server results
        """
        log_data = {
            'timestamp': datetime.now().isoformat(),
            'mop_id': mop_id,
            'mop_name': mop_name,
            'execution_type': execution_type,
            'total_servers': total_servers,
            'total_commands': total_commands,
            'passed_commands': passed_commands,
            'failed_commands': failed_commands,
            'success_rate': success_rate,
            'execution_time': execution_time,
            'executed_by': executed_by,
            'server_results': server_results or []
        }
        
        self.mop_logger.info(f"MOP Summary: {json.dumps(log_data, indent=2)}")
    
    def log_execution_start(self, mop_id: int, mop_name: str, execution_type: str,
                           servers: List[str], commands: List[str], executed_by: str):
        """Log execution start"""
        log_data = {
            'timestamp': datetime.now().isoformat(),
            'event': 'execution_start',
            'mop_id': mop_id,
            'mop_name': mop_name,
            'execution_type': execution_type,
            'servers': servers,
            'commands': commands,
            'executed_by': executed_by
        }
        
        self.execution_logger.info(f"Execution Start: {json.dumps(log_data, indent=2)}")
    
    def log_execution_end(self, mop_id: int, mop_name: str, execution_type: str,
                         total_time: float, success_rate: float, executed_by: str):
        """Log execution end"""
        log_data = {
            'timestamp': datetime.now().isoformat(),
            'event': 'execution_end',
            'mop_id': mop_id,
            'mop_name': mop_name,
            'execution_type': execution_type,
            'total_time': total_time,
            'success_rate': success_rate,
            'executed_by': executed_by
        }
        
        self.execution_logger.info(f"Execution End: {json.dumps(log_data, indent=2)}")
    
    def log_error(self, error_type: str, error_message: str, context: Dict = None,
                  server_ip: str = None, command: str = None):
        """Log error information"""
        log_data = {
            'timestamp': datetime.now().isoformat(),
            'error_type': error_type,
            'error_message': error_message,
            'context': context or {},
            'server_ip': server_ip,
            'command': command
        }
        
        self.error_logger.error(f"Error: {json.dumps(log_data, indent=2)}")
    
    def log_user_action(self, user_id: int, username: str, action: str, 
                       resource_type: str, resource_id: int = None, details: Dict = None):
        """Log user actions for audit trail"""
        log_data = {
            'timestamp': datetime.now().isoformat(),
            'user_id': user_id,
            'username': username,
            'action': action,
            'resource_type': resource_type,
            'resource_id': resource_id,
            'details': details or {}
        }
        
        self.execution_logger.info(f"User Action: {json.dumps(log_data, indent=2)}")
    
    def log_mop_creation(self, mop_id: int, mop_name: str, created_by: str, 
                        mop_type: str, commands_count: int):
        """Log MOP creation"""
        log_data = {
            'timestamp': datetime.now().isoformat(),
            'event': 'mop_creation',
            'mop_id': mop_id,
            'mop_name': mop_name,
            'created_by': created_by,
            'mop_type': mop_type,
            'commands_count': commands_count
        }
        
        self.mop_logger.info(f"MOP Creation: {json.dumps(log_data, indent=2)}")
    
    def log_mop_approval(self, mop_id: int, mop_name: str, approved_by: str, 
                        status: str, reject_reason: str = None):
        """Log MOP approval/rejection"""
        log_data = {
            'timestamp': datetime.now().isoformat(),
            'event': 'mop_approval',
            'mop_id': mop_id,
            'mop_name': mop_name,
            'approved_by': approved_by,
            'status': status,
            'reject_reason': reject_reason
        }
        
        self.mop_logger.info(f"MOP Approval: {json.dumps(log_data, indent=2)}")
    
    def get_log_files(self) -> Dict[str, str]:
        """Get list of available log files"""
        log_files = {}
        for log_file in self.log_dir.glob("*.log"):
            log_files[log_file.stem] = str(log_file)
        return log_files
    
    def get_log_content(self, log_type: str, lines: int = 100) -> List[str]:
        """
        Get recent log content
        
        Args:
            log_type: Type of log (server_detail, mop_summary, execution, error)
            lines: Number of lines to retrieve
            
        Returns:
            List of log lines
        """
        log_file = self.log_dir / f"{log_type}.log"
        if not log_file.exists():
            return []
        
        try:
            with open(log_file, 'r', encoding='utf-8') as f:
                content = f.readlines()
                return content[-lines:] if len(content) > lines else content
        except Exception as e:
            self.log_error("log_reading", f"Failed to read log file {log_type}: {str(e)}")
            return []
    
    def clear_logs(self, log_type: str = None):
        """
        Clear log files
        
        Args:
            log_type: Specific log type to clear, or None for all
        """
        if log_type:
            log_file = self.log_dir / f"{log_type}.log"
            if log_file.exists():
                log_file.unlink()
        else:
            for log_file in self.log_dir.glob("*.log"):
                log_file.unlink()
    
    def export_logs(self, log_type: str, start_date: str = None, end_date: str = None) -> str:
        """
        Export logs to file
        
        Args:
            log_type: Type of log to export
            start_date: Start date filter (ISO format)
            end_date: End date filter (ISO format)
            
        Returns:
            Path to exported log file
        """
        log_file = self.log_dir / f"{log_type}.log"
        if not log_file.exists():
            raise FileNotFoundError(f"Log file {log_type} not found")
        
        # Create export directory
        export_dir = Path("exports")
        export_dir.mkdir(exist_ok=True)
        
        # Export filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        export_file = export_dir / f"{log_type}_export_{timestamp}.txt"
        
        try:
            with open(log_file, 'r', encoding='utf-8') as source:
                with open(export_file, 'w', encoding='utf-8') as target:
                    for line in source:
                        # Apply date filters if provided
                        if start_date or end_date:
                            try:
                                # Extract timestamp from log line
                                timestamp_str = line.split(' - ')[0]
                                log_date = datetime.fromisoformat(timestamp_str.replace(',', '.'))
                                
                                if start_date:
                                    start_dt = datetime.fromisoformat(start_date)
                                    if log_date < start_dt:
                                        continue
                                
                                if end_date:
                                    end_dt = datetime.fromisoformat(end_date)
                                    if log_date > end_dt:
                                        continue
                            except:
                                # If timestamp parsing fails, include the line
                                pass
                        
                        target.write(line)
            
            return str(export_file)
            
        except Exception as e:
            self.log_error("log_export", f"Failed to export log {log_type}: {str(e)}")
            raise

# Global logging system instance
logging_system = LoggingSystem()
