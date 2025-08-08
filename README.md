# System Checklist Tool

Hệ thống quản lý và thực thi Method of Procedure (MOP) cho việc đánh giá rủi ro và bàn giao hệ thống.

---

## **Hướng dẫn cài đặt hệ thống**

### **1. Cài đặt Dependencies**

```bash
# Clone repository (nếu chưa có)
cd system-checklist-tool

# Tạo virtual environment
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# hoặc
venv\Scripts\activate  # Windows

# Cài đặt Python dependencies
cd backend
pip install -r requirements.txt

# Cài đặt thêm packages cần thiết
pip install openpyxl pandas Flask-AdminLTE3
```

### **2. Cấu hình Database**

```bash
# Tạo thư mục uploads
mkdir -p backend/uploads/pdf backend/uploads/appendix
chmod 755 backend/uploads backend/uploads/pdf backend/uploads/appendix

# Khởi tạo database
cd backend
flask db init
flask db migrate
flask db upgrade

# Tạo admin users
python3 create_admin.py
```

### **3. Chạy Backend**

```bash
# Trong thư mục backend
cd backend
python3 app.py
```

Backend sẽ chạy tại: `http://localhost:5000`

### **4. Frontend**

Hệ thống sử dụng Flask + AdminLTE (server-rendered). Không cần React frontend.

### **5. Truy cập hệ thống**

1. **Mở trình duyệt**: `http://localhost:5000`
2. **Đăng nhập** với một trong hai tài khoản:
   - Username: `admin`, Password: `admin` (Admin role)
   - Username: `suser`, Password: `user` (User role)

### **6. Các tính năng chính**

#### **Cho User:**
- **MOP Submission**: Upload PDF + appendix file
- **Risk Assessment**: Chọn MOP và thực thi đánh giá rủi ro
- **Handover Assessment**: Chọn MOP và thực thi đánh giá bàn giao
- **Execution History**: Xem lịch sử thực thi 7 ngày gần nhất

#### **Cho Admin:**
- ✅ **MOP Review**: Approve/reject MOPs từ user
- ✅ **MOP Edit**: Chỉnh sửa và categorize MOPs
- ✅ **User Management**: Tạo và quản lý users
- ✅ **MOP Management**: Tạo, edit, delete MOPs
- ✅ **Tất cả tính năng của User**

### **7. Workflow MOP hoàn chỉnh**

1. **User upload MOP** (PDF + appendix) → Status: PENDING_APPROVAL
2. **Admin review** → Approve for Edit → Status: APPROVED_FOR_EDIT
3. **Admin edit** → Chỉnh sửa name, commands, categorize → Finalize
4. **MOP available** → Status: APPROVED → Có thể thực thi

### **8. Cấu trúc thư mục quan trọng**

```
system-checklist-tool/
├── backend/
│   ├── app.py                 # Main Flask application
│   ├── templates/             # HTML templates
│   │   ├── mop_submission.html    # Trang upload MOP
│   │   ├── mop_review.html        # Trang review MOP
│   │   ├── mop_edit.html          # Trang edit MOP
│   │   ├── user_management.html   # Trang quản lý user
│   │   └── ...
│   ├── uploads/              # Thư mục upload files
│   ├── logs/                 # Log files
│   └── models/               # Database models
└── (không còn thư mục frontend)
```

### **9. Troubleshooting**

```bash
# Nếu có lỗi database
flask db upgrade

# Nếu có lỗi permission
chmod 755 backend/uploads backend/logs

# Nếu có lỗi dependencies
pip install -r requirements.txt --upgrade
```

---

## Tính năng chính

### 1. Frontend State Persistence (state_1)
- Lưu trữ trạng thái frontend trong localStorage
- Hiển thị lịch sử MOP 7 ngày gần nhất
- Quản lý danh sách server và cài đặt người dùng

### 2. Output Comparison (output_1)
- So sánh output với giá trị tham chiếu
- Hỗ trợ nhiều loại validation: exact_match, contains, regex, custom
- Hiển thị kết quả chi tiết với score và details

### 3. Excel Export (export_1)
- Export kết quả thực thi sang Excel với format chuyên nghiệp
- Bao gồm Summary, Detailed Results, và Server Summary sheets
- Hỗ trợ export MOP templates và user reports

### 4. Logging System (log_1)
- 2 loại log: Server Detail và MOP Summary
- Log rotation tự động (10MB/file, 5 backup files)
- Export logs với filter theo ngày

### 5. MOP Management
- Tạo, chỉnh sửa, phê duyệt MOP
- Quản lý commands với validation rules
- Template system cho MOP creation

### 6. User Management
- Quản lý người dùng với roles (admin/user)
- Audit trail cho user actions
- User status management

## API Endpoints

### Authentication
- `POST /api/auth/login` - Đăng nhập
- `POST /api/auth/logout` - Đăng xuất
- `GET /api/auth/user` - Lấy thông tin user hiện tại

### MOP Management
- `GET /api/mops` - Lấy danh sách MOP
- `POST /api/mops` - Tạo MOP mới
- `GET /api/mops/<id>` - Lấy chi tiết MOP
- `PUT /api/mops/<id>` - Cập nhật MOP
- `DELETE /api/mops/<id>` - Xóa MOP

### Execution
- `POST /api/commands/run` - Thực thi commands
- `GET /api/commands/status/<job_id>` - Kiểm tra trạng thái
- `GET /api/commands/results/<job_id>` - Lấy kết quả

### Export
- `GET /api/export/execution/<id>` - Export execution results
- `GET /api/logs/system/<type>/export` - Export system logs

### Logs
- `GET /api/logs/system` - Lấy danh sách log files
- `GET /api/logs/system/<type>` - Lấy log content

## Cấu hình

### Environment Variables
```bash
export FLASK_ENV=development
export DATABASE_URL=postgresql://user:pass@localhost/dbname
export SECRET_KEY=your-secret-key
```

### Database Configuration
```python
# config.py
class Config:
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'sqlite:///app.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key')
```

## Bảo mật

### Command Validation
- Kiểm tra dangerous commands
- Validate input parameters
- Sanitize command output

### User Authentication
- Password hashing với bcrypt
- Session management
- Role-based access control

### Logging
- Audit trail cho tất cả actions
- Error logging với stack traces
- Security event logging
