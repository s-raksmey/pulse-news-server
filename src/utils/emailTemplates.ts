// src/utils/emailTemplates.ts

export interface EmailVerificationData {
  name: string;
  verificationUrl: string;
  expiryHours: number;
}

export interface RegistrationApprovedData {
  name: string;
  email: string;
  loginUrl: string;
  role: string;
}

export interface RegistrationRejectedData {
  name: string;
  reason?: string;
  supportEmail: string;
}

export interface RegistrationReceivedData {
  name: string;
  email: string;
}

export class EmailTemplates {
  private static getBaseStyles(): string {
    return `
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #ffffff; padding: 30px; border: 1px solid #e1e5e9; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px; color: #6c757d; }
        .btn { display: inline-block; padding: 12px 30px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
        .btn:hover { background: #0056b3; }
        .alert { padding: 15px; margin: 20px 0; border-radius: 5px; }
        .alert-success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
        .alert-danger { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
        .alert-info { background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; }
        .logo { font-size: 28px; font-weight: bold; margin-bottom: 10px; }
        .subtitle { font-size: 16px; opacity: 0.9; }
      </style>
    `;
  }

  static generateEmailVerification(data: EmailVerificationData): { html: string; text: string } {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email - Pulse News</title>
        ${this.getBaseStyles()}
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">📰 Pulse News</div>
            <div class="subtitle">Verify Your Email Address</div>
          </div>
          <div class="content">
            <h2>Hello ${data.name}!</h2>
            <p>Thank you for registering with Pulse News. To complete your registration, please verify your email address by clicking the button below:</p>
            
            <div style="text-align: center;">
              <a href="${data.verificationUrl}" class="btn">Verify Email Address</a>
            </div>
            
            <div class="alert alert-info">
              <strong>Important:</strong> This verification link will expire in ${data.expiryHours} hours. If you don't verify your email within this time, you'll need to register again.
            </div>
            
            <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
            <p style="word-break: break-all; background: #f8f9fa; padding: 10px; border-radius: 5px; font-family: monospace;">
              ${data.verificationUrl}
            </p>
            
            <p>If you didn't create an account with Pulse News, you can safely ignore this email.</p>
            
            <p>Best regards,<br>The Pulse News Team</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 Pulse News. All rights reserved.</p>
            <p>This is an automated message, please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Hello ${data.name}!

Thank you for registering with Pulse News. To complete your registration, please verify your email address by visiting this link:

${data.verificationUrl}

IMPORTANT: This verification link will expire in ${data.expiryHours} hours. If you don't verify your email within this time, you'll need to register again.

If you didn't create an account with Pulse News, you can safely ignore this email.

Best regards,
The Pulse News Team

---
© 2024 Pulse News. All rights reserved.
This is an automated message, please do not reply to this email.
    `;

    return { html, text };
  }

  static generateRegistrationReceived(data: RegistrationReceivedData): { html: string; text: string } {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Registration Received - Pulse News</title>
        ${this.getBaseStyles()}
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">📰 Pulse News</div>
            <div class="subtitle">Registration Received</div>
          </div>
          <div class="content">
            <h2>Hello ${data.name}!</h2>
            <p>We've received your registration request for Pulse News. Your email address has been successfully verified!</p>
            
            <div class="alert alert-info">
              <strong>What's Next?</strong><br>
              Your registration is now pending review by our administrators. We'll notify you via email once your account has been reviewed.
            </div>
            
            <p><strong>Registration Details:</strong></p>
            <ul>
              <li><strong>Email:</strong> ${data.email}</li>
              <li><strong>Name:</strong> ${data.name}</li>
              <li><strong>Status:</strong> Pending Admin Review</li>
            </ul>
            
            <p>We typically review new registrations within 24-48 hours. Thank you for your patience!</p>
            
            <p>Best regards,<br>The Pulse News Team</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 Pulse News. All rights reserved.</p>
            <p>This is an automated message, please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Hello ${data.name}!

We've received your registration request for Pulse News. Your email address has been successfully verified!

What's Next?
Your registration is now pending review by our administrators. We'll notify you via email once your account has been reviewed.

Registration Details:
- Email: ${data.email}
- Name: ${data.name}
- Status: Pending Admin Review

We typically review new registrations within 24-48 hours. Thank you for your patience!

Best regards,
The Pulse News Team

---
© 2024 Pulse News. All rights reserved.
This is an automated message, please do not reply to this email.
    `;

    return { html, text };
  }

