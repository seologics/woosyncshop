// Receives AWS SNS notifications for SES bounces, complaints and deliveries.
// Setup: SES → Configuration Sets → Event Destinations → SNS → this endpoint.
// SNS first sends a SubscriptionConfirmation — we auto-confirm it.
// Then on every bounce/complaint/delivery it sends a Notification.

import { createClient } from '@supabase/supabase-js';

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const messageType = req.headers.get('x-amz-sns-message-type') || body?.Type;

  // ── Auto-confirm SNS subscription ────────────────────────────────────────
  if (messageType === 'SubscriptionConfirmation') {
    const confirmUrl = body.SubscribeURL;
    if (confirmUrl) {
      await fetch(confirmUrl); // GET to confirm
    }
    return new Response('Confirmed', { status: 200 });
  }

  // ── Handle notification ───────────────────────────────────────────────────
  if (messageType !== 'Notification') {
    return new Response('Ignored', { status: 200 });
  }

  let sesMessage;
  try {
    sesMessage = typeof body.Message === 'string' ? JSON.parse(body.Message) : body.Message;
  } catch {
    return new Response('Could not parse SES message', { status: 400 });
  }

  const notifType = sesMessage?.notificationType; // 'Bounce' | 'Complaint' | 'Delivery'
  if (!notifType) return new Response('No notificationType', { status: 200 });

  const supabase = createClient(
    Netlify.env.get('SUPABASE_URL'),
    Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  );

  const timestamp = new Date().toISOString();

  if (notifType === 'Bounce') {
    const bounce     = sesMessage.bounce || {};
    const bounceType = bounce.bounceType;       // 'Permanent' | 'Transient' | 'Undetermined'
    const subType    = bounce.bounceSubType;    // 'General' | 'NoEmail' | 'Suppressed' etc.
    const recipients = (bounce.bouncedRecipients || []).map(r => r.emailAddress).join(', ');
    const source     = sesMessage.mail?.source || 'unknown';
    const subject    = sesMessage.mail?.commonHeaders?.subject || '(no subject)';
    const msgId      = sesMessage.mail?.messageId || null;

    await supabase.from('system_logs').insert({
      level:   bounceType === 'Permanent' ? 'error' : 'warn',
      action:  'email-bounce',
      message: `${bounceType} bounce (${subType}) → ${recipients}`,
      details: JSON.stringify({
        bounceType, subType, recipients, source, subject, messageId: msgId,
        diagnosticCodes: (bounce.bouncedRecipients || []).map(r => r.diagnosticCode),
        timestamp: bounce.timestamp,
      }),
      created_at: timestamp,
    });
  } else if (notifType === 'Complaint') {
    const complaint  = sesMessage.complaint || {};
    const recipients = (complaint.complainedRecipients || []).map(r => r.emailAddress).join(', ');
    const source     = sesMessage.mail?.source || 'unknown';
    const subject    = sesMessage.mail?.commonHeaders?.subject || '(no subject)';

    await supabase.from('system_logs').insert({
      level:   'warn',
      action:  'email-complaint',
      message: `Spam complaint from ${recipients}`,
      details: JSON.stringify({
        complaintFeedbackType: complaint.complaintFeedbackType,
        recipients, source, subject,
        timestamp: complaint.timestamp,
      }),
      created_at: timestamp,
    });
  } else if (notifType === 'DeliveryDelay') {
    const delay      = sesMessage.deliveryDelay || {};
    const recipients = (delay.delayedRecipients || []).map(r => r.emailAddress).join(', ');
    const source     = sesMessage.mail?.source || 'unknown';
    const subject    = sesMessage.mail?.commonHeaders?.subject || '(no subject)';

    await supabase.from('system_logs').insert({
      level:   'warn',
      action:  'email-delay',
      message: `Delivery delay (${delay.delayType || 'unknown'}) → ${recipients}`,
      details: JSON.stringify({
        delayType: delay.delayType,
        expirationTime: delay.expirationTime,
        recipients, source, subject,
        diagnosticCodes: (delay.delayedRecipients || []).map(r => r.diagnosticCode),
        timestamp: delay.timestamp,
      }),
      created_at: timestamp,
    });
  } else if (notifType === 'Delivery') {
    const delivery   = sesMessage.delivery || {};
    const recipients = (delivery.recipients || []).join(', ');
    const source     = sesMessage.mail?.source || 'unknown';

    await supabase.from('system_logs').insert({
      level:   'info',
      action:  'email-delivery',
      message: `Delivered to ${recipients} via ${delivery.smtpResponse || 'unknown'}`,
      details: JSON.stringify({
        recipients, source,
        processingTimeMillis: delivery.processingTimeMillis,
        reportingMTA: delivery.reportingMTA,
        smtpResponse: delivery.smtpResponse,
        timestamp: delivery.timestamp,
      }),
      created_at: timestamp,
    });
  }

  return new Response('OK', { status: 200 });
};

export const config = { path: '/api/ses-notification' };
