#!/bin/bash

# Production Testing Script for System Checklist Tool
# Tests production deployment health and functionality

set -e  # Exit on any error

echo "🧪 System Checklist Tool - Production Testing"
echo "================================================"

# Configuration
# Script hiện ở trong thư mục scripts, cần lên 1 cấp để về project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd .. && pwd)"
BACKEND_URL="http://localhost:5000"
FRONTEND_URL="http://localhost"
API_URL="$BACKEND_URL/api"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results
TEST_PASSED=0
TEST_FAILED=0
TEST_WARNINGS=0

# Functions
print_step() {
    echo -e "${BLUE}🔍 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
    ((TEST_PASSED++))
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    ((TEST_WARNINGS++))
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
    ((TEST_FAILED++))
}

test_backend_health() {
    print_step "Testing Backend Health..."
    
    # Test health endpoint
    if curl -s -f "$API_URL/health" > /dev/null 2>&1; then
        local health_response=$(curl -s "$API_URL/health")
        print_success "Backend health check passed"
        echo "   Response: $health_response"
    else
        print_error "Backend health check failed"
        return 1
    fi
    
    # Test response time
    local response_time=$(curl -o /dev/null -s -w "%{time_total}" "$API_URL/health")
    local response_ms=$(echo "$response_time * 1000" | bc -l | cut -d. -f1)
    
    if (( response_ms < 1000 )); then
        print_success "Backend response time: ${response_ms}ms (Good)"
    elif (( response_ms < 3000 )); then
        print_warning "Backend response time: ${response_ms}ms (Acceptable)"
    else
        print_error "Backend response time: ${response_ms}ms (Too slow)"
    fi
}

test_database_connection() {
    print_step "Testing Database Connection..."
    
    # Test database through API
    local db_test=$(curl -s "$API_URL/health" | grep -o '"database":"[^"]*"' | cut -d'"' -f4)
    
    if [[ "$db_test" == "connected" ]] || [[ "$db_test" == "healthy" ]]; then
        print_success "Database connection healthy"
    else
        print_error "Database connection issues detected"
    fi
}

test_api_endpoints() {
    print_step "Testing API Endpoints..."
    
    # Test endpoints that don't require authentication
    local endpoints=(
        "/health"
        "/api"
    )
    
    for endpoint in "${endpoints[@]}"; do
        local url="$BACKEND_URL$endpoint"
        local status_code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
        
        if [[ "$status_code" == "200" ]]; then
            print_success "Endpoint $endpoint: HTTP $status_code"
        elif [[ "$status_code" == "401" ]] || [[ "$status_code" == "403" ]]; then
            print_success "Endpoint $endpoint: HTTP $status_code (Auth required - OK)"
        else
            print_error "Endpoint $endpoint: HTTP $status_code"
        fi
    done
}

test_frontend_availability() {
    print_step "Testing Frontend Availability..."
    
    # Test if frontend is accessible
    if curl -s -f "$FRONTEND_URL" > /dev/null 2>&1; then
        print_success "Frontend is accessible"
        
        # Check if it's actually the React app
        local content=$(curl -s "$FRONTEND_URL")
        if echo "$content" | grep -q "System Checklist\|React App\|root"; then
            print_success "Frontend content looks correct"
        else
            print_warning "Frontend accessible but content may be incorrect"
        fi
    else
        print_error "Frontend is not accessible"
    fi
}

test_static_assets() {
    print_step "Testing Static Assets..."
    
    # Test common static files
    local static_files=(
        "/static/css"
        "/static/js"
        "/favicon.ico"
    )
    
    for file in "${static_files[@]}"; do
        local url="$FRONTEND_URL$file"
        local status_code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
        
        if [[ "$status_code" == "200" ]]; then
            print_success "Static asset $file: Available"
        elif [[ "$status_code" == "404" ]]; then
            print_warning "Static asset $file: Not found (may be normal)"
        else
            print_error "Static asset $file: HTTP $status_code"
        fi
    done
}

test_file_upload_limits() {
    print_step "Testing File Upload Limits..."
    
    # Test upload endpoint (without actually uploading)
    local upload_endpoints=(
        "/api/mops/upload"
        "/api/assessments/upload"
    )
    
    for endpoint in "${upload_endpoints[@]}"; do
        local url="$BACKEND_URL$endpoint"
        local status_code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
        
        if [[ "$status_code" == "401" ]] || [[ "$status_code" == "405" ]]; then
            print_success "Upload endpoint $endpoint: Protected (Good)"
        elif [[ "$status_code" == "413" ]]; then
            print_warning "Upload endpoint $endpoint: File too large (test with smaller file)"
        else
            print_warning "Upload endpoint $endpoint: HTTP $status_code"
        fi
    done
}

test_security_headers() {
    print_step "Testing Security Headers..."
    
    # Test security headers
    local headers=$(curl -s -I "$FRONTEND_URL")
    
    local security_headers=(
        "X-Frame-Options"
        "X-XSS-Protection"
        "X-Content-Type-Options"
    )
    
    for header in "${security_headers[@]}"; do
        if echo "$headers" | grep -qi "$header"; then
            print_success "Security header $header: Present"
        else
            print_warning "Security header $header: Missing"
        fi
    done
}

test_ssl_redirect() {
    print_step "Testing SSL/HTTPS Configuration..."
    
    # Test HTTPS redirect (if configured)
    local https_status=$(curl -s -o /dev/null -w "%{http_code}" "https://localhost" 2>/dev/null || echo "000")
    
    if [[ "$https_status" == "200" ]]; then
        print_success "HTTPS is configured and working"
    elif [[ "$https_status" == "301" ]] || [[ "$https_status" == "302" ]]; then
        print_success "HTTPS redirect is configured"
    else
        print_warning "HTTPS not configured (HTTP only)"
    fi
}

