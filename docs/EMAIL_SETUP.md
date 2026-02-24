# Email Configuration Guide

This guide explains how to set up email notifications for the Pulse News server, including Gmail SMTP configuration and troubleshooting common issues.

## Quick Setup (Gmail)

1. **Copy environment variables**:
   ```bash
   cp .env.example .env
   ```

2. **Update your `.env` file**:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USERNAME=your-email@gmail.com
   SMTP_PASSWORD=your-app-password
   SITE_BASE_URL=http://localhost:3001
   SUPPORT_EMAIL=your-email@gmail.com
   ```

3. **Generate Gmail App Password**:
   - Go to [Google Account Settings](https://myaccount.google.com/)
   - Security → 2-Step Verification → App passwords
   - Generate a new app password for "Mail"
   - Use this password in `SMTP_PASSWORD` (not your regular Gmail password)

## Supported Email Providers

### Gmail (Recommended)
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
```

### Outlook/Hotmail
```env
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
```

### Yahoo Mail
```env
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=587
```

### Custom SMTP Server
```env
SMTP_HOST=your-smtp-server.com
SMTP_PORT=587  # or 465 for SSL
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SMTP_HOST` | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP server port | `587` (TLS) or `465` (SSL) |
| `SMTP_USERNAME` | Your email address | `your-email@gmail.com` |
| `SMTP_PASSWORD` | App password or email password | `abcd efgh ijkl mnop` |
| `SITE_BASE_URL` | Base URL for verification links | `http://localhost:3001` |
| `SUPPORT_EMAIL` | Support contact email | `support@your-domain.com` |

## Email Workflow

The system sends emails for these events:

1. **Registration Request Received** - Confirms user submitted registration
2. **Registration Approved** - Notifies user their request was approved
3. **Email Verification** - Contains verification link for account activation
4. **Registration Rejected** - Notifies user their request was rejected
5. **Account Activated** - Confirms successful email verification

## Troubleshooting

### Common Issues

#### 1. DNS Resolution Error
```
Error: getaddrinfo ENOTFOUND cms-news.gmail.com
```
**Solution**: Update `SMTP_HOST` to a valid hostname:
```env
# ❌ Invalid
SMTP_HOST=cms-news.gmail.com

# ✅ Correct
SMTP_HOST=smtp.gmail.com
```

#### 2. Authentication Failed
```
Error: Invalid login: 535-5.7.8 Username and Password not accepted
```
**Solutions**:
- Use an App Password instead of your regular Gmail password
- Enable 2-Step Verification in your Google Account
- Generate a new App Password specifically for this application

#### 3. Connection Timeout
```
Error: Connection timeout
```
**Solutions**:
- Check your firewall settings
- Verify the SMTP port (587 for TLS, 465 for SSL)
- Try a different network connection

#### 4. Base URL Issues
```
Verification links not working
```
**Solution**: Ensure `SITE_BASE_URL` matches your development/production URL:
```env
# Development
SITE_BASE_URL=http://localhost:3001

# Production
SITE_BASE_URL=https://your-domain.com
```

### Testing Email Configuration

#### Option 1: Manual Test Script (Recommended)

Run the built-in email test script:

```bash
npx ts-node src/test-email.ts
```

This script will:
- ✅ Verify email configuration
- ✅ Test SMTP connection
- ✅ Send test emails for all registration workflow steps
- ✅ Provide detailed error diagnostics

#### Option 2: Server Integration Test

1. **Start the server**:
   ```bash
   npm run dev
   ```

2. **Check server logs** for email configuration status:
   ```
   ✅ SMTP connection verified successfully for smtp.gmail.com:587
   ```

3. **Test registration workflow**:
   - Submit a registration request via admin panel
   - Admin approves the request
   - Check server logs for email sending status
   - Check your email inbox for notifications

### Disabling Email Notifications

If you want to disable email notifications temporarily:

1. **Via Environment Variable**:
   ```env
   # Comment out or remove SMTP_HOST
   # SMTP_HOST=smtp.gmail.com
   ```

2. **Via Admin Settings** (if available):
   - Go to Settings → Email
   - Disable "Email Notifications"

## Security Best Practices

1. **Use App Passwords**: Never use your main email password
2. **Environment Variables**: Keep sensitive data in `.env` files
3. **Git Ignore**: Ensure `.env` is in your `.gitignore`
4. **Rotate Passwords**: Regularly update app passwords
5. **Limit Permissions**: Use dedicated email accounts for applications

## Production Deployment

For production environments:

1. **Use Environment Variables**:
   ```bash
   export SMTP_HOST=smtp.gmail.com
   export SMTP_USERNAME=your-email@gmail.com
   export SMTP_PASSWORD=your-app-password
   export SITE_BASE_URL=https://your-domain.com
   ```

2. **Use Secrets Management**:
   - AWS Secrets Manager
   - Azure Key Vault
   - Google Secret Manager
   - HashiCorp Vault

3. **Monitor Email Delivery**:
   - Set up logging and monitoring
   - Track email delivery rates
   - Monitor for bounces and failures

## Support

If you continue to experience email issues:

1. Check the server logs for detailed error messages
2. Verify your email provider's SMTP settings
3. Test with a different email provider
4. Contact your system administrator

For Gmail-specific issues, refer to [Google's SMTP documentation](https://support.google.com/mail/answer/7126229).
