-- Initialize database for System Checklist Tool
-- This script runs when the PostgreSQL container starts for the first time

-- Create database if it doesn't exist (this is handled by POSTGRES_DB env var)
-- CREATE DATABASE IF NOT EXISTS system_checklist;

-- Connect to the database
\c system_checklist;

-- Create extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Set timezone
SET timezone = 'UTC';

-- Create initial admin user (optional - can be done through the application)
-- This is just a placeholder, actual user creation should be done through the API

-- Grant necessary permissions
GRANT ALL PRIVILEGES ON DATABASE system_checklist TO postgres;

-- Create any initial tables or data if needed
-- Note: Flask-Migrate will handle table creation, so this is mainly for extensions and permissions
