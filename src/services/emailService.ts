// src/services/emailService.ts
import nodemailer from 'nodemailer';
import { SettingsService } from './settingsService';
import { 
  EmailTemplates, 
  EmailVerificationData, 
  RegistrationApprovedData, 
  RegistrationRejectedData, 
  RegistrationReceivedData,
  AccountActivationData
} from '../utils/emailTemplates';

type EmailConfig = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  fromAddress: string;
  fromName: string;
  notificationsEnabled: boolean;
};

type NotificationEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

let cachedTransporter: nodemailer.Transporter | null = null;
let cachedConfigKey = '';

function buildConfigKey(config: EmailConfig): string {
  return [
    config.host,
    config.port,
    config.username || '',
    config.password ? 'set' : 'unset',
    config.fromAddress,
    config.fromName,
    config.notificationsEnabled ? 'enabled' : 'disabled',
  ].join('|');
}

export class EmailService {
  static async getEmailConfig(): Promise<EmailConfig | null> {
    const notificationsEnabled =
      (await SettingsService.getSettingValue<boolean>('email.notifications_enabled')) ?? true;

    if (!notificationsEnabled) return null;

    // Try to get settings from database first, then fall back to environment variables
    const host = 
      (await SettingsService.getSettingValue<string>('email.smtp_host')) || 
      process.env.SMTP_HOST;
    const portValue = 
      (await SettingsService.getSettingValue<number>('email.smtp_port')) || 
      process.env.SMTP_PORT;
    const username = 
      (await SettingsService.getSettingValue<string>('email.smtp_username')) || 
      process.env.SMTP_USERNAME;
    const password = 
      (await SettingsService.getSettingValue<string>('email.smtp_password')) || 
      process.env.SMTP_PASSWORD;
    const fromAddress = 
      (await SettingsService.getSettingValue<string>('email.from_address')) || 
      process.env.SMTP_USERNAME; // Use SMTP_USERNAME as from address if not set
    const fromName =
      (await SettingsService.getSettingValue<string>('email.from_name')) ?? 'Pulse News';

    if (!host || !fromAddress) return null;

    const port = typeof portValue === 'number' ? portValue : Number(portValue || 587);

    return {
      host,
      port,
      username: username || undefined,
      password: password || undefined,
      fromAddress,
      fromName,
      notificationsEnabled,
    };
  }

  static async getTransporter(): Promise<nodemailer.Transporter | null> {
    try {
      const config = await this.getEmailConfig();
      if (!config) return null;

      // Validate SMTP host before creating transporter
      if (!config.host || config.host.trim() === '') {
        console.warn('Email configuration incomplete: SMTP host is empty');
        return null;
      }

      // Check for known invalid hostnames that cause DNS errors
      if (config.host === 'cms-news.gmail.com') {
        console.error('Invalid SMTP host detected: cms-news.gmail.com');
        console.error('This hostname does not exist and will cause DNS resolution errors.');
        console.error('Please update your email settings to use a valid SMTP server.');
        return null;
      }

      const configKey = buildConfigKey(config);
      if (cachedTransporter && cachedConfigKey === configKey) {
        return cachedTransporter;
      }

      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465,
        auth: config.username
          ? {
              user: config.username,
              pass: config.password,
            }
          : undefined,
      });

      // Test the connection to catch configuration errors early
      try {
        await transporter.verify();
        console.log(`SMTP connection verified successfully for ${config.host}:${config.port}`);
      } catch (verifyError) {
        console.warn('SMTP connection verification failed:', {
          host: config.host,
          port: config.port,
          error: verifyError instanceof Error ? verifyError.message : 'Unknown error'
        });
        // Don't return null here - let the actual send attempt handle the error
        // This allows for cases where verify() fails but sendMail() might still work
      }

      cachedTransporter = transporter;
      cachedConfigKey = configKey;

