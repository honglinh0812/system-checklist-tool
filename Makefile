# Makefile for System Checklist Tool Docker Management

.PHONY: help build up down restart logs clean dev prod

# Default target
help:
	@echo "Available commands:"
	@echo "  build     - Build all Docker images"
	@echo "  up        - Start all services"
	@echo "  down      - Stop all services"
	@echo "  restart   - Restart all services"
	@echo "  logs      - Show logs for all services"
	@echo "  logs-backend - Show backend logs"
	@echo "  logs-frontend - Show frontend logs"
	@echo "  logs-db    - Show database logs"
	@echo "  clean     - Remove all containers, volumes, and images"
	@echo "  dev       - Start development environment"
	@echo "  prod      - Start production environment"
	@echo "  shell-backend - Open shell in backend container"
	@echo "  shell-frontend - Open shell in frontend container"
	@echo "  db-shell  - Open PostgreSQL shell"

# Build all images
build:
	docker-compose -f docker/docker-compose.yml build

# Start all services
up:
	docker-compose -f docker/docker-compose.yml up -d

# Stop all services
down:
	docker-compose -f docker/docker-compose.yml down

# Restart all services
restart: down up

# Show logs
logs:
	docker-compose -f docker/docker-compose.yml logs -f

logs-backend:
	docker-compose -f docker/docker-compose.yml logs -f backend

logs-frontend:
	docker-compose -f docker/docker-compose.yml logs -f frontend

logs-db:
	docker-compose -f docker/docker-compose.yml logs -f database

# Clean up everything
clean:
	docker-compose -f docker/docker-compose.yml down -v --rmi all
	docker system prune -f

# Development environment
dev:
	FLASK_ENV=development docker-compose -f docker/docker-compose.yml up -d

# Production environment
prod:
	FLASK_ENV=production docker-compose -f docker/docker-compose.yml --profile production up -d

# Shell access
shell-backend:
	docker-compose -f docker/docker-compose.yml exec backend /bin/bash

shell-frontend:
	docker-compose -f docker/docker-compose.yml exec frontend /bin/sh

db-shell:
	docker-compose -f docker/docker-compose.yml exec database psql -U postgres -d system_checklist

# Database operations
db-migrate:
	docker-compose -f docker/docker-compose.yml exec backend flask db upgrade

db-reset:
	docker-compose -f docker/docker-compose.yml exec backend flask db downgrade base
	docker-compose -f docker/docker-compose.yml exec backend flask db upgrade

# Health checks
health:
	@echo "Checking service health..."
	@docker-compose -f docker/docker-compose.yml ps

# Quick start (build and run)
start: build up
	@echo "System Checklist Tool is starting up..."
	@echo "Frontend: http://localhost"
	@echo "Backend API: http://localhost:5000"
	@echo "Database: localhost:5432"
