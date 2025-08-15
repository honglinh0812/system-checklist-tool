import re
import subprocess
import shlex
import logging
from typing import Dict, List, Any, Tuple

logger = logging.getLogger(__name__)

class CommandValidator:
    def __init__(self):
        self.allowed_commands = {
            'ls', 'cat', 'head', 'tail', 'grep', 'awk', 'sed', 'cut', 'wc', 'sort', 'uniq', 'tr', 'xargs', 'find',
            
            'uname', 'uptime', 'who', 'w', 'last', 'lastlog', 'ps', 'top', 'htop', 'free', 'df', 'du', 'iostat', 'vmstat',
            
            'netstat', 'ss', 'ip', 'ifconfig', 'route', 'arp', 'ping', 'traceroute', 'nslookup', 'dig', 'host', 'hostname',
            
            'systemctl', 'service', 'chkconfig', 'pgrep', 'pkill', 'killall', 'lsof', 'fuser',
            
            'strings', 'hexdump', 'od', 'xxd', 'base64', 'md5sum', 'sha1sum', 'sha256sum', 'sha512sum', 'cksum', 'sum',
            'crc32', 'adler32', 'fnv', 'murmur', 'city', 'spooky', 'xxhash', 'blake2', 'blake3', 'sha3', 'keccak',
            'ripemd', 'whirlpool', 'tiger', 'haval', 'gost', 'streebog', 'sm3', 'sm4',
            
            'tar', 'gzip', 'bzip2', 'xz', 'zip', 'unzip', '7z', 'rar', 'unrar', 'lzma', 'lzop', 'lzip', 'lz4', 'zstd',
            'lz', 'compress', 'pack', 'unpack',
            
            'ar', 'nm', 'objdump', 'readelf', 'ldd', 'file',
            
            'journalctl', 'logrotate', 'logwatch',
            
            'id', 'groups', 'getent', 'passwd', 'group', 'shadow', 'gshadow',
            
            'lscpu', 'lshw', 'lsblk', 'lsusb', 'lspci', 'dmidecode', 'hdparm', 'smartctl',
            
            'lsmod', 'modinfo', 'dmesg', 'sysctl',
            
            'getenforce', 'sestatus', 'getsebool', 'seinfo', 'sesearch',
            
            'date', 'timedatectl', 'ntpdate', 'chronyc',
            
            'env', 'printenv', 'set', 'declare', 'type', 'which', 'whereis', 'locate', 'updatedb',
            
            'column', 'expand', 'fold', 'fmt', 'nl', 'pr', 'tac', 'rev', 'split', 'csplit',
            
            'bc', 'dc', 'expr', 'let', 'factor', 'seq', 'jot',
            
            'pwd', 'dirname', 'basename', 'realpath', 'readlink',
            
            'stat', 'file', 'mime', 'mimetype', 'lsattr', 'getfacl',
            
            'ulimit', 'sysctl', 'getconf', 'getrlimit',
            
            'mount', 'umount', 'findmnt', 'blkid', 'lsblk', 'parted', 'fdisk', 'sfdisk',
            
            'ethtool', 'iwconfig', 'iwlist', 'nmcli', 'nm-tool',
            
            'strace', 'ltrace', 'perf', 'ftrace', 'kprobe',
            
            'pmap', 'slabtop', 'vmstat', 'iostat', 'mpstat', 'pidstat', 'sar',
            
            'tune2fs', 'dumpe2fs', 'debugfs', 'xfs_info', 'xfs_db', 'btrfs', 'zfs',
            
            'tcpdump', 'wireshark', 'tshark', 'nmap', 'ncat', 'telnet', 'nc', 'netcat',
            
            'openssl', 'keytool', 'certtool', 'gpg', 'gpg2',
            
            'rpm', 'dpkg', 'yum', 'apt', 'dnf', 'zypper', 'pacman', 'brew', 'snap', 'flatpak',
            'pip', 'npm', 'gem', 'cargo', 'go', 'java', 'python', 'perl', 'ruby',
            
            'bash', 'sh', 'zsh', 'tcsh', 'ksh', 'fish', 'csh', 'ash', 'dash', 'busybox',
            
            'curl', 'wget', 'scp', 'rsync', 'sftp', 'ftp', 'lftp', 'aria2c', 'axel',
            
            'less', 'more', 'view', 'vim', 'vi', 'nano', 'emacs', 'ed', 'ex', 'sed',
            
            'tee', 'sponge', 'parallel', 'xargs', 'watch', 'timeout', 'nice', 'renice',
            'ionice', 'chrt', 'taskset', 'numactl', 'cgroups', 'systemd-cgtop'
        }
        
        self.forbidden_commands = { 
            'rm', 'rmdir', 'mkdir', 'touch', 'cp', 'mv', 'ln', 'chmod', 'chown', 'chgrp',
            'umask', 'mknod', 'mktemp', 'install', 'dd', 'fallocate', 'truncate',
            
            'shutdown', 'reboot', 'halt', 'poweroff', 'init', 'systemctl', 'service',
            'kill', 'killall', 'pkill', 'fuser', 'lsof', 'mount', 'umount',
            
            'useradd', 'userdel', 'usermod', 'groupadd', 'groupdel', 'groupmod',
            'passwd', 'chpasswd', 'gpasswd', 'newgrp', 'su', 'sudo',
            
            'ifconfig', 'ip', 'route', 'arp', 'iptables', 'firewall-cmd', 'ufw',
            'hostname', 'hostnamectl', 'nmcli', 'systemd-resolve',
            
            'yum', 'apt', 'dnf', 'zypper', 'pacman', 'brew', 'snap', 'flatpak',
            'pip', 'npm', 'gem', 'cargo', 'go', 'java', 'python', 'perl', 'ruby',
            
            'kill', 'killall', 'pkill', 'fuser', 'lsof', 'nice', 'renice', 'ionice',
            'chrt', 'taskset', 'numactl', 'cgroups', 'systemd-cgtop',
            
            'sysctl', 'modprobe', 'insmod', 'rmmod', 'depmod', 'modinfo',
            'setenforce', 'setsebool', 'semanage', 'auditctl', 'ausearch',
            
            'date', 'timedatectl', 'ntpdate', 'chronyc', 'hwclock', 'clock',
            
            'mkfs', 'fsck', 'tune2fs', 'resize2fs', 'e2fsck', 'xfs_repair',
            'btrfs', 'zfs', 'lvm', 'pvcreate', 'vgcreate', 'lvcreate',
            
            'tar', 'gzip', 'bzip2', 'xz', 'zip', 'unzip', '7z', 'rar', 'unrar',
            
            'vim', 'vi', 'nano', 'emacs', 'ed', 'ex', 'sed',
            'eval', 'exec', 'source', 'export', 'unset', 'alias', 'unalias',
            'history', 'fc', 'builtin', 'command', 'type', 'hash', 'enable',
            'set', 'shopt', 'ulimit', 'umask', 'cd', 'pushd', 'popd', 'dirs',
            'jobs', 'fg', 'bg', 'wait', 'disown', 'suspend', 'exit', 'logout',
            'trap', 'trap', 'trap', 'trap', 'trap', 'trap', 'trap', 'trap'
        }
        
        self.dangerous_patterns = [
            r'\b(rm|rmdir|mkdir|touch|cp|mv|ln|chmod|chown|chgrp)\b',
            r'\b(shutdown|reboot|halt|poweroff|init)\b',
            r'\b(useradd|userdel|usermod|groupadd|groupdel|groupmod)\b',
            r'\b(passwd|chpasswd|gpasswd)\b',
            #r'\b(ifconfig|ip|route|arp|iptables|firewall-cmd|ufw)\b',
            r'\b(yum|apt|dnf|zypper|pacman|brew|snap|flatpak)\s+(install|remove|update|upgrade)',
            r'\b(pip|npm|gem|cargo|go|java|python|perl|ruby)\s+(install|uninstall|update|upgrade)',
            r'\b(kill|killall|pkill)\b',
            r'\b(sysctl|modprobe|insmod|rmmod)\b',
            r'\b(setenforce|setsebool|semanage)\b',
            r'\b(mkfs|fsck|tune2fs|resize2fs)\b',
            r'\b(eval|exec|source)\b',
            r'\b(export|unset|alias|unalias)\b',
            r'\b(history|fc|builtin|command)\b',
            r'\b(set|shopt|ulimit|umask)\b',
            r'\b(cd|pushd|popd|dirs)\b',
            r'\b(jobs|fg|bg|wait|disown|suspend|exit|logout)\b',
            r'\b(trap)\b',
            """
            r'[<>]',  # Redirection operators
            r'&',     # Background execution
            r'\|\s*[<>]',  # Pipeline with redirection
            r'`.*`',  # Command substitution
            r'\$\(.*\)',  # Command substitution
            r'&&',    # Logical AND
            r'\|\|',  # Logical OR
            r';',     # Command separator
            r'\\',    # Line continuation
            r'#.*$',  # Comments
            r'echo\s+.*[<>]',  # Echo with redirection
            r'printf\s+.*[<>]',  # Printf with redirection
            r'cat\s+.*[<>]',  # Cat with redirection
            r'tee\s+.*[<>]',  # Tee with redirection
            r'>>',    # Append redirection
            r'2>',    # Error redirection
            r'1>',    # Output redirection
            r'0<',    # Input redirection
            r'&>',    # All output redirection
            r'|&',    # Pipeline with error
            """
        ]
        
        self.allowed_pipeline_operators = ['|']
        
        # Thêm validation_methods
        self.validation_methods = {
            'exact_match': self._exact_match,
            'contains': self._contains,
            'regex_match': self._regex_match,
            'custom': self._custom_validation
        }

    def validate_command(self, command: str) -> Dict[str, Any]:
        """
        Validate a shell command for security
        Returns: {
            'valid': bool,
            'errors': List[str],
            'warnings': List[str],
            'syntax_error': str or None
        }
        """
        command = command.strip()
        if not command:
            return {
                'valid': False,
                'errors': ['Command cannot be empty'],
                'warnings': [],
                'syntax_error': None
            }
        
        errors = []
        warnings = []
        syntax_error = None
        
        for pattern in self.dangerous_patterns:
            if re.search(pattern, command, re.IGNORECASE):
                errors.append(f'Dangerous pattern detected: {pattern}')
        
        try:
            tokens = shlex.split(command)
        except ValueError as e:
            syntax_error = f'Syntax error: {str(e)}'
            return {
                'valid': False,
                'errors': [syntax_error],
                'warnings': [],
                'syntax_error': syntax_error
            }
        
        pipeline_commands = command.split('|')
        for i, pipe_cmd in enumerate(pipeline_commands):
            pipe_cmd = pipe_cmd.strip()
            if not pipe_cmd:
                continue
                
            try:
                pipe_tokens = shlex.split(pipe_cmd)
            except ValueError as e:
                syntax_error = f'Syntax error in pipeline command {i+1}: {str(e)}'
                return {
                    'valid': False,
                    'errors': [syntax_error],
                    'warnings': [],
                    'syntax_error': syntax_error
                }
            
            if pipe_tokens:
                first_cmd = pipe_tokens[0].lower()
                
                if first_cmd in self.forbidden_commands:
                    errors.append(f'Forbidden command: {first_cmd}')
                
                elif first_cmd not in self.allowed_commands:
                    errors.append(f'Unknown command: {first_cmd}')
        
        try:
            result = subprocess.run(
                ['bash', '-n', '-c', command],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode != 0:
                syntax_error = f'Syntax error: {result.stderr.strip()}'
        except subprocess.TimeoutExpired:
            syntax_error = 'Syntax check timeout'
        except Exception as e:
            syntax_error = f'Syntax check failed: {str(e)}'
        
        if re.search(r'\b(eval|exec|source)\b', command, re.IGNORECASE):
            errors.append('Command contains eval/exec/source which is not allowed')
        
        if re.search(r'[<>]', command):
            errors.append('Redirection operators are not allowed')
        
        if re.search(r'&(?!&)', command):
            errors.append('Background execution (&) is not allowed')
        
        if re.search(r'`.*`|\$\(.*\)', command):
            errors.append('Command substitution is not allowed')
        
        if re.search(r'&&|\|\|', command):
            errors.append('Logical operators (&&, ||) are not allowed')
        
        if re.search(r'[;\\]', command):
            errors.append('Command separators (;, \\) are not allowed')
        
        if re.search(r'\$[A-Z_][A-Z0-9_]*', command):
            warnings.append('Variable expansion detected - ensure variables are safe')
        
        return {
            'valid': len(errors) == 0 and syntax_error is None,
            'errors': errors,
            'warnings': warnings,
            'syntax_error': syntax_error
        }
    
    def get_allowed_commands(self) -> List[str]:
        """Get list of allowed commands"""
        return sorted(list(self.allowed_commands))
    
    def get_forbidden_commands(self) -> List[str]:
        """Get list of forbidden commands"""
        return sorted(list(self.forbidden_commands)) 

    def validate_output(self, actual_output: str, expected_output: str, validation_type: str = 'exact_match') -> Dict[str, Any]:
        """
        Validate command output against expected reference value
        
        Args:
            actual_output: The actual command output
            expected_output: The expected reference value
            validation_type: Type of validation to perform
            
        Returns:
            Dict containing validation result and details
        """
        try:
            if validation_type not in self.validation_methods:
                logger.warning(f"Unknown validation type: {validation_type}, using exact_match")
                validation_type = 'exact_match'
            
            validation_method = self.validation_methods[validation_type]
            is_valid, details = validation_method(actual_output, expected_output)
            
            return {
                'is_valid': is_valid,
                'validation_type': validation_type,
                'actual_output': actual_output,
                'expected_output': expected_output,
                'details': details,
                'score': self._calculate_score(actual_output, expected_output, validation_type)
            }
            
        except Exception as e:
            logger.error(f"Error during output validation: {str(e)}")
            return {
                'is_valid': False,
                'validation_type': validation_type,
                'actual_output': actual_output,
                'expected_output': expected_output,
                'details': f"Validation error: {str(e)}",
                'score': 0
            }
    
    def _exact_match(self, actual: str, expected: str) -> Tuple[bool, Dict[str, Any]]:
        """Exact string match validation"""
        actual_clean = actual.strip()
        expected_clean = expected.strip()
        
        is_match = actual_clean == expected_clean
        
        details = {
            'method': 'exact_match',
            'actual_length': len(actual_clean),
            'expected_length': len(expected_clean),
            'match': is_match,
            'differences': self._find_differences(actual_clean, expected_clean) if not is_match else []
        }
        
        return is_match, details
    
    def _contains(self, actual: str, expected: str) -> Tuple[bool, Dict[str, Any]]:
        """Contains validation - check if expected string is contained in actual output"""
        actual_lower = actual.lower().strip()
        expected_lower = expected.lower().strip()
        
        is_contained = expected_lower in actual_lower
        
        details = {
            'method': 'contains',
            'case_sensitive': False,
            'contained': is_contained,
            'found_at': actual_lower.find(expected_lower) if is_contained else -1
        }
        
        return is_contained, details
    
    def _regex_match(self, actual: str, expected: str) -> Tuple[bool, Dict[str, Any]]:
        """Regex pattern validation"""
        try:
            pattern = re.compile(expected, re.MULTILINE | re.DOTALL)
            match = pattern.search(actual)
            
            is_match = match is not None
            
            details = {
                'method': 'regex',
                'pattern': expected,
                'match_found': is_match,
                'match_groups': list(match.groups()) if match else [],
                'match_span': match.span() if match else None
            }
            
            return is_match, details
            
        except re.error as e:
            logger.error(f"Invalid regex pattern: {expected}, error: {str(e)}")
            return False, {
                'method': 'regex',
                'error': f"Invalid regex pattern: {str(e)}",
                'pattern': expected
            }
    
    def _custom_validation(self, actual: str, expected: str) -> Tuple[bool, Dict[str, Any]]:
        """Custom validation logic - can be extended for specific use cases"""
        # For now, implement a flexible validation that checks multiple criteria
        criteria = expected.split('|') if '|' in expected else [expected]
        
        results = []
        for criterion in criteria:
            criterion = criterion.strip()
            if criterion.startswith('contains:'):
                # Format: contains:text
                text = criterion[9:]
                result = text.lower() in actual.lower()
                results.append(('contains', text, result))
            elif criterion.startswith('regex:'):
                # Format: regex:pattern
                pattern = criterion[6:]
                try:
                    match = re.search(pattern, actual, re.MULTILINE | re.DOTALL)
                    result = match is not None
                    results.append(('regex', pattern, result))
                except re.error:
                    results.append(('regex', pattern, False))
            elif criterion.startswith('not_contains:'):
                # Format: not_contains:text
                text = criterion[13:]
                result = text.lower() not in actual.lower()
                results.append(('not_contains', text, result))
            else:
                # Default to exact match
                result = criterion.strip() == actual.strip()
                results.append(('exact', criterion, result))
        
        # All criteria must pass for custom validation to succeed
        is_valid = all(result[2] for result in results)
        
        details = {
            'method': 'custom',
            'criteria': results,
            'all_passed': is_valid,
            'passed_count': sum(1 for r in results if r[2]),
            'total_count': len(results)
        }
        
        return is_valid, details
    
    def _find_differences(self, actual: str, expected: str) -> List[Dict[str, Any]]:
        """Find specific differences between actual and expected output"""
        differences = []
        
        # Split into lines for line-by-line comparison
        actual_lines = actual.split('\n')
        expected_lines = expected.split('\n')
        
        max_lines = max(len(actual_lines), len(expected_lines))
        
        for i in range(max_lines):
            actual_line = actual_lines[i] if i < len(actual_lines) else ''
            expected_line = expected_lines[i] if i < len(expected_lines) else ''
            
            if actual_line != expected_line:
                differences.append({
                    'line_number': i + 1,
                    'actual': actual_line,
                    'expected': expected_line,
                    'type': 'line_mismatch'
                })
        
        return differences
    
    def _calculate_score(self, actual: str, expected: str, validation_type: str) -> float:
        """Calculate a similarity score between actual and expected output"""
        if not actual or not expected:
            return 0.0
        
        if validation_type == 'exact_match':
            return 100.0 if actual.strip() == expected.strip() else 0.0
        
        elif validation_type == 'contains':
            actual_lower = actual.lower()
            expected_lower = expected.lower()
            if expected_lower in actual_lower:
                # Calculate how much of the expected text is found
                return min(100.0, (len(expected) / len(actual)) * 100)
            return 0.0
        
        elif validation_type == 'regex':
            try:
                pattern = re.compile(expected, re.MULTILINE | re.DOTALL)
                match = pattern.search(actual)
                if match:
                    # Calculate score based on match length vs expected length
                    return min(100.0, (len(match.group()) / len(expected)) * 100)
                return 0.0
            except re.error:
                return 0.0
        
        elif validation_type == 'custom':
            # For custom validation, calculate score based on passed criteria
            criteria = expected.split('|') if '|' in expected else [expected]
            passed = 0
            total = len(criteria)
            
            for criterion in criteria:
                criterion = criterion.strip()
                if self._evaluate_criterion(actual, criterion):
                    passed += 1
            
            return (passed / total) * 100 if total > 0 else 0.0
        
        return 0.0
    
    def _evaluate_criterion(self, actual: str, criterion: str) -> bool:
        """Evaluate a single criterion in custom validation"""
        if criterion.startswith('contains:'):
            text = criterion[9:]
            return text.lower() in actual.lower()
        elif criterion.startswith('regex:'):
            pattern = criterion[6:]
            try:
                return re.search(pattern, actual, re.MULTILINE | re.DOTALL) is not None
            except re.error:
                return False
        elif criterion.startswith('not_contains:'):
            text = criterion[13:]
            return text.lower() not in actual.lower()
        else:
            return criterion.strip() == actual.strip()
    
    def validate_multiple_commands(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Validate multiple command results and provide summary
        
        Args:
            results: List of command execution results
            
        Returns:
            Summary of validation results
        """
        total_commands = len(results)
        passed_commands = sum(1 for r in results if r.get('is_valid', False))
        failed_commands = total_commands - passed_commands
        
        # Calculate overall score
        total_score = sum(r.get('score', 0) for r in results)
        average_score = total_score / total_commands if total_commands > 0 else 0
        
        # Group by validation type
        validation_summary = {}
        for result in results:
            vtype = result.get('validation_type', 'unknown')
            if vtype not in validation_summary:
                validation_summary[vtype] = {'total': 0, 'passed': 0}
            validation_summary[vtype]['total'] += 1
            if result.get('is_valid', False):
                validation_summary[vtype]['passed'] += 1
        
        return {
            'total_commands': total_commands,
            'passed_commands': passed_commands,
            'failed_commands': failed_commands,
            'success_rate': (passed_commands / total_commands * 100) if total_commands > 0 else 0,
            'average_score': average_score,
            'validation_summary': validation_summary,
            'results': results
        }