#!/bin/bash
# Production Validation Script
# This script performs comprehensive validation before production deployment

set -e  # Exit on any error

echo "🔍 Production Environment Validation"
echo "===================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Validation counters
PASSED=0
FAILED=0
WARNINGS=0

# Function to print status
print_status() {
    local status=$1
    local message=$2
    if [ "$status" = "PASS" ]; then
        echo -e "${GREEN}✅ PASS${NC}: $message"
        ((PASSED++))
    elif [ "$status" = "FAIL" ]; then
        echo -e "${RED}❌ FAIL${NC}: $message"
        ((FAILED++))
    elif [ "$status" = "WARN" ]; then
        echo -e "${YELLOW}⚠️  WARN${NC}: $message"
        ((WARNINGS++))
    fi
}

# Check Node.js version
echo -e "\n📦 Checking Node.js Environment"
echo "--------------------------------"
NODE_VERSION=$(node --version | cut -d'v' -f2)
REQUIRED_NODE="18.0.0"
if [ "$(printf '%s\n' "$REQUIRED_NODE" "$NODE_VERSION" | sort -V | head -n1)" = "$REQUIRED_NODE" ]; then
    print_status "PASS" "Node.js version $NODE_VERSION >= $REQUIRED_NODE"
else
    print_status "FAIL" "Node.js version $NODE_VERSION < $REQUIRED_NODE"
fi

# Check npm version
NPM_VERSION=$(npm --version)
REQUIRED_NPM="8.0.0"
if [ "$(printf '%s\n' "$REQUIRED_NPM" "$NPM_VERSION" | sort -V | head -n1)" = "$REQUIRED_NPM" ]; then
    print_status "PASS" "npm version $NPM_VERSION >= $REQUIRED_NPM"
else
    print_status "FAIL" "npm version $NPM_VERSION < $REQUIRED_NPM"
fi

# Check environment variables
echo -e "\n🔒 Checking Environment Variables"
echo "----------------------------------"

