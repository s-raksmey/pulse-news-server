#!/usr/bin/env node
// Test script to manually verify email configuration
// Usage: npx ts-node src/test-email.ts

import { EmailService } from './services/emailService';

async function testEmailConfiguration() {
  console.log('🧪 Testing email configuration...\n');

  try {
    // Test 1: Check email configuration
    console.log('1️⃣ Testing email configuration...');
    const config = await EmailService.getEmailConfig();
    if (!config) {
      console.log('❌ No email configuration found');
      return;
    }
    console.log('✅ Email configuration loaded:');
    console.log(`   Host: ${config.host}:${config.port}`);
    console.log(`   From: ${config.fromName} <${config.fromAddress}>`);
    console.log(`   Notifications: ${config.notificationsEnabled ? 'Enabled' : 'Disabled'}\n`);

    // Test 2: Check transporter
    console.log('2️⃣ Testing SMTP connection...');
    const transporter = await EmailService.getTransporter();
    if (!transporter) {
      console.log('❌ Failed to create email transporter');
      return;
    }
    console.log('✅ SMTP transporter created successfully\n');

    // Test 3: Send test email
    console.log('3️⃣ Sending test email...');
    const testEmail = process.env.SMTP_USERNAME || 'test@example.com';
    
    await EmailService.sendNotificationEmail({
      to: testEmail,
      subject: '🧪 Pulse News Email Test',
      text: 'This is a test email from Pulse News server. If you receive this, email configuration is working correctly!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #007bff;">🧪 Pulse News Email Test</h2>
          <p>This is a test email from Pulse News server.</p>
          <p><strong>If you receive this, email configuration is working correctly!</strong></p>
          <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3>Configuration Details:</h3>
            <ul>
              <li>SMTP Host: ${config.host}:${config.port}</li>
              <li>From Address: ${config.fromAddress}</li>
              <li>Test Time: ${new Date().toISOString()}</li>
            </ul>
          </div>
          <p style="color: #6c757d; font-size: 14px;">
            This email was sent automatically by the Pulse News email test script.
          </p>
        </div>
      `
    });

    console.log('✅ Test email sent successfully!');
    console.log(`📬 Check your inbox at: ${testEmail}\n`);

    // Test 4: Test registration workflow emails
    console.log('4️⃣ Testing registration workflow emails...');
    
    // Registration received
    await EmailService.sendRegistrationReceived(testEmail, {
      name: 'Test User',
      email: testEmail,
    });
    console.log('✅ Registration received email sent');

    // Registration approved
    const baseUrl = await EmailService.getBaseUrl();
    await EmailService.sendRegistrationApproved(testEmail, {
      name: 'Test User',
      email: testEmail,
      loginUrl: `${baseUrl}/login`,
      role: 'USER',
    });
    console.log('✅ Registration approved email sent');

    // Email verification
    await EmailService.sendEmailVerification(testEmail, {
      name: 'Test User',
      verificationUrl: `${baseUrl}/verify-email?code=TEST123&email=${encodeURIComponent(testEmail)}`,
      expiryHours: 24,
    });
    console.log('✅ Email verification email sent');

    console.log('\n🎉 All email tests completed successfully!');
    console.log('📧 Check your email inbox for the test messages.');

  } catch (error) {
    console.error('\n❌ Email test failed:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('getaddrinfo ENOTFOUND')) {
        console.log('\n💡 DNS Resolution Error - Check your SMTP_HOST setting');
      } else if (error.message.includes('Invalid login')) {
        console.log('\n💡 Authentication Error - Check your SMTP_USERNAME and SMTP_PASSWORD');
      } else if (error.message.includes('Connection timeout')) {
        console.log('\n💡 Connection Timeout - Check your network and SMTP_PORT setting');
      }
    }
  }
}

// Run the test
testEmailConfiguration().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Test script failed:', error);
  process.exit(1);
});