test_process_management() {
    print_step "Testing Process Management..."
    
    # Check if systemd service is running
    if systemctl is-active --quiet system-checklist.service 2>/dev/null; then
        print_success "Systemd service is running"
        
        # Check service status
        local service_status=$(systemctl is-enabled system-checklist.service 2>/dev/null || echo "disabled")
        if [[ "$service_status" == "enabled" ]]; then
            print_success "Systemd service is enabled (auto-start)"
        else
            print_warning "Systemd service not enabled for auto-start"
        fi
    else
        print_warning "Systemd service not found or not running"
        
        # Check if running manually
        if pgrep -f "gunicorn.*app:app" > /dev/null; then
            print_success "Backend running manually with Gunicorn"
        elif pgrep -f "python.*app.py" > /dev/null; then
            print_warning "Backend running manually with Python (not recommended for production)"
        else
            print_error "Backend process not found"
        fi
    fi
    
    # Check Nginx
    if systemctl is-active --quiet nginx 2>/dev/null; then
        print_success "Nginx is running"
    else
        print_warning "Nginx not running or not installed"
    fi
}

test_log_files() {
    print_step "Testing Log Files..."
    
    local log_files=(
        "$PROJECT_ROOT/logs/gunicorn_access.log"
        "$PROJECT_ROOT/logs/gunicorn_error.log"
    )
    
    for log_file in "${log_files[@]}"; do
        if [[ -f "$log_file" ]]; then
            local log_size=$(stat -c%s "$log_file")
            if [[ $log_size -gt 0 ]]; then
                print_success "Log file $(basename "$log_file"): Present and active"
            else
                print_warning "Log file $(basename "$log_file"): Present but empty"
            fi
        else
            print_warning "Log file $(basename "$log_file"): Not found"
        fi
    done
}

test_backup_system() {
    print_step "Testing Backup System..."
    
    # Check if backup directory exists
    if [[ -d "$PROJECT_ROOT/backups" ]]; then
        local backup_count=$(find "$PROJECT_ROOT/backups" -name "*.sql.gz" | wc -l)
        if [[ $backup_count -gt 0 ]]; then
            print_success "Backup system: $backup_count backup(s) found"
        else
            print_warning "Backup directory exists but no backups found"
        fi
    else
        print_warning "Backup directory not found"
    fi
    
    # Test backup script
    if [[ -x "$PROJECT_ROOT/manage_database.sh" ]]; then
        print_success "Database management script is executable"
    else
        print_warning "Database management script not found or not executable"
    fi
}

run_performance_test() {
    print_step "Running Basic Performance Test..."
    
    # Simple load test
    local start_time=$(date +%s.%N)
    
    for i in {1..10}; do
        curl -s "$API_URL/health" > /dev/null
    done
    
    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc -l)
    local avg_time=$(echo "scale=3; $duration / 10" | bc -l)
    
    if (( $(echo "$avg_time < 0.5" | bc -l) )); then
        print_success "Performance test: Average ${avg_time}s per request (Excellent)"
    elif (( $(echo "$avg_time < 1.0" | bc -l) )); then
        print_success "Performance test: Average ${avg_time}s per request (Good)"
    else
        print_warning "Performance test: Average ${avg_time}s per request (Consider optimization)"
    fi
}

show_summary() {
    echo ""
    echo "================================================"
    echo "📊 Production Test Summary"
    echo "================================================"
    echo -e "${GREEN}✅ Tests Passed: $TEST_PASSED${NC}"
    echo -e "${YELLOW}⚠️  Warnings: $TEST_WARNINGS${NC}"
    echo -e "${RED}❌ Tests Failed: $TEST_FAILED${NC}"
    echo ""
    
    if [[ $TEST_FAILED -eq 0 ]]; then
        if [[ $TEST_WARNINGS -eq 0 ]]; then
            echo -e "${GREEN}🎉 All tests passed! Production deployment is healthy.${NC}"
        else
            echo -e "${YELLOW}⚠️  Production deployment is functional but has some warnings.${NC}"
        fi
    else
        echo -e "${RED}❌ Production deployment has issues that need attention.${NC}"
    fi
    
    echo ""
    echo "🔧 Quick Commands:"
    echo "   sudo systemctl status system-checklist.service  # Check backend service"
    echo "   sudo systemctl status nginx                     # Check nginx"
    echo "   tail -f logs/gunicorn_error.log                 # Check backend logs"
    echo "   ./manage_database.sh status                     # Check database"
    echo "   ./test_production.sh                            # Run this test again"
}

# Main function
main() {
    # Check if we can run basic commands
    if ! command -v curl &> /dev/null; then
        print_error "curl is required but not installed"
        exit 1
    fi
    
    if ! command -v bc &> /dev/null; then
        print_warning "bc is recommended for performance calculations"
    fi
    
    # Run all tests
    test_backend_health
    test_database_connection
    test_api_endpoints
    test_frontend_availability
    test_static_assets
    test_file_upload_limits
    test_security_headers
    test_ssl_redirect
    test_process_management
    test_log_files
    test_backup_system
    run_performance_test
    
    # Show summary
    show_summary
    
    # Exit with appropriate code
    if [[ $TEST_FAILED -gt 0 ]]; then
        exit 1
    else
        exit 0
    fi
}

# Run main function
main "$@"