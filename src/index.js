/**
 * RPL Hospital WhatsApp Bot - MAIN ENTRY POINT
 * All existing features preserved + webhook stream error FIXED
 */

import { WhatsAppAPI } from './services/whatsapp.js';
import { MessageProcessor } from './services/message-processor.js';
import { SessionManager } from './services/session.js';

/**
 * Main fetch handler - STREAM ERROR FIXED
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ✅ GET: Webhook verification (unchanged)
    if (request.method === 'GET' && url.pathname === '/webhook') {
      return verifyWebhook(request, env);
    }

    // 🔥 POST: Webhook messages - FIXED SEQUENCE
    if (request.method === 'POST' && url.pathname === '/webhook') {
      await handleWebhook(request, env);  // Process FIRST
      return new Response('OK', { status: 200 });  // Reply LAST ✅
    }

    // All other routes unchanged
    return new Response('Not found', { status: 404 });
  }
};

/**
 * Verify webhook subscription from Meta - UNCHANGED
 */
function verifyWebhook(request, env) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
    console.log('✅ Webhook verified successfully');
    return new Response(challenge, { status: 200 });
  }

  console.error('❌ Webhook verification failed');
  return new Response('Forbidden', { status: 403 });
}

/**
 * Handle incoming webhook messages - FIXED: NO EARLY RETURN
 */
async function handleWebhook(request, env) {
  try {
    // 1️⃣ READ BODY FIRST (critical fix)
    const body = await request.json();
    console.log('📨 Webhook received:', JSON.stringify(body, null, 2));

    // Check if WhatsApp message exists
    if (!body.entry?.[0]?.changes?.[0]?.value?.messages) {
      console.log('ℹ️ No messages in webhook');
      return;
    }

    const value = body.entry[0].changes[0].value;
    const messages = value.messages;
    const contacts = value.contacts;

    // Initialize ALL existing services
    const whatsapp = new WhatsAppAPI(env);
    const sessionManager = new SessionManager(env.DB);
    const processor = new MessageProcessor(env, whatsapp, sessionManager);

    // Process EVERY message (unchanged logic)
    for (const message of messages) {
      const phoneNumber = message.from;
      const contact = contacts?.find(c => c.wa_id === phoneNumber);
      const senderName = contact?.profile?.name || 'User';

      console.log(`🤖 Processing: ${phoneNumber} (${senderName})`);

      try {
        // All existing features preserved
        await logMessage(env.DB, phoneNumber, 'incoming', message);
        await whatsapp.markAsRead(message.id);
        await processor.processMessage(message, phoneNumber, senderName);

      } catch (error) {
        console.error(`❌ Error ${phoneNumber}:`, error);
        await whatsapp.sendTextMessage(
          phoneNumber,
          '❌ Sorry, something went wrong. Type "menu" to restart.'
        );
      }
    }

    // Status updates (unchanged)
    if (value.statuses) {
      for (const status of value.statuses) {
        await updateMessageStatus(env.DB, status);
      }
    }

  } catch (error) {
    console.error('💥 Webhook handler error:', error);
  }
  // ✅ NO Response return - main fetch handles it
}

/**
 * Log message to D1 DB - UNCHANGED
 */
async function logMessage(db, phoneNumber, direction, message) {
  const messageType = message.type || 'text';
  let content = '';

  switch (messageType) {
    case 'text': content = message.text?.body || ''; break;
    case 'interactive':
      if (message.interactive?.type === 'button_reply') {
        content = `Button: ${message.interactive.button_reply.id}`;
      } else if (message.interactive?.type === 'list_reply') {
        content = `List: ${message.interactive.list_reply.id}`;
      }
      break;
    case 'image': content = `[Image] ${message.image?.caption || ''}`; break;
    case 'document': content = `[Document] ${message.document?.filename || ''}`; break;
    case 'location': content = `[Location] ${message.location?.latitude}`; break;
    default: content = `[${messageType}]`;
  }

  try {
    await db.prepare(`
      INSERT INTO message_logs (phone_number, direction, message_type, message_content, whatsapp_message_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(phoneNumber, direction, messageType, content, message.id).run();
  } catch (error) {
    console.error('DB log error:', error);
  }
}

/**
 * Update message status - UNCHANGED
 */
async function updateMessageStatus(db, status) {
  try {
    await db.prepare(`
      UPDATE message_logs SET status = ? WHERE whatsapp_message_id = ?
    `).bind(status.status, status.id).run();
  } catch (error) {
    console.error('Status update error:', error);
  }
}
