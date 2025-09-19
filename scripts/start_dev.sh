#!/bin/bash

# Script khởi động development environment cho System Checklist Tool
# Chạy cả backend và frontend đồng thời

echo "🚀 Starting System Checklist Tool Development Environment..."
echo "================================================"

# Chuyển về thư mục gốc của dự án (parent directory của scripts)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd .. && pwd)"
cd "$PROJECT_ROOT"

# Kiểm tra xem có đang trong thư mục dự án không
if [ ! -f "package.json" ] && [ ! -f "backend/app.py" ]; then
    echo "❌ Error: Cannot find project files. Please check project structure."
    echo "Current directory: $(pwd)"
    exit 1
fi

# Function để cleanup khi script bị dừng
cleanup() {
    echo "\n🛑 Stopping all services..."
    kill $BACKEND_PID $FRONTEND_PID $REDIS_PID $WORKER_PID 2>/dev/null
    wait $BACKEND_PID $FRONTEND_PID $REDIS_PID $WORKER_PID 2>/dev/null
    echo "✅ All services stopped"
    exit 0
}

# Trap SIGINT (Ctrl+C) để cleanup
trap cleanup SIGINT

# Kiểm tra Python và Node.js
echo "🔍 Checking dependencies..."

if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 is not installed"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed"
    exit 1
fi

echo "✅ Dependencies check passed"

# Kiểm tra và cài đặt Redis
echo "\n🔍 Checking Redis..."
if ! command -v redis-server &> /dev/null; then
    echo "📦 Redis not found. Installing Redis..."
    
    # Cài đặt Redis bằng snap (không cần sudo)
    if command -v snap &> /dev/null; then
        echo "Installing Redis via snap..."
        sudo apt install redis -y
    else
        echo "⚠️  Redis not installed and snap not available."
        echo "Please install Redis manually:"
        echo "  sudo apt update && sudo apt install redis-server -y"
        echo "Or install snap first:"
        echo "  sudo apt install snapd -y"
        echo ""
        echo "Continuing without Redis (RQ features will be disabled)..."
        export DISABLE_RQ=true
    fi
else
    echo "✅ Redis is available"
fi

# Khởi động Redis Server
if [ "$DISABLE_RQ" != "true" ] && command -v redis-server &> /dev/null; then
    echo "\n🔴 Starting Redis Server..."
    
    # Kiểm tra xem Redis đã chạy chưa
    if redis-cli ping &> /dev/null; then
        echo "✅ Redis is already running"
    else
        # Khởi động Redis server
        redis-server --daemonize yes --port 6379 --bind 127.0.0.1
        sleep 2
        
        # Kiểm tra Redis đã khởi động thành công chưa
        if redis-cli ping &> /dev/null; then
            echo "✅ Redis server started successfully"
        else
            echo "⚠️  Failed to start Redis server"
            echo "Continuing without Redis (RQ features will be disabled)..."
            export DISABLE_RQ=true
        fi
    fi
else
    echo "⚠️  Redis not available, RQ features will be disabled"
    export DISABLE_RQ=true
fi

# Khởi động Backend
echo "\n🐍 Starting Backend (Flask)..."
cd "$PROJECT_ROOT/backend"

# Kiểm tra virtual environment
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies nếu cần
if [ ! -f "venv/.deps_installed" ]; then
    echo "📦 Installing Python dependencies..."
    pip install -r requirements.txt
    touch venv/.deps_installed
fi

# Khởi động Flask server
echo "🌐 Starting Flask server on http://localhost:5000"
export FLASK_ENV=development
export FLASK_DEBUG=1
python3 app.py &
BACKEND_PID=$!

# Khởi động RQ Worker
if [ "$DISABLE_RQ" != "true" ]; then
    echo "\n👷 Starting RQ Worker..."
    python3 run_worker.py &
    WORKER_PID=$!
    echo "✅ RQ Worker started (PID: $WORKER_PID)"
else
    echo "⚠️  RQ Worker disabled"
    WORKER_PID=""
fi

# Khởi động Frontend
echo "\n⚛️  Starting Frontend (React)..."
cd "$PROJECT_ROOT/frontend"

# Install dependencies nếu cần
if [ ! -d "node_modules" ]; then
    echo "📦 Installing Node.js dependencies..."
    npm install
fi

# Khởi động React development server
echo "🌐 Starting React server on http://localhost:5173"
npm run dev &
FRONTEND_PID=$!

# Quay về thư mục gốc
cd "$PROJECT_ROOT"

# Chờ một chút để servers khởi động
echo "\n⏳ Waiting for servers to start..."
sleep 5

# Hiển thị thông tin
echo "\n🎉 Development environment is ready!"
echo "================================================"
echo "📱 Frontend (React):  http://localhost:5173"
echo "🔧 Backend (Flask):   http://localhost:5000"
echo "📊 API Endpoints:     http://localhost:5000/api"
if [ "$DISABLE_RQ" != "true" ]; then
    echo "🔴 Redis Server:      localhost:6379"
    echo "👷 RQ Worker:         Running"
else
    echo "⚠️  Redis:             Disabled (RQ features unavailable)"
    echo "⚠️  RQ Worker:         Disabled"
fi
echo "================================================"
echo "\n💡 Tips:"
echo "   - Frontend sẽ tự động reload khi bạn thay đổi code"
echo "   - Backend cũng sẽ reload với Flask debug mode"
echo "   - Nhấn Ctrl+C để dừng tất cả services"
echo "\n🔍 Checking server status..."

# Kiểm tra backend
if curl -s http://localhost:5000/api/health > /dev/null; then
    echo "✅ Backend is running"
else
    echo "⚠️  Backend might still be starting..."
fi

# Kiểm tra frontend
if curl -s http://localhost:5173 > /dev/null; then
    echo "✅ Frontend is running"
else
    echo "⚠️  Frontend might still be starting..."
fi

# Kiểm tra Redis
if [ "$DISABLE_RQ" != "true" ]; then
    if redis-cli ping &> /dev/null; then
        echo "✅ Redis is running"
    else
        echo "⚠️  Redis might have issues..."
    fi
    
    # Kiểm tra RQ Worker
    if ps -p $WORKER_PID &> /dev/null; then
        echo "✅ RQ Worker is running"
    else
        echo "⚠️  RQ Worker might have issues..."
    fi
fi

echo "\n🚀 Ready for development! Press Ctrl+C to stop all services."

# Chờ cho đến khi user nhấn Ctrl+C
if [ "$DISABLE_RQ" != "true" ] && [ -n "$WORKER_PID" ]; then
    wait $BACKEND_PID $FRONTEND_PID $WORKER_PID
else
    wait $BACKEND_PID $FRONTEND_PID
fi