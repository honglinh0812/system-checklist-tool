import pandas as pd
import os
import logging
from typing import List, Dict, Any, Tuple
from werkzeug.datastructures import FileStorage
from .command_sanitizer import CommandSanitizer

logger = logging.getLogger(__name__)

class AppendixParser:
    """Service to parse MOP appendix files and extract commands"""
    
    def __init__(self):
        self.required_columns = ['ID', 'Name', 'Command', 'Extract', 'Comparator', 'Reference Value']
        self.legacy_columns = ['Command Name', 'Command', 'Reference Value']  # For backward compatibility
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
        
        # Check for 6-column format first
        missing_6col = []
        for required_col in self.required_columns:
            found = False
            for df_col in df_columns:
                if df_col.lower() == required_col.lower():
                    found = True
                    break
            if not found:
                missing_6col.append(required_col)
        
        # If 6-column format is complete, use it
        if not missing_6col:
            logger.info("Detected 6-column format")
            return True, ""
        
        # Check for legacy 3-column format
        missing_3col = []
        for required_col in self.legacy_columns:
            found = False
            for df_col in df_columns:
                if df_col.lower() == required_col.lower():
                    found = True
                    break
            if not found:
                missing_3col.append(required_col)
        
        # If 3-column format is complete, use it
        if not missing_3col:
            logger.info("Detected legacy 3-column format")
            return True, ""
        
        # Neither format is complete
        return False, f"File must have either 6-column format {self.required_columns} or legacy 3-column format {self.legacy_columns}. Missing columns: 6-col: {missing_6col}, 3-col: {missing_3col}"
    
    def _validate_content(self, df: pd.DataFrame) -> Tuple[bool, str]:
        """
        Validate the content of each row in the DataFrame
        
        Args:
            df: DataFrame to validate
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        # Normalize column names for easier access
        column_mapping = {}
        for col in df.columns:
            col_lower = col.strip().lower()
            # Handle both 6-column and 3-column formats
            if col_lower in ['command name', 'name']:
                column_mapping['title'] = col
            elif col_lower == 'command':
                column_mapping['command'] = col
            elif col_lower == 'reference value':
                column_mapping['reference_value'] = col
            elif col_lower == 'id':
                column_mapping['id'] = col
            elif col_lower == 'extract':
                column_mapping['extract'] = col
            elif col_lower == 'comparator':
                column_mapping['comparator'] = col
        
        errors = []
        valid_rows = 0
        
        for index, row in df.iterrows():
            row_num = index + 1
            row_errors = []
            
            # Check Command Name (if exists) - validation removed per user request
            if 'title' in column_mapping:
                title = row[column_mapping['title']] if pd.notna(row[column_mapping['title']]) else ""
                if isinstance(title, str):
                    title = title.strip()
                    # Validation for invalid characters removed
            
            # Check Command
            command = ""
            if 'command' in column_mapping:
                command = row[column_mapping['command']] if pd.notna(row[column_mapping['command']]) else ""
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
            
            # Check Reference Value
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
            if not title and not command and not ref_value:
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
        Extract commands from DataFrame
        Supports both 6-column format and legacy 3-column format
        
        Args:
            df: DataFrame containing command data
            
        Returns:
            List of command dictionaries
        """
        commands = []
        
        # Detect format and normalize column names (case-insensitive mapping)
        column_mapping = {}
        is_6_column_format = False
        
        for col in df.columns:
            col_lower = col.strip().lower()
            # 6-column format mapping
            if col_lower == 'id':
                column_mapping['command_id_ref'] = col
                is_6_column_format = True
            elif col_lower == 'name':
                column_mapping['title'] = col
                is_6_column_format = True
            elif col_lower == 'extract':
                column_mapping['extract_method'] = col
                is_6_column_format = True
            elif col_lower == 'comparator':
                column_mapping['comparator_method'] = col
                is_6_column_format = True
            # Common columns
            elif col_lower == 'command':
                column_mapping['command'] = col
            elif col_lower == 'reference value':
                column_mapping['reference_value'] = col
            # Legacy 3-column format mapping
            elif col_lower == 'command name':
                column_mapping['title'] = col
        
        for index, row in df.iterrows():
            try:
                # Skip empty rows - check if columns exist first
                title_empty = True
                command_empty = True
                
                if 'title' in column_mapping:
                    title_empty = pd.isna(row[column_mapping['title']])
                if 'command' in column_mapping:
                    command_empty = pd.isna(row[column_mapping['command']])
                    
                if title_empty and command_empty:
                    continue
                
                title = str(row[column_mapping['title']]).strip() if 'title' in column_mapping and pd.notna(row[column_mapping['title']]) else f"Command_{index + 1}"
                command = str(row[column_mapping['command']]).strip() if 'command' in column_mapping and pd.notna(row[column_mapping['command']]) else ""
                reference_value = str(row[column_mapping['reference_value']]).strip() if 'reference_value' in column_mapping and pd.notna(row[column_mapping['reference_value']]) else ""
                
                # Skip rows with empty command
                if not command:
                    logger.warning(f"Skipping row {index + 1}: empty command")
                    continue
                
                # Sanitize command
                sanitize_result = self.sanitizer.sanitize_command(command)
                sanitized_command = sanitize_result['sanitized']
                sanitize_warnings = sanitize_result['warnings']
                
                command_dict = {
                    'title': title,
                    'command': sanitized_command,
                    'original_command': command,
                    'reference_value': reference_value,
                    'validation_type': self._determine_validation_type(reference_value) if not is_6_column_format else 'extract_compare',
                    'order_index': len(commands) + 1,
                    'is_critical': False,  # Default to non-critical
                    'timeout_seconds': 30,  # Default timeout
                    'sanitized': sanitize_result['is_modified'],
                    'sanitize_warnings': sanitize_warnings
                }
                
                # Add 6-column format specific fields
                if is_6_column_format:
                    command_dict['command_id_ref'] = str(row[column_mapping['command_id_ref']]).strip() if 'command_id_ref' in column_mapping and pd.notna(row[column_mapping['command_id_ref']]) else f"cmd_{index + 1}"
                    command_dict['extract_method'] = str(row[column_mapping['extract_method']]).strip() if 'extract_method' in column_mapping and pd.notna(row[column_mapping['extract_method']]) else 'raw'
                    command_dict['comparator_method'] = str(row[column_mapping['comparator_method']]).strip() if 'comparator_method' in column_mapping and pd.notna(row[column_mapping['comparator_method']]) else 'eq'
                else:
                    # Default values for legacy format
                    command_dict['command_id_ref'] = f"cmd_{index + 1}"
                    command_dict['extract_method'] = 'raw'
                    command_dict['comparator_method'] = 'eq'
                
                commands.append(command_dict)
                
            except Exception as e:
                logger.warning(f"Error processing row {index + 1}: {str(e)}")
                continue
        
        return commands
    
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