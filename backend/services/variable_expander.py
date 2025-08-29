import re
import logging
from typing import Dict, Any, List
from services.context_builder import ContextBuilder

logger = logging.getLogger(__name__)

class VariableExpander:
    """
    Service to expand template variables in commands and other text
    Supports variables like {{user}}, {{bond}}, etc.
    """
    
    def __init__(self):
        self.context_builder = ContextBuilder()
        self.variable_pattern = re.compile(r'\{\{(\w+)\}\}')
    
    def expand_variables(self, text: str, context: Dict[str, Any] = None) -> str:
        """
        Expand variables in text using provided context
        
        Args:
            text: Text containing variables like {{user}}, {{bond}}
            context: Context dictionary with variable values
            
        Returns:
            Text with variables expanded
        """
        if not text:
            return text
            
        if context is None:
            context = {}
            
        # Find all variables in text
        variables = self.variable_pattern.findall(text)
        
        if not variables:
            return text
            
        # Expand each variable
        expanded_text = text
        for var_name in variables:
            var_value = context.get(var_name, '')
            
            # Handle list values (for loops)
            if isinstance(var_value, list):
                # For now, join with comma. Later can support loops
                var_value = ','.join(str(v) for v in var_value)
            
            # Replace variable in text
            expanded_text = expanded_text.replace(f'{{{{{var_name}}}}}', str(var_value))
            
        logger.debug(f"Expanded '{text}' to '{expanded_text}'")
        return expanded_text
    
    def expand_command_list(self, commands: List[Dict[str, Any]], server_context: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """
        Expand variables in a list of commands
        
        Args:
            commands: List of command dictionaries
            server_context: Server-specific context
            
        Returns:
            List of commands with variables expanded
        """
        if not commands:
            return commands
            
        # Build context if not provided
        if server_context is None:
            server_context = self.context_builder.build_server_context()
            
        expanded_commands = []
        
        for cmd in commands:
            expanded_cmd = cmd.copy()
            
            # Expand variables in relevant fields
            fields_to_expand = ['title', 'command', 'command_text', 'name', 'description']
            
            for field in fields_to_expand:
                if field in expanded_cmd and expanded_cmd[field]:
                    expanded_cmd[field] = self.expand_variables(expanded_cmd[field], server_context)
            
            # Handle command_id_ref expansion for loops
            if 'command_id_ref' in expanded_cmd and expanded_cmd['command_id_ref']:
                command_id = expanded_cmd['command_id_ref']
                
                # Check if command_id contains variables that expand to lists
                variables = self.variable_pattern.findall(command_id)
                list_variables = []
                
                for var_name in variables:
                    var_value = server_context.get(var_name, '')
                    if isinstance(var_value, list) and len(var_value) > 1:
                        list_variables.append((var_name, var_value))
                
                # If we have list variables, create multiple commands
                if list_variables:
                    # For now, handle single list variable
                    # TODO: Support multiple list variables (cartesian product)
                    var_name, var_values = list_variables[0]
                    
                    for i, var_value in enumerate(var_values):
                        loop_context = server_context.copy()
                        loop_context[var_name] = var_value
                        
                        loop_cmd = cmd.copy()
                        
                        # Expand all fields with loop context
                        for field in fields_to_expand + ['command_id_ref']:
                            if field in loop_cmd and loop_cmd[field]:
                                loop_cmd[field] = self.expand_variables(loop_cmd[field], loop_context)
                        
                        # Add loop index to make command_id unique
                        if 'command_id_ref' in loop_cmd:
                            loop_cmd['command_id_ref'] = f"{loop_cmd['command_id_ref']}_{i}"
                        
                        expanded_commands.append(loop_cmd)
                    
                    continue
            
            expanded_commands.append(expanded_cmd)
        
        return expanded_commands
    
    def get_available_variables(self, server_ip: str = None) -> Dict[str, Any]:
        """
        Get list of available variables for a server
        
        Args:
            server_ip: IP address of server to get context for
            
        Returns:
            Dictionary of available variables
        """
        return self.context_builder.build_server_context(server_ip)
    
    def validate_variables(self, text: str, available_context: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Validate that all variables in text are available in context
        
        Args:
            text: Text to validate
            available_context: Available context variables
            
        Returns:
            Validation result with missing variables
        """
        if available_context is None:
            available_context = self.context_builder.build_server_context()
            
        variables = self.variable_pattern.findall(text)
        missing_variables = []
        
        for var_name in variables:
            if var_name not in available_context:
                missing_variables.append(var_name)
        
        return {
            'is_valid': len(missing_variables) == 0,
            'variables_found': variables,
            'missing_variables': missing_variables,
            'available_variables': list(available_context.keys())
        }