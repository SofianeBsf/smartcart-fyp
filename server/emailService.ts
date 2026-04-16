import nodemailer from 'nodemailer';

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Custom "From" address for Resend. Default: "Pick N Take <noreply@contact.pickntake.com>"
// Override with RESEND_FROM_EMAIL env var if needed.
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Pick N Take <noreply@contact.pickntake.com>';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Determine email mode: Resend (HTTP) preferred, SMTP fallback
const emailMode: 'resend' | 'smtp' | 'none' =
  RESEND_API_KEY ? 'resend' :
  (SMTP_USER && SMTP_PASS) ? 'smtp' :
  'none';

if (emailMode === 'none') {
  console.warn(
    'Warning: Neither RESEND_API_KEY nor SMTP_USER/SMTP_PASS are set. Email functionality will be disabled.'
  );
} else {
  console.log(`[Email] Using ${emailMode} mode`);
}

// SMTP transporter (fallback for local dev)
const transporter =
  emailMode === 'smtp'
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: SMTP_USER!,
          pass: SMTP_PASS!,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      })
    : null;

/**
 * Send email via Resend HTTP API (works from cloud hosts that block SMTP)
 */
async function sendViaResend(
  to: string,
  subject: string,
  html: string,
  from?: string,
): Promise<EmailResponse> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from || `Pick N Take <${RESEND_FROM_EMAIL}>`,
        to: [to],
        subject,
        html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('[Email/Resend] API error:', res.status, data);
      // Resend free-tier 403: "You can only send testing emails to your own email address"
      const msg =
        data?.message ||
        data?.error ||
        `HTTP ${res.status}`;
      return { success: false, error: msg };
    }

    console.log('[Email/Resend] Sent to', to, '- ID:', data.id);
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error('[Email/Resend] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send email via SMTP (nodemailer)
 */
async function sendViaSMTP(
  to: string,
  subject: string,
  html: string,
  from?: string,
): Promise<EmailResponse> {
  if (!transporter) {
    return { success: false, error: 'SMTP not configured' };
  }
  try {
    const info = await transporter.sendMail({
      from: from || `Pick N Take <${SMTP_USER}>`,
      to,
      subject,
      html,
    });
    console.log('[Email/SMTP] Sent to', to, '- ID:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[Email/SMTP] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Unified email send — routes to Resend or SMTP based on config
 */
async function sendEmail(
  to: string,
  subject: string,
  html: string,
  from?: string,
): Promise<EmailResponse> {
  if (emailMode === 'resend') return sendViaResend(to, subject, html, from);
  if (emailMode === 'smtp') return sendViaSMTP(to, subject, html, from);
  console.warn('[Email] No email provider configured. Email not sent.');
  return { success: false, error: 'Email service not configured' };
}

interface EmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface OrderItem {
  title: string;
  quantity: number;
  price: number;
}

interface OrderDetails {
  orderId: string;
  items: OrderItem[];
  total: number;
}

/**
 * Sends a verification email with a clickable link
 */
export async function sendVerificationEmail(
  email: string,
  name: string,
  token: string
): Promise<EmailResponse> {
  if (emailMode === 'none') {
    console.warn('Email not configured. Verification email not sent.');
    return { success: false, error: 'Email service not configured' };
  }

  const verificationUrl = `${BASE_URL}/verify-email?token=${token}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          }
          .header {
            background: linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%);
            color: white;
            padding: 40px 20px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 32px;
            font-weight: 700;
          }
          .content {
            padding: 40px 30px;
          }
          .greeting {
            font-size: 18px;
            margin-bottom: 20px;
          }
          .message {
            color: #555;
            margin-bottom: 30px;
            font-size: 16px;
          }
          .cta-button {
            display: inline-block;
            background: linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%);
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
            text-align: center;
          }
          .cta-button:hover {
            background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);
          }
          .alternative-link {
            color: #8b5cf6;
            word-break: break-all;
            font-size: 14px;
            margin-top: 15px;
          }
          .footer {
            background-color: #f9f9f9;
            padding: 20px 30px;
            font-size: 12px;
            color: #999;
            border-top: 1px solid #eee;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Pick N Take</h1>
          </div>
          <div class="content">
            <div class="greeting">Hi ${name},</div>
            <div class="message">
              Welcome to Pick N Take! We're excited to have you on board. Please verify your email address to get started.
            </div>
            <a href="${verificationUrl}" class="cta-button">Verify Email</a>
            <div class="alternative-link">
              If the button doesn't work, copy and paste this link:<br>
              ${verificationUrl}
            </div>
            <div class="message" style="margin-top: 30px; font-size: 14px; color: #999;">
              This link will expire in 24 hours. If you didn't create this account, please ignore this email.
            </div>
          </div>
          <div class="footer">
            <p>This email was sent by Pick N Take</p>
            <p>&copy; 2026 Pick N Take. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail(email, 'Verify your Pick N Take email address', htmlContent);
}

/**
 * Sends a password reset email with a clickable link
 */
export async function sendPasswordResetEmail(
  email: string,
  name: string,
  token: string
): Promise<EmailResponse> {
  if (emailMode === 'none') {
    console.warn('Email not configured. Password reset email not sent.');
    return { success: false, error: 'Email service not configured' };
  }

  const resetUrl = `${BASE_URL}/reset-password?token=${token}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          }
          .header {
            background: linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%);
            color: white;
            padding: 40px 20px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 32px;
            font-weight: 700;
          }
          .content {
            padding: 40px 30px;
          }
          .greeting {
            font-size: 18px;
            margin-bottom: 20px;
          }
          .message {
            color: #555;
            margin-bottom: 30px;
            font-size: 16px;
          }
          .warning {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
            font-size: 14px;
            color: #856404;
          }
          .cta-button {
            display: inline-block;
            background: linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%);
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
            text-align: center;
          }
          .cta-button:hover {
            background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);
          }
          .alternative-link {
            color: #8b5cf6;
            word-break: break-all;
            font-size: 14px;
            margin-top: 15px;
          }
          .footer {
            background-color: #f9f9f9;
            padding: 20px 30px;
            font-size: 12px;
            color: #999;
            border-top: 1px solid #eee;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Pick N Take</h1>
          </div>
          <div class="content">
            <div class="greeting">Hi ${name},</div>
            <div class="message">
              We received a request to reset your Pick N Take password. Click the button below to set a new password.
            </div>
            <a href="${resetUrl}" class="cta-button">Reset Password</a>
            <div class="alternative-link">
              If the button doesn't work, copy and paste this link:<br>
              ${resetUrl}
            </div>
            <div class="warning">
              <strong>Security Notice:</strong> This link will expire in 1 hour. If you didn't request a password reset, please ignore this email or contact support if you have concerns about your account security.
            </div>
          </div>
          <div class="footer">
            <p>This email was sent by Pick N Take</p>
            <p>&copy; 2026 Pick N Take. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail(email, 'Reset your Pick N Take password', htmlContent);
}

/**
 * Sends a styled purchase confirmation email with order details
 */
export async function sendPurchaseConfirmationEmail(
  email: string,
  name: string,
  orderDetails: OrderDetails
): Promise<EmailResponse> {
  if (emailMode === 'none') {
    console.warn('Email not configured. Purchase confirmation not sent.');
    return { success: false, error: 'Email service not configured' };
  }

  const itemsHtml = orderDetails.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px 15px; border-bottom: 1px solid #eee; text-align: left;">
        ${item.title}
      </td>
      <td style="padding: 12px 15px; border-bottom: 1px solid #eee; text-align: center;">
        ${item.quantity}
      </td>
      <td style="padding: 12px 15px; border-bottom: 1px solid #eee; text-align: right;">
        &pound;${item.price.toFixed(2)}
      </td>
      <td style="padding: 12px 15px; border-bottom: 1px solid #eee; text-align: right;">
        &pound;${(item.quantity * item.price).toFixed(2)}
      </td>
    </tr>
  `
    )
    .join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          }
          .header {
            background: linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%);
            color: white;
            padding: 40px 20px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 32px;
            font-weight: 700;
          }
          .content {
            padding: 40px 30px;
          }
          .greeting {
            font-size: 18px;
            margin-bottom: 10px;
          }
          .subtitle {
            color: #8b5cf6;
            font-weight: 600;
            margin-bottom: 20px;
          }
          .order-id {
            background-color: #f0f0f0;
            padding: 15px;
            border-radius: 6px;
            margin: 20px 0;
            font-size: 14px;
          }
          .order-id strong {
            color: #333;
          }
          .table-header {
            background-color: #f9f9f9;
            border-bottom: 2px solid #8b5cf6;
          }
          .table-header th {
            padding: 12px 15px;
            text-align: left;
            font-weight: 600;
            color: #333;
          }
          .table-header th:last-child {
            text-align: right;
          }
          .total-row {
            background-color: #f9f9f9;
          }
          .total-row td {
            padding: 15px;
            font-size: 16px;
            font-weight: 600;
            text-align: right;
            border-top: 2px solid #8b5cf6;
          }
          .total-row td:first-child {
            text-align: left;
          }
          .table-content {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          .message {
            color: #555;
            margin-top: 30px;
            font-size: 14px;
          }
          .cta-button {
            display: inline-block;
            background: linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%);
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
            text-align: center;
          }
          .cta-button:hover {
            background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);
          }
          .footer {
            background-color: #f9f9f9;
            padding: 20px 30px;
            font-size: 12px;
            color: #999;
            border-top: 1px solid #eee;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Pick N Take</h1>
          </div>
          <div class="content">
            <div class="greeting">Hi ${name},</div>
            <div class="subtitle">Your order has been confirmed!</div>

            <div class="order-id">
              <strong>Order ID:</strong> ${orderDetails.orderId}
            </div>

            <p style="color: #555; margin-bottom: 10px;">Order Summary:</p>
            <table class="table-content">
              <thead class="table-header">
                <tr>
                  <th>Item</th>
                  <th>Quantity</th>
                  <th>Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
              <tfoot>
                <tr class="total-row">
                  <td colspan="3">Total:</td>
                  <td>&pound;${orderDetails.total.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>

            <div class="message">
              <p>Thank you for your purchase! We're preparing your order for shipment. You'll receive a tracking number as soon as your items ship.</p>
              <p>If you have any questions about your order, please don't hesitate to contact our customer support team.</p>
            </div>

            <a href="${BASE_URL}/orders/${orderDetails.orderId}" class="cta-button">View Order Details</a>
          </div>
          <div class="footer">
            <p>This email was sent by Pick N Take</p>
            <p>&copy; 2026 Pick N Take. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail(
    email,
    `Order Confirmation - Pick N Take Order #${orderDetails.orderId}`,
    htmlContent,
  );
}