      return transporter;
    } catch (error) {
      console.error('Failed to create email transporter:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      return null;
    }
  }

  static async sendNotificationEmail(input: NotificationEmailInput): Promise<void> {
    try {
      console.log(`🔄 Attempting to send email to ${input.to}: ${input.subject}`);
      
      const transporter = await this.getTransporter();
      const config = await this.getEmailConfig();

      if (!transporter || !config) {
        console.log('❌ Email notifications disabled: No valid email configuration found');
        return;
      }

      console.log(`📧 Sending email via ${config.host}:${config.port} from ${config.fromAddress}`);

      const mailOptions = {
        from: `${config.fromName} <${config.fromAddress}>`,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      };

      const result = await transporter.sendMail(mailOptions);
      console.log(`✅ Email sent successfully to ${input.to}: ${input.subject}`);
      console.log(`📬 Message ID: ${result.messageId}`);
    } catch (error) {
      // Log the error but don't throw it - this prevents email failures from breaking workflows
      console.error('Failed to send email notification:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        to: input.to,
        subject: input.subject,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Provide specific guidance for the cms-news.gmail.com DNS error
      if (error instanceof Error && error.message.includes('cms-news.gmail.com')) {
        console.error('🚨 SMTP Configuration Error: Invalid hostname "cms-news.gmail.com" detected.');
        console.error('💡 Solution: Update your email settings in the admin panel:');
        console.error('   1. Go to Settings > Email');
        console.error('   2. Change SMTP Host to a valid server (e.g., smtp.gmail.com)');
        console.error('   3. Or disable email notifications temporarily');
      }
      
      // Provide guidance for general DNS resolution errors
      if (error instanceof Error && error.message.includes('getaddrinfo ENOTFOUND')) {
        console.error('🚨 DNS Resolution Error: Cannot resolve SMTP hostname.');
        console.error('💡 This error prevents article workflow from completing.');
        console.error('💡 Email notifications will be skipped to allow workflows to continue.');
      }
    }
  }

  // Registration workflow email methods
  static async sendEmailVerification(email: string, data: EmailVerificationData): Promise<void> {
    const { html, text } = EmailTemplates.generateEmailVerification(data);
    
    await this.sendNotificationEmail({
      to: email,
      subject: 'Verify Your Email Address - Pulse News',
      text,
      html,
    });
  }

  static async sendRegistrationReceived(email: string, data: RegistrationReceivedData): Promise<void> {
    const { html, text } = EmailTemplates.generateRegistrationReceived(data);
    
    await this.sendNotificationEmail({
      to: email,
      subject: 'Registration Received - Pulse News',
      text,
      html,
    });
  }

  static async sendRegistrationApproved(email: string, data: RegistrationApprovedData): Promise<void> {
    const { html, text } = EmailTemplates.generateRegistrationApproved(data);
    
    await this.sendNotificationEmail({
      to: email,
      subject: '🎉 Welcome to Pulse News - Account Approved!',
      text,
      html,
    });
  }

  static async sendRegistrationRejected(email: string, data: RegistrationRejectedData): Promise<void> {
    const { html, text } = EmailTemplates.generateRegistrationRejected(data);
    
    await this.sendNotificationEmail({
      to: email,
      subject: 'Registration Update - Pulse News',
      text,
      html,
    });
  }

  static async sendAccountActivation(email: string, data: AccountActivationData): Promise<void> {
    const { html, text } = EmailTemplates.generateAccountActivation(data);
    
    await this.sendNotificationEmail({
      to: email,
      subject: '🎉 Account Activated - Welcome to Pulse News!',
      text,
      html,
    });
  }

  // Utility method to get support email from settings
  static async getSupportEmail(): Promise<string> {
    const supportEmail = 
      (await SettingsService.getSettingValue<string>('email.support_address')) || 
      process.env.SUPPORT_EMAIL;
    return supportEmail || 'support@pulsenews.com';
  }

  // Utility method to get base URL for links
  static async getBaseUrl(): Promise<string> {
    // Prioritize environment variable for development, then database setting
    const envBaseUrl = process.env.SITE_BASE_URL;
    const dbBaseUrl = await SettingsService.getSettingValue<string>('site.base_url');
    
    // Use environment variable first (for development), then database setting
    const baseUrl = envBaseUrl || dbBaseUrl;
    
    if (!baseUrl) {
      console.warn('No base URL configured. Please set SITE_BASE_URL environment variable or configure site.base_url in admin settings.');
      // For development, default to admin app (3001) which has the verify-email page
      return process.env.NODE_ENV === 'production' ? 'https://pulsenews.com' : 'http://localhost:3001';
    }
    
    return baseUrl;
  }
}
