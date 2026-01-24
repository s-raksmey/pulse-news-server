// GraphQL API-based fix for corrupted settings
// Run this in your browser console while logged into the admin panel

// INSTRUCTIONS:
// 1. Go to http://localhost:3000 in your browser
// 2. Open Developer Tools (F12)
// 3. Go to Application/Storage tab → localStorage
// 4. Copy your JWT token value
// 5. Replace 'YOUR_JWT_TOKEN_HERE' below with your actual token
// 6. Copy and paste this entire script into the browser console
// 7. Run: fixCorruptedSettings()

const JWT_TOKEN = 'YOUR_JWT_TOKEN_HERE'; // Replace with your actual JWT token
const GRAPHQL_ENDPOINT = 'http://localhost:4000/graphql';

// Default settings configuration
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

// GraphQL mutation for updating settings
const UPDATE_SETTING_MUTATION = `
  mutation UpdateSetting($input: UpdateSettingInput!) {
    updateSetting(input: $input) {
      id
      key
      value
      type
      label
      description
      isPublic
      isRequired
      updatedAt
    }
  }
`;

// Helper function to make GraphQL requests
async function graphqlRequest(query, variables = {}) {
  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`
      },
      body: JSON.stringify({
        query,
        variables
      })
    });
    
    const result = await response.json();
    
    if (result.errors) {
      console.error('❌ GraphQL Errors:', result.errors);
      return null;
    }
    
    return result.data;
  } catch (error) {
    console.error('❌ Request Error:', error);
    return null;
  }
}

// Main function to fix corrupted settings
async function fixCorruptedSettings() {
  console.log('🔧 Starting Settings Fix Process...');
  console.log('=' .repeat(50));
  
  // Check if JWT token is set
  if (JWT_TOKEN === 'YOUR_JWT_TOKEN_HERE') {
    console.log('❌ Please set your JWT token first!');
    console.log('   1. Go to Developer Tools (F12)');
    console.log('   2. Application/Storage → localStorage');
    console.log('   3. Copy the token value');
    console.log('   4. Replace JWT_TOKEN in this script');
    return;
  }
  
  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  
  console.log(`📝 Processing ${DEFAULT_SETTINGS.length} settings...`);
  
  for (const setting of DEFAULT_SETTINGS) {
    try {
      console.log(`⚙️  Updating: ${setting.key}`);
      
      const result = await graphqlRequest(UPDATE_SETTING_MUTATION, {
        input: {
          key: setting.key,
          value: setting.value,
          type: setting.type,
          label: setting.label,
          description: setting.description,
          isPublic: setting.isPublic,
          isRequired: setting.isRequired
        }
      });
      
      if (result && result.updateSetting) {
        console.log(`✅ Updated: ${setting.key}`);
        successCount++;
      } else {
        console.log(`❌ Failed: ${setting.key}`);
        errorCount++;
        errors.push(setting.key);
      }
      
      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`❌ Error updating ${setting.key}:`, error);
      errorCount++;
      errors.push(setting.key);
    }
  }
  
  // Summary
  console.log('\n📊 Fix Results Summary');
  console.log('=' .repeat(50));
  console.log(`✅ Successfully updated: ${successCount} settings`);
  console.log(`❌ Failed to update: ${errorCount} settings`);
  
  if (errors.length > 0) {
    console.log(`\n❌ Failed settings: ${errors.join(', ')}`);
  }
  
  if (successCount > 0) {
    console.log('\n🎉 Settings fix completed!');
    console.log('📋 Next steps:');
    console.log('1. Refresh your settings page');
    console.log('2. Restart your GraphQL server if needed');
    console.log('3. Verify all settings are now visible');
  } else {
    console.log('\n⚠️  No settings were updated successfully.');
    console.log('🔧 Troubleshooting:');
    console.log('1. Check your JWT token is valid');
    console.log('2. Ensure GraphQL server is running');
    console.log('3. Check browser console for errors');
  }
}

// Instructions
console.log(`
🔧 SETTINGS FIX INSTRUCTIONS:

1. Replace 'YOUR_JWT_TOKEN_HERE' with your actual JWT token
2. Run: fixCorruptedSettings()

To get your JWT token:
1. Go to http://localhost:3000
2. Open Developer Tools (F12)
3. Application/Storage tab → localStorage
4. Copy the 'token' value
5. Replace JWT_TOKEN above

Then run: fixCorruptedSettings()
`);

// Export for easy access
window.fixCorruptedSettings = fixCorruptedSettings;