/**
 * Sends an account deletion confirmation email with a clickable link
 */
export async function sendAccountDeletionEmail(
  email: string,
  name: string,
  token: string
): Promise<EmailResponse> {
  if (emailMode === 'none') {
    console.warn('Email not configured. Account deletion email not sent.');
    return { success: false, error: 'Email service not configured' };
  }

  const deletionUrl = `${BASE_URL}/api/auth/confirm-delete-account?token=${token}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          }
          .header {
            background: linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%);
            color: white;
            padding: 40px 20px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 32px;
            font-weight: 700;
          }
          .content {
            padding: 40px 30px;
          }
          .greeting {
            font-size: 18px;
            margin-bottom: 20px;
          }
          .message {
            color: #555;
            margin-bottom: 30px;
            font-size: 16px;
          }
          .warning {
            background-color: #fef2f2;
            border-left: 4px solid #dc2626;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
            font-size: 14px;
            color: #991b1b;
          }
          .cta-button {
            display: inline-block;
            background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
            text-align: center;
          }
          .cta-button:hover {
            background: linear-gradient(135deg, #b91c1c 0%, #dc2626 100%);
          }
          .alternative-link {
            color: #8b5cf6;
            word-break: break-all;
            font-size: 14px;
            margin-top: 15px;
          }
          .footer {
            background-color: #f9f9f9;
            padding: 20px 30px;
            font-size: 12px;
            color: #999;
            border-top: 1px solid #eee;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Pick N Take</h1>
          </div>
          <div class="content">
            <div class="greeting">Hi ${name},</div>
            <div class="message">
              We received a request to permanently delete your Pick N Take account. If you made this request, click the button below to confirm.
            </div>
            <div class="warning">
              <strong>Warning:</strong> This action is irreversible. Deleting your account will permanently remove all your data, including your order history, cart, wishlist, and profile information. This cannot be undone.
            </div>
            <a href="${deletionUrl}" class="cta-button">Confirm Deletion</a>
            <div class="alternative-link">
              If the button doesn't work, copy and paste this link:<br>
              ${deletionUrl}
            </div>
            <div class="message" style="margin-top: 30px; font-size: 14px; color: #999;">
              This link will expire in 1 hour. If you did not request account deletion, please ignore this email and your account will remain safe.
            </div>
          </div>
          <div class="footer">
            <p>This email was sent by Pick N Take</p>
            <p>&copy; 2026 Pick N Take. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail(email, 'Confirm Account Deletion - Pick N Take', htmlContent);
}
