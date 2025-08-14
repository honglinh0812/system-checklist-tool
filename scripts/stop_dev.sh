#!/bin/bash

# Script dừng tất cả development services cho System Checklist Tool

echo "🛑 Stopping System Checklist Tool Development Environment..."
echo "================================================"

# Dừng React development server (thường chạy trên port 5173)
echo "⚛️  Stopping React development server..."
REACT_PID=$(lsof -ti:5173)
if [ ! -z "$REACT_PID" ]; then
    kill -9 $REACT_PID
    echo "✅ React server stopped"
else
    echo "ℹ️  No React server running on port 5173"
fi

# Dừng Flask development server (thường chạy trên port 5000)
echo "🐍 Stopping Flask development server..."
FLASK_PID=$(lsof -ti:5000)
if [ ! -z "$FLASK_PID" ]; then
    kill -9 $FLASK_PID
    echo "✅ Flask server stopped"
else
    echo "ℹ️  No Flask server running on port 5000"
fi

# Dừng tất cả processes liên quan đến npm dev
echo "📦 Stopping npm processes..."
NPM_PIDS=$(pgrep -f "npm.*dev")
if [ ! -z "$NPM_PIDS" ]; then
    echo $NPM_PIDS | xargs kill -9
    echo "✅ npm processes stopped"
else
    echo "ℹ️  No npm dev processes running"
fi

# Dừng tất cả processes liên quan đến node (Vite)
echo "🔧 Stopping node processes..."
NODE_PIDS=$(pgrep -f "node.*vite")
if [ ! -z "$NODE_PIDS" ]; then
    echo $NODE_PIDS | xargs kill -9
    echo "✅ Node processes stopped"
else
    echo "ℹ️  No Vite node processes running"
fi

# Dừng tất cả processes liên quan đến Python Flask
echo "🐍 Stopping Python Flask processes..."
PYTHON_PIDS=$(pgrep -f "python.*app.py")
if [ ! -z "$PYTHON_PIDS" ]; then
    echo $PYTHON_PIDS | xargs kill -9
    echo "✅ Python Flask processes stopped"
else
    echo "ℹ️  No Python Flask processes running"
fi

echo "\n🎉 All development services have been stopped!"
echo "================================================"
echo "💡 You can now run ./scripts/start_dev.sh to start again"