  static generateRegistrationApproved(data: RegistrationApprovedData): { html: string; text: string } {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Pulse News! 🎉</title>
        ${this.getBaseStyles()}
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">📰 Pulse News</div>
            <div class="subtitle">Welcome Aboard! 🎉</div>
          </div>
          <div class="content">
            <h2>Congratulations ${data.name}!</h2>
            <p>Great news! Your registration for Pulse News has been approved. Welcome to our community!</p>
            
            <div class="alert alert-success">
              <strong>🎉 Account Approved!</strong><br>
              Your account is now active and ready to use. You can log in and start exploring all the features available to you.
            </div>
            
            <div style="text-align: center;">
              <a href="${data.loginUrl}" class="btn">Login to Your Account</a>
            </div>
            
            <p><strong>Your Account Details:</strong></p>
            <ul>
              <li><strong>Email:</strong> ${data.email}</li>
              <li><strong>Name:</strong> ${data.name}</li>
              <li><strong>Role:</strong> ${data.role}</li>
              <li><strong>Status:</strong> Active</li>
            </ul>
            
            <p>You can now:</p>
            <ul>
              <li>Access your dashboard</li>
              <li>Create and manage content</li>
              <li>Collaborate with the team</li>
              <li>Explore all available features</li>
            </ul>
            
            <p>If you have any questions or need assistance getting started, don't hesitate to reach out to our support team.</p>
            
            <p>Welcome to Pulse News!</p>
            
            <p>Best regards,<br>The Pulse News Team</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 Pulse News. All rights reserved.</p>
            <p>This is an automated message, please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Congratulations ${data.name}!

Great news! Your registration for Pulse News has been approved. Welcome to our community!

🎉 ACCOUNT APPROVED!
Your account is now active and ready to use. You can log in and start exploring all the features available to you.

Login here: ${data.loginUrl}

Your Account Details:
- Email: ${data.email}
- Name: ${data.name}
- Role: ${data.role}
- Status: Active

You can now:
- Access your dashboard
- Create and manage content
- Collaborate with the team
- Explore all available features

If you have any questions or need assistance getting started, don't hesitate to reach out to our support team.

Welcome to Pulse News!

Best regards,
The Pulse News Team

---
© 2024 Pulse News. All rights reserved.
This is an automated message, please do not reply to this email.
    `;

    return { html, text };
  }

  static generateRegistrationRejected(data: RegistrationRejectedData): { html: string; text: string } {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Registration Update - Pulse News</title>
        ${this.getBaseStyles()}
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">📰 Pulse News</div>
            <div class="subtitle">Registration Update</div>
          </div>
          <div class="content">
            <h2>Hello ${data.name},</h2>
            <p>Thank you for your interest in joining Pulse News. After reviewing your registration, we're unable to approve your account at this time.</p>
            
            <div class="alert alert-danger">
              <strong>Registration Status:</strong> Not Approved
            </div>
            
            ${data.reason ? `
            <p><strong>Reason:</strong></p>
            <div class="alert alert-info">
              ${data.reason}
            </div>
            ` : ''}
            
            <p>If you believe this decision was made in error or if you have additional information that might help with your application, please feel free to contact our support team at <a href="mailto:${data.supportEmail}">${data.supportEmail}</a>.</p>
            
            <p>We appreciate your understanding and interest in Pulse News.</p>
            
            <p>Best regards,<br>The Pulse News Team</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 Pulse News. All rights reserved.</p>
            <p>This is an automated message, please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Hello ${data.name},

Thank you for your interest in joining Pulse News. After reviewing your registration, we're unable to approve your account at this time.

Registration Status: Not Approved

${data.reason ? `Reason: ${data.reason}\n\n` : ''}

If you believe this decision was made in error or if you have additional information that might help with your application, please feel free to contact our support team at ${data.supportEmail}.

We appreciate your understanding and interest in Pulse News.

Best regards,
The Pulse News Team

---
© 2024 Pulse News. All rights reserved.
This is an automated message, please do not reply to this email.
    `;

    return { html, text };
  }
}