check_env() {
    local var_name=$1
    local is_required=${2:-true}
    local check_strength=${3:-false}
    
    if [ -n "${!var_name}" ]; then
        if [ "$check_strength" = true ]; then
            local var_value="${!var_name}"
            if [ ${#var_value} -ge 32 ]; then
                print_status "PASS" "$var_name is set and sufficiently strong"
            else
                print_status "FAIL" "$var_name is set but too weak (< 32 characters)"
            fi
        else
            print_status "PASS" "$var_name is set"
        fi
    else
        if [ "$is_required" = true ]; then
            print_status "FAIL" "$var_name is not set"
        else
            print_status "WARN" "$var_name is not set (optional)"
        fi
    fi
}

# Required environment variables
check_env "NODE_ENV"
check_env "DATABASE_URL"
check_env "JWT_SECRET" true true
check_env "SESSION_SECRET" true true
check_env "GEMINI_API_KEY"

# Optional but recommended
check_env "FORCE_HTTPS" false
check_env "HSTS_MAX_AGE" false

# Check NODE_ENV is production
if [ "$NODE_ENV" = "production" ]; then
    print_status "PASS" "NODE_ENV is set to production"
else
    print_status "FAIL" "NODE_ENV must be set to 'production'"
fi

# Check if secrets are different
if [ -n "$JWT_SECRET" ] && [ -n "$SESSION_SECRET" ]; then
    if [ "$JWT_SECRET" = "$SESSION_SECRET" ]; then
        print_status "FAIL" "JWT_SECRET and SESSION_SECRET must be different"
    else
        print_status "PASS" "JWT_SECRET and SESSION_SECRET are different"
    fi
fi

# Check database connection
echo -e "\n🗄️  Checking Database Connection"
echo "--------------------------------"
if command -v psql >/dev/null 2>&1; then
    if psql "$DATABASE_URL" -c "SELECT 1;" >/dev/null 2>&1; then
        print_status "PASS" "Database connection successful"
    else
        print_status "FAIL" "Cannot connect to database"
    fi
else
    print_status "WARN" "psql not available, skipping database connection test"
fi

# Check SSL in database URL
if [[ "$DATABASE_URL" == *"sslmode=require"* ]]; then
    print_status "PASS" "Database URL includes SSL requirement"
else
    print_status "FAIL" "Database URL should include sslmode=require"
fi

# Check dependencies
echo -e "\n📚 Checking Dependencies"
echo "-------------------------"
if npm audit --audit-level high >/dev/null 2>&1; then
    print_status "PASS" "No high/critical vulnerability in dependencies"
else
    print_status "FAIL" "High/critical vulnerabilities found in dependencies"
fi

# Check for development dependencies in production
DEV_DEPS=$(npm ls --depth=0 --prod=false 2>/dev/null | grep -E "(nodemon|ts-node|@types/)" | wc -l)
if [ "$DEV_DEPS" -eq 0 ]; then
    print_status "PASS" "No development dependencies in production"
else
    print_status "WARN" "Development dependencies found in production build"
fi

# Check file permissions
echo -e "\n🔐 Checking File Permissions"
echo "-----------------------------"
if [ -f ".env.production" ]; then
    PERMS=$(stat -c "%a" .env.production 2>/dev/null || stat -f "%A" .env.production 2>/dev/null)
    if [ "$PERMS" = "600" ] || [ "$PERMS" = "0600" ]; then
        print_status "PASS" ".env.production has secure permissions (600)"
    else
        print_status "FAIL" ".env.production permissions too open ($PERMS), should be 600"
    fi
else
    print_status "WARN" ".env.production file not found"
fi

# Check for sensitive files in git
echo -e "\n📁 Checking Git Security"
echo "-------------------------"
if git ls-files | grep -E "\.(env|key|pem|p12|pfx)$" >/dev/null 2>&1; then
    print_status "FAIL" "Sensitive files found in git repository"
else
    print_status "PASS" "No sensitive files in git repository"
fi

# Check if .gitignore includes production files
if [ -f ".gitignore" ]; then
    if grep -q "\.env\.production" .gitignore; then
        print_status "PASS" ".gitignore includes .env.production"
    else
        print_status "FAIL" ".gitignore should include .env.production"
    fi
else
    print_status "WARN" ".gitignore file not found"
fi

# Check SSL certificate (if domain is set)
if [ -n "$PRODUCTION_DOMAIN" ]; then
    echo -e "\n🔒 Checking SSL Certificate"
    echo "----------------------------"
    if command -v openssl >/dev/null 2>&1; then
        if echo | openssl s_client -connect "$PRODUCTION_DOMAIN:443" -servername "$PRODUCTION_DOMAIN" 2>/dev/null | openssl x509 -noout -dates >/dev/null 2>&1; then
            print_status "PASS" "SSL certificate is valid for $PRODUCTION_DOMAIN"
        else
            print_status "FAIL" "SSL certificate issue for $PRODUCTION_DOMAIN"
        fi
    else
        print_status "WARN" "openssl not available, skipping SSL check"
    fi
fi

# Run security tests
echo -e "\n🛡️  Running Security Tests"
echo "---------------------------"
if npm run test:security >/dev/null 2>&1; then
    print_status "PASS" "Security tests passed"
else
    print_status "FAIL" "Security tests failed"
fi

# Check application build
echo -e "\n🏗️  Checking Application Build"
echo "------------------------------"
if npm run build >/dev/null 2>&1; then
    print_status "PASS" "Application builds successfully"
else
    print_status "FAIL" "Application build failed"
fi

# Check for debug/development code
echo -e "\n🐛 Checking for Debug Code"
echo "---------------------------"
DEBUG_PATTERNS=("console.log" "debugger" "TODO" "FIXME" "XXX")
DEBUG_FOUND=false

for pattern in "${DEBUG_PATTERNS[@]}"; do
    if grep -r "$pattern" server/ client/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" >/dev/null 2>&1; then
        print_status "WARN" "Debug code found: $pattern"
        DEBUG_FOUND=true
    fi
done

if [ "$DEBUG_FOUND" = false ]; then
    print_status "PASS" "No debug code patterns found"
fi

# Check disk space
echo -e "\n💾 Checking System Resources"
echo "-----------------------------"
DISK_USAGE=$(df . | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -lt 80 ]; then
    print_status "PASS" "Disk usage is acceptable ($DISK_USAGE%)"
else
    print_status "WARN" "Disk usage is high ($DISK_USAGE%)"
fi

# Check memory
if command -v free >/dev/null 2>&1; then
    MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.0f", ($3/$2) * 100.0}')
    if [ "$MEMORY_USAGE" -lt 80 ]; then
        print_status "PASS" "Memory usage is acceptable ($MEMORY_USAGE%)"
    else
        print_status "WARN" "Memory usage is high ($MEMORY_USAGE%)"
    fi
fi

# Final summary
echo -e "\n📊 Validation Summary"
echo "===================="
echo -e "✅ Passed: $PASSED"
echo -e "❌ Failed: $FAILED"
echo -e "⚠️  Warnings: $WARNINGS"

if [ $FAILED -eq 0 ]; then
    echo -e "\n${GREEN}🎉 Production validation completed successfully!${NC}"
    echo "Your application is ready for production deployment."
    exit 0
else
    echo -e "\n${RED}❌ Production validation failed!${NC}"
    echo "Please fix the failed checks before deploying to production."
    exit 1
fi