// Node.js script to fix corrupted settings directly via Prisma
// Run this with: node fix-settings-node.mjs

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Default settings configuration with proper JSON values
const DEFAULT_SETTINGS = [
  // SITE SETTINGS
  { key: 'site.name', value: 'Pulse News', type: 'SITE', label: 'Site Name', description: 'The name of your news website', isPublic: true, isRequired: true },
  { key: 'site.description', value: 'Your trusted source for breaking news and in-depth analysis', type: 'SITE', label: 'Site Description', description: 'A brief description of your news website', isPublic: true, isRequired: false },
  { key: 'site.logo_url', value: '', type: 'SITE', label: 'Logo URL', description: 'URL to your site logo image', isPublic: true, isRequired: false },
  { key: 'site.favicon_url', value: '', type: 'SITE', label: 'Favicon URL', description: 'URL to your site favicon', isPublic: true, isRequired: false },
  { key: 'site.contact_email', value: '', type: 'SITE', label: 'Contact Email', description: 'Primary contact email for your site', isPublic: true, isRequired: false },
  { key: 'site.timezone', value: 'UTC', type: 'SITE', label: 'Timezone', description: 'Default timezone for the site', isPublic: true, isRequired: false },
  
  // EMAIL SETTINGS
  { key: 'email.smtp_host', value: '', type: 'EMAIL', label: 'SMTP Host', description: 'SMTP server hostname', isPublic: false, isRequired: false },
  { key: 'email.smtp_port', value: 587, type: 'EMAIL', label: 'SMTP Port', description: 'SMTP server port (usually 587 or 465)', isPublic: false, isRequired: false },
  { key: 'email.smtp_username', value: '', type: 'EMAIL', label: 'SMTP Username', description: 'Username for SMTP authentication', isPublic: false, isRequired: false },
  { key: 'email.smtp_password', value: '', type: 'EMAIL', label: 'SMTP Password', description: 'Password for SMTP authentication (encrypted)', isPublic: false, isRequired: false },
  { key: 'email.from_address', value: '', type: 'EMAIL', label: 'From Email Address', description: 'Default sender email address', isPublic: false, isRequired: false },
  { key: 'email.from_name', value: 'Pulse News', type: 'EMAIL', label: 'From Name', description: 'Default sender name', isPublic: false, isRequired: false },
  { key: 'email.notifications_enabled', value: true, type: 'EMAIL', label: 'Enable Email Notifications', description: 'Whether to send email notifications', isPublic: false, isRequired: false },
  
  // SEO SETTINGS
  { key: 'seo.meta_title', value: 'Pulse News - Breaking News & Analysis', type: 'SEO', label: 'Default Meta Title', description: 'Default title for SEO meta tags', isPublic: true, isRequired: false },
  { key: 'seo.meta_description', value: 'Stay informed with the latest breaking news, in-depth analysis, and expert commentary from around the world.', type: 'SEO', label: 'Default Meta Description', description: 'Default description for SEO meta tags', isPublic: true, isRequired: false },
  { key: 'seo.meta_keywords', value: 'news, breaking news, analysis, world news, politics, technology', type: 'SEO', label: 'Default Meta Keywords', description: 'Default keywords for SEO (comma-separated)', isPublic: true, isRequired: false },
  { key: 'seo.google_analytics_id', value: '', type: 'SEO', label: 'Google Analytics ID', description: 'Google Analytics tracking ID (GA4)', isPublic: true, isRequired: false },
  { key: 'seo.google_search_console_verification', value: '', type: 'SEO', label: 'Google Search Console Verification', description: 'Google Search Console verification meta tag content', isPublic: true, isRequired: false },
  { key: 'seo.sitemap_enabled', value: true, type: 'SEO', label: 'Enable Sitemap', description: 'Whether to generate XML sitemap', isPublic: true, isRequired: false },
  
  // CONTENT SETTINGS
  { key: 'content.require_approval', value: false, type: 'CONTENT', label: 'Require Article Approval', description: 'Whether articles need approval before publishing', isPublic: false, isRequired: false },
  { key: 'content.auto_save_interval', value: 30, type: 'CONTENT', label: 'Auto-save Interval (seconds)', description: 'How often to auto-save article drafts', isPublic: false, isRequired: false },
  { key: 'content.max_article_length', value: 0, type: 'CONTENT', label: 'Maximum Article Length', description: 'Maximum number of characters per article (0 = unlimited)', isPublic: false, isRequired: false },
  { key: 'content.featured_articles_limit', value: 5, type: 'CONTENT', label: 'Featured Articles Limit', description: 'Maximum number of featured articles on homepage', isPublic: false, isRequired: false },
  { key: 'content.breaking_news_duration', value: 24, type: 'CONTENT', label: 'Breaking News Duration (hours)', description: 'How long articles stay marked as breaking news', isPublic: false, isRequired: false },
  { key: 'content.comments_enabled', value: true, type: 'CONTENT', label: 'Enable Comments', description: 'Whether to allow comments on articles', isPublic: false, isRequired: false },
  
  // USER MANAGEMENT SETTINGS
  { key: 'users.registration_enabled', value: false, type: 'USER_MANAGEMENT', label: 'Enable User Registration', description: 'Whether new users can register accounts', isPublic: false, isRequired: false },
  { key: 'users.email_verification_required', value: true, type: 'USER_MANAGEMENT', label: 'Require Email Verification', description: 'Whether new users must verify their email', isPublic: false, isRequired: false },
  { key: 'users.default_role', value: 'AUTHOR', type: 'USER_MANAGEMENT', label: 'Default User Role', description: 'Default role for new users', isPublic: false, isRequired: false },
  { key: 'users.session_timeout', value: 24, type: 'USER_MANAGEMENT', label: 'Session Timeout (hours)', description: 'How long user sessions last', isPublic: false, isRequired: false },
  { key: 'users.password_min_length', value: 8, type: 'USER_MANAGEMENT', label: 'Minimum Password Length', description: 'Minimum required password length', isPublic: false, isRequired: false },
  
  // API SETTINGS
  { key: 'api.rate_limit_requests', value: 100, type: 'API', label: 'Rate Limit - Requests per Window', description: 'Maximum API requests per time window', isPublic: false, isRequired: false },
  { key: 'api.rate_limit_window', value: 15, type: 'API', label: 'Rate Limit - Window (minutes)', description: 'Time window for rate limiting', isPublic: false, isRequired: false },
  { key: 'api.cors_origins', value: '*', type: 'API', label: 'CORS Allowed Origins', description: 'Allowed origins for CORS (comma-separated)', isPublic: false, isRequired: false },
  { key: 'api.public_endpoints_enabled', value: true, type: 'API', label: 'Enable Public API Endpoints', description: 'Whether to allow public access to read-only endpoints', isPublic: false, isRequired: false },
  
  // THEME SETTINGS
  { key: 'theme.primary_color', value: '#3B82F6', type: 'THEME', label: 'Primary Color', description: 'Primary brand color (hex code)', isPublic: true, isRequired: false },
  { key: 'theme.secondary_color', value: '#64748B', type: 'THEME', label: 'Secondary Color', description: 'Secondary brand color (hex code)', isPublic: true, isRequired: false },
  { key: 'theme.dark_mode_enabled', value: true, type: 'THEME', label: 'Enable Dark Mode', description: 'Whether to offer dark mode toggle', isPublic: true, isRequired: false },
  { key: 'theme.custom_css', value: '', type: 'THEME', label: 'Custom CSS', description: 'Additional CSS styles to apply', isPublic: true, isRequired: false },
  
  // MAINTENANCE SETTINGS
  { key: 'maintenance.mode_enabled', value: false, type: 'MAINTENANCE', label: 'Maintenance Mode', description: 'Whether the site is in maintenance mode', isPublic: true, isRequired: false },
  { key: 'maintenance.message', value: 'We are currently performing scheduled maintenance. Please check back soon.', type: 'MAINTENANCE', label: 'Maintenance Message', description: 'Message to display during maintenance', isPublic: true, isRequired: false },
  { key: 'maintenance.backup_enabled', value: true, type: 'MAINTENANCE', label: 'Enable Automatic Backups', description: 'Whether to perform automatic database backups', isPublic: false, isRequired: false },
  { key: 'maintenance.backup_frequency', value: 24, type: 'MAINTENANCE', label: 'Backup Frequency (hours)', description: 'How often to perform backups', isPublic: false, isRequired: false },
  { key: 'maintenance.log_retention_days', value: 30, type: 'MAINTENANCE', label: 'Log Retention (days)', description: 'How long to keep application logs', isPublic: false, isRequired: false }
];

