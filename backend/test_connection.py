import yaml
import tempfile
import os
from ansible_runner import run

inventory_content = {
    "all": {
        "hosts": {
            "localhost": {
                "ansible_connection": "local"
            }
        },
        "vars": {
            "ansible_python_interpreter": "/usr/bin/python3"
        }
    }
}

print("Testing Ansible connection with localhost...")
    
temp_dir = tempfile.mkdtemp()
inventory_path = os.path.join(temp_dir, "test_inventory.yml")

with open(inventory_path, 'w') as f:
    yaml.dump(inventory_content, f, default_flow_style=False)

print(f"Inventory created: {inventory_path}")
print("Inventory content:")
print(yaml.dump(inventory_content, default_flow_style=False))

playbook_content = [{
    "name": "Test Connection",
    "hosts": "all",
    "gather_facts": True,
    "tasks": [
        {
            "name": "Test ping",
            "ping": {}
        },
        {
            "name": "Get hostname",
            "shell": "hostname",
            "register": "hostname_result"
        },
        {
            "name": "Show hostname",
            "debug": {
                "msg": "Hostname: {{ hostname_result.stdout }}"
            }
        }
    ]
}]

playbook_path = os.path.join(temp_dir, "test_playbook.yml")
with open(playbook_path, 'w') as f:
    yaml.dump(playbook_content, f, default_flow_style=False)

print(f"Playbook created: {playbook_path}")

try:
    print("\nRunning Ansible playbook...")
    result = run(
        playbook=playbook_path,
        inventory=inventory_path,
        private_data_dir=temp_dir,
        quiet=False
    )
    
    print(f"Ansible run completed!")
    print(f"Status: {result.status}")
    print(f"Return code: {result.rc}")
    
    if result.rc == 0:
        print("Connection test successful!")
    else:
        print("Connection test failed!")
        
except Exception as e:
    print(f"Error running Ansible: {str(e)}")