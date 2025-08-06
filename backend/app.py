from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import os
import yaml
import json
from werkzeug.utils import secure_filename
import tempfile
import zipfile
from io import BytesIO
import threading
import pandas as pd
from typing import Dict, List, Any

app = Flask(__name__)
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'postgresql://localhost/checklist_db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key-here')

db = SQLAlchemy(app)

# Import AnsibleRunner
from ansible_manager import AnsibleRunner
ansible_runner = AnsibleRunner()

class Checklist(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    yaml_content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ScanJob(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    checklist_id = db.Column(db.Integer, db.ForeignKey('checklist.id'), nullable=False)
    target_ips = db.Column(db.Text, nullable=False)  
    status = db.Column(db.String(20), default='pending')  
    result_file = db.Column(db.String(255))
    result_details = db.Column(db.Text)  # JSON string chứa chi tiết kết quả
    logs = db.Column(db.Text)  # JSON string chứa logs
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)
    error_message = db.Column(db.Text)


@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'timestamp': datetime.utcnow().isoformat()})

@app.route('/api/checklists/sample', methods=['POST'])
def create_sample_checklist():
    try:
        sample_checklist = Checklist(
            name="System Security Checklist",
            description="Kiểm tra bảo mật hệ thống cơ bản",
            yaml_content=json.dumps({
                "name": "System Security Checklist",
                "description": "Kiểm tra bảo mật hệ thống cơ bản",
                "items": [
                    {
                        "id": "1",
                        "name": "Gather OS Information",
                        "description": "Collect basic operating system information",
                        "type": "task",
                        "enabled": True,
                    },
                    {
                        "id": "2",
                        "name": "Check SSH Configuration",
                        "description": "Verify SSH security settings",
                        "type": "check",
                        "enabled": True,
                    },
                    {
                        "id": "3",
                        "name": "System Services Status",
                        "description": "Check running services",
                        "type": "task",
                        "enabled": True,
                    },
                    {
                        "id": "4",
                        "name": "Network Configuration",
                        "description": "Verify network interface settings",
                        "type": "check",
                        "enabled": True,
                    },
                    {
                        "id": "5",
                        "name": "Disk Usage Check",
                        "description": "Monitor disk space usage",
                        "type": "task",
                        "enabled": True,
                    },
                ]
            })
        )
        db.session.add(sample_checklist)
        db.session.commit()
        
        return jsonify({
            'id': sample_checklist.id,
            'name': sample_checklist.name,
            'description': sample_checklist.description,
            'created_at': sample_checklist.created_at.isoformat()
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/checklists', methods=['GET'])
def get_checklists():
    checklists = Checklist.query.order_by(Checklist.updated_at.desc()).all()
    return jsonify([{
        'id': c.id,
        'name': c.name,
        'description': c.description,
        'created_at': c.created_at.isoformat(),
        'updated_at': c.updated_at.isoformat()
    } for c in checklists])

@app.route('/api/checklists', methods=['POST'])
def create_checklist():
    data = request.get_json()
    
    if not data or 'name' not in data or 'yaml_content' not in data:
        return jsonify({'error': 'Missing required fields'}), 400
    
    try:
        yaml.safe_load(data['yaml_content'])
        
        checklist = Checklist(
            name=data['name'],
            description=data.get('description', ''),
            yaml_content=data['yaml_content']
        )
        db.session.add(checklist)
        db.session.commit()
        
        return jsonify({
            'id': checklist.id,
            'name': checklist.name,
            'description': checklist.description,
            'created_at': checklist.created_at.isoformat()
        }), 201
        
    except yaml.YAMLError as e:
        return jsonify({'error': f'Invalid YAML: {str(e)}'}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/checklists/<int:checklist_id>', methods=['GET'])
def get_checklist(checklist_id):
    checklist = Checklist.query.get_or_404(checklist_id)
    return jsonify({
        'id': checklist.id,
        'name': checklist.name,
        'description': checklist.description,
        'yaml_content': checklist.yaml_content,
        'created_at': checklist.created_at.isoformat(),
        'updated_at': checklist.updated_at.isoformat()
    })

@app.route('/api/checklists/<int:checklist_id>', methods=['PUT'])
def update_checklist(checklist_id):
    checklist = Checklist.query.get_or_404(checklist_id)
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    try:
        if 'yaml_content' in data:
            yaml.safe_load(data['yaml_content'])
            checklist.yaml_content = data['yaml_content']
        
        if 'name' in data:
            checklist.name = data['name']
        
        if 'description' in data:
            checklist.description = data['description']
        
        checklist.updated_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({
            'id': checklist.id,
            'name': checklist.name,
            'description': checklist.description,
            'updated_at': checklist.updated_at.isoformat()
        })
        
    except yaml.YAMLError as e:
        return jsonify({'error': f'Invalid YAML: {str(e)}'}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/checklists/<int:checklist_id>', methods=['DELETE'])
def delete_checklist(checklist_id):
    checklist = Checklist.query.get_or_404(checklist_id)
    db.session.delete(checklist)
    db.session.commit()
    return jsonify({'message': 'Checklist deleted successfully'})

@app.route('/api/scan', methods=['POST'])
def start_scan():
    data = request.get_json()
    
    if not data or 'checklist_id' not in data or 'target_ips' not in data:
        return jsonify({'error': 'Missing required fields'}), 400
    
    try:
        checklist = Checklist.query.get(data['checklist_id'])
        if not checklist:
            return jsonify({'error': 'Checklist not found'}), 404
        
        try:
            yaml_content = json.loads(checklist.yaml_content)
            checklist_items = yaml_content.get('items', [])
        except:
            return jsonify({'error': 'Invalid checklist format'}), 400
        
        scan_job = ScanJob(
            checklist_id=data['checklist_id'],
            target_ips=json.dumps(data['target_ips']),
            status='pending'
        )
        db.session.add(scan_job)
        db.session.commit()
        
        # Chạy scan ngay lập tức (để test)
        try:
            print(f"Starting scan for job {scan_job.id}")
            
            scan_job.status = 'running'
            db.session.commit()
            
            results = ansible_runner.run_playbook(
                job_id=scan_job.id,
                checklist_items=checklist_items,
                target_ips=data['target_ips']
            )
            
            report_path = create_excel_report(scan_job.id, results, checklist)
            
            scan_job.status = 'completed'
            scan_job.completed_at = datetime.utcnow()
            scan_job.result_file = report_path
            scan_job.result_details = json.dumps(results)  # Lưu chi tiết kết quả
            scan_job.logs = json.dumps(ansible_runner.get_job_logs(scan_job.id))  # Lưu logs
            db.session.commit()
            
            print(f"Scan completed for job {scan_job.id}")
            
        except Exception as e:
            print(f"Error in scan job {scan_job.id}: {str(e)}")
            scan_job.status = 'failed'
            scan_job.error_message = str(e)
            db.session.commit()
        
        return jsonify({
            'job_id': scan_job.id,
            'status': scan_job.status,
            'message': 'Scan completed successfully' if scan_job.status == 'completed' else 'Scan failed',
            'result_file': scan_job.result_file if scan_job.status == 'completed' else None,
            'error_message': scan_job.error_message if scan_job.status == 'failed' else None
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

def create_excel_report(job_id: int, results: Dict, checklist: Checklist) -> str:
    if pd is None:
        print("Warning: pandas not available, skipping Excel report generation")
        return None
        
    try:
        summary_data = {
            'Metric': ['Total Items', 'Completed Items', 'Failed Items', 'Score (%)'],
            'Value': [
                results['summary']['total_items'],
                results['summary']['completed_items'],
                results['summary']['failed_items'],
                results['summary']['score']
            ]
        }
        summary_df = pd.DataFrame(summary_data)
        
        items_data = []
        for item in results['items']:
            items_data.append({
                'ID': item['id'],
                'Name': item['name'],
                'Type': item['type'],
                'Status': item['status'],
                'Score': item['score'],
                'Passed': 'Yes' if item['passed'] else 'No',
                'Output': item.get('output', '')[:200] + '...' if len(item.get('output', '')) > 200 else item.get('output', '')
            })
        items_df = pd.DataFrame(items_data)
        
        report_dir = os.getenv('REPORT_OUTPUT_DIR', './reports')
        os.makedirs(report_dir, exist_ok=True)
        report_path = os.path.join(report_dir, f'scan_report_{job_id}.xlsx')
        
        with pd.ExcelWriter(report_path, engine='openpyxl') as writer:
            summary_df.to_excel(writer, sheet_name='Summary', index=False)
            items_df.to_excel(writer, sheet_name='Items', index=False)
            
            checklist_info = pd.DataFrame({
                'Field': ['Checklist Name', 'Description', 'Job ID', 'Created At'],
                'Value': [
                    checklist.name,
                    checklist.description,
                    job_id,
                    datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                ]
            })
            checklist_info.to_excel(writer, sheet_name='Checklist Info', index=False)
        
        print(f"Excel report created: {report_path}")
        return report_path
        
    except Exception as e:
        print(f"Error creating Excel report: {str(e)}")
        return None

@app.route('/api/scan/<int:job_id>', methods=['GET'])
def get_scan_status(job_id):
    scan_job = ScanJob.query.get_or_404(job_id)
    
    job_status = ansible_runner.get_job_status(job_id)
    
    response_data = {
        'id': scan_job.id,
        'checklist_id': scan_job.checklist_id,
        'target_ips': json.loads(scan_job.target_ips),
        'status': scan_job.status,
        'created_at': scan_job.created_at.isoformat(),
        'completed_at': scan_job.completed_at.isoformat() if scan_job.completed_at else None,
        'error_message': scan_job.error_message,
        'result_details': json.loads(scan_job.result_details) if scan_job.result_details else None,
        'logs': json.loads(scan_job.logs) if scan_job.logs else []
    }
    
    if job_status and scan_job.status == 'running':
        response_data.update({
            'progress': job_status.get('progress', 0),
            'current_task': job_status.get('current_task', 0),
            'total_tasks': job_status.get('total_tasks', 0),
            'logs': job_status.get('logs', [])
        })
    
    return jsonify(response_data)

@app.route('/api/scan/<int:job_id>/download', methods=['GET'])
def download_report(job_id):
    scan_job = ScanJob.query.get_or_404(job_id)
    
    if scan_job.status != 'completed' or not scan_job.result_file:
        return jsonify({'error': 'Report not available'}), 404
    
    # Kiểm tra file có tồn tại không
    if not os.path.exists(scan_job.result_file):
        return jsonify({'error': 'Report file not found'}), 404
    
    # Trả về file Excel
    return send_file(
        scan_job.result_file,
        as_attachment=True,
        download_name=f"scan_report_job_{job_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx",
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )

@app.route('/api/dashboard', methods=['GET'])
def get_dashboard_data():
    recent_scans = ScanJob.query.order_by(ScanJob.created_at.desc()).limit(5).all()
    
    total_checklists = Checklist.query.count()
    total_scans = ScanJob.query.count()
    completed_scans = ScanJob.query.filter_by(status='completed').count()
    failed_scans = ScanJob.query.filter_by(status='failed').count()
    
    return jsonify({
        'recent_scans': [{
            'id': scan.id,
            'checklist_id': scan.checklist_id,
            'status': scan.status,
            'created_at': scan.created_at.isoformat(),
            'completed_at': scan.completed_at.isoformat() if scan.completed_at else None
        } for scan in recent_scans],
        'statistics': {
            'total_checklists': total_checklists,
            'total_scans': total_scans,
            'completed_scans': completed_scans,
            'failed_scans': failed_scans,
            'success_rate': (completed_scans / total_scans * 100) if total_scans > 0 else 0
        }
    })

@app.route('/api/ips/dcim', methods=['GET'])
def get_dcim_ips():
    return jsonify({
        'ips': [
            {'ip': '192.168.1.10', 'hostname': 'server-01', 'type': 'DELL IDRAC9'},
            {'ip': '192.168.1.11', 'hostname': 'server-02', 'type': 'HPE ILO5'},
            {'ip': '192.168.1.12', 'hostname': 'server-03', 'type': 'DELL IDRAC9'}
        ]
    })

@app.route('/api/ips/prom', methods=['GET'])
def get_prom_ips():
    return jsonify({
        'ips': [
            {'ip': '192.168.1.20', 'hostname': 'centos-01', 'os': 'CentOS 7'},
            {'ip': '192.168.1.21', 'hostname': 'ubuntu-01', 'os': 'Ubuntu 22.04'},
            {'ip': '192.168.1.22', 'hostname': 'centos-02', 'os': 'CentOS 8'}
        ]
    })

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, host='0.0.0.0', port=5000) 