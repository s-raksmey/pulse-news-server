import { SettingType } from '@prisma/client';

export interface SettingConfig {
  key: string;
  type: SettingType;
  label: string;
  description?: string;
  defaultValue: any;
  isPublic?: boolean;
  isRequired?: boolean;
  validation?: {
    type: 'string' | 'number' | 'boolean' | 'email' | 'url' | 'json' | 'array';
    required?: boolean;
    min?: number;
    max?: number;
    pattern?: string;
    options?: string[];
  };
}

export const SETTINGS_CONFIG: SettingConfig[] = [
  // SITE SETTINGS
  {
    key: 'site.name',
    type: 'SITE',
    label: 'Site Name',
    description: 'The name of your news website',
    defaultValue: 'Pulse News',
    isPublic: true,
    isRequired: true,
    validation: { type: 'string', required: true, min: 1, max: 100 },
  },
  {
    key: 'site.description',
    type: 'SITE',
    label: 'Site Description',
    description: 'A brief description of your news website',
    defaultValue: 'Your trusted source for breaking news and in-depth analysis',
    isPublic: true,
    validation: { type: 'string', max: 500 },
  },
  {
    key: 'site.logo_url',
    type: 'SITE',
    label: 'Logo URL',
    description: 'URL to your site logo image',
    defaultValue: '',
    isPublic: true,
    validation: { type: 'url' },
  },
  {
    key: 'site.favicon_url',
    type: 'SITE',
    label: 'Favicon URL',
    description: 'URL to your site favicon',
    defaultValue: '',
    isPublic: true,
    validation: { type: 'url' },
  },
  {
    key: 'site.contact_email',
    type: 'SITE',
    label: 'Contact Email',
    description: 'Primary contact email for your site',
    defaultValue: '',
    isPublic: true,
    validation: { type: 'email' },
  },
  {
    key: 'site.timezone',
    type: 'SITE',
    label: 'Timezone',
    description: 'Default timezone for the site',
    defaultValue: 'UTC',
    isPublic: true,
    validation: {
      type: 'string',
      options: [
        'UTC',
        'America/New_York',
        'America/Los_Angeles',
        'Europe/London',
        'Asia/Tokyo',
        'Australia/Sydney',
      ],
    },
  },

  // EMAIL SETTINGS
  {
    key: 'email.smtp_host',
    type: 'EMAIL',
    label: 'SMTP Host',
    description: 'SMTP server hostname',
    defaultValue: '',
    validation: { type: 'string' },
  },
  {
    key: 'email.smtp_port',
    type: 'EMAIL',
    label: 'SMTP Port',
    description: 'SMTP server port (usually 587 or 465)',
    defaultValue: 587,
    validation: { type: 'number', min: 1, max: 65535 },
  },
  {
    key: 'email.smtp_username',
    type: 'EMAIL',
    label: 'SMTP Username',
    description: 'Username for SMTP authentication',
    defaultValue: '',
    validation: { type: 'string' },
  },
  {
    key: 'email.smtp_password',
    type: 'EMAIL',
    label: 'SMTP Password',
    description: 'Password for SMTP authentication (encrypted)',
    defaultValue: '',
    validation: { type: 'string' },
  },
  {
    key: 'email.from_address',
    type: 'EMAIL',
    label: 'From Email Address',
    description: 'Default sender email address',
    defaultValue: '',
    validation: { type: 'email' },
  },
  {
    key: 'email.from_name',
    type: 'EMAIL',
    label: 'From Name',
    description: 'Default sender name',
    defaultValue: 'Pulse News',
    validation: { type: 'string' },
  },
  {
    key: 'email.notifications_enabled',
    type: 'EMAIL',
    label: 'Enable Email Notifications',
    description: 'Whether to send email notifications',
    defaultValue: true,
    validation: { type: 'boolean' },
  },

  // SEO SETTINGS
  {
    key: 'seo.meta_title',
    type: 'SEO',
    label: 'Default Meta Title',
    description: 'Default title for SEO meta tags',
    defaultValue: 'Pulse News - Breaking News & Analysis',
    isPublic: true,
    validation: { type: 'string', max: 60 },
  },
  {
    key: 'seo.meta_description',
    type: 'SEO',
    label: 'Default Meta Description',
    description: 'Default description for SEO meta tags',
    defaultValue:
      'Stay informed with the latest breaking news, in-depth analysis, and expert commentary from around the world.',
    isPublic: true,
    validation: { type: 'string', max: 160 },
  },
  {
    key: 'seo.meta_keywords',
    type: 'SEO',
    label: 'Default Meta Keywords',
    description: 'Default keywords for SEO (comma-separated)',
    defaultValue: 'news, breaking news, analysis, world news, politics, technology',
    isPublic: true,
    validation: { type: 'string' },
  },
  {
    key: 'seo.google_analytics_id',
    type: 'SEO',
    label: 'Google Analytics ID',
    description: 'Google Analytics tracking ID (GA4)',
    defaultValue: '',
    isPublic: true,
    validation: { type: 'string', pattern: '^(G-[A-Z0-9]+)?$' },
  },
  {
    key: 'seo.google_search_console_verification',
    type: 'SEO',
    label: 'Google Search Console Verification',
    description: 'Google Search Console verification meta tag content',
    defaultValue: '',
    isPublic: true,
    validation: { type: 'string' },
  },
  {
    key: 'seo.sitemap_enabled',
    type: 'SEO',
    label: 'Enable Sitemap',
    description: 'Whether to generate XML sitemap',
    defaultValue: true,
    isPublic: true,
    validation: { type: 'boolean' },
  },

  // CONTENT SETTINGS
  {
    key: 'content.require_approval',
    type: 'CONTENT',
    label: 'Require Article Approval',
    description: 'Whether articles need approval before publishing',
    defaultValue: false,
    validation: { type: 'boolean' },
  },
  {
    key: 'content.auto_save_interval',
    type: 'CONTENT',
    label: 'Auto-save Interval (seconds)',
    description: 'How often to auto-save article drafts',
    defaultValue: 30,
    validation: { type: 'number', min: 10, max: 300 },
  },
  {
    key: 'content.max_article_length',
    type: 'CONTENT',
    label: 'Maximum Article Length',
    description: 'Maximum number of characters per article (0 = unlimited)',
    defaultValue: 0,
    validation: { type: 'number', min: 0 },
  },
  {
    key: 'content.featured_articles_limit',
    type: 'CONTENT',
    label: 'Featured Articles Limit',
    description: 'Maximum number of featured articles on homepage',
    defaultValue: 5,
    validation: { type: 'number', min: 1, max: 20 },
  },
  {
    key: 'content.breaking_news_duration',
    type: 'CONTENT',
    label: 'Breaking News Duration (hours)',
    description: 'How long articles stay marked as breaking news',
    defaultValue: 24,
    validation: { type: 'number', min: 1, max: 168 },
  },
  {
    key: 'content.comments_enabled',
    type: 'CONTENT',
    label: 'Enable Comments',
    description: 'Whether to allow comments on articles',
    defaultValue: true,
    validation: { type: 'boolean' },
  },

  // USER MANAGEMENT SETTINGS
  {
    key: 'users.registration_enabled',
    type: 'USER_MANAGEMENT',
    label: 'Enable User Registration',
    description: 'Whether new users can register accounts',
    defaultValue: false,
    validation: { type: 'boolean' },
  },
  {
    key: 'users.email_verification_required',
    type: 'USER_MANAGEMENT',
    label: 'Require Email Verification',
    description: 'Whether new users must verify their email',
    defaultValue: true,
    validation: { type: 'boolean' },
  },
  {
    key: 'users.default_role',
    type: 'USER_MANAGEMENT',
    label: 'Default User Role',
    description: 'Default role for new users',
    defaultValue: 'AUTHOR',
    validation: {
      type: 'string',
      options: ['AUTHOR', 'EDITOR', 'ADMIN'],
    },
  },
  {
    key: 'users.session_timeout',
    type: 'USER_MANAGEMENT',
    label: 'Session Timeout (hours)',
    description: 'How long user sessions last',
    defaultValue: 24,
    validation: { type: 'number', min: 1, max: 720 },
  },
  {
    key: 'users.password_min_length',
    type: 'USER_MANAGEMENT',
    label: 'Minimum Password Length',
    description: 'Minimum required password length',
    defaultValue: 8,
    validation: { type: 'number', min: 6, max: 50 },
  },

  // API SETTINGS
  {
    key: 'api.rate_limit_requests',
    type: 'API',
    label: 'Rate Limit - Requests per Window',
    description: 'Maximum API requests per time window',
    defaultValue: 100,
    validation: { type: 'number', min: 10, max: 10000 },
  },
  {
    key: 'api.rate_limit_window',
    type: 'API',
    label: 'Rate Limit - Window (minutes)',
    description: 'Time window for rate limiting',
    defaultValue: 15,
    validation: { type: 'number', min: 1, max: 60 },
  },
  {
    key: 'api.cors_origins',
    type: 'API',
    label: 'CORS Allowed Origins',
    description: 'Allowed origins for CORS (comma-separated)',
    defaultValue: '*',
    validation: { type: 'string' },
  },
  {
    key: 'api.public_endpoints_enabled',
    type: 'API',
    label: 'Enable Public API Endpoints',
    description: 'Whether to allow public access to read-only endpoints',
    defaultValue: true,
    validation: { type: 'boolean' },
  },

  // THEME SETTINGS
  {
    key: 'theme.primary_color',
    type: 'THEME',
    label: 'Primary Color',
    description: 'Primary brand color (hex code)',
    defaultValue: '#3B82F6',
    isPublic: true,
    validation: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
  },
  {
    key: 'theme.secondary_color',
    type: 'THEME',
    label: 'Secondary Color',
    description: 'Secondary brand color (hex code)',
    defaultValue: '#64748B',
    isPublic: true,
    validation: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
  },
  {
    key: 'theme.dark_mode_enabled',
    type: 'THEME',
    label: 'Enable Dark Mode',
    description: 'Whether to offer dark mode toggle',
    defaultValue: true,
    isPublic: true,
    validation: { type: 'boolean' },
  },
  {
    key: 'theme.custom_css',
    type: 'THEME',
    label: 'Custom CSS',
    description: 'Additional CSS styles to apply',
    defaultValue: '',
    isPublic: true,
    validation: { type: 'string' },
  },

  // MAINTENANCE SETTINGS
  {
    key: 'maintenance.mode_enabled',
    type: 'MAINTENANCE',
    label: 'Maintenance Mode',
    description: 'Whether the site is in maintenance mode',
    defaultValue: false,
    isPublic: true,
    validation: { type: 'boolean' },
  },
  {
    key: 'maintenance.message',
    type: 'MAINTENANCE',
    label: 'Maintenance Message',
    description: 'Message to display during maintenance',
    defaultValue: 'We are currently performing scheduled maintenance. Please check back soon.',
    isPublic: true,
    validation: { type: 'string', max: 500 },
  },
  {
    key: 'maintenance.backup_enabled',
    type: 'MAINTENANCE',
    label: 'Enable Automatic Backups',
    description: 'Whether to perform automatic database backups',
    defaultValue: true,
    validation: { type: 'boolean' },
  },
  {
    key: 'maintenance.backup_frequency',
    type: 'MAINTENANCE',
    label: 'Backup Frequency (hours)',
    description: 'How often to perform backups',
    defaultValue: 24,
    validation: { type: 'number', min: 1, max: 168 },
  },
  {
    key: 'maintenance.log_retention_days',
    type: 'MAINTENANCE',
    label: 'Log Retention (days)',
    description: 'How long to keep application logs',
    defaultValue: 30,
    validation: { type: 'number', min: 1, max: 365 },
  },
];

// Helper function to get settings by type
export function getSettingsByType(type: SettingType): SettingConfig[] {
  return SETTINGS_CONFIG.filter((setting) => setting.type === type);
}

// Helper function to get setting by key
export function getSettingConfig(key: string): SettingConfig | undefined {
  return SETTINGS_CONFIG.find((setting) => setting.key === key);
}

// Helper function to get all public settings
export function getPublicSettings(): SettingConfig[] {
  return SETTINGS_CONFIG.filter((setting) => setting.isPublic);
}

// Helper function to get all required settings
export function getRequiredSettings(): SettingConfig[] {
  return SETTINGS_CONFIG.filter((setting) => setting.isRequired);
}
