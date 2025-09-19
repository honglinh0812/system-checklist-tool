# Docker Setup for System Checklist Tool

This document provides instructions for running the System Checklist Tool using Docker containers.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- Make (optional, for using Makefile commands)

## Quick Start

1. **Clone and navigate to the project:**
   ```bash
   cd system-checklist-tool
   ```

2. **Copy environment file:**
   ```bash
   cp env.example .env
   ```

3. **Edit environment variables (optional):**
   ```bash
   nano .env
   ```

4. **Start the application:**
   ```bash
   make start
   # or manually:
   # docker-compose -f docker/docker-compose.yml up -d
   ```

5. **Access the application:**
   - Frontend: http://localhost
   - Backend API: http://localhost:5000
   - Database: localhost:5432

## Available Commands

### Using Makefile (recommended)
```bash
make help          # Show all available commands
make build         # Build all Docker images
make up            # Start all services
make down          # Stop all services
make restart       # Restart all services
make logs          # Show logs for all services
make clean         # Remove all containers, volumes, and images
make dev           # Start development environment
make prod          # Start production environment
```

### Using Docker Compose directly
```bash
# Build images
docker-compose -f docker/docker-compose.yml build

# Start services
docker-compose -f docker/docker-compose.yml up -d

# Stop services
docker-compose -f docker/docker-compose.yml down

# View logs
docker-compose -f docker/docker-compose.yml logs -f

# Restart services
docker-compose -f docker/docker-compose.yml restart
```

## Services

### Backend (Flask API)
- **Port:** 5000
- **Image:** Built from `docker/backend/Dockerfile`
- **Dependencies:** PostgreSQL, Redis
- **Health Check:** http://localhost:5000/api/health

### Frontend (React + Nginx)
- **Port:** 80
- **Image:** Built from `docker/frontend/Dockerfile`
- **Dependencies:** Backend API
- **Health Check:** http://localhost:80/health

### Database (PostgreSQL)
- **Port:** 5432
- **Image:** postgres:15-alpine
- **Database:** system_checklist
- **User:** postgres
- **Password:** postgres (change in .env)

### Redis (Cache)
- **Port:** 6379
- **Image:** redis:7-alpine
- **Password:** redis (change in .env)

## Environment Variables

Key environment variables (see `env.example` for full list):

```bash
# Database
POSTGRES_DB=system_checklist
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# Redis
REDIS_PASSWORD=redis

# Flask
FLASK_ENV=production
SECRET_KEY=your-secret-key-change-in-production
JWT_SECRET_KEY=your-jwt-secret-key-change-in-production

# Application
UPLOAD_FOLDER=/app/uploads
MAX_CONTENT_LENGTH=16777216
LOG_LEVEL=INFO
```

## Development vs Production

### Development Mode
```bash
make dev
# or
FLASK_ENV=development docker-compose -f docker/docker-compose.yml up -d
```

### Production Mode
```bash
make prod
# or
FLASK_ENV=production docker-compose -f docker/docker-compose.yml --profile production up -d
```

## Database Management

### Run migrations
```bash
make db-migrate
# or
docker-compose -f docker/docker-compose.yml exec backend flask db upgrade
```

### Reset database
```bash
make db-reset
# or
docker-compose -f docker/docker-compose.yml exec backend flask db downgrade base
docker-compose -f docker/docker-compose.yml exec backend flask db upgrade
```

### Access database shell
```bash
make db-shell
# or
docker-compose -f docker/docker-compose.yml exec database psql -U postgres -d system_checklist
```

## Troubleshooting

### Check service health
```bash
make health
# or
docker-compose -f docker/docker-compose.yml ps
```

### View logs
```bash
make logs-backend    # Backend logs
make logs-frontend   # Frontend logs
make logs-db         # Database logs
```

### Clean everything and start fresh
```bash
make clean
make start
```

### Access container shells
```bash
make shell-backend   # Backend container
make shell-frontend  # Frontend container
```

## Volumes and Data Persistence

The following volumes are created for data persistence:

- `postgres_data`: Database data
- `redis_data`: Redis cache data
- `backend_uploads`: File uploads
- `backend_logs`: Application logs
- `backend_tmp`: Temporary files

## Security Considerations

1. **Change default passwords** in `.env` file
2. **Use strong secret keys** for Flask and JWT
3. **Enable SSL/TLS** in production
4. **Configure firewall** rules
5. **Regular security updates** of base images

## Performance Optimization

1. **Resource limits** can be added to services in docker-compose.yml
2. **Multi-stage builds** reduce image sizes
3. **Health checks** ensure service availability
4. **Volume optimization** for better I/O performance

## Monitoring

- **Health checks** are configured for all services
- **Logs** are available through Docker Compose
- **Resource usage** can be monitored with `docker stats`

## Backup and Recovery

### Backup database
```bash
docker-compose -f docker/docker-compose.yml exec database pg_dump -U postgres system_checklist > backup.sql
```

### Restore database
```bash
docker-compose -f docker/docker-compose.yml exec -T database psql -U postgres system_checklist < backup.sql
```

## Support

For issues related to Docker setup, check:
1. Service logs: `make logs`
2. Service health: `make health`
3. Container status: `docker ps`
4. Volume status: `docker volume ls`
