# Scripts Directory

Thư mục này chứa tất cả các script bash và Python để quản lý System Checklist Tool.

## Development Scripts

### 🚀 Khởi động Development Environment
```bash
./scripts/start_dev.sh
```
Khởi động cả backend (Flask) và frontend (React) đồng thời cho môi trường development.

### 🛑 Dừng Development Environment
```bash
./scripts/stop_dev.sh
```
Dừng tất cả các service development đang chạy.

### 🔍 Kiểm tra Service Status
```bash
./scripts/test_services.sh
```
Kiểm tra trạng thái của các service đang chạy.

## Production Scripts

### 🚀 Quick Start Production
```bash
python3 ./scripts/quick_start.py
```
Script Python để setup và test nhanh môi trường production.

### 🌐 Start Production Server
```bash
python3 ./scripts/start_production.py start
```
Khởi động production server với Gunicorn.

### 📦 Deploy Production
```bash
./scripts/deploy_production.sh
```
Deploy toàn bộ ứng dụng cho production (frontend + backend).

### 🧪 Test Production
```bash
./scripts/test_production.sh
```
Kiểm tra health và functionality của production deployment.

### 🗄️ Database Management
```bash
./scripts/manage_database.sh [command]
```
Quản lý database (setup, migration, backup, restore).

### ⚙️ Production Manager
```bash
./scripts/production_manager.sh [command]
```
Script tổng hợp để quản lý toàn bộ production environment.

## Lưu ý quan trọng

- Tất cả các script đã được cập nhật để hoạt động từ thư mục `scripts`
- Các script sẽ tự động chuyển về thư mục gốc của project khi cần thiết
- Frontend sử dụng Vite (port 5173) thay vì Create React App (port 3000)
- Đảm bảo chạy script từ thư mục gốc của project: `./scripts/script_name.sh`

## Cấu trúc thư mục sau khi di chuyển

```
system-checklist-tool/
├── scripts/
│   ├── start_dev.sh
│   ├── stop_dev.sh
│   ├── test_services.sh
│   ├── quick_start.py
│   ├── start_production.py
│   ├── deploy_production.sh
│   ├── test_production.sh
│   ├── manage_database.sh
│   ├── production_manager.sh
│   └── README.md
├── backend/
├── frontend/
└── ...
```

## Troubleshooting

Nếu gặp lỗi về đường dẫn, hãy đảm bảo:
1. Chạy script từ thư mục gốc của project
2. Script có quyền thực thi: `chmod +x scripts/*.sh`
3. Các dependency đã được cài đặt đầy đủ