import re
import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

class CommandSanitizer:
    """
    CommandSanitizer v2.0 - Ansible Compatible
    
    Improved sanitization that maintains shell command syntax
    while ensuring Ansible YAML compatibility.
    """
    
    def __init__(self):
        # Dangerous command patterns to remove or replace
        self.dangerous_patterns = [
            r'rm\s+-rf\s+/',
            r'shutdown',
            r'reboot',
            r'halt',
            r'poweroff',
            r'mkfs',
            r'fdisk',
            r'format',
            r'dd\s+if=.*of=/dev/',
            r'>\s*/dev/[a-z]+',
            r':\(\)\{\s*:\|:\&\s*\}\s*;\s*:',  # Fork bomb
        ]
        
        # Dangerous sequences to remove
        self.dangerous_sequences = [
            r';\s*rm\s+-rf',
            r'&&\s*shutdown',
            r'\|\|\s*reboot',
            r';\s*halt',
        ]
        
        # Control characters to remove (only truly dangerous ones)
        self.control_chars = [
            '\x00', '\x01', '\x02', '\x03', '\x04', '\x05', '\x06', '\x07',
            '\x08', '\x0b', '\x0c', '\x0e', '\x0f', '\x10', '\x11', '\x12',
            '\x13', '\x14', '\x15', '\x16', '\x17', '\x18', '\x19', '\x1a',
            '\x1b', '\x1c', '\x1d', '\x1e', '\x1f', '\x7f'
        ]
    
    def _sanitize_shell_command(self, command: str) -> str:
        """
        Sanitize shell command with improved Ansible compatibility
        """
        if not command or not isinstance(command, str):
            return ""
        
        # Remove control characters
        sanitized = command
        for char in self.control_chars:
            sanitized = sanitized.replace(char, '')
        
        # Normalize whitespace
        sanitized = re.sub(r'\s+', ' ', sanitized).strip()
        
        # Fix unbalanced quotes (improved method)
        sanitized = self._fix_unbalanced_quotes(sanitized)
        
        # Replace backticks with safer alternatives
        sanitized = sanitized.replace('`', '$(')
        if sanitized.count('$(') != sanitized.count(')'):
            # If unbalanced, remove command substitution
            sanitized = re.sub(r'\$\([^)]*$', '', sanitized)
        
        # Remove dangerous sequences first
        for sequence in self.dangerous_sequences:
            sanitized = re.sub(sequence, '', sanitized, flags=re.IGNORECASE)
        
        # Remove dangerous command patterns
        for pattern in self.dangerous_patterns:
            sanitized = re.sub(pattern, '', sanitized, flags=re.IGNORECASE)
        
        # Remove multiple consecutive spaces
        sanitized = re.sub(r'\s+', ' ', sanitized).strip()
        
        return sanitized
    
    def _fix_unbalanced_quotes(self, command: str) -> str:
        """
        Fix unbalanced quotes in a way that's compatible with Ansible
        """
        # Count quotes
        double_quotes = command.count('"')
        single_quotes = command.count("'")
        
        # If quotes are balanced, return as is
        if double_quotes % 2 == 0 and single_quotes % 2 == 0:
            return command
        
        # Fix unbalanced double quotes
        if double_quotes % 2 != 0:
            # Find the last unmatched quote and remove it
            last_quote_pos = command.rfind('"')
            if last_quote_pos != -1:
                command = command[:last_quote_pos] + command[last_quote_pos + 1:]
        
        # Fix unbalanced single quotes
        if single_quotes % 2 != 0:
            # Find the last unmatched quote and remove it
            last_quote_pos = command.rfind("'")
            if last_quote_pos != -1:
                command = command[:last_quote_pos] + command[last_quote_pos + 1:]
        
        return command
    
    def sanitize_command(self, command: str) -> Dict[str, Any]:
        """
        Public method to sanitize a command and return result with metadata
        """
        try:
            original_command = command
            sanitized_command = self._sanitize_shell_command(command)
            
            is_modified = original_command != sanitized_command
            
            return {
                'original': original_command,
                'sanitized': sanitized_command,
                'is_modified': is_modified,
                'is_safe': len(sanitized_command.strip()) > 0,
                'warnings': self._get_warnings(original_command, sanitized_command)
            }
        
        except Exception as e:
            logger.error(f"Error sanitizing command: {str(e)}")
            return {
                'original': command,
                'sanitized': '',
                'is_modified': True,
                'is_safe': False,
                'warnings': [f'Sanitization error: {str(e)}']
            }
    
    def _get_warnings(self, original: str, sanitized: str) -> List[str]:
        """
        Generate warnings about what was changed during sanitization
        """
        warnings = []
        
        if original != sanitized:
            warnings.append('Command was modified during sanitization')
        
        if not sanitized.strip():
            warnings.append('Command was completely removed due to safety concerns')
        
        # Check for specific dangerous patterns that were removed
        for pattern in self.dangerous_patterns:
            if re.search(pattern, original, re.IGNORECASE):
                warnings.append(f'Dangerous pattern removed: {pattern}')
        
        # Check for control characters
        for char in self.control_chars:
            if char in original:
                warnings.append('Control characters removed')
                break
        
        return warnings
    
    def batch_sanitize(self, commands: List[str]) -> List[Dict[str, Any]]:
        """
        Sanitize multiple commands at once
        """
        results = []
        for command in commands:
            results.append(self.sanitize_command(command))
        return results