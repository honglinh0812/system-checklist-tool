#!/bin/bash

# Production Manager for System Checklist Tool
# Comprehensive script to manage production deployment

set -e  # Exit on any error

echo "🚀 System Checklist Tool - Production Manager"
echo "==============================================="

# Configuration
# Script hiện ở trong thư mục scripts, cần lên 1 cấp để về project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd .. && pwd)"
SERVICE_NAME="system-checklist"
NGINX_SITE="system-checklist"
BACKEND_PORT="5000"
FRONTEND_PORT="80"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo -e "${PURPLE}\n=== $1 ===${NC}"
}

print_step() {
    echo -e "${BLUE}🔍 $1${NC}"
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

print_info() {
    echo -e "${CYAN}ℹ️  $1${NC}"
}

check_root() {
    if [[ $EUID -eq 0 ]]; then
        print_warning "Running as root. Some operations may require non-root user."
    fi
}

check_dependencies() {
    print_step "Checking dependencies..."
    
    local deps=("python3" "pip3" "node" "npm" "curl" "systemctl")
    local missing_deps=()
    
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            missing_deps+=("$dep")
        fi
    done
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        print_error "Missing dependencies: ${missing_deps[*]}"
        print_info "Please install missing dependencies and try again."
        exit 1
    else
        print_success "All dependencies are available"
    fi
}

show_status() {
    print_header "System Status"
    
    # Backend service status
    print_step "Backend Service Status:"
    if systemctl is-active --quiet "$SERVICE_NAME.service" 2>/dev/null; then
        print_success "Backend service is running"
        local status=$(systemctl show -p ActiveState,SubState "$SERVICE_NAME.service" --value)
        echo "   Status: $status"
    else
        print_warning "Backend service is not running"
    fi
    
    # Nginx status
    print_step "Nginx Status:"
    if systemctl is-active --quiet nginx 2>/dev/null; then
        print_success "Nginx is running"
    else
        print_warning "Nginx is not running"
    fi
    
    # Database status
    print_step "Database Status:"
    if systemctl is-active --quiet postgresql 2>/dev/null; then
        print_success "PostgreSQL is running"
    else
        print_warning "PostgreSQL is not running"
    fi
    
    # Port status
    print_step "Port Status:"
    if netstat -tuln 2>/dev/null | grep -q ":$BACKEND_PORT "; then
        print_success "Backend port $BACKEND_PORT is in use"
    else
        print_warning "Backend port $BACKEND_PORT is not in use"
    fi
    
    if netstat -tuln 2>/dev/null | grep -q ":$FRONTEND_PORT "; then
        print_success "Frontend port $FRONTEND_PORT is in use"
    else
        print_warning "Frontend port $FRONTEND_PORT is not in use"
    fi
    
    # Disk space
    print_step "Disk Space:"
    local disk_usage=$(df -h "$PROJECT_ROOT" | awk 'NR==2 {print $5}' | sed 's/%//')
    if [[ $disk_usage -lt 80 ]]; then
        print_success "Disk usage: ${disk_usage}% (Good)"
    elif [[ $disk_usage -lt 90 ]]; then
        print_warning "Disk usage: ${disk_usage}% (Monitor)"
    else
        print_error "Disk usage: ${disk_usage}% (Critical)"
    fi
    
    # Memory usage
    print_step "Memory Usage:"
    local mem_usage=$(free | awk 'NR==2{printf "%.1f", $3*100/$2 }')
    echo "   Memory usage: ${mem_usage}%"
}

deploy_full() {
    print_header "Full Production Deployment"
    
    print_step "Starting full deployment..."
    
    # Run deployment script
    if [[ -x "$PROJECT_ROOT/deploy_production.sh" ]]; then
        print_info "Running deployment script..."
        "$PROJECT_ROOT/deploy_production.sh"
    else
        print_error "Deployment script not found or not executable"
        exit 1
    fi
    
    print_success "Full deployment completed"
}

start_services() {
    print_header "Starting Services"
    
    # Start PostgreSQL
    print_step "Starting PostgreSQL..."
    if sudo systemctl start postgresql; then
        print_success "PostgreSQL started"
    else
        print_error "Failed to start PostgreSQL"
    fi
    
    # Start backend service
    print_step "Starting backend service..."
    if sudo systemctl start "$SERVICE_NAME.service"; then
        print_success "Backend service started"
    else
        print_error "Failed to start backend service"
    fi
    
    # Start Nginx
    print_step "Starting Nginx..."
    if sudo systemctl start nginx; then
        print_success "Nginx started"
    else
        print_error "Failed to start Nginx"
    fi
    
    # Wait for services to be ready
    print_step "Waiting for services to be ready..."
    sleep 5
    
    # Test services
    test_services
}

stop_services() {
    print_header "Stopping Services"
    
    # Stop Nginx
    print_step "Stopping Nginx..."
    if sudo systemctl stop nginx; then
        print_success "Nginx stopped"
    else
        print_warning "Failed to stop Nginx (may not be running)"
    fi
    
    # Stop backend service
    print_step "Stopping backend service..."
    if sudo systemctl stop "$SERVICE_NAME.service"; then
        print_success "Backend service stopped"
    else
        print_warning "Failed to stop backend service (may not be running)"
    fi
    
    print_success "Services stopped"
}

restart_services() {
    print_header "Restarting Services"
    
    stop_services
    sleep 2
    start_services
}

test_services() {
    print_header "Testing Services"
    
    if [[ -x "$PROJECT_ROOT/test_production.sh" ]]; then
        "$PROJECT_ROOT/test_production.sh"
    else
        print_error "Test script not found or not executable"
        
        # Basic manual tests
        print_step "Running basic tests..."
        
        # Test backend
        if curl -s -f "http://localhost:$BACKEND_PORT/api/health" > /dev/null; then
            print_success "Backend is responding"
        else
            print_error "Backend is not responding"
        fi
        
        # Test frontend
        if curl -s -f "http://localhost:$FRONTEND_PORT" > /dev/null; then
            print_success "Frontend is responding"
        else
            print_error "Frontend is not responding"
        fi
    fi
}

view_logs() {
    print_header "Service Logs"
    
    local log_type="${1:-all}"
    
    case "$log_type" in
        "backend")
            print_step "Backend Service Logs (last 50 lines):"
            sudo journalctl -u "$SERVICE_NAME.service" -n 50 --no-pager
            
            if [[ -f "$PROJECT_ROOT/logs/gunicorn_error.log" ]]; then
                echo ""
                print_step "Gunicorn Error Logs (last 20 lines):"
                tail -n 20 "$PROJECT_ROOT/logs/gunicorn_error.log"
            fi
            ;;
        "nginx")
            print_step "Nginx Error Logs (last 50 lines):"
            sudo tail -n 50 /var/log/nginx/error.log
            
            print_step "Nginx Access Logs (last 20 lines):"
            sudo tail -n 20 /var/log/nginx/access.log
            ;;
        "database")
            print_step "PostgreSQL Logs (last 50 lines):"
            sudo journalctl -u postgresql -n 50 --no-pager
            ;;
        "all")
            view_logs "backend"
            echo ""
            view_logs "nginx"
            echo ""
            view_logs "database"
            ;;
        *)
            print_error "Unknown log type: $log_type"
            print_info "Available log types: backend, nginx, database, all"
            ;;
    esac
}

