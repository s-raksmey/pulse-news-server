-- Fix corrupted settings data causing JSONObject serialization errors
-- This script will clean up corrupted settings and repopulate with proper JSON values

-- First, let's see what corrupted settings exist
SELECT 
  key, 
  value, 
  type,
  CASE 
    WHEN value::text LIKE '%*%' THEN 'Contains asterisk'
    WHEN value IS NULL THEN 'NULL value'
    WHEN value::text = '' THEN 'Empty string'
    ELSE 'Other issue'
  END as issue_type
FROM "Setting" 
WHERE value::text LIKE '%*%' OR value IS NULL OR value::text = '';

-- Delete any settings with corrupted values
DELETE FROM "Setting" WHERE value::text LIKE '%*%' OR value IS NULL OR value::text = '';

-- Insert/Update all default settings with proper JSON values
-- Using ON CONFLICT to handle existing records safely
INSERT INTO "Setting" (id, key, value, type, label, description, "isPublic", "isRequired", "createdAt", "updatedAt") 
VALUES 
  -- SITE SETTINGS (6 settings)
  (gen_random_uuid(), 'site.name', '"Pulse News"', 'SITE', 'Site Name', 'The name of your news website', true, true, NOW(), NOW()),
  (gen_random_uuid(), 'site.description', '"Your trusted source for breaking news and in-depth analysis"', 'SITE', 'Site Description', 'A brief description of your news website', true, false, NOW(), NOW()),
  (gen_random_uuid(), 'site.logo_url', '""', 'SITE', 'Logo URL', 'URL to your site logo image', true, false, NOW(), NOW()),
  (gen_random_uuid(), 'site.favicon_url', '""', 'SITE', 'Favicon URL', 'URL to your site favicon', true, false, NOW(), NOW()),
  (gen_random_uuid(), 'site.contact_email', '""', 'SITE', 'Contact Email', 'Primary contact email for your site', true, false, NOW(), NOW()),
  (gen_random_uuid(), 'site.timezone', '"UTC"', 'SITE', 'Timezone', 'Default timezone for the site', true, false, NOW(), NOW()),
  
  -- EMAIL SETTINGS (7 settings)
  (gen_random_uuid(), 'email.smtp_host', '""', 'EMAIL', 'SMTP Host', 'SMTP server hostname', false, false, NOW(), NOW()),
  (gen_random_uuid(), 'email.smtp_port', '587', 'EMAIL', 'SMTP Port', 'SMTP server port (usually 587 or 465)', false, false, NOW(), NOW()),
  (gen_random_uuid(), 'email.smtp_username', '""', 'EMAIL', 'SMTP Username', 'Username for SMTP authentication', false, false, NOW(), NOW()),
  (gen_random_uuid(), 'email.smtp_password', '""', 'EMAIL', 'SMTP Password', 'Password for SMTP authentication (encrypted)', false, false, NOW(), NOW()),
  (gen_random_uuid(), 'email.from_address', '""', 'EMAIL', 'From Email Address', 'Default sender email address', false, false, NOW(), NOW()),
  (gen_random_uuid(), 'email.from_name', '"Pulse News"', 'EMAIL', 'From Name', 'Default sender name', false, false, NOW(), NOW()),
  (gen_random_uuid(), 'email.notifications_enabled', 'true', 'EMAIL', 'Enable Email Notifications', 'Whether to send email notifications', false, false, NOW(), NOW()),
  
  -- SEO SETTINGS (6 settings)
  (gen_random_uuid(), 'seo.meta_title', '"Pulse News - Breaking News & Analysis"', 'SEO', 'Default Meta Title', 'Default title for SEO meta tags', true, false, NOW(), NOW()),
  (gen_random_uuid(), 'seo.meta_description', '"Stay informed with the latest breaking news, in-depth analysis, and expert commentary from around the world."', 'SEO', 'Default Meta Description', 'Default description for SEO meta tags', true, false, NOW(), NOW()),
  (gen_random_uuid(), 'seo.meta_keywords', '"news, breaking news, analysis, world news, politics, technology"', 'SEO', 'Default Meta Keywords', 'Default keywords for SEO (comma-separated)', true, false, NOW(), NOW()),
  (gen_random_uuid(), 'seo.google_analytics_id', '""', 'SEO', 'Google Analytics ID', 'Google Analytics tracking ID (GA4)', true, false, NOW(), NOW()),
  (gen_random_uuid(), 'seo.google_search_console_verification', '""', 'SEO', 'Google Search Console Verification', 'Google Search Console verification meta tag content', true, false, NOW(), NOW()),
  (gen_random_uuid(), 'seo.sitemap_enabled', 'true', 'SEO', 'Enable Sitemap', 'Whether to generate XML sitemap', true, false, NOW(), NOW()),
  
  -- CONTENT SETTINGS (6 settings)
  (gen_random_uuid(), 'content.require_approval', 'false', 'CONTENT', 'Require Article Approval', 'Whether articles need approval before publishing', false, false, NOW(), NOW()),
  (gen_random_uuid(), 'content.auto_save_interval', '30', 'CONTENT', 'Auto-save Interval (seconds)', 'How often to auto-save article drafts', false, false, NOW(), NOW()),
  (gen_random_uuid(), 'content.max_article_length', '0', 'CONTENT', 'Maximum Article Length', 'Maximum number of characters per article (0 = unlimited)', false, false, NOW(), NOW()),
  (gen_random_uuid(), 'content.featured_articles_limit', '5', 'CONTENT', 'Featured Articles Limit', 'Maximum number of featured articles on homepage', false, false, NOW(), NOW()),
  (gen_random_uuid(), 'content.breaking_news_duration', '24', 'CONTENT', 'Breaking News Duration (hours)', 'How long articles stay marked as breaking news', false, false, NOW(), NOW()),
  (gen_random_uuid(), 'content.comments_enabled', 'true', 'CONTENT', 'Enable Comments', 'Whether to allow comments on articles', false, false, NOW(), NOW()),
  
  -- USER MANAGEMENT SETTINGS (5 settings)
  (gen_random_uuid(), 'users.registration_enabled', 'false', 'USER_MANAGEMENT', 'Enable User Registration', 'Whether new users can register accounts', false, false, NOW(), NOW()),
  (gen_random_uuid(), 'users.email_verification_required', 'true', 'USER_MANAGEMENT', 'Require Email Verification', 'Whether new users must verify their email', false, false, NOW(), NOW()),
  (gen_random_uuid(), 'users.default_role', '"AUTHOR"', 'USER_MANAGEMENT', 'Default User Role', 'Default role for new users', false, false, NOW(), NOW()),
  (gen_random_uuid(), 'users.session_timeout', '24', 'USER_MANAGEMENT', 'Session Timeout (hours)', 'How long user sessions last', false, false, NOW(), NOW()),
  (gen_random_uuid(), 'users.password_min_length', '8', 'USER_MANAGEMENT', 'Minimum Password Length', 'Minimum required password length', false, false, NOW(), NOW()),
  
  -- API SETTINGS (4 settings)
  (gen_random_uuid(), 'api.rate_limit_requests', '100', 'API', 'Rate Limit - Requests per Window', 'Maximum API requests per time window', false, false, NOW(), NOW()),
  (gen_random_uuid(), 'api.rate_limit_window', '15', 'API', 'Rate Limit - Window (minutes)', 'Time window for rate limiting', false, false, NOW(), NOW()),
  (gen_random_uuid(), 'api.cors_origins', '"*"', 'API', 'CORS Allowed Origins', 'Allowed origins for CORS (comma-separated)', false, false, NOW(), NOW()),
  (gen_random_uuid(), 'api.public_endpoints_enabled', 'true', 'API', 'Enable Public API Endpoints', 'Whether to allow public access to read-only endpoints', false, false, NOW(), NOW()),
  
  -- THEME SETTINGS (4 settings)
  (gen_random_uuid(), 'theme.primary_color', '"#3B82F6"', 'THEME', 'Primary Color', 'Primary brand color (hex code)', true, false, NOW(), NOW()),
  (gen_random_uuid(), 'theme.secondary_color', '"#64748B"', 'THEME', 'Secondary Color', 'Secondary brand color (hex code)', true, false, NOW(), NOW()),
  (gen_random_uuid(), 'theme.dark_mode_enabled', 'true', 'THEME', 'Enable Dark Mode', 'Whether to offer dark mode toggle', true, false, NOW(), NOW()),
  (gen_random_uuid(), 'theme.custom_css', '""', 'THEME', 'Custom CSS', 'Additional CSS styles to apply', true, false, NOW(), NOW()),
  
  -- MAINTENANCE SETTINGS (5 settings)
  (gen_random_uuid(), 'maintenance.mode_enabled', 'false', 'MAINTENANCE', 'Maintenance Mode', 'Whether the site is in maintenance mode', true, false, NOW(), NOW()),
  (gen_random_uuid(), 'maintenance.message', '"We are currently performing scheduled maintenance. Please check back soon."', 'MAINTENANCE', 'Maintenance Message', 'Message to display during maintenance', true, false, NOW(), NOW()),
  (gen_random_uuid(), 'maintenance.backup_enabled', 'true', 'MAINTENANCE', 'Enable Automatic Backups', 'Whether to perform automatic database backups', false, false, NOW(), NOW()),
  (gen_random_uuid(), 'maintenance.backup_frequency', '24', 'MAINTENANCE', 'Backup Frequency (hours)', 'How often to perform backups', false, false, NOW(), NOW()),
  (gen_random_uuid(), 'maintenance.log_retention_days', '30', 'MAINTENANCE', 'Log Retention (days)', 'How long to keep application logs', false, false, NOW(), NOW())

ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  "updatedAt" = NOW();

-- Verify the settings were inserted correctly and count by type
SELECT 
  type,
  COUNT(*) as count,
  STRING_AGG(key, ', ' ORDER BY key) as keys
FROM "Setting" 
GROUP BY type 
ORDER BY type;

-- Show total count
SELECT COUNT(*) as total_settings FROM "Setting";

-- Verify no corrupted values remain
SELECT 
  COUNT(*) as corrupted_count,
  STRING_AGG(key, ', ') as corrupted_keys
FROM "Setting" 
WHERE value::text LIKE '%*%' OR value IS NULL OR value::text = '';

