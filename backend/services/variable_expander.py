import re
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

class VariableExpander:
    """
    Service to expand template variables in commands and other text
    Supports variables like {{user}}, {{bond}}, etc.
    """
    
    def __init__(self):
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
            
            # Handle list values - use first value for single expansion
            # Multiple values will be handled by expand_command_list
            if isinstance(var_value, list):
                if var_value:
                    var_value = str(var_value[0])  # Use first value
                else:
                    var_value = ''
            
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
            
        # Use provided context or default simple context
        if server_context is None:
            server_context = {
                'user': ['root', 'admin', 'oracle', 'postgres'],
                'users': ['root', 'admin', 'oracle', 'postgres'],
                'bond': ['bond0', 'bond1'],
                'bonds': ['bond0', 'bond1'],
                'interface': ['eth0', 'eth1', 'ens160', 'ens192'],
                'interfaces': ['eth0', 'eth1', 'ens160', 'ens192']
            }
            
        expanded_commands = []
        
        for cmd in commands:
            # Find all variables in command fields
            fields_to_expand = ['title', 'command', 'command_text', 'name', 'description', 'reference_value', 'expected_value']
            all_text = ''
            for field in fields_to_expand:
                if field in cmd and cmd[field]:
                    all_text += str(cmd[field]) + ' '
            
            variables = self.variable_pattern.findall(all_text)
            list_variables = []
            
            # Find list variables
            for var_name in variables:
                var_value = server_context.get(var_name, '')
                if isinstance(var_value, list) and len(var_value) > 1:
                    list_variables.append((var_name, var_value))
            
            # If we have list variables, create multiple commands
            if list_variables:
                # General solution: Create one command per value for each list variable
                # Find the variable with the most values to use as the primary expansion
                primary_var = max(list_variables, key=lambda x: len(x[1]))
                var_name, var_values = primary_var
                
                for i, var_value in enumerate(var_values):
                    loop_context = server_context.copy()
                    loop_context[var_name] = var_value
                    
                    loop_cmd = cmd.copy()
                    
                    # Expand all fields with loop context
                    for field in fields_to_expand:
                        if field in loop_cmd and loop_cmd[field]:
                            loop_cmd[field] = self.expand_variables(loop_cmd[field], loop_context)
                    
                    # Make command_id unique
                    original_id = loop_cmd.get('command_id_ref', loop_cmd.get('command_id', loop_cmd.get('id', '')))
                    if original_id:
                        if 'command_id_ref' in loop_cmd:
                            loop_cmd['command_id_ref'] = f"{original_id}_{var_name}_{var_value}"
                        elif 'command_id' in loop_cmd:
                            loop_cmd['command_id'] = f"{original_id}_{var_name}_{var_value}"
                        elif 'id' in loop_cmd:
                            loop_cmd['id'] = f"{original_id}_{var_name}_{var_value}"
                    
                    # Add metadata about the expansion
                    loop_cmd['_expanded_from'] = original_id
                    loop_cmd['_expanded_variables'] = {var_name: var_value}
                    loop_cmd['_expanded_index'] = i
                    
                    expanded_commands.append(loop_cmd)
                
                continue
            
            # No list variables, expand normally
            expanded_cmd = cmd.copy()
            
            for field in fields_to_expand:
                if field in expanded_cmd and expanded_cmd[field]:
                    expanded_cmd[field] = self.expand_variables(expanded_cmd[field], server_context)
            
            expanded_commands.append(expanded_cmd)
        
        return expanded_commands
    
    def get_available_variables(self, server_ip: str = None) -> Dict[str, Any]:
        """
        Get list of available variables for a server
        
        Args:
            server_ip: IP address of server to get context for
            
        Returns:
            Dictionary with available variables
        """
        # Return simple static context to avoid SSH issues
        return {
            'user': ['root', 'admin', 'oracle', 'postgres'],
            'users': ['root', 'admin', 'oracle', 'postgres'],
            'bond': ['bond0', 'bond1'],
            'bonds': ['bond0', 'bond1'],
            'interface': ['eth0', 'eth1', 'ens160', 'ens192'],
            'interfaces': ['eth0', 'eth1', 'ens160', 'ens192'],
            'server_ip': server_ip or 'localhost',
            'hostname': server_ip or 'localhost'
        }
    
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
            available_context = self.get_available_variables()
            
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
    
    def expand_dynamic_commands(self, commands: List[Dict[str, Any]], command_results: Dict[str, List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
        """
        Expand commands dynamically based on output from previous commands
        
        Args:
            commands: List of command dictionaries
            command_results: Results from previous commands indexed by server IP
            
        Returns:
            List of expanded commands with dynamic variables resolved
        """
        if not commands or not command_results:
            return commands
            
        expanded_commands = []
        
        for cmd in commands:
            # Check if command has dynamic variable references
            dynamic_ref = cmd.get('dynamic_reference')
            if not dynamic_ref:
                expanded_commands.append(cmd)
                continue
                
            ref_command_id = dynamic_ref.get('command_id')
            ref_field = dynamic_ref.get('output_field', 'output')  # Default to 'output'
            variable_name = dynamic_ref.get('variable_name', 'dynamic_value')
            
            if not ref_command_id:
                logger.warning(f"Dynamic reference missing command_id for command: {cmd.get('title', 'Unknown')}")
                expanded_commands.append(cmd)
                continue
                
            # Find reference command results across all servers
            dynamic_values = set()  # Use set to avoid duplicates
            
            for server_ip, server_results in command_results.items():
                for cmd_result in server_results:
                    # Match by command ID or title
                    if (cmd_result.get('command_id_ref') == ref_command_id or
                        cmd_result.get('command_id') == ref_command_id or
                        cmd_result.get('_expanded_from') == ref_command_id):
                        
                        # Get the output value
                        output_value = cmd_result.get(ref_field, '').strip()
                        if output_value:
                            # Split by lines if multiple values
                            lines = [line.strip() for line in output_value.split('\n') if line.strip()]
                            dynamic_values.update(lines)
                        break
            
            if not dynamic_values:
                logger.warning(f"No dynamic values found for reference command '{ref_command_id}'")
                expanded_commands.append(cmd)
                continue
                
            # Create one command for each dynamic value
            for i, value in enumerate(sorted(dynamic_values)):
                dynamic_cmd = cmd.copy()
                
                # Create dynamic context with the value
                dynamic_context = {variable_name: value}
                
                # Expand variables in command fields
                fields_to_expand = ['title', 'command', 'command_text', 'name', 'description', 'reference_value', 'expected_value']
                for field in fields_to_expand:
                    if field in dynamic_cmd and dynamic_cmd[field]:
                        # Replace dynamic variable placeholder
                        expanded_text = dynamic_cmd[field].replace(f'{{{{{variable_name}}}}}', value)
                        dynamic_cmd[field] = expanded_text
                
                # Update command ID to make it unique
                original_id = dynamic_cmd.get('command_id_ref', dynamic_cmd.get('command_id', dynamic_cmd.get('id', '')))
                if original_id:
                    if 'command_id_ref' in dynamic_cmd:
                        dynamic_cmd['command_id_ref'] = f"{original_id}_{variable_name}_{value}"
                    elif 'command_id' in dynamic_cmd:
                        dynamic_cmd['command_id'] = f"{original_id}_{variable_name}_{value}"
                    elif 'id' in dynamic_cmd:
                        dynamic_cmd['id'] = f"{original_id}_{variable_name}_{value}"
                
                # Add metadata about the dynamic expansion
                dynamic_cmd['_expanded_from'] = original_id
                dynamic_cmd['_dynamic_variables'] = {variable_name: value}
                dynamic_cmd['_dynamic_index'] = i
                dynamic_cmd['_dynamic_reference'] = dynamic_ref
                
                expanded_commands.append(dynamic_cmd)
                
                logger.info(f"Created dynamic command for {variable_name}={value}: {dynamic_cmd.get('title', 'Unknown')}")
        
        return expanded_commands