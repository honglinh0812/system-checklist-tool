#!/bin/bash

# Database Management Script for System Checklist Tool
# Handles database setup, migration, backup, and restore for production

set -e  # Exit on any error

echo "🗄️  System Checklist Tool - Database Management"
echo "================================================"

# Configuration
# Script hiện ở trong thư mục scripts, cần lên 1 cấp để về project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd .. && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
BACKUP_DIR="$PROJECT_ROOT/backups"
DATE=$(date +"%Y%m%d_%H%M%S")

# Default database settings (can be overridden by .env.production)
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="system_checklist_prod"
DB_USER="postgres"
DB_PASSWORD="postgres"

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

load_env() {
    # Load environment variables from .env.production
    if [ -f "$PROJECT_ROOT/.env.production" ]; then
        print_step "Loading production environment variables..."
        export $(cat "$PROJECT_ROOT/.env.production" | grep -v '^#' | xargs)
        
        # Parse DATABASE_URL if provided
        if [ ! -z "$DATABASE_URL" ]; then
            # Extract components from DATABASE_URL
            # Format: postgresql://user:password@host:port/database
            DB_USER=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
            DB_PASSWORD=$(echo $DATABASE_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
            DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
            DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
            DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')
        fi
        
        print_success "Environment loaded"
    else
        print_warning "No .env.production file found, using defaults"
    fi
}

check_dependencies() {
    print_step "Checking dependencies..."
    
    # Check PostgreSQL client
    if ! command -v psql &> /dev/null; then
        print_error "PostgreSQL client (psql) is not installed"
        print_error "Install with: sudo apt-get install postgresql-client"
        exit 1
    fi
    
    # Check pg_dump
    if ! command -v pg_dump &> /dev/null; then
        print_error "pg_dump is not installed"
        exit 1
    fi
    
    # Check Python3
    if ! command -v python3 &> /dev/null; then
        print_error "Python3 is not installed"
        exit 1
    fi
    
    print_success "Dependencies check passed"
}

check_db_connection() {
    print_step "Testing database connection..."
    
    export PGPASSWORD="$DB_PASSWORD"
    
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "postgres" -c "\q" 2>/dev/null; then
        print_success "Database connection successful"
        return 0
    else
        print_error "Cannot connect to database"
        print_error "Host: $DB_HOST, Port: $DB_PORT, User: $DB_USER"
        return 1
    fi
}

create_database() {
    print_step "Creating production database..."
    
    export PGPASSWORD="$DB_PASSWORD"
    
    # Check if database exists
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
        print_warning "Database '$DB_NAME' already exists"
        read -p "Do you want to recreate it? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "postgres" -c "DROP DATABASE IF EXISTS $DB_NAME;"
            print_success "Existing database dropped"
        else
            print_step "Using existing database"
            return 0
        fi
    fi
    
    # Create database
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "postgres" -c "CREATE DATABASE $DB_NAME;"
    print_success "Database '$DB_NAME' created"
}

init_database() {
    print_step "Initializing database schema and data..."
    
    cd "$BACKEND_DIR"
    
    # Activate virtual environment if it exists
    if [ -d "venv" ]; then
        source venv/bin/activate
    fi
    
    # Set database URL for the script
    export DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"
    
    # Run database initialization
    if [ -f "init_data.py" ]; then
        python3 init_data.py
        print_success "Database initialized with schema and initial data"
    else
        print_error "init_data.py not found in backend directory"
        exit 1
    fi
    
    cd "$PROJECT_ROOT"
}

run_migrations() {
    print_step "Running database migrations..."
    
    cd "$BACKEND_DIR"
    
    # Activate virtual environment if it exists
    if [ -d "venv" ]; then
        source venv/bin/activate
    fi
    
    # Set database URL for migrations
    export DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"
    
    # Check if Alembic is available
    if [ -d "migrations" ] && command -v alembic &> /dev/null; then
        print_step "Running Alembic migrations..."
        alembic upgrade head
        print_success "Migrations completed"
    else
        print_warning "No migrations directory or Alembic not found"
        print_warning "Using init_data.py instead"
        init_database
    fi
    
    cd "$PROJECT_ROOT"
}

backup_database() {
    print_step "Creating database backup..."
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    
    export PGPASSWORD="$DB_PASSWORD"
    
    local backup_file="$BACKUP_DIR/system_checklist_backup_$DATE.sql"
    
    # Create backup
    pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" > "$backup_file"
    
    # Compress backup
    gzip "$backup_file"
    
    print_success "Database backup created: ${backup_file}.gz"
    
    # Keep only last 7 backups
    find "$BACKUP_DIR" -name "system_checklist_backup_*.sql.gz" -type f -mtime +7 -delete
    print_step "Old backups cleaned up (keeping last 7 days)"
}

restore_database() {
    local backup_file="$1"
    
    if [ -z "$backup_file" ]; then
        print_error "Please specify backup file to restore"
        echo "Usage: $0 restore <backup_file>"
        echo "Available backups:"
        ls -la "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "No backups found"
        exit 1
    fi
    
    if [ ! -f "$backup_file" ]; then
        print_error "Backup file not found: $backup_file"
        exit 1
    fi
    
    print_step "Restoring database from backup: $backup_file"
    
    export PGPASSWORD="$DB_PASSWORD"
    
    # Drop and recreate database
    print_warning "This will completely replace the current database!"
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_step "Restore cancelled"
        exit 0
    fi
    
    # Drop existing database
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "postgres" -c "DROP DATABASE IF EXISTS $DB_NAME;"
    
    # Create new database
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "postgres" -c "CREATE DATABASE $DB_NAME;"
    
    # Restore from backup
    if [[ "$backup_file" == *.gz ]]; then
        gunzip -c "$backup_file" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"
    else
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" < "$backup_file"
    fi
    
    print_success "Database restored successfully"
}

migrate_from_dev() {
    print_step "Migrating data from development database..."
    
    local dev_db_name="system_checklist"
    local temp_backup="/tmp/dev_migration_$DATE.sql"
    
    export PGPASSWORD="$DB_PASSWORD"
    
    # Backup development database
    print_step "Creating backup of development database..."
    pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$dev_db_name" > "$temp_backup"
    
    # Create production database if it doesn't exist
    if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
        create_database
    fi
    
    # Restore to production database
    print_step "Restoring to production database..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" < "$temp_backup"
    
    # Clean up
    rm "$temp_backup"
    
    print_success "Development data migrated to production database"
}

show_status() {
    print_step "Database Status"
    
    export PGPASSWORD="$DB_PASSWORD"
    
    echo "Database Configuration:"
    echo "  Host: $DB_HOST"
    echo "  Port: $DB_PORT"
    echo "  Database: $DB_NAME"
    echo "  User: $DB_USER"
    echo ""
    
    # Check connection
    if check_db_connection; then
        # Show database info
        echo "Database Information:"
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "\l+" | grep "$DB_NAME"
        
        echo ""
        echo "Tables:"
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "\dt"
        
        echo ""
        echo "Recent Backups:"
        ls -la "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -5 || echo "No backups found"
    fi
}

show_help() {
    echo "Database Management Script for System Checklist Tool"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  setup           - Create and initialize production database"
    echo "  migrate         - Run database migrations"
    echo "  backup          - Create database backup"
    echo "  restore <file>  - Restore database from backup file"
    echo "  migrate-dev     - Migrate data from development to production"
    echo "  status          - Show database status and information"
    echo "  help            - Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 setup                                    # Setup new production database"
    echo "  $0 backup                                   # Create backup"
    echo "  $0 restore backups/backup_20231201.sql.gz  # Restore from backup"
    echo "  $0 migrate-dev                             # Migrate from development"
    echo ""
    echo "Environment:"
    echo "  Configuration is loaded from .env.production"
    echo "  Override with environment variables if needed"
}

# Main function
main() {
    local command="$1"
    
    if [ -z "$command" ]; then
        show_help
        exit 1
    fi
    
    # Load environment and check dependencies for most commands
    if [[ "$command" != "help" ]]; then
        load_env
        check_dependencies
    fi
    
    case "$command" in
        "setup")
            check_db_connection
            create_database
            init_database
            print_success "Production database setup complete!"
            ;;
        "migrate")
            check_db_connection
            run_migrations
            ;;
        "backup")
            check_db_connection
            backup_database
            ;;
        "restore")
            restore_database "$2"
            ;;
        "migrate-dev")
            check_db_connection
            migrate_from_dev
            ;;
        "status")
            show_status
            ;;
        "help")
            show_help
            ;;
        *)
            print_error "Unknown command: $command"
            show_help
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"