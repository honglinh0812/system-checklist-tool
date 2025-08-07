import re
import subprocess
import shlex
from typing import Dict, List, Any

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