async function fixCorruptedSettings() {
  console.log('🔧 Starting Settings Database Fix...');
  console.log('=' .repeat(50));
  
  try {
    // Step 1: Check for corrupted settings
    console.log('🔍 Checking for corrupted settings...');
    
    const corruptedSettings = await prisma.$queryRaw`
      SELECT key, value, type 
      FROM "Setting" 
      WHERE value::text LIKE '%*%' OR value IS NULL OR value::text = ''
    `;
    
    console.log(`Found ${corruptedSettings.length} corrupted settings:`, corruptedSettings);
    
    // Step 2: Delete corrupted settings
    if (corruptedSettings.length > 0) {
      console.log('🗑️  Deleting corrupted settings...');
      
      const deleteResult = await prisma.$executeRaw`
        DELETE FROM "Setting" 
        WHERE value::text LIKE '%*%' OR value IS NULL OR value::text = ''
      `;
      
      console.log(`✅ Deleted ${deleteResult} corrupted settings`);
    }
    
    // Step 3: Upsert all default settings
    console.log('📝 Upserting default settings...');
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    for (const setting of DEFAULT_SETTINGS) {
      try {
        // Convert value to proper JSON format
        let jsonValue;
        if (typeof setting.value === 'string') {
          jsonValue = JSON.stringify(setting.value);
        } else {
          jsonValue = JSON.stringify(setting.value);
        }
        
        const result = await prisma.setting.upsert({
          where: { key: setting.key },
          update: {
            value: jsonValue,
            type: setting.type,
            label: setting.label,
            description: setting.description,
            isPublic: setting.isPublic,
            isRequired: setting.isRequired,
            updatedAt: new Date()
          },
          create: {
            key: setting.key,
            value: jsonValue,
            type: setting.type,
            label: setting.label,
            description: setting.description,
            isPublic: setting.isPublic,
            isRequired: setting.isRequired
          }
        });
        
        console.log(`✅ Upserted: ${setting.key} = ${jsonValue}`);
        successCount++;
        
      } catch (error) {
        console.error(`❌ Error upserting ${setting.key}:`, error.message);
        errorCount++;
        errors.push({ key: setting.key, error: error.message });
      }
    }
    
    // Step 4: Verify results
    console.log('\n🔍 Verifying results...');
    
    const totalSettings = await prisma.setting.count();
    const settingsByType = await prisma.setting.groupBy({
      by: ['type'],
      _count: {
        type: true
      }
    });
    
    console.log(`📊 Total settings in database: ${totalSettings}`);
    console.log('📊 Settings by type:');
    settingsByType.forEach(group => {
      console.log(`  ${group.type}: ${group._count.type} settings`);
    });
    
    // Check for any remaining corrupted settings
    const remainingCorrupted = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM "Setting" 
      WHERE value::text LIKE '%*%' OR value IS NULL OR value::text = ''
    `;
    
    console.log(`🔍 Remaining corrupted settings: ${remainingCorrupted[0].count}`);
    
    // Summary
    console.log('\n📊 Fix Results Summary');
    console.log('=' .repeat(50));
    console.log(`✅ Successfully processed: ${successCount} settings`);
    console.log(`❌ Failed to process: ${errorCount} settings`);
    
    if (errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      errors.forEach(error => {
        console.log(`  ${error.key}: ${error.error}`);
      });
    }
    
    if (successCount > 0) {
      console.log('\n🎉 Settings fix completed successfully!');
      console.log('📋 Next steps:');
      console.log('1. Restart your GraphQL server');
      console.log('2. Refresh your settings page');
      console.log('3. Verify all settings are now visible');
      console.log('4. Test that you can edit and save settings');
    }
    
  } catch (error) {
    console.error('❌ Fatal error during settings fix:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the fix
fixCorruptedSettings();

