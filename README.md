# System Checklist Tool

Hệ thống tự động đánh giá checklist cho hệ thống Cloud - cho phép upload danh sách server, tạo lệnh tùy chỉnh và thu thập thông tin hệ thống.

## Tính năng chính

- **Upload File Server List**: Tải lên file Excel/CSV/TXT chứa thông tin server (IP, credentials)
- **Manual Server Input**: Nhập thông tin server (IP, SSH/Sudo credentials)
- **Server Selection**: Chọn một hoặc nhiều server để đánh giá
- **Command Builder**: Tạo danh sách lệnh shell với validation chặt chẽ

## Cài đặt và chạy

### Yêu cầu hệ thống
- Python 3.8+
- Node.js 16+
- Ansible

### Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# hoặc venv\Scripts\activate  # Windows
pip install -r requirements.txt
python3 app.py
```

### Frontend
```bash
cd frontend
npm install
npm start
```

## Hướng dẫn sử dụng

### 1. Chuẩn bị server list
**Cách 1: Upload file**
- Tải template mẫu từ nút "Download Template"
- Hỗ trợ format: .xlsx, .xls, .csv, .txt

**Cách 2: Nhập trực tiếp**
- Click "Nhập thông tin server"
- Điền đầy đủ 5 thông tin: IP, SSH username, SSH password, Sudo username, Sudo password
- Click "Import Server"

### 2. Chọn server
- Chọn một hoặc nhiều server từ danh sách
- Server sẽ xuất hiện trong mục "Selected Servers"

### 3. Tạo danh sách lệnh
- Thêm lệnh thủ công hoặc chọn từ template
- Mỗi lệnh cần có tiêu đề và câu lệnh shell
- Hệ thống sẽ validate lệnh tự động

### 4. Chạy lệnh
- Nhấn "Run Commands" để bắt đầu
- Theo dõi tiến trình và kết quả
- Tải xuống log chi tiết


## API Endpoints

### File Upload
- `POST /api/upload/servers` - Upload file server list
- `GET /api/template/download` - Download template

### Commands
- `GET /api/templates/commands` - Get command templates
- `POST /api/commands/validate` - Validate shell command
- `POST /api/commands/run` - Run commands on servers
- `GET /api/commands/status/{job_id}` - Get job status
- `GET /api/commands/results/{job_id}` - Get job results
- `GET /api/logs/{job_id}` - Get job logs

### Health Check
- `GET /api/health` - Health check

## Cấu trúc dự án
```
system-checklist-tool/
├── frontend/                 # ReactJS application
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── types.ts         # TypeScript interfaces
│   │   ├── config.ts        # Configuration
│   │   └── App.tsx          # Main application
├── backend/                  # Python Flask API
│   ├── app.py               # Main Flask application
│   ├── ansible_manager.py   # Ansible integration
│   ├── command_validator.py # Command validation
│   ├── templates/           # Template files
│   └── logs/                # Generated logs
└── ansible/                 # Ansible playbooks
```

## Log Files

Log files được tạo theo format: `[giờ phút giây ngày tháng năm_IP].txt`
Ví dụ: `143022_25122023_127.0.0.1.txt`

Log chứa:
- Job ID và timestamp
- Danh sách commands và servers
- Kết quả chi tiết từng lệnh

