import re
import logging
from typing import Any, Dict, List, Union

logger = logging.getLogger(__name__)

class ExtractProcessor:
    """
    Service to process Extract methods and apply Comparators for 6-column format
    """
    
    def __init__(self):
        self.supported_comparators = [
            # String comparators
            'eq', 'neq', 'contains', 'not_contains', 'regex', 'in', 'not_in', 'contains_any',
            # Numeric comparators
            'int_eq', 'int_neq', 'int_ge', 'int_gt', 'int_le', 'int_lt',
            # Special comparators
            'empty', 'non_empty', 'wc_eq'
        ]
    
    def _compare_single_value(self, value: str, comparator: str, reference: str) -> bool:
        """
        Compare single value using specified comparator
        
        Args:
            value: Value to compare
            comparator: Comparison method
            reference: Reference value
            
        Returns:
            Boolean result of comparison
        """
        value = value.strip()
        reference = reference.strip()
        
        if comparator in ['equals', 'eq']:
            return value == reference
        elif comparator == 'contains':
            return reference in value
        elif comparator == 'not_contains':
            return reference not in value
        elif comparator == 'empty':
            return len(value) == 0
        elif comparator == 'non_empty':
            return len(value) > 0
        elif comparator in ['greater_than', 'less_than', 'greater_equal', 'less_equal']:
            try:
                val_num = float(value)
                ref_num = float(reference)
                
                if comparator == 'greater_than':
                    return val_num > ref_num
                elif comparator == 'less_than':
                    return val_num < ref_num
                elif comparator == 'greater_equal':
                    return val_num >= ref_num
                elif comparator == 'less_equal':
                    return val_num <= ref_num
            except ValueError:
                logger.warning(f"Cannot convert values to numbers for comparison: '{value}' vs '{reference}'")
                return False
        else:
            # For unsupported comparators, return False but don't log warning
            # as this might be handled by other validation methods
            return False
        
        return False
    
    def _compare_single(self, data: Any, method: str, reference: str) -> bool:
        """
        Compare single data item using specified method
        
        Args:
            data: Single data item to compare
            method: Comparator method
            reference: Reference value
            
        Returns:
            Boolean result of comparison
        """
        try:
            data_str = str(data).strip()
            reference_str = str(reference).strip()
            
            # String comparators
            if method == 'eq':
                return data_str == reference_str
            elif method == 'neq':
                return data_str != reference_str
            elif method == 'contains':
                return reference_str in data_str
            elif method == 'not_contains':
                return reference_str not in data_str
            elif method == 'regex':
                return bool(re.search(reference_str, data_str))
            elif method == 'in':
                # Check if data is in pipe-separated or comma-separated reference list
                # Support both '|' and ',' as separators
                if '|' in reference_str:
                    ref_list = [item.strip() for item in reference_str.split('|')]
                else:
                    ref_list = [item.strip() for item in reference_str.split(',')]
                return data_str in ref_list
            elif method == 'not_in':
                ref_list = [item.strip() for item in reference_str.split(',')]
                return data_str not in ref_list
            elif method == 'contains_any':
                # Check if data contains any of the reference values (comma-separated)
                ref_list = [item.strip() for item in reference_str.split(',')]
                return any(ref_item in data_str for ref_item in ref_list)
            
            # Numeric comparators
            elif method.startswith('int_'):
                # Handle empty data gracefully
                if not data_str or not data_str.strip():
                    # For empty data, only return True for int_eq with reference '0' or empty
                    if method == 'int_eq' and (reference_str == '0' or not reference_str.strip()):
                        return True
                    return False
                    
                try:
                    data_int = int(data_str)
                    ref_int = int(reference_str)
                    
                    if method == 'int_eq':
                        return data_int == ref_int
                    elif method == 'int_neq':
                        return data_int != ref_int
                    elif method == 'int_ge':
                        return data_int >= ref_int
                    elif method == 'int_gt':
                        return data_int > ref_int
                    elif method == 'int_le':
                        return data_int <= ref_int
                    elif method == 'int_lt':
                        return data_int < ref_int
                except ValueError:
                    # Only log warning if data is not empty (to reduce noise)
                    if data_str.strip():
                        logger.warning(f"Cannot convert to int: data='{data_str}', reference='{reference_str}'")
                    return False
            
            # Special comparators
            elif method == 'empty':
                return data_str == ""
            elif method == 'non_empty':
                return data_str != ""
            elif method == 'wc_eq':
                # Word count equal - count lines in output
                try:
                    line_count = len([line for line in data_str.split('\n') if line.strip()])
                    expected_count = int(reference_str)
                    return line_count == expected_count
                except ValueError:
                    logger.warning(f"Cannot convert reference to int for wc_eq: '{reference_str}'")
                    return False
            
            else:
                logger.warning(f"Unsupported comparator method: {method}")
                return False
                
        except Exception as e:
            logger.error(f"Error in single comparison: {str(e)}")
            return False
    
    def validate_comparator_method(self, method: str) -> bool:
        """
        Validate if comparator method is supported
        
        Args:
            method: Comparator method to validate
            
        Returns:
            True if method is valid
        """
        if method in self.supported_comparators:
            return True
        
        # Check pattern-based methods
        if method.startswith('per_line:'):
            sub_method = method[9:]
            return self.validate_comparator_method(sub_method)
        
        return False