import re
import logging
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)

class RecommendationEngine:
    """
    Service to generate recommendations for failed commands
    Provides remediation suggestions based on command type and failure reason
    """
    
    def __init__(self):
        self.recommendations = self._load_recommendations()
    
    def _load_recommendations(self) -> Dict[str, Any]:
        """Load recommendation templates"""
        return {
            # System Information Commands
            'system_info': {
                'patterns': [r'uname', r'hostname', r'uptime', r'whoami', r'id'],
                'recommendations': [
                    {
                        'title': 'Kiểm tra quyền truy cập hệ thống',
                        'description': 'Đảm bảo user có quyền thực thi lệnh cơ bản',
                        'commands': [
                            'whoami',
                            'id',
                            'groups'
                        ],
                        'explanation': 'Kiểm tra identity và quyền của user hiện tại'
                    }
                ]
            },
            
            # File System Commands
            'filesystem': {
                'patterns': [r'ls', r'find', r'du', r'df', r'mount', r'lsblk', r'fdisk'],
                'recommendations': [
                    {
                        'title': 'Kiểm tra hệ thống file và mount points',
                        'description': 'Xác minh các filesystem và mount points',
                        'commands': [
                            'df -h',
                            'mount | grep -E "(ext[234]|xfs|btrfs)"',
                            'lsblk -f',
                            'cat /proc/mounts'
                        ],
                        'explanation': 'Hiển thị thông tin chi tiết về filesystem và mount points'
                    },
                    {
                        'title': 'Tạo mount point bị thiếu',
                        'description': 'Tạo các mount point cần thiết',
                        'commands': [
                            'sudo mkdir -p /mount/point/path',
                            'sudo mount /dev/device /mount/point/path',
                            'echo "/dev/device /mount/point/path filesystem defaults 0 2" | sudo tee -a /etc/fstab'
                        ],
                        'explanation': 'Tạo mount point và cập nhật fstab để mount tự động'
                    }
                ]
            },
            
            # Network Commands
            'network': {
                'patterns': [r'ip', r'ifconfig', r'netstat', r'ss', r'ping', r'curl', r'wget'],
                'recommendations': [
                    {
                        'title': 'Kiểm tra cấu hình mạng',
                        'description': 'Xác minh cấu hình network interfaces',
                        'commands': [
                            'ip addr show',
                            'ip route show',
                            'cat /etc/network/interfaces',
                            'systemctl status networking'
                        ],
                        'explanation': 'Hiển thị cấu hình mạng và trạng thái các interfaces'
                    },
                    {
                        'title': 'Khởi động network interface',
                        'description': 'Kích hoạt network interface bị tắt',
                        'commands': [
                            'sudo ip link set eth0 up',
                            'sudo systemctl restart networking',
                            'sudo dhclient eth0'
                        ],
                        'explanation': 'Kích hoạt interface và lấy IP từ DHCP'
                    }
                ]
            },
            
            # Process Commands
            'process': {
                'patterns': [r'ps', r'top', r'htop', r'pgrep', r'pkill', r'systemctl', r'service'],
                'recommendations': [
                    {
                        'title': 'Kiểm tra trạng thái service',
                        'description': 'Xác minh trạng thái các service quan trọng',
                        'commands': [
                            'systemctl status service-name',
                            'systemctl is-enabled service-name',
                            'journalctl -u service-name --no-pager -n 20'
                        ],
                        'explanation': 'Kiểm tra trạng thái và logs của service'
                    },
                    {
                        'title': 'Khởi động service bị dừng',
                        'description': 'Khởi động và enable service',
                        'commands': [
                            'sudo systemctl start service-name',
                            'sudo systemctl enable service-name',
                            'sudo systemctl status service-name'
                        ],
                        'explanation': 'Khởi động service và đảm bảo tự động chạy khi boot'
                    }
                ]
            },
            
            # Package Management
            'packages': {
                'patterns': [r'rpm', r'yum', r'dnf', r'apt', r'dpkg', r'zypper'],
                'recommendations': [
                    {
                        'title': 'Cập nhật package manager',
                        'description': 'Cập nhật danh sách packages và cache',
                        'commands': [
                            'sudo yum clean all && sudo yum update -y',  # RHEL/CentOS
                            'sudo apt update && sudo apt upgrade -y',     # Ubuntu/Debian
                            'sudo zypper refresh && sudo zypper update'   # SUSE
                        ],
                        'explanation': 'Cập nhật package manager cache và packages'
                    },
                    {
                        'title': 'Cài đặt package bị thiếu',
                        'description': 'Cài đặt các packages cần thiết',
                        'commands': [
                            'sudo yum install -y package-name',           # RHEL/CentOS
                            'sudo apt install -y package-name',           # Ubuntu/Debian
                            'sudo zypper install package-name'            # SUSE
                        ],
                        'explanation': 'Cài đặt package theo distribution'
                    }
                ]
            },
            
            # Security Commands
            'security': {
                'patterns': [r'sudo', r'su', r'passwd', r'chown', r'chmod', r'selinux', r'firewall'],
                'recommendations': [
                    {
                        'title': 'Kiểm tra cấu hình sudo',
                        'description': 'Xác minh cấu hình sudo và quyền user',
                        'commands': [
                            'sudo -l',
                            'cat /etc/sudoers | grep -v "^#"',
                            'groups $USER'
                        ],
                        'explanation': 'Kiểm tra quyền sudo của user hiện tại'
                    },
                    {
                        'title': 'Cấp quyền sudo cho user',
                        'description': 'Thêm user vào sudoers',
                        'commands': [
                            'sudo usermod -aG sudo username',             # Ubuntu/Debian
                            'sudo usermod -aG wheel username',            # RHEL/CentOS
                            'echo "username ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/username'
                        ],
                        'explanation': 'Thêm user vào group sudo/wheel hoặc tạo sudoers file'
                    }
                ]
            },
            
            # Log Commands
            'logs': {
                'patterns': [r'tail', r'head', r'cat', r'less', r'grep', r'journalctl'],
                'recommendations': [
                    {
                        'title': 'Kiểm tra log files',
                        'description': 'Xác minh quyền truy cập và tồn tại của log files',
                        'commands': [
                            'ls -la /var/log/',
                            'sudo tail -f /var/log/messages',
                            'sudo journalctl -xe --no-pager -n 50'
                        ],
                        'explanation': 'Kiểm tra logs hệ thống để tìm lỗi'
                    }
                ]
            },
            
            # Hardware Commands
            'hardware': {
                'patterns': [r'lscpu', r'lsmem', r'lsblk', r'lspci', r'lsusb', r'dmidecode'],
                'recommendations': [
                    {
                        'title': 'Kiểm tra thông tin hardware',
                        'description': 'Thu thập thông tin chi tiết về hardware',
                        'commands': [
                            'lscpu',
                            'free -h',
                            'lsblk',
                            'lspci | head -20',
                            'sudo dmidecode -t system | head -20'
                        ],
                        'explanation': 'Hiển thị thông tin CPU, RAM, storage và system'
                    }
                ]
            },
            
            # Generic fallback
            'generic': {
                'patterns': [r'.*'],
                'recommendations': [
                    {
                        'title': 'Kiểm tra cơ bản hệ thống',
                        'description': 'Thực hiện các kiểm tra cơ bản',
                        'commands': [
                            'whoami',
                            'pwd',
                            'ls -la',
                            'df -h',
                            'free -h',
                            'uptime'
                        ],
                        'explanation': 'Kiểm tra thông tin cơ bản về user, filesystem và tài nguyên hệ thống'
                    },
                    {
                        'title': 'Kiểm tra quyền và đường dẫn',
                        'description': 'Xác minh quyền truy cập và PATH',
                        'commands': [
                            'echo $PATH',
                            'which command-name',
                            'ls -la $(which command-name)',
                            'sudo which command-name'
                        ],
                        'explanation': 'Kiểm tra PATH và quyền thực thi của command'
                    }
                ]
            }
        }
    
    def generate_recommendations(self, command: str, output: str = "", error: str = "", 
                               validation_result: str = "Not OK") -> List[Dict[str, Any]]:
        """
        Generate recommendations for a failed command
        
        Args:
            command: The failed command
            output: Command output
            error: Error message
            validation_result: Validation result
            
        Returns:
            List of recommendation dictionaries
        """
        if validation_result == "OK" or validation_result == "OK (skipped)":
            return []
        
        recommendations = []
        
        # Determine command category
        category = self._categorize_command(command)
        
        # Get recommendations for the category
        if category in self.recommendations:
            category_recs = self.recommendations[category]['recommendations']
        else:
            category_recs = self.recommendations['generic']['recommendations']
        
        # Add context-specific recommendations
        context_recs = self._generate_context_specific_recommendations(command, output, error)
        
        # Combine and deduplicate
        all_recs = category_recs + context_recs
        seen_titles = set()
        
        for rec in all_recs:
            if rec['title'] not in seen_titles:
                recommendations.append(rec)
                seen_titles.add(rec['title'])
        
        # Limit to top 3 recommendations
        return recommendations[:3]
    
    def _categorize_command(self, command: str) -> str:
        """Categorize command based on patterns"""
        command_lower = command.lower()
        
        for category, config in self.recommendations.items():
            if category == 'generic':
                continue
                
            for pattern in config['patterns']:
                if re.search(pattern, command_lower):
                    return category
        
        return 'generic'
    
    def _generate_context_specific_recommendations(self, command: str, output: str, error: str) -> List[Dict[str, Any]]:
        """Generate context-specific recommendations based on error patterns"""
        recommendations = []
        
        error_lower = error.lower() if error else ""
        output_lower = output.lower() if output else ""
        combined_text = f"{error_lower} {output_lower}".strip()
        
        # Permission denied errors
        if any(phrase in combined_text for phrase in ['permission denied', 'access denied', 'not permitted']):
            recommendations.append({
                'title': 'Khắc phục lỗi quyền truy cập',
                'description': 'Lệnh bị từ chối do thiếu quyền',
                'commands': [
                    f'sudo {command}',
                    'ls -la $(dirname $(which {command.split()[0]}))',
                    'sudo chmod +x /path/to/command'
                ],
                'explanation': 'Thử chạy với sudo hoặc kiểm tra quyền thực thi'
            })
        
        # Command not found errors
        if any(phrase in combined_text for phrase in ['command not found', 'not found', 'no such file']):
            cmd_name = command.split()[0]
            recommendations.append({
                'title': 'Cài đặt lệnh bị thiếu',
                'description': f'Lệnh {cmd_name} không tồn tại trên hệ thống',
                'commands': [
                    f'which {cmd_name}',
                    f'sudo yum install -y {cmd_name}',     # RHEL/CentOS
                    f'sudo apt install -y {cmd_name}',     # Ubuntu/Debian
                    f'sudo zypper install {cmd_name}'      # SUSE
                ],
                'explanation': f'Cài đặt package chứa lệnh {cmd_name}'
            })
        
        # Network/connection errors
        if any(phrase in combined_text for phrase in ['connection refused', 'network unreachable', 'timeout']):
            recommendations.append({
                'title': 'Khắc phục lỗi kết nối mạng',
                'description': 'Lỗi kết nối mạng hoặc service không chạy',
                'commands': [
                    'ping -c 3 8.8.8.8',
                    'systemctl status networking',
                    'ip route show',
                    'netstat -tuln | grep LISTEN'
                ],
                'explanation': 'Kiểm tra kết nối mạng và các service đang chạy'
            })
        
        # File/directory not found
        if any(phrase in combined_text for phrase in ['no such file or directory', 'file not found']):
            recommendations.append({
                'title': 'Tạo file/thư mục bị thiếu',
                'description': 'File hoặc thư mục không tồn tại',
                'commands': [
                    'ls -la $(dirname /path/to/missing/file)',
                    'sudo mkdir -p /path/to/missing/directory',
                    'sudo touch /path/to/missing/file',
                    'sudo chown $USER:$USER /path/to/file'
                ],
                'explanation': 'Tạo file/thư mục bị thiếu và cấp quyền phù hợp'
            })
        
        # Service not running
        if any(phrase in combined_text for phrase in ['service not running', 'inactive', 'failed']):
            recommendations.append({
                'title': 'Khởi động service bị dừng',
                'description': 'Service cần thiết không chạy',
                'commands': [
                    'systemctl list-units --failed',
                    'sudo systemctl start service-name',
                    'sudo systemctl enable service-name',
                    'journalctl -u service-name --no-pager -n 20'
                ],
                'explanation': 'Khởi động service và kiểm tra logs để tìm nguyên nhân lỗi'
            })
        
        return recommendations
    
    def format_recommendations_for_display(self, recommendations: List[Dict[str, Any]]) -> str:
        """Format recommendations for display in UI"""
        if not recommendations:
            return "Không có gợi ý khắc phục cho lệnh này."
        
        formatted = []
        
        for i, rec in enumerate(recommendations, 1):
            formatted.append(f"**{i}. {rec['title']}**")
            formatted.append(f"   {rec['description']}")
            formatted.append(f"   *{rec['explanation']}*")
            formatted.append("")
            formatted.append("   **Các lệnh gợi ý:**")
            
            for cmd in rec['commands']:
                formatted.append(f"   ```bash")
                formatted.append(f"   {cmd}")
                formatted.append(f"   ```")
            
            formatted.append("")
            formatted.append("---")
            formatted.append("")
        
        return "\n".join(formatted)
