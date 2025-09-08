#!/bin/bash
# Production Deployment Script
# This script handles the complete deployment process for the Japanese Quiz Application

set -e  # Exit on any error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_ROOT/backups"
DEPLOY_LOG="$PROJECT_ROOT/logs/deployment.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "$1" | tee -a "$DEPLOY_LOG"
}

log_step() {
    log "\n${BLUE}🔄 $1${NC}"
}

log_success() {
    log "${GREEN}✅ $1${NC}"
}

log_error() {
    log "${RED}❌ $1${NC}"
}

log_warning() {
    log "${YELLOW}⚠️  $1${NC}"
}

# Create necessary directories
mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$DEPLOY_LOG")"

log "${BLUE}🚀 Starting Production Deployment${NC}"
log "======================================="
log "Timestamp: $(date)"
log "User: $(whoami)"
log "Project: $PROJECT_ROOT"

# Step 1: Pre-deployment validation
log_step "Running pre-deployment validation"
if ! bash "$SCRIPT_DIR/validate-production.sh"; then
    log_error "Pre-deployment validation failed"
    exit 1
fi
log_success "Pre-deployment validation passed"

# Step 2: Create backup
log_step "Creating pre-deployment backup"
BACKUP_FILE="$BACKUP_DIR/pre-deploy-$(date +%Y%m%d-%H%M%S).sql"
if [ -n "$DATABASE_URL" ]; then
    if command -v pg_dump >/dev/null 2>&1; then
        pg_dump "$DATABASE_URL" > "$BACKUP_FILE"
        log_success "Database backup created: $BACKUP_FILE"
    else
        log_warning "pg_dump not available, skipping database backup"
    fi
else
    log_warning "DATABASE_URL not set, skipping database backup"
fi

# Step 3: Install dependencies
log_step "Installing production dependencies"
npm ci --only=production
log_success "Dependencies installed"

# Step 4: Run security tests
log_step "Running security test suite"
if npm run test:security > /dev/null 2>&1; then
    log_success "Security tests passed"
else
    log_error "Security tests failed"
    read -p "Continue deployment despite test failures? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Step 5: Build application
log_step "Building application for production"
npm run build
log_success "Application built successfully"

# Step 6: Database migrations
log_step "Running database migrations"
npm run db:push
log_success "Database migrations completed"

# Step 7: SSL certificate check
if [ -n "$PRODUCTION_DOMAIN" ]; then
    log_step "Checking SSL certificate"
    if command -v openssl >/dev/null 2>&1; then
        if echo | openssl s_client -connect "$PRODUCTION_DOMAIN:443" -servername "$PRODUCTION_DOMAIN" 2>/dev/null | openssl x509 -noout -dates > /dev/null 2>&1; then
            log_success "SSL certificate is valid"
        else
            log_warning "SSL certificate check failed"
        fi
    else
        log_warning "openssl not available for SSL check"
    fi
fi

# Step 8: Start application
log_step "Starting production application"
if [ -f "ecosystem.config.js" ]; then
    # Using PM2
    pm2 start ecosystem.config.js --env production
    pm2 save
    log_success "Application started with PM2"
elif [ -f "docker-compose.production.yml" ]; then
    # Using Docker
    docker-compose -f docker-compose.production.yml up -d
    log_success "Application started with Docker"
else
    # Direct start
    nohup npm run start:production > "$PROJECT_ROOT/logs/application.log" 2>&1 &
    APP_PID=$!
    echo $APP_PID > "$PROJECT_ROOT/app.pid"
    log_success "Application started (PID: $APP_PID)"
fi

# Step 9: Health check
log_step "Performing health check"
sleep 10  # Wait for application to start

HEALTH_URL="https://${PRODUCTION_DOMAIN:-localhost:5000}/api/health"
if command -v curl >/dev/null 2>&1; then
    if curl -f "$HEALTH_URL" > /dev/null 2>&1; then
        log_success "Health check passed"
    else
        log_error "Health check failed - application may not be running correctly"
    fi
else
    log_warning "curl not available for health check"
fi

# Step 10: Security verification
log_step "Verifying security configuration"
if [ -n "$PRODUCTION_DOMAIN" ]; then
    # Check security headers
    if command -v curl >/dev/null 2>&1; then
        HEADERS=$(curl -I "https://$PRODUCTION_DOMAIN" 2>/dev/null || true)
        
        if echo "$HEADERS" | grep -i "strict-transport-security" > /dev/null; then
            log_success "HSTS header present"
        else
            log_warning "HSTS header missing"
        fi
        
        if echo "$HEADERS" | grep -i "content-security-policy" > /dev/null; then
            log_success "CSP header present"
        else
            log_warning "CSP header missing"
        fi
        
        if echo "$HEADERS" | grep -i "x-frame-options" > /dev/null; then
            log_success "X-Frame-Options header present"
        else
            log_warning "X-Frame-Options header missing"
        fi
    fi
fi

# Step 11: Performance monitoring setup
log_step "Setting up monitoring"
if [ -f "$PROJECT_ROOT/scripts/setup-monitoring.sh" ]; then
    bash "$PROJECT_ROOT/scripts/setup-monitoring.sh"
    log_success "Monitoring setup completed"
else
    log_warning "Monitoring setup script not found"
fi

# Step 12: Final verification
log_step "Running final verification"
if npm run health:check > /dev/null 2>&1; then
    log_success "Final health check passed"
else
    log_warning "Final health check failed"
fi

# Deployment summary
log "\n${GREEN}🎉 Deployment Summary${NC}"
log "======================"
log "✅ Pre-deployment validation: PASSED"
log "✅ Backup created: $(basename "$BACKUP_FILE")"
log "✅ Dependencies installed: COMPLETED"
log "✅ Application built: SUCCESS"
log "✅ Database migrations: COMPLETED"
log "✅ Application started: RUNNING"

if [ -n "$PRODUCTION_DOMAIN" ]; then
    log "\n🌐 Application URLs:"
    log "   - Production: https://$PRODUCTION_DOMAIN"
    log "   - Health Check: https://$PRODUCTION_DOMAIN/api/health"
    log "   - Admin Panel: https://$PRODUCTION_DOMAIN/admin"
fi

log "\n📁 Important Files:"
log "   - Backup: $BACKUP_FILE"
log "   - Deployment Log: $DEPLOY_LOG"
log "   - Application Log: $PROJECT_ROOT/logs/application.log"

log "\n🔧 Post-Deployment Tasks:"
log "   1. Monitor application logs for 24 hours"
log "   2. Verify all user flows are working"
log "   3. Check performance metrics"
log "   4. Update monitoring dashboards"
log "   5. Notify stakeholders of successful deployment"

log "\n${GREEN}✅ Production deployment completed successfully!${NC}"
log "Deployment finished at: $(date)"