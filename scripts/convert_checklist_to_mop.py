#!/usr/bin/env python3
"""
Script để chuyển đổi checklist CSV cải tiến thành format MOP có thể import vào hệ thống

Usage:
    python3 convert_checklist_to_mop.py <input_csv> <output_csv>
    
Ví dụ:
    python3 convert_checklist_to_mop.py checklist_ubuntu_improved.csv mop_ubuntu_commands.csv
"""

import pandas as pd
import sys
import os
from typing import List, Dict, Any

def convert_checklist_to_mop(input_file: str, output_file: str) -> bool:
    """
    Chuyển đổi checklist CSV cải tiến thành format MOP
    
    Args:
        input_file: Đường dẫn file CSV checklist đầu vào
        output_file: Đường dẫn file CSV MOP đầu ra
        
    Returns:
        True nếu thành công, False nếu có lỗi
    """
    try:
        # Đọc file CSV checklist
        print(f"Đang đọc file: {input_file}")
        df = pd.read_csv(input_file)
        
        # Kiểm tra cấu trúc file
        required_columns = ['Command Name', 'Sub-Command ID', 'Command', 'Expected Value', 'Logic', 'Notes']
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            print(f"Lỗi: Thiếu các cột bắt buộc: {missing_columns}")
            return False
        
        print(f"Tìm thấy {len(df)} dòng trong file checklist")
        
        # Tạo danh sách commands cho MOP
        mop_commands = []
        
        for index, row in df.iterrows():
            # Bỏ qua dòng trống
            if pd.isna(row['Command']) or str(row['Command']).strip() == '':
                continue
                
            # Tạo command name từ Command Name và Sub-Command ID
            command_name = str(row['Command Name']).strip()
            sub_id = str(row['Sub-Command ID']).strip() if pd.notna(row['Sub-Command ID']) else ''
            
            if sub_id:
                full_command_name = f"{command_name} - {sub_id}"
            else:
                full_command_name = command_name
            
            # Tạo command dict theo format MOP
            command_dict = {
                'Command Name': full_command_name,
                'Command': str(row['Command']).strip(),
                'Reference Value': str(row['Expected Value']).strip() if pd.notna(row['Expected Value']) else ''
            }
            
            mop_commands.append(command_dict)
        
        print(f"Đã chuyển đổi {len(mop_commands)} commands")
        
        # Tạo DataFrame cho MOP format
        mop_df = pd.DataFrame(mop_commands)
        
        # Lưu file output
        print(f"Đang lưu file: {output_file}")
        mop_df.to_csv(output_file, index=False, encoding='utf-8')
        
        print(f"Hoàn thành! File MOP đã được tạo: {output_file}")
        print(f"Tổng số commands: {len(mop_commands)}")
        
        return True
        
    except Exception as e:
        print(f"Lỗi khi chuyển đổi file: {str(e)}")
        return False

def create_sample_mop_commands() -> List[Dict[str, str]]:
    """
    Tạo một số commands mẫu để test
    """
    return [
        {
            'Command Name': 'SYS1 - Hostname Check',
            'Command': 'hostname',
            'Reference Value': 'server-name'
        },
        {
            'Command Name': 'SYS2 - Memory Check', 
            'Command': 'free -m | awk "/Mem:/ {print $2}"',
            'Reference Value': '>=8192'
        },
        {
            'Command Name': 'NET1 - Default Gateway',
            'Command': 'ip route | grep default | awk "{print $3}"',
            'Reference Value': '192.168.1.1'
        },
        {
            'Command Name': 'DISK1 - Root Partition',
            'Command': 'df -h / | tail -1 | awk "{print $5}" | sed "s/%//"',
            'Reference Value': '<80'
        },
        {
            'Command Name': 'PROC1 - SSH Service',
            'Command': 'systemctl is-active sshd',
            'Reference Value': 'active'
        }
    ]

def create_sample_file(output_file: str) -> bool:
    """
    Tạo file mẫu để test
    """
    try:
        sample_commands = create_sample_mop_commands()
        df = pd.DataFrame(sample_commands)
        df.to_csv(output_file, index=False, encoding='utf-8')
        print(f"Đã tạo file mẫu: {output_file}")
        return True
    except Exception as e:
        print(f"Lỗi khi tạo file mẫu: {str(e)}")
        return False

def main():
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python3 convert_checklist_to_mop.py <input_csv> <output_csv>")
        print("  python3 convert_checklist_to_mop.py --sample <output_csv>")
        print("")
        print("Examples:")
        print("  python3 convert_checklist_to_mop.py checklist_ubuntu_improved.csv mop_ubuntu_commands.csv")
        print("  python3 convert_checklist_to_mop.py --sample sample_mop_commands.csv")
        sys.exit(1)
    
    if sys.argv[1] == '--sample':
        if len(sys.argv) < 3:
            print("Lỗi: Cần chỉ định tên file output cho sample")
            sys.exit(1)
        
        output_file = sys.argv[2]
        if create_sample_file(output_file):
            print(f"File mẫu đã được tạo thành công: {output_file}")
            print("Bạn có thể upload file này vào hệ thống để test")
        else:
            sys.exit(1)
    else:
        if len(sys.argv) < 3:
            print("Lỗi: Cần chỉ định cả input và output file")
            sys.exit(1)
        
        input_file = sys.argv[1]
        output_file = sys.argv[2]
        
        # Kiểm tra file input tồn tại
        if not os.path.exists(input_file):
            print(f"Lỗi: File input không tồn tại: {input_file}")
            sys.exit(1)
        
        # Chuyển đổi file
        if convert_checklist_to_mop(input_file, output_file):
            print("\nChuyển đổi thành công!")
            print(f"File MOP commands đã được tạo: {output_file}")
            print("Bạn có thể upload file này vào hệ thống thông qua trang MOP Submission")
        else:
            print("Chuyển đổi thất bại!")
            sys.exit(1)

if __name__ == '__main__':
    main()