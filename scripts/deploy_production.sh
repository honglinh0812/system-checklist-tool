#!/bin/bash

# Production Deployment Script for System Checklist Tool
# Deploys both Frontend (React) and Backend (Flask) for production

set -e  # Exit on any error

echo "🚀 System Checklist Tool - Production Deployment"
echo "================================================"

# Configuration
# Script hiện ở trong thư mục scripts, cần lên 1 cấp để về project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd .. && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BUILD_DIR="$PROJECT_ROOT/build"
LOGS_DIR="$PROJECT_ROOT/logs"
NGINX_CONFIG_DIR="/etc/nginx/sites-available"
NGINX_ENABLED_DIR="/etc/nginx/sites-enabled"
SERVICE_NAME="system-checklist"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_step() {
    echo -e "${BLUE}📋 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

check_dependencies() {
    print_step "Checking dependencies..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    print_success "Node.js: $(node --version)"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi
    print_success "npm: $(npm --version)"
    
    # Check Python3
    if ! command -v python3 &> /dev/null; then
        print_error "Python3 is not installed"
        exit 1
    fi
    print_success "Python3: $(python3 --version)"
    
    # Check pip3
    if ! command -v pip3 &> /dev/null; then
        print_error "pip3 is not installed"
        exit 1
    fi
    print_success "pip3: $(pip3 --version)"
    
    # Check if running as root for nginx setup
    if [[ $EUID -ne 0 ]] && [[ "$1" == "--with-nginx" ]]; then
        print_warning "Not running as root. Nginx configuration will be skipped."
        print_warning "Run with sudo for full deployment including nginx setup."
    fi
}

setup_directories() {
    print_step "Setting up directories..."
    
    # Create necessary directories
    mkdir -p "$LOGS_DIR"
    mkdir -p "$BUILD_DIR"
    
    print_success "Directories created"
}

build_frontend() {
    print_step "Building React frontend for production..."
    
    cd "$FRONTEND_DIR"
    
    # Install dependencies
    print_step "Installing frontend dependencies..."
    npm ci --production=false
    
    # Build for production
    print_step "Building React app..."
    npm run build
    
    # Copy build to deployment directory
    if [ -d "build" ]; then
        cp -r build/* "$BUILD_DIR/"
        print_success "Frontend built and copied to $BUILD_DIR"
    else
        print_error "Frontend build failed - build directory not found"
        exit 1
    fi
    
    cd "$PROJECT_ROOT"
}

setup_backend() {
    print_step "Setting up Flask backend for production..."
    
    cd "$BACKEND_DIR"
    
    # Create virtual environment if it doesn't exist
    if [ ! -d "venv" ]; then
        print_step "Creating Python virtual environment..."
        python3 -m venv venv
    fi
    
    # Activate virtual environment
    source venv/bin/activate
    
    # Install dependencies
    print_step "Installing backend dependencies..."
    pip install -r requirements.txt
    
    # Install gunicorn if not already installed
    pip install gunicorn
    
    print_success "Backend dependencies installed"
    
    cd "$PROJECT_ROOT"
}

setup_database() {
    print_step "Setting up database..."
    
    # Check if PostgreSQL is running
    if ! systemctl is-active --quiet postgresql; then
        print_warning "PostgreSQL is not running. Please start it manually:"
        print_warning "sudo systemctl start postgresql"
        print_warning "sudo systemctl enable postgresql"
    else
        print_success "PostgreSQL is running"
    fi
    
    # Initialize database (if needed)
    cd "$BACKEND_DIR"
    source venv/bin/activate
    
    # Load environment variables
    if [ -f "$PROJECT_ROOT/.env.production" ]; then
        export $(cat "$PROJECT_ROOT/.env.production" | grep -v '^#' | xargs)
    fi
    
    # Run database initialization
    if [ -f "init_data.py" ]; then
        print_step "Initializing database..."
        python3 init_data.py
        print_success "Database initialized"
    fi
    
    cd "$PROJECT_ROOT"
}

create_systemd_service() {
    print_step "Creating systemd service..."
    
    # Create systemd service file
    cat > "/tmp/${SERVICE_NAME}.service" << EOF
[Unit]
Description=System Checklist Tool - Flask Backend
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=exec
User=$USER
Group=$USER
WorkingDirectory=$BACKEND_DIR
Environment=PATH=$BACKEND_DIR/venv/bin
EnvironmentFile=$PROJECT_ROOT/.env.production
ExecStart=$BACKEND_DIR/venv/bin/gunicorn --config $PROJECT_ROOT/gunicorn.conf.py app:app
ExecReload=/bin/kill -s HUP \$MAINPID
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
    
    # Move service file to systemd directory (requires sudo)
    if [[ $EUID -eq 0 ]]; then
        mv "/tmp/${SERVICE_NAME}.service" "/etc/systemd/system/"
        systemctl daemon-reload
        systemctl enable "${SERVICE_NAME}.service"
        print_success "Systemd service created and enabled"
    else
        print_warning "Service file created at /tmp/${SERVICE_NAME}.service"
        print_warning "Run the following commands as root to install:"
        echo "sudo mv /tmp/${SERVICE_NAME}.service /etc/systemd/system/"
        echo "sudo systemctl daemon-reload"
        echo "sudo systemctl enable ${SERVICE_NAME}.service"
    fi
}

create_nginx_config() {
    print_step "Creating Nginx configuration..."
    
    # Create nginx configuration
    cat > "/tmp/${SERVICE_NAME}-nginx.conf" << 'EOF'
server {
    listen 80;
    server_name localhost;  # Change this to your domain
    
    # Frontend (React build)
    location / {
        root /home/linhnh/system-checklist-tool/build;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # Backend API
    location /api {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Increase timeout for long-running requests
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }
    
    # File uploads
    client_max_body_size 32M;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
}
EOF
    
    if [[ $EUID -eq 0 ]]; then
        mv "/tmp/${SERVICE_NAME}-nginx.conf" "${NGINX_CONFIG_DIR}/${SERVICE_NAME}"
        ln -sf "${NGINX_CONFIG_DIR}/${SERVICE_NAME}" "${NGINX_ENABLED_DIR}/${SERVICE_NAME}"
        nginx -t && systemctl reload nginx
        print_success "Nginx configuration created and enabled"
    else
        print_warning "Nginx config created at /tmp/${SERVICE_NAME}-nginx.conf"
        print_warning "Run the following commands as root to install:"
        echo "sudo mv /tmp/${SERVICE_NAME}-nginx.conf ${NGINX_CONFIG_DIR}/${SERVICE_NAME}"
        echo "sudo ln -sf ${NGINX_CONFIG_DIR}/${SERVICE_NAME} ${NGINX_ENABLED_DIR}/${SERVICE_NAME}"
        echo "sudo nginx -t && sudo systemctl reload nginx"
    fi
}

start_services() {
    print_step "Starting services..."
    
    if [[ $EUID -eq 0 ]]; then
        # Start backend service
        systemctl start "${SERVICE_NAME}.service"
        systemctl status "${SERVICE_NAME}.service" --no-pager
        print_success "Backend service started"
        
        # Start nginx
        systemctl start nginx
        systemctl enable nginx
        print_success "Nginx started and enabled"
    else
        print_warning "Run the following commands as root to start services:"
        echo "sudo systemctl start ${SERVICE_NAME}.service"
        echo "sudo systemctl start nginx"
        
        # Start backend manually for testing
        print_step "Starting backend manually for testing..."
        cd "$PROJECT_ROOT"
        python3 start_production.py start &
        sleep 3
        
        # Check if backend is running
        if curl -s -f http://localhost:5000/api/health > /dev/null 2>&1; then
            print_success "Backend is running on http://localhost:5000"
        else
            print_error "Backend failed to start"
        fi
    fi
}

show_summary() {
    echo ""
    echo "================================================"
    echo "🎉 Production Deployment Complete!"
    echo "================================================"
    echo ""
    echo "📁 Frontend Build: $BUILD_DIR"
    echo "🐍 Backend: $BACKEND_DIR"
    echo "📝 Logs: $LOGS_DIR"
    echo "⚙️  Config: $PROJECT_ROOT/.env.production"
    echo ""
    echo "🌐 URLs:"
    if [[ $EUID -eq 0 ]]; then
        echo "   Frontend: http://localhost (via Nginx)"
        echo "   Backend API: http://localhost/api"
    else
        echo "   Frontend: Serve $BUILD_DIR with a web server"
        echo "   Backend API: http://localhost:5000/api"
    fi
    echo ""
    echo "🔧 Management Commands:"
    if [[ $EUID -eq 0 ]]; then
        echo "   sudo systemctl start/stop/restart ${SERVICE_NAME}.service"
        echo "   sudo systemctl status ${SERVICE_NAME}.service"
        echo "   sudo systemctl start/stop/restart nginx"
    else
        echo "   ./start_production.py start/stop/status"
        echo "   Serve frontend build directory with nginx or apache"
    fi
    echo ""
    echo "📊 Monitoring:"
    echo "   Backend Health: http://localhost:5000/api/health"
    echo "   Logs: tail -f $LOGS_DIR/gunicorn_*.log"
    echo ""
}

# Main deployment function
main() {
    local with_nginx=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --with-nginx)
                with_nginx=true
                shift
                ;;
            -h|--help)
                echo "Usage: $0 [--with-nginx]"
                echo "  --with-nginx: Setup nginx configuration (requires root)"
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Run deployment steps
    check_dependencies "$with_nginx"
    setup_directories
    build_frontend
    setup_backend
    setup_database
    create_systemd_service
    
    if [[ "$with_nginx" == true ]]; then
        create_nginx_config
    fi
    
    start_services
    show_summary
}

# Run main function with all arguments
main "$@"