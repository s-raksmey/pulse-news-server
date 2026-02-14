// src/services/emailService.ts
import nodemailer from 'nodemailer';
import { SettingsService } from './settingsService';
import { 
  EmailTemplates, 
  EmailVerificationData, 
  RegistrationApprovedData, 
  RegistrationRejectedData, 
  RegistrationReceivedData 
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

    const host = await SettingsService.getSettingValue<string>('email.smtp_host');
    const portValue = await SettingsService.getSettingValue<number>('email.smtp_port');
    const username = await SettingsService.getSettingValue<string>('email.smtp_username');
    const password = await SettingsService.getSettingValue<string>('email.smtp_password');
    const fromAddress = await SettingsService.getSettingValue<string>('email.from_address');
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
    const config = await this.getEmailConfig();
    if (!config) return null;

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

    cachedTransporter = transporter;
    cachedConfigKey = configKey;

    return transporter;
  }

  static async sendNotificationEmail(input: NotificationEmailInput): Promise<void> {
    const transporter = await this.getTransporter();
    const config = await this.getEmailConfig();

    if (!transporter || !config) return;

    await transporter.sendMail({
      from: `${config.fromName} <${config.fromAddress}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
  }

  // Registration workflow email methods
  static async sendEmailVerification(data: EmailVerificationData): Promise<void> {
    const { html, text } = EmailTemplates.generateEmailVerification(data);
    
    await this.sendNotificationEmail({
      to: data.verificationUrl.includes('email=') ? 
        decodeURIComponent(data.verificationUrl.split('email=')[1].split('&')[0]) : 
        '', // Extract email from verification URL or pass separately
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

  // Utility method to get support email from settings
  static async getSupportEmail(): Promise<string> {
    const supportEmail = await SettingsService.getSettingValue<string>('email.support_address');
    return supportEmail || 'support@pulsenews.com';
  }

  // Utility method to get base URL for links
  static async getBaseUrl(): Promise<string> {
    const baseUrl = await SettingsService.getSettingValue<string>('site.base_url');
    return baseUrl || 'https://pulsenews.com';
  }
}
