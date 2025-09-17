import re
import json
import logging
from typing import Dict, Any, List, Optional, Union
from datetime import datetime, timezone, timedelta
from .extract_processor import ExtractProcessor
from .variable_expander import VariableExpander

# GMT+7 timezone
GMT_PLUS_7 = timezone(timedelta(hours=7))

logger = logging.getLogger(__name__)

class AdvancedValidator:
    """
    Advanced validation class with enhanced features for command output validation
    Provides backward compatibility with CommandValidator while adding new capabilities
    """
    
    def __init__(self):
        self.validation_types = {
            'exact_match': self._validate_exact_match,
            'contains': self._validate_contains,
            'regex': self._validate_regex,
            'comparison': self._validate_comparison,
            'json': self._validate_json,
            'custom': self._validate_custom
        }
        self.extract_processor = ExtractProcessor()
        self.variable_expander = VariableExpander()
        
    def validate_output(self, output: str, expected: str, validation_type: str = 'exact_match', 
                       options: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Enhanced output validation with multiple validation types
        
        Args:
            output: The actual command output
            expected: The expected value or pattern
            validation_type: Type of validation to perform
            options: Additional validation options
            
        Returns:
            Dict containing validation results with enhanced details
        """
        if options is None:
            options = {}
            
        result = {
            'is_valid': False,
            'validation_type': validation_type,
            'score': 0.0,
            'details': {},
            'timestamp': datetime.now(GMT_PLUS_7).isoformat(),
            'error': None
        }
        
        try:
            if validation_type not in self.validation_types:
                result['error'] = f"Unknown validation type: {validation_type}"
                return result
                
            validator_func = self.validation_types[validation_type]
            validation_result = validator_func(output, expected, options)
            
            result.update(validation_result)
            
        except Exception as e:
            logger.error(f"Validation error: {str(e)}")
            result['error'] = str(e)
            
        return result
    
    def _validate_exact_match(self, output: str, expected: str, options: Dict[str, Any]) -> Dict[str, Any]:
        """
        Exact string match validation
        """
        case_sensitive = options.get('case_sensitive', True)
        strip_whitespace = options.get('strip_whitespace', True)
        
        actual = output.strip() if strip_whitespace else output
        expect = expected.strip() if strip_whitespace else expected
        
        if not case_sensitive:
            actual = actual.lower()
            expect = expect.lower()
            
        is_valid = actual == expect
        score = 1.0 if is_valid else 0.0
        
        return {
            'is_valid': is_valid,
            'score': score,
            'details': {
                'actual': actual,
                'expected': expect,
                'case_sensitive': case_sensitive,
                'strip_whitespace': strip_whitespace
            }
        }
    
    def _validate_contains(self, output: str, expected: str, options: Dict[str, Any]) -> Dict[str, Any]:
        """
        Contains substring validation
        """
        case_sensitive = options.get('case_sensitive', True)
        
        actual = output if case_sensitive else output.lower()
        expect = expected if case_sensitive else expected.lower()
        
        is_valid = expect in actual
        score = 1.0 if is_valid else 0.0
        
        return {
            'is_valid': is_valid,
            'score': score,
            'details': {
                'actual': output,
                'expected': expected,
                'case_sensitive': case_sensitive,
                'found_at': actual.find(expect) if is_valid else -1
            }
        }
    
    def _validate_regex(self, output: str, expected: str, options: Dict[str, Any]) -> Dict[str, Any]:
        """
        Regular expression validation
        """
        flags = 0
        if not options.get('case_sensitive', True):
            flags |= re.IGNORECASE
        if options.get('multiline', False):
            flags |= re.MULTILINE
        if options.get('dotall', False):
            flags |= re.DOTALL
            
        try:
            pattern = re.compile(expected, flags)
            match = pattern.search(output)
            is_valid = match is not None
            score = 1.0 if is_valid else 0.0
            
            details = {
                'pattern': expected,
                'flags': flags,
                'match_found': is_valid
            }
            
            if match:
                details.update({
                    'match_start': match.start(),
                    'match_end': match.end(),
                    'matched_text': match.group(0),
                    'groups': match.groups() if match.groups() else []
                })
                
            return {
                'is_valid': is_valid,
                'score': score,
                'details': details
            }
            
        except re.error as e:
            return {
                'is_valid': False,
                'score': 0.0,
                'details': {'regex_error': str(e)}
            }
    
    def _validate_comparison(self, output: str, expected: str, options: Dict[str, Any]) -> Dict[str, Any]:
        """
        Numerical comparison validation
        """
        try:
            # Extract number from output
            output_num = self._extract_number(output)
            if output_num is None:
                return {
                    'is_valid': False,
                    'score': 0.0,
                    'details': {'error': 'Could not extract number from output'}
                }
            
            # Parse comparison from expected
            comparison_result = self._parse_comparison(expected, output_num)
            
            return {
                'is_valid': comparison_result['is_valid'],
                'score': 1.0 if comparison_result['is_valid'] else 0.0,
                'details': {
                    'extracted_value': output_num,
                    'comparison': expected,
                    'result': comparison_result
                }
            }
            
        except Exception as e:
            return {
                'is_valid': False,
                'score': 0.0,
                'details': {'error': str(e)}
            }
    
    def _validate_json(self, output: str, expected: str, options: Dict[str, Any]) -> Dict[str, Any]:
        """
        JSON structure validation
        """
        try:
            output_json = json.loads(output)
            expected_json = json.loads(expected)
            
            is_valid = self._compare_json(output_json, expected_json, options)
            score = 1.0 if is_valid else 0.0
            
            return {
                'is_valid': is_valid,
                'score': score,
                'details': {
                    'output_json': output_json,
                    'expected_json': expected_json
                }
            }
            
        except json.JSONDecodeError as e:
            return {
                'is_valid': False,
                'score': 0.0,
                'details': {'json_error': str(e)}
            }
    
    def _validate_custom(self, output: str, expected: str, options: Dict[str, Any]) -> Dict[str, Any]:
        """
        Custom validation using user-defined function
        """
        custom_func = options.get('custom_function')
        if not custom_func or not callable(custom_func):
            return {
                'is_valid': False,
                'score': 0.0,
                'details': {'error': 'No valid custom function provided'}
            }
        
        try:
            result = custom_func(output, expected, options)
            if isinstance(result, bool):
                return {
                    'is_valid': result,
                    'score': 1.0 if result else 0.0,
                    'details': {'custom_validation': True}
                }
            elif isinstance(result, dict):
                return result
            else:
                return {
                    'is_valid': False,
                    'score': 0.0,
                    'details': {'error': 'Custom function returned invalid result'}
                }
                
        except Exception as e:
            return {
                'is_valid': False,
                'score': 0.0,
                'details': {'custom_error': str(e)}
            }
    
    def _extract_number(self, text: str) -> Optional[float]:
        """
        Extract first number from text
        """
        import re
        match = re.search(r'-?\d+(?:\.\d+)?', text)
        if match:
            return float(match.group())
        return None
    
    def _parse_comparison(self, comparison_str: str, value: float) -> Dict[str, Any]:
        """
        Parse and evaluate comparison string
        """
        comparison_str = comparison_str.strip()
        
        # Handle different comparison operators
        if comparison_str.startswith('>='): 
            threshold = float(comparison_str[2:].strip())
            return {'is_valid': value >= threshold, 'operator': '>=', 'threshold': threshold}
        elif comparison_str.startswith('<='): 
            threshold = float(comparison_str[2:].strip())
            return {'is_valid': value <= threshold, 'operator': '<=', 'threshold': threshold}
        elif comparison_str.startswith('!='): 
            threshold = float(comparison_str[2:].strip())
            return {'is_valid': value != threshold, 'operator': '!=', 'threshold': threshold}
        elif comparison_str.startswith('>'): 
            threshold = float(comparison_str[1:].strip())
            return {'is_valid': value > threshold, 'operator': '>', 'threshold': threshold}
        elif comparison_str.startswith('<'): 
            threshold = float(comparison_str[1:].strip())
            return {'is_valid': value < threshold, 'operator': '<', 'threshold': threshold}
        elif comparison_str.startswith('='): 
            threshold = float(comparison_str[1:].strip())
            return {'is_valid': value == threshold, 'operator': '=', 'threshold': threshold}
        else:
            # Default to equality
            threshold = float(comparison_str)
            return {'is_valid': value == threshold, 'operator': '=', 'threshold': threshold}
    
    def _compare_json(self, output_json: Any, expected_json: Any, options: Dict[str, Any]) -> bool:
        """
        Compare JSON structures
        """
        strict_mode = options.get('strict_mode', True)
        
        if strict_mode:
            return output_json == expected_json
        else:
            # Partial matching - check if expected keys exist in output
            if isinstance(expected_json, dict) and isinstance(output_json, dict):
                for key, value in expected_json.items():
                    if key not in output_json:
                        return False
                    if not self._compare_json(output_json[key], value, options):
                        return False
                return True
            else:
                return output_json == expected_json



    # Backward compatibility methods
    def validate_command(self, command: str) -> Dict[str, Any]:
        """
        Backward compatibility with CommandValidator
        """
        from .command_validator import CommandValidator
        validator = CommandValidator()
        return validator.validate_command(command)
    
    def is_command_allowed(self, command: str) -> bool:
        """
        Backward compatibility with CommandValidator
        """
        from .command_validator import CommandValidator
        validator = CommandValidator()
        return validator.is_command_allowed(command)
    
    def validate_with_variables(self, output: str, expected: str, validation_type: str = 'exact_match',
                               options: Dict[str, Any] = None, server_context: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Validate output with template variable expansion support
        
        Args:
            output: The actual command output
            expected: The expected value (may contain variables)
            validation_type: Type of validation to perform
            options: Additional validation options
            server_context: Server context for variable expansion
            
        Returns:
            Dict containing validation results
        """
        if options is None:
            options = {}
        
        # Expand variables in expected value
        if server_context:
            expanded_expected = self.variable_expander.expand_variables(expected, server_context)
            logger.debug(f"Expanded expected value from '{expected}' to '{expanded_expected}'")
        else:
            expanded_expected = expected
        
        # Perform validation with expanded expected value
        return self.validate_output(output, expanded_expected, validation_type, options)
    
    def expand_command_variables(self, command: str, server_context: Dict[str, Any] = None) -> str:
        """
        Expand template variables in command
        
        Args:
            command: Command text with potential variables
            server_context: Server context for variable expansion
            
        Returns:
            Command with variables expanded
        """
        if server_context:
            return self.variable_expander.expand_variables(command, server_context)
        return command
    
    def get_available_variables(self, server_ip: str = None) -> Dict[str, Any]:
        """
        Get available variables for template expansion
        
        Args:
            server_ip: Server IP to get context for
            
        Returns:
            Dictionary of available variables
        """
        return self.variable_expander.get_available_variables(server_ip)
    
    def validate_template_variables(self, text: str, server_context: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Validate that template variables in text are available
        
        Args:
            text: Text to validate
            server_context: Available context variables
            
        Returns:
            Validation result
        """
        if server_context is None:
            server_context = self.variable_expander.get_available_variables()
        
        return self.variable_expander.validate_variables(text, server_context)