import pandas as pd
import os
import logging
import re
from typing import List, Dict, Any, Tuple
from werkzeug.datastructures import FileStorage
from .command_sanitizer import CommandSanitizer

logger = logging.getLogger(__name__)

class AppendixParser:
    """Service to parse MOP appendix files and extract commands"""
    
    def __init__(self):
        # New 5-column strict format (no Extract/Status, no legacy support)
        self.required_columns = ['ID', 'Command name', 'Command', 'Comparator', 'Reference Value']
        self.legacy_columns = []
        self.allowed_extensions = ['xlsx', 'xls', 'csv', 'txt']
        self.sanitizer = CommandSanitizer()
    
    def parse_appendix_file(self, file_path: str) -> Tuple[bool, List[Dict[str, Any]], str]:
        """
        Parse appendix file and extract commands
        
        Args:
            file_path: Path to the appendix file
            
        Returns:
            Tuple of (success, commands_list, error_message)
        """
        try:
            if not os.path.exists(file_path):
                return False, [], "File not found"
            
            # Get file extension
            file_extension = file_path.rsplit('.', 1)[1].lower() if '.' in file_path else ''
            
            if file_extension not in self.allowed_extensions:
                return False, [], f"Unsupported file format: {file_extension}"
            
            # Read file based on extension
            try:
                if file_extension in ['xlsx', 'xls']:
                    df = pd.read_excel(file_path)
                elif file_extension in ['csv', 'txt']:
                    df = pd.read_csv(file_path)
                else:
                    return False, [], f"Unsupported file format: {file_extension}"
            except Exception as e:
                logger.error(f"Error reading file {file_path}: {str(e)}")
                return False, [], f"Error reading file: {str(e)}"
            
            # Validate columns
            success, error_msg = self._validate_columns(df)
            if not success:
                return False, [], error_msg
            
            # Extract commands
            commands = self._extract_commands(df)
            
            if not commands:
                return False, [], "No valid commands found in the file"
            
            logger.info(f"Successfully parsed {len(commands)} commands from {file_path}")
            return True, commands, ""
            
        except Exception as e:
            logger.error(f"Error parsing appendix file {file_path}: {str(e)}")
            return False, [], f"Error parsing file: {str(e)}"
    
    def _validate_file_structure(self, df: pd.DataFrame) -> Tuple[bool, str]:
        """
        Comprehensive validation of file structure and content
        
        Args:
            df: DataFrame to validate
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if df.empty:
            return False, "File is empty"
        
        # Validate columns
        success, error_msg = self._validate_columns(df)
        if not success:
            return False, error_msg
        
        # Validate content
        success, error_msg = self._validate_content(df)
        if not success:
            return False, error_msg
        
        return True, ""
    
    def _validate_columns(self, df: pd.DataFrame) -> Tuple[bool, str]:
        """
        Validate that the DataFrame has required columns
        Supports both 6-column format and legacy 3-column format
        
        Args:
            df: DataFrame to validate
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if df.empty:
            return False, "File is empty"
        
        # Check if required columns exist (case-insensitive)
        df_columns = [col.strip() for col in df.columns]
        
        # Enforce strict 5-column format
        missing = []
        for required_col in self.required_columns:
            found = False
            for df_col in df_columns:
                if df_col.lower() == required_col.lower():
                    found = True
                    break
            if not found:
                missing.append(required_col)
        
        if not missing:
            logger.info("Detected strict 5-column format")
            return True, ""
        
        return False, f"File must have exact 5 columns {self.required_columns}. Missing: {missing}"
    
    def _validate_content(self, df: pd.DataFrame) -> Tuple[bool, str]:
        """
        Validate the content of each row in the DataFrame
        
        Args:
            df: DataFrame to validate
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        # Normalize column names for strict 5-column format
        column_mapping = {}
        for col in df.columns:
            col_lower = col.strip().lower()
            if col_lower == 'command name':
                column_mapping['title'] = col
            elif col_lower == 'command':
                column_mapping['command_text'] = col
            elif col_lower == 'reference value':
                column_mapping['reference_value'] = col
            elif col_lower == 'id':
                column_mapping['command_id_ref'] = col
            elif col_lower == 'comparator':
                column_mapping['comparator_method'] = col
        
        errors = []
        valid_rows = 0
        
        for index, row in df.iterrows():
            row_num = index + 1
            row_errors = []
            
            # Command name required (non-empty after strip)
            if 'title' in column_mapping:
                title = row[column_mapping['title']] if pd.notna(row[column_mapping['title']]) else ""
                if isinstance(title, str):
                    title = title.strip()
                    if not title:
                        row_errors.append("Command name is empty")
                else:
                    row_errors.append("Command name must be text")
            
            # Check Command (required)
            command = ""
            if 'command_text' in column_mapping:
                command = row[column_mapping['command_text']] if pd.notna(row[column_mapping['command_text']]) else ""
                if isinstance(command, str):
                    command = command.strip()
                    if not command:
                        row_errors.append("Command is empty")
                    else:
                        # Note: Dangerous commands will be sanitized during processing
                        # We don't reject them here, just log for awareness
                        dangerous_patterns = ['rm -rf', 'format', 'del /f', 'shutdown', 'reboot', 'halt']
                        if any(pattern in command.lower() for pattern in dangerous_patterns):
                            logger.warning(f"Row {row_num}: Command contains potentially dangerous operations that will be sanitized: {command}")
                        
                        # Check command length
                        if len(command) > 1000:
                            row_errors.append("Command is too long (max 1000 characters)")
                else:
                    row_errors.append("Command must be text")
            
            # Check Comparator (required)
            comparator = ""
            if 'comparator_method' in column_mapping:
                comparator = row[column_mapping['comparator_method']] if pd.notna(row[column_mapping['comparator_method']]) else ""
                if isinstance(comparator, str):
                    comparator = comparator.strip()
                    if not comparator:
                        row_errors.append("Comparator is empty")
                else:
                    row_errors.append("Comparator must be text")

            # Check Reference Value (may be optional depending on comparator, validate length)
            ref_value = ""
            if 'reference_value' in column_mapping:
                ref_value = row[column_mapping['reference_value']] if pd.notna(row[column_mapping['reference_value']]) else ""
                if isinstance(ref_value, str):
                    ref_value = ref_value.strip()
                    # Check reference value length
                    if len(ref_value) > 500:
                        row_errors.append("Reference Value is too long (max 500 characters)")
            
            # Skip completely empty rows
            title = row[column_mapping['title']] if 'title' in column_mapping and pd.notna(row[column_mapping['title']]) else ""
            if not title and not command and not comparator and not ref_value:
                continue
            
            if row_errors:
                errors.append(f"Row {row_num}: {'; '.join(row_errors)}")
            else:
                valid_rows += 1
        
        if valid_rows == 0:
            return False, "No valid commands found in the file"
        
        if errors:
            if len(errors) > 10:  # Limit error messages
                error_msg = "\n".join(errors[:10]) + f"\n... and {len(errors) - 10} more errors"
            else:
                error_msg = "\n".join(errors)
            return False, f"File validation errors:\n{error_msg}"
        
        return True, ""
    
    def _extract_commands(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        """
        Extract commands from DataFrame (strict 5-column format only)
        
        Args:
            df: DataFrame containing command data
            
        Returns:
            List of command dictionaries
        """
        commands = []
        
        # Detect format and normalize column names (case-insensitive mapping)
        column_mapping = {}
        
        for col in df.columns:
            col_lower = col.strip().lower()
            if col_lower == 'id':
                column_mapping['command_id_ref'] = col
            elif col_lower == 'command name':
                column_mapping['title'] = col
            elif col_lower == 'command':
                column_mapping['command_text'] = col
            elif col_lower == 'comparator':
                column_mapping['comparator_method'] = col
            elif col_lower == 'reference value':
                column_mapping['reference_value'] = col
        
        for index, row in df.iterrows():
            try:
                # Skip empty rows - check if columns exist first
                title_empty = True
                command_empty = True
                
                if 'title' in column_mapping:
                    title_empty = pd.isna(row[column_mapping['title']])
                if 'command_text' in column_mapping:
                    command_empty = pd.isna(row[column_mapping['command_text']])
                    
                if title_empty and command_empty:
                    continue
                
                title = str(row[column_mapping['title']]).strip() if 'title' in column_mapping and pd.notna(row[column_mapping['title']]) else f"Command_{index + 1}"
                command_text = str(row[column_mapping['command_text']]).strip() if 'command_text' in column_mapping and pd.notna(row[column_mapping['command_text']]) else ""
                reference_value = str(row[column_mapping['reference_value']]).strip() if 'reference_value' in column_mapping and pd.notna(row[column_mapping['reference_value']]) else ""
                comparator_method = str(row[column_mapping['comparator_method']]).strip() if 'comparator_method' in column_mapping and pd.notna(row[column_mapping['comparator_method']]) else "eq"
                
                # Skip condition parsing moved to new smart execution system
                
                # Skip rows with empty command
                if not command_text:
                    logger.warning(f"Skipping row {index + 1}: empty command")
                    continue
                
                # Sanitize command
                sanitize_result = self.sanitizer.sanitize_command(command_text)
                sanitized_command = sanitize_result['sanitized']
                sanitize_warnings = sanitize_result['warnings']
                
                # Dynamic reference detection moved to new smart execution system
                
                # Build strict 5-column command object
                if 'command_id_ref' not in column_mapping or pd.isna(row[column_mapping['command_id_ref']]):
                    logger.error(f"Row {index + 1} is missing required ID column. Skipping row.")
                    continue
                command_id_ref = str(row[column_mapping['command_id_ref']]).strip()
                if not command_id_ref:
                    logger.error(f"Row {index + 1} has empty ID after strip. Skipping row.")
                    continue

                command_dict = {
                    'command_id_ref': command_id_ref,
                    'title': title,
                    'command_text': sanitized_command,
                    'original_command': command_text,
                    'reference_value': reference_value,
                    'comparator_method': comparator_method,
                    'order_index': len(commands) + 1,
                    'is_critical': False,
                    'timeout_seconds': 30,
                    'sanitized': sanitize_result['is_modified'],
                    'sanitize_warnings': sanitize_warnings
                }
                
                commands.append(command_dict)
                
            except Exception as e:
                logger.warning(f"Error processing row {index + 1}: {str(e)}")
                continue
        
        return commands
    
    def _extract_command_id_from_title(self, title: str, fallback_index: int) -> str:
        """
        Extract command ID from title for smart execution
        
        Strategy: Use original MOP numbering scheme for consistency with skip conditions
        
        Args:
            title: Command title from MOP
            fallback_index: Fallback sequential index (1-based)
            
        Returns:
            Extracted command ID matching MOP's original scheme
        """
        if not title:
            return str(fallback_index)
        
        import re
        
        # Pattern 1: Extract numbered prefix (1., 2., 6., 11., 1p., etc.)
        # This preserves the original MOP numbering scheme
        number_pattern = re.compile(r'^(\d+[a-z]*)\.\s')
        match = number_pattern.match(title)
        if match:
            extracted_id = match.group(1)
            
            # Special handling: If this is command 1 and might be referenced as '1p'
            # Check if this could be a reference command by analyzing title content
            if extracted_id == '1' and self._might_be_reference_command(title):
                return '1p'
            
            return extracted_id
        
        # Pattern 2: For commands without explicit numbering, use sequential
        # This ensures every command has a consistent ID
        return str(fallback_index)
    
    def _might_be_reference_command(self, title: str) -> bool:
        """
        Heuristic to detect if a command might be referenced by skip conditions
        
        Args:
            title: Command title to analyze
            
        Returns:
            True if this command might be referenced as '1p' by skip conditions
        """
        # Look for keywords that suggest this is a detection/check command
        # that might be referenced by skip conditions
        reference_indicators = [
            'detect', 'check', 'verify', 'test', 'validate',
            'RDO', 'VMware', 'system', 'platform'
        ]
        
        title_lower = title.lower()
        return any(indicator in title_lower for indicator in reference_indicators)
    
    def _determine_validation_type(self, reference_value: str) -> str:
        """
        Determine validation type based on reference value
        
        Args:
            reference_value: The reference value to analyze
            
        Returns:
            Validation type string
        """
        if not reference_value:
            return 'exact_match'
        
        ref_lower = reference_value.lower().strip()
        
        # Check for comparison operators
        if any(op in ref_lower for op in ['>=', '<=', '>', '<', '!=']):
            return 'comparison'
        
        # Check for regex patterns
        if any(char in reference_value for char in ['^', '$', '*', '+', '?', '[', ']', '(', ')', '|']):
            return 'regex'
        
        # Check for contains patterns
        if 'contains:' in ref_lower or 'include:' in ref_lower:
            return 'contains'
        
        # Default to exact match
        return 'exact_match'
    
    def validate_file_before_upload(self, file: FileStorage) -> Tuple[bool, str]:
        """
        Validate file before processing (without saving)
        
        Args:
            file: FileStorage object from request
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        try:
            if not file or not file.filename:
                return False, "No file provided"
            
            # Check file extension
            file_extension = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
            if file_extension not in self.allowed_extensions:
                return False, f"Unsupported file format. Allowed formats: {', '.join(self.allowed_extensions)}"
            
            # Check file size (max 10MB)
            file.seek(0, 2)  # Seek to end
            file_size = file.tell()
            file.seek(0)  # Reset to beginning
            
            if file_size > 10 * 1024 * 1024:  # 10MB
                return False, "File size too large. Maximum allowed size is 10MB"
            
            if file_size == 0:
                return False, "File is empty"
            
            # Try to read the file content to validate structure
            try:
                if file_extension in ['xlsx', 'xls']:
                    df = pd.read_excel(file)
                elif file_extension in ['csv', 'txt']:
                    # Try different encodings for CSV/TXT files
                    encodings = ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']
                    df = None
                    for encoding in encodings:
                        try:
                            file.seek(0)
                            df = pd.read_csv(file, encoding=encoding)
                            break
                        except UnicodeDecodeError:
                            continue
                    
                    if df is None:
                        return False, "Unable to read file. Please check file encoding or format"
                else:
                    return False, f"Unsupported file format: {file_extension}"
                
                # Reset file pointer
                file.seek(0)
                
                # Validate file structure and content
                success, error_msg = self._validate_file_structure(df)
                if not success:
                    return False, error_msg
                
                return True, ""
                
            except Exception as e:
                logger.error(f"Error validating file content: {str(e)}")
                return False, f"Error reading file content: {str(e)}"
            
        except Exception as e:
            logger.error(f"Error validating file: {str(e)}")
            return False, f"Error validating file: {str(e)}"
    
    def _old_parse_skip_condition_removed(self, title: str):
        """
        Parse skip condition from command title using syntax: [SKIP_IF:condition_id:"condition_value"] Original Title
        
        Args:
            title: Command title that may contain skip condition
            
        Returns:
            Dictionary with skip condition info or None if no skip condition found
        """
        # Pattern to match [SKIP_IF:condition_id:"condition_value"] at the beginning of title
        # Also support legacy format [SKIP_IF:condition_id:condition_type] for backward compatibility
        pattern = r'^\[SKIP_IF:([^:]+):([^\]]+)\]\s*(.*)$'
        match = re.match(pattern, title.strip())
        
        if not match:
            return None
            
        condition_id = match.group(1).strip()
        condition_value_raw = match.group(2).strip()
        clean_title = match.group(3).strip()
        
        # Check if it's a quoted value (new format) or legacy format
        if condition_value_raw.startswith('"') and condition_value_raw.endswith('"'):
            # New format: [SKIP_IF:command_id:"value"]
            condition_value = condition_value_raw[1:-1]  # Remove quotes
            condition_type = 'value_match'  # New type for value matching
        else:
            # Legacy format: [SKIP_IF:command_id:empty|not_empty|ok|not_ok]
            condition_type = condition_value_raw.lower()
            condition_value = None
            
            # Normalize common variations
            if condition_type == 'non_empty':
                condition_type = 'not_empty'
            
            # Validate legacy condition types
            valid_legacy_types = ['empty', 'not_empty', 'ok', 'not_ok']
            if condition_type not in valid_legacy_types:
                logger.warning(f"Invalid skip condition type '{condition_type}' in title '{title}'. Valid legacy types: {valid_legacy_types} or use quoted value format")
                return None
            
        pass  # Method removed