#!/bin/bash

# Script kiểm tra nhanh các services đang chạy

echo "🔍 Testing System Checklist Tool Services..."
echo "================================================"

# Test Backend (Flask)
echo "🐍 Testing Backend (http://localhost:5000)..."
if curl -s -f http://localhost:5000/api/health > /dev/null 2>&1; then
    echo "✅ Backend is running and healthy"
    
    # Test API response
    HEALTH_RESPONSE=$(curl -s http://localhost:5000/api/health)
    echo "   Response: $HEALTH_RESPONSE"
else
    echo "❌ Backend is not responding"
    echo "   Please check if Flask server is running on port 5000"
fi

echo ""

# Test Frontend (React)
echo "⚛️  Testing Frontend (http://localhost:5173)..."
if curl -s -f http://localhost:5173 > /dev/null 2>&1; then
    echo "✅ Frontend is running"
    
    # Check if it's actually React app
    if curl -s http://localhost:5173 | grep -q "React App\|System Checklist"; then
        echo "   React application is loaded"
    else
        echo "   ⚠️  Server responding but might not be React app"
    fi
else
    echo "❌ Frontend is not responding"
    echo "   Please check if React dev server is running on port 5173"
fi

echo ""

# Check running processes
echo "🔧 Checking running processes..."

# Check Flask process
FLASK_PID=$(pgrep -f "python.*app.py")
if [ ! -z "$FLASK_PID" ]; then
    echo "✅ Flask process found (PID: $FLASK_PID)"
else
    echo "❌ No Flask process found"
fi

# Check React process (Vite)
REACT_PID=$(pgrep -f "node.*vite")
if [ ! -z "$REACT_PID" ]; then
    echo "✅ React process found (PID: $REACT_PID)"
else
    echo "❌ No React process found"
fi

echo ""

# Port usage check
echo "🌐 Checking port usage..."

# Check port 5000 (Backend)
PORT_5000=$(lsof -ti:5000)
if [ ! -z "$PORT_5000" ]; then
    echo "✅ Port 5000 is in use (PID: $PORT_5000)"
else
    echo "❌ Port 5000 is not in use"
fi

# Check port 5173 (Frontend)
PORT_5173=$(lsof -ti:5173)
if [ ! -z "$PORT_5173" ]; then
    echo "✅ Port 5173 is in use (PID: $PORT_5173)"
else
    echo "❌ Port 5173 is not in use"
fi

echo ""
echo "================================================"
echo "🎯 Quick Test Summary:"

# Overall status
BACKEND_OK=false
FRONTEND_OK=false

if curl -s -f http://localhost:5000/api/health > /dev/null 2>&1; then
    BACKEND_OK=true
fi

if curl -s -f http://localhost:5173 > /dev/null 2>&1; then
    FRONTEND_OK=true
fi

if [ "$BACKEND_OK" = true ] && [ "$FRONTEND_OK" = true ]; then
    echo "🎉 Both services are running perfectly!"
    echo "   👉 Frontend: http://localhost:5173"
    echo "   👉 Backend:  http://localhost:5000"
    echo "   👉 Ready for testing!"
elif [ "$BACKEND_OK" = true ]; then
    echo "⚠️  Backend OK, but Frontend has issues"
    echo "   Try: cd frontend && npm run dev"
elif [ "$FRONTEND_OK" = true ]; then
    echo "⚠️  Frontend OK, but Backend has issues"
    echo "   Try: cd backend && python app.py"
else
    echo "❌ Both services have issues"
    echo "   Try: ./scripts/start_dev.sh"
fi

echo ""
echo "💡 Commands:"
echo "   ./scripts/start_dev.sh  - Start both services"
echo "   ./scripts/stop_dev.sh   - Stop all services"
echo "   ./scripts/test_services.sh - Run this test again"