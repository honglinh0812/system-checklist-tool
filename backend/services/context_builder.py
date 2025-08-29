import subprocess
import logging
import json
import re
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class ContextBuilder:
    """
    Service to build context for template variable expansion
    Discovers server information like users, bond interfaces, etc.
    """
    
    def __init__(self):
        self.cache = {}
        self.cache_timeout = 300  # 5 minutes
    
    def build_server_context(self, server_ip: str = None) -> Dict[str, Any]:
        """
        Build context dictionary for a server
        
        Args:
            server_ip: IP address of server (None for localhost)
            
        Returns:
            Dictionary with available variables
        """
        cache_key = server_ip or 'localhost'
        
        # Check cache
        if self._is_cache_valid(cache_key):
            logger.debug(f"Using cached context for {cache_key}")
            return self.cache[cache_key]['data']
        
        logger.info(f"Building context for server: {cache_key}")
        
        context = {
            'server_ip': server_ip or 'localhost',
            'timestamp': datetime.now().isoformat()
        }
        
        try:
            # Discover users
            context['user'] = self._discover_users(server_ip)
            context['users'] = context['user']  # Alias
            
            # Discover bond interfaces
            context['bond'] = self._discover_bonds(server_ip)
            context['bonds'] = context['bond']  # Alias
            
            # Discover network interfaces
            context['interface'] = self._discover_interfaces(server_ip)
            context['interfaces'] = context['interface']  # Alias
            
            # Discover system info
            context.update(self._discover_system_info(server_ip))
            
            # Cache the result
            self.cache[cache_key] = {
                'data': context,
                'timestamp': datetime.now()
            }
            
            logger.info(f"Context built for {cache_key}: {len(context)} variables")
            
        except Exception as e:
            logger.error(f"Error building context for {cache_key}: {str(e)}")
            # Return basic context on error
            context.update({
                'user': [],
                'bond': [],
                'interface': [],
                'error': str(e)
            })
        
        return context
    
    def _discover_users(self, server_ip: str = None) -> List[str]:
        """
        Discover system users
        
        Args:
            server_ip: Server IP (None for localhost)
            
        Returns:
            List of usernames
        """
        try:
            if server_ip and server_ip not in ['localhost', '127.0.0.1']:
                # For remote servers, would need SSH connection
                # For now, return empty list
                logger.warning(f"Remote user discovery not implemented for {server_ip}")
                return []
            
            # Local discovery
            result = subprocess.run(
                ['cut', '-d:', '-f1', '/etc/passwd'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                users = [line.strip() for line in result.stdout.split('\n') if line.strip()]
                # Filter out system users (UID < 1000)
                filtered_users = []
                for user in users:
                    try:
                        uid_result = subprocess.run(
                            ['id', '-u', user],
                            capture_output=True,
                            text=True,
                            timeout=5
                        )
                        if uid_result.returncode == 0:
                            uid = int(uid_result.stdout.strip())
                            if uid >= 1000:  # Regular users
                                filtered_users.append(user)
                    except (ValueError, subprocess.TimeoutExpired):
                        continue
                
                logger.debug(f"Discovered {len(filtered_users)} users")
                return filtered_users
            
        except Exception as e:
            logger.error(f"Error discovering users: {str(e)}")
        
        return []
    
    def _discover_bonds(self, server_ip: str = None) -> List[str]:
        """
        Discover bond interfaces
        
        Args:
            server_ip: Server IP (None for localhost)
            
        Returns:
            List of bond interface names
        """
        try:
            if server_ip and server_ip not in ['localhost', '127.0.0.1']:
                logger.warning(f"Remote bond discovery not implemented for {server_ip}")
                return []
            
            # Check for bond interfaces
            bonds = []
            
            # Method 1: Check /proc/net/bonding
            try:
                result = subprocess.run(
                    ['ls', '/proc/net/bonding/'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0:
                    bonds.extend([line.strip() for line in result.stdout.split('\n') if line.strip()])
            except subprocess.TimeoutExpired:
                pass
            
            # Method 2: Check ip link for bond interfaces
            try:
                result = subprocess.run(
                    ['ip', 'link', 'show'],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if result.returncode == 0:
                    for line in result.stdout.split('\n'):
                        if 'bond' in line.lower() and ':' in line:
                            # Extract interface name
                            match = re.search(r'\d+:\s+(\w*bond\w*):', line)
                            if match:
                                bond_name = match.group(1)
                                if bond_name not in bonds:
                                    bonds.append(bond_name)
            except subprocess.TimeoutExpired:
                pass
            
            logger.debug(f"Discovered {len(bonds)} bond interfaces: {bonds}")
            return bonds
            
        except Exception as e:
            logger.error(f"Error discovering bonds: {str(e)}")
        
        return []
    
    def _discover_interfaces(self, server_ip: str = None) -> List[str]:
        """
        Discover network interfaces
        
        Args:
            server_ip: Server IP (None for localhost)
            
        Returns:
            List of interface names
        """
        try:
            if server_ip and server_ip not in ['localhost', '127.0.0.1']:
                logger.warning(f"Remote interface discovery not implemented for {server_ip}")
                return []
            
            # Get network interfaces
            result = subprocess.run(
                ['ip', 'link', 'show'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                interfaces = []
                for line in result.stdout.split('\n'):
                    if ':' in line and not line.startswith(' '):
                        # Extract interface name
                        match = re.search(r'\d+:\s+(\w+):', line)
                        if match:
                            interface_name = match.group(1)
                            # Skip loopback
                            if interface_name != 'lo':
                                interfaces.append(interface_name)
                
                logger.debug(f"Discovered {len(interfaces)} interfaces: {interfaces}")
                return interfaces
            
        except Exception as e:
            logger.error(f"Error discovering interfaces: {str(e)}")
        
        return []
    
    def _discover_system_info(self, server_ip: str = None) -> Dict[str, Any]:
        """
        Discover additional system information
        
        Args:
            server_ip: Server IP (None for localhost)
            
        Returns:
            Dictionary with system info
        """
        info = {}
        
        try:
            if server_ip and server_ip not in ['localhost', '127.0.0.1']:
                return info
            
            # Get hostname
            try:
                result = subprocess.run(
                    ['hostname'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0:
                    info['hostname'] = result.stdout.strip()
            except subprocess.TimeoutExpired:
                pass
            
            # Get OS info
            try:
                result = subprocess.run(
                    ['uname', '-a'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0:
                    info['uname'] = result.stdout.strip()
            except subprocess.TimeoutExpired:
                pass
            
            # Get current user
            try:
                result = subprocess.run(
                    ['whoami'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0:
                    info['current_user'] = result.stdout.strip()
            except subprocess.TimeoutExpired:
                pass
            
        except Exception as e:
            logger.error(f"Error discovering system info: {str(e)}")
        
        return info
    
    def _is_cache_valid(self, cache_key: str) -> bool:
        """
        Check if cached data is still valid
        
        Args:
            cache_key: Cache key to check
            
        Returns:
            True if cache is valid
        """
        if cache_key not in self.cache:
            return False
        
        cache_time = self.cache[cache_key]['timestamp']
        return datetime.now() - cache_time < timedelta(seconds=self.cache_timeout)
    
    def clear_cache(self, server_ip: str = None):
        """
        Clear cache for a server or all servers
        
        Args:
            server_ip: Server IP to clear (None for all)
        """
        if server_ip:
            cache_key = server_ip or 'localhost'
            if cache_key in self.cache:
                del self.cache[cache_key]
                logger.info(f"Cleared cache for {cache_key}")
        else:
            self.cache.clear()
            logger.info("Cleared all cache")
    
    def get_cache_info(self) -> Dict[str, Any]:
        """
        Get information about current cache
        
        Returns:
            Cache information
        """
        cache_info = {}
        for key, value in self.cache.items():
            cache_info[key] = {
                'timestamp': value['timestamp'].isoformat(),
                'variables': list(value['data'].keys()),
                'age_seconds': (datetime.now() - value['timestamp']).total_seconds()
            }
        
        return cache_info