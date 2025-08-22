#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script to convert checklist TXT files to CSV format
Converts bash script checklist files to structured CSV with 6 columns:
- Command Name
- Sub-Command ID  
- Command
- Expected Value
- Logic
- Notes
"""

import sys
import re
import csv
from typing import List, Tuple, Optional

def extract_check_info(line: str) -> Optional[Tuple[str, str]]:
    """
    Extract check number and name from echo statement
    Returns (check_num, check_name) or None if not found
    """
    # Pattern for echo statements with check info
    pattern = r'echo -e "\\n\\n(\d+)\. ([^:]+):\\n"'
    match = re.search(pattern, line)
    if match:
        return match.group(1), match.group(2)
    return None

def analyze_check_logic(line: str, check_name: str) -> Tuple[str, str, str]:
    """
    Analyze the logic of a check line and return expected value, logic, and notes
    """
    expected_value = ""
    logic = ""
    notes = ""
    
    # Determine expected value and logic based on the if conditions
    if 'if [[ -z $' in line:
        if '==> OK' in line and '==> WARNING' in line:
            # Check which condition leads to OK
            if line.find('==> OK') < line.find('==> WARNING'):
                expected_value = "Empty result"
                logic = "IF empty THEN OK, ELSE WARNING"
            else:
                expected_value = "Non-empty result"
                logic = "IF not empty THEN OK, ELSE WARNING"
        else:
            expected_value = "Empty result"
            logic = "IF empty THEN OK, ELSE WARNING"
    elif 'if [[ ! -z $' in line or 'if [[ -n $' in line:
        expected_value = "Non-empty result"
        logic = "IF not empty THEN OK, ELSE WARNING"
    elif 'if [[ $' in line and '==' in line:
        # Extract comparison value
        if '*0700*' in line:
            expected_value = "Contains '+0700'"
        elif '*VMware*' in line or '*RDO*' in line:
            expected_value = "Contains VMware or RDO"
        else:
            expected_value = "Specific value match"
        logic = "IF matches expected THEN OK, ELSE WARNING"
    elif 'if [ $' in line and '-lt' in line:
        # Extract numeric comparison
        lt_match = re.search(r'\[ \$\w+ -lt (\d+)', line)
        if lt_match:
            expected_value = f">= {lt_match.group(1)}"
            logic = f"IF >= {lt_match.group(1)} THEN OK, ELSE WARNING"
        else:
            expected_value = "Numeric threshold"
            logic = "IF meets threshold THEN OK, ELSE WARNING"
    elif 'for ' in line:
        expected_value = "Check each item in list"
        logic = "FOR each item: apply condition"
        notes = "Iterative check"
    else:
        expected_value = "Condition-based"
        logic = "IF condition met THEN OK, ELSE WARNING"
    
    # Extract notes from check name and content
    if 'vmware' in check_name.lower() or 'VMware' in line:
        notes += "Check if system is VMware/virtual; "
    if 'bond' in check_name.lower():
        notes += "Network bonding configuration check; "
    if 'password' in check_name.lower():
        notes += "Password policy configuration; "
    if 'ssh' in check_name.lower():
        notes += "SSH configuration check; "
    if 'service' in line or 'systemctl' in line:
        notes += "System service status check; "
    if 'timezone' in check_name.lower():
        notes += "Check timezone is +7; "
    if 'sudoers' in check_name.lower():
        notes += "Sudoers configuration check; "
    if 'selinux' in check_name.lower():
        notes += "SELinux configuration check; "
    if 'multipath' in check_name.lower():
        notes += "Storage multipath check; "
    if 'kdump' in check_name.lower():
        notes += "Kernel dump service check; "
    if 'openssl' in check_name.lower():
        notes += "OpenSSL version check; "
    if 'crontab' in check_name.lower():
        notes += "Crontab configuration check; "
    if 'rsyslog' in check_name.lower():
        notes += "System logging configuration; "
    
    notes = notes.rstrip('; ')
    
    return expected_value, logic, notes

def parse_simple_check(check_info: Tuple[str, str], command_lines: List[str]) -> List[Tuple[str, str, str, str, str, str]]:
    """
    Parse a simple check from check info and command lines
    Returns list of CSV rows
    """
    check_num, check_name = check_info
    command_name = f"{check_num}. {check_name}"
    
    # Join all command lines
    full_line = ' '.join(command_lines)
    
    # Extract commands between backticks
    commands = re.findall(r'`([^`]+)`', full_line)
    
    if not commands:
        return []
    
    results = []
    
    if len(commands) == 1:
        # Simple single command check
        cmd = commands[0]
        expected_value, logic, notes = analyze_check_logic(full_line, check_name)
        clean_cmd = cmd.replace('"', '').strip()
        results.append((command_name, "a", clean_cmd, expected_value, logic, notes))
    else:
        # Multi-command check
        sub_id = 'a'
        for i, cmd in enumerate(commands):
            if i == 0 and ('list=' in full_line or 'vmware=' in full_line or 'check=' in full_line):
                # First command is usually a prerequisite or list generator
                expected = "Get list/check prerequisite"
                logic = "Prepare for main check"
                notes = "Prerequisite step"
            else:
                # Subsequent commands are the actual checks
                expected, logic, notes = analyze_check_logic(full_line, check_name)
            
            clean_cmd = cmd.replace('"', '').strip()
            results.append((command_name, sub_id, clean_cmd, expected, logic, notes))
            sub_id = chr(ord(sub_id) + 1)
    
    return results

def convert_txt_to_csv(input_file: str, output_file: str):
    """
    Convert TXT checklist file to CSV format
    """
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            content = f.read()
    except FileNotFoundError:
        print(f"Error: File {input_file} not found")
        return
    except Exception as e:
        print(f"Error reading file {input_file}: {e}")
        return
    
    # Split content into lines
    lines = content.split(';')
    
    csv_rows = []
    current_check = None
    current_commands = []
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Check if this line contains a new check definition
        check_info = extract_check_info(line)
        
        if check_info:
            # Process previous check if exists
            if current_check and current_commands:
                rows = parse_simple_check(current_check, current_commands)
                csv_rows.extend(rows)
            
            # Start new check
            current_check = check_info
            current_commands = [line]
        else:
            # Add to current check commands
            if current_check:
                current_commands.append(line)
    
    # Process the last check
    if current_check and current_commands:
        rows = parse_simple_check(current_check, current_commands)
        csv_rows.extend(rows)
    
    # Write to CSV
    try:
        with open(output_file, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.writer(csvfile)
            # Write header
            writer.writerow(["Command Name", "Sub-Command ID", "Command", "Expected Value", "Logic", "Notes"])
            # Write data rows
            for row in csv_rows:
                writer.writerow(row)
        
        print(f"Conversion completed successfully!")
        print(f"Input file: {input_file}")
        print(f"Output file: {output_file}")
        print(f"Total checks converted: {len(csv_rows)}")
        
    except Exception as e:
        print(f"Error writing to CSV file {output_file}: {e}")

def main():
    if len(sys.argv) != 3:
        print("Usage: python3 convert_txt_to_csv.py <input_txt_file> <output_csv_file>")
        print("Example: python3 convert_txt_to_csv.py checklist_oracle_linux_8.txt checklist_oracle_linux_8_converted.csv")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    
    convert_txt_to_csv(input_file, output_file)

if __name__ == "__main__":
    main()