backup_system() {
    print_header "System Backup"
    
    if [[ -x "$PROJECT_ROOT/manage_database.sh" ]]; then
        print_step "Running database backup..."
        "$PROJECT_ROOT/manage_database.sh" backup
    else
        print_error "Database management script not found"
    fi
    
    # Backup configuration files
    print_step "Backing up configuration files..."
    local backup_dir="$PROJECT_ROOT/backups/config_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"
    
    # Copy important config files
    local config_files=(
        "/etc/systemd/system/$SERVICE_NAME.service"
        "/etc/nginx/sites-available/$NGINX_SITE"
        "$PROJECT_ROOT/.env.production"
        "$PROJECT_ROOT/gunicorn.conf.py"
    )
    
    for config_file in "${config_files[@]}"; do
        if [[ -f "$config_file" ]]; then
            cp "$config_file" "$backup_dir/" 2>/dev/null || true
            print_success "Backed up $(basename "$config_file")"
        fi
    done
    
    print_success "Configuration backup completed: $backup_dir"
}

update_system() {
    print_header "System Update"
    
    # Stop services
    print_step "Stopping services for update..."
    stop_services
    
    # Update code (if git repository)
    if [[ -d "$PROJECT_ROOT/.git" ]]; then
        print_step "Updating code from git..."
        cd "$PROJECT_ROOT"
        git pull
    else
        print_info "Not a git repository, skipping code update"
    fi
    
    # Update backend dependencies
    print_step "Updating backend dependencies..."
    cd "$PROJECT_ROOT/backend"
    if [[ -f "venv/bin/activate" ]]; then
        source venv/bin/activate
        pip install -r requirements.txt --upgrade
        deactivate
    else
        print_warning "Virtual environment not found, installing globally"
        pip3 install -r requirements.txt --upgrade
    fi
    
    # Update frontend dependencies
    print_step "Updating frontend dependencies..."
    cd "$PROJECT_ROOT/frontend"
    npm update
    
    # Rebuild frontend
    print_step "Rebuilding frontend..."
    npm run build
    
    # Database migrations (if needed)
    print_step "Running database migrations..."
    cd "$PROJECT_ROOT/backend"
    if [[ -f "venv/bin/activate" ]]; then
        source venv/bin/activate
        python manage.py db upgrade 2>/dev/null || true
        deactivate
    fi
    
    # Restart services
    print_step "Restarting services..."
    start_services
    
    print_success "System update completed"
}

show_help() {
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  status      Show system status"
    echo "  deploy      Run full production deployment"
    echo "  start       Start all services"
    echo "  stop        Stop all services"
    echo "  restart     Restart all services"
    echo "  test        Test all services"
    echo "  logs [type] View logs (backend|nginx|database|all)"
    echo "  backup      Backup system and database"
    echo "  update      Update system (code, dependencies, restart)"
    echo "  help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 status                    # Show current status"
    echo "  $0 deploy                    # Full deployment"
    echo "  $0 restart                   # Restart all services"
    echo "  $0 logs backend              # View backend logs"
    echo "  $0 test                      # Run production tests"
    echo ""
}

# Main function
main() {
    local command="${1:-help}"
    
    # Check dependencies for most commands
    if [[ "$command" != "help" ]]; then
        check_dependencies
        check_root
    fi
    
    case "$command" in
        "status")
            show_status
            ;;
        "deploy")
            deploy_full
            ;;
        "start")
            start_services
            ;;
        "stop")
            stop_services
            ;;
        "restart")
            restart_services
            ;;
        "test")
            test_services
            ;;
        "logs")
            view_logs "$2"
            ;;
        "backup")
            backup_system
            ;;
        "update")
            update_system
            ;;
        "help")
            show_help
            ;;
        *)
            print_error "Unknown command: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# Run main function
main "$@"