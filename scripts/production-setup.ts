#!/usr/bin/env ts-node
/**
 * Production Setup Script
 * 
 * This script helps set up the production environment by:
 * - Validating environment variables
 * - Generating secure secrets
 * - Checking system readiness
 * - Creating necessary directories
 */

import { generateSecureSecrets, validateProductionReadiness } from '../config/production';
import * as fs from 'fs';
import * as path from 'path';

interface SetupOptions {
  force?: boolean;
  generateSecrets?: boolean;
  validateOnly?: boolean;
}

/**
 * Main setup function
 */
async function setupProduction(options: SetupOptions = {}) {
  console.log('🚀 Production Environment Setup');
  console.log('==============================\n');

  try {
    // 1. Validate current configuration
    console.log('1. Validating production configuration...');
    const validation = validateProductionReadiness();
    
    if (!validation.valid) {
      console.log('❌ Production validation failed:');
      validation.issues.forEach(issue => {
        console.log(`   - ${issue}`);
      });
      
      if (!options.force) {
        console.log('\n⚠️  Use --force to continue despite validation errors');
        process.exit(1);
      }
    } else {
      console.log('✅ Production configuration is valid');
    }

    if (options.validateOnly) {
      console.log('\n✅ Validation complete - no changes made');
      return;
    }

    // 2. Generate secure secrets if requested
    if (options.generateSecrets) {
      console.log('\n2. Generating secure secrets...');
      const secrets = generateSecureSecrets();
      
      console.log('🔐 Generated secure secrets:');
      console.log(`JWT_SECRET=${secrets.jwtSecret}`);
      console.log(`SESSION_SECRET=${secrets.sessionSecret}`);
      console.log('\n⚠️  IMPORTANT: Copy these secrets to your .env.production file');
      console.log('⚠️  NEVER commit these secrets to version control');
    }

    // 3. Create necessary directories
    console.log('\n3. Creating necessary directories...');
    const directories = [
      'logs',
      'logs/security',
      'logs/audit',
      'uploads',
      'tmp',
      'backups'
    ];

    directories.forEach(dir => {
      const dirPath = path.join(process.cwd(), dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`   ✅ Created directory: ${dir}`);
      } else {
        console.log(`   ⏩ Directory exists: ${dir}`);
      }
    });

    // 4. Set proper file permissions for sensitive files
    console.log('\n4. Setting file permissions...');
    const sensitiveFiles = [
      '.env.production',
      'logs',
      'uploads'
    ];

    sensitiveFiles.forEach(file => {
      const filePath = path.join(process.cwd(), file);
      if (fs.existsSync(filePath)) {
        try {
          fs.chmodSync(filePath, 0o600); // Owner read/write only
          console.log(`   ✅ Set permissions for: ${file}`);
        } catch (error) {
          console.log(`   ⚠️  Could not set permissions for: ${file}`);
        }
      }
    });

    // 5. Generate deployment checklist
    console.log('\n5. Generating deployment checklist...');
    await generateDeploymentChecklist();

    console.log('\n🎉 Production setup complete!');
    console.log('\nNext steps:');
    console.log('1. Review and update .env.production with your actual values');
    console.log('2. Run the deployment checklist (deployment-checklist.md)');
    console.log('3. Test your application in staging environment');
    console.log('4. Deploy to production');

  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

/**
 * Generate deployment checklist
 */
async function generateDeploymentChecklist() {
  const checklist = `# Production Deployment Checklist

## Pre-Deployment Security Checklist

### Environment Configuration
- [ ] **Environment Variables**: All required environment variables are set in production
- [ ] **Secrets**: JWT_SECRET and SESSION_SECRET are strong, unique, and different from staging
- [ ] **Database**: DATABASE_URL includes \`sslmode=require\` for SSL connection
- [ ] **HTTPS**: FORCE_HTTPS is set to true
- [ ] **API Keys**: All API keys are production-ready (not test/staging keys)

### Security Configuration
- [ ] **Rate Limiting**: Production rate limits are configured and tested
- [ ] **CSRF Protection**: CSRF protection is enabled
- [ ] **Security Headers**: All security headers are properly configured
- [ ] **File Uploads**: File upload restrictions are in place and tested
- [ ] **Content Security Policy**: CSP is configured for production (no unsafe-inline/unsafe-eval)

### Database Security
- [ ] **SSL Connection**: Database connection uses SSL/TLS
- [ ] **User Permissions**: Database user has minimal required permissions
- [ ] **Backup Strategy**: Database backup strategy is implemented and tested
- [ ] **Schema Validation**: Database schema matches application requirements

### Application Security
- [ ] **Error Handling**: Production error handling hides sensitive information
- [ ] **Debug Features**: All debug features are disabled in production
- [ ] **Source Maps**: Source maps are disabled in production builds
- [ ] **Logging**: Security logging is enabled and configured

### Infrastructure Security
- [ ] **Firewall**: Only necessary ports (80, 443) are open
- [ ] **SSL Certificate**: Valid SSL certificate is installed and configured
- [ ] **HSTS**: HTTP Strict Transport Security is enabled
- [ ] **Server Hardening**: Server is hardened according to security best practices

## Deployment Steps

### 1. Final Testing
- [ ] Run all security tests: \`npm run test:security\`
- [ ] Validate production configuration: \`npm run validate:production\`
- [ ] Test file uploads with various file types
- [ ] Test rate limiting with high request volumes
- [ ] Verify error handling doesn't expose sensitive data

### 2. Build and Deploy
- [ ] Build application for production: \`npm run build\`
- [ ] Deploy application to production server
- [ ] Set environment variables in production environment
- [ ] Run database migrations: \`npm run db:push\`

### 3. Post-Deployment Verification
- [ ] **Health Check**: Application starts without errors
- [ ] **Database Connection**: Database connectivity is working
- [ ] **HTTPS**: All HTTP requests redirect to HTTPS
- [ ] **Security Headers**: Verify security headers are present
- [ ] **API Endpoints**: Test critical API endpoints
- [ ] **File Uploads**: Test file upload functionality
- [ ] **Authentication**: Test login/logout functionality

### 4. Monitoring Setup
- [ ] **Error Monitoring**: Error reporting is working
- [ ] **Performance Monitoring**: Performance metrics are being collected
- [ ] **Security Monitoring**: Security events are being logged
- [ ] **Uptime Monitoring**: Uptime monitoring is configured

## Post-Deployment Security Tasks

### Immediate (Day 1)
- [ ] Monitor application logs for errors or security events
- [ ] Verify SSL certificate is working correctly
- [ ] Test all critical user flows
- [ ] Check security headers using online tools

### Weekly
- [ ] Review security logs for anomalies
- [ ] Check for dependency updates with security patches
- [ ] Monitor rate limiting effectiveness
- [ ] Review error logs for potential security issues

### Monthly
- [ ] Update dependencies with security patches
- [ ] Review and rotate API keys if necessary
- [ ] Audit user permissions and access
- [ ] Test backup and recovery procedures

## Emergency Procedures

### Security Incident Response
1. **Immediate**: Isolate affected systems
2. **Assessment**: Determine scope and impact
3. **Containment**: Stop the attack/breach
4. **Eradication**: Remove threats and vulnerabilities
5. **Recovery**: Restore systems and verify security
6. **Lessons Learned**: Document and improve processes

### Contact Information
- **Security Team**: [Your security team contact]
- **Infrastructure Team**: [Your infrastructure team contact]
- **Emergency Hotline**: [Emergency contact number]

---

**Generated on**: ${new Date().toISOString()}
**Environment**: Production
**Application**: Japanese Quiz Application
`;

  fs.writeFileSync('deployment-checklist.md', checklist);
  console.log('   ✅ Generated: deployment-checklist.md');
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: SetupOptions = {
    force: args.includes('--force'),
    generateSecrets: args.includes('--generate-secrets'),
    validateOnly: args.includes('--validate-only')
  };

  setupProduction(options).catch(error => {
    console.error('Setup failed:', error);
    process.exit(1);
  });
}

export { setupProduction };