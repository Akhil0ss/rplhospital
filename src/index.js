// src/index.js - BUILD FIXED VERSION
import { WhatsAppAPI } from './services/whatsapp.js';
import { MessageProcessor } from './services/message-processor.js';
import { SessionManager } from './services/session.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/webhook') {
      return verifyWebhook(request, env);
    }

    if (request.method === 'POST' && url.pathname === '/webhook') {
      await handleWebhook(request, env);
      return new Response('OK', { status: 200 });
    }

    return new Response('Not found', { status: 404 });
  }
};

function verifyWebhook(request, env) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
    console.log('✅ Webhook verified');
    return new Response(challenge, { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

async function handleWebhook(request, env) {
  try {
    const body = await request.json();
    
    if (!body.entry?.[0]?.changes?.[0]?.value?.messages) {
      console.log('ℹ️ No messages');
      return;
    }

    const value = body.entry[0].changes[0].value;
    const messages = value.messages;
    const contacts = value.contacts || [];

    let whatsapp, sessionManager, processor;
    
    try {
      whatsapp = new WhatsAppAPI(env);
      sessionManager = new SessionManager(env.DB);
      processor = new MessageProcessor(env, whatsapp, sessionManager);
    } catch (initError) {
      console.error('❌ Service init failed:', initError);
      for (const message of messages) {
        await sendEmergencyReply(env, message.from, "✅ RPL Hospital Bot!
Type MENU");
      }
      return;
    }

    for (const message of messages) {
      try {
        const phoneNumber = message.from;
        const contact = contacts.find(c => c.wa_id === phoneNumber);
        const senderName = contact?.profile?.name || 'User';

        console.log(`🤖 Processing: ${phoneNumber}`);

        await logMessage(env.DB, phoneNumber, 'incoming', message);
        await whatsapp.markAsRead(message.id);
        await processor.processMessage(message, phoneNumber, senderName);

      } catch (msgError) {
        console.error(`❌ Msg error ${message.from}:`, msgError);
        await sendEmergencyReply(env, message.from, "❌ Try 'menu'");
      }
    }

    if (value.statuses) {
      for (const status of value.statuses) {
        await updateMessageStatus(env.DB, status).catch(console.error);
      }
    }

  } catch (error) {
    console.error('💥 Webhook error:', error);
  }
}

async function sendEmergencyReply(env, phoneNumber, message) {
  try {
    const payload = {
      messaging_product: "whatsapp",
      to: phoneNumber,
      type: "text",
      text: { body: message }
    };

    await fetch(`https://graph.facebook.com/v20.0/${env.PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.error('Emergency reply failed:', e);
  }
}

async function logMessage(db, phoneNumber, direction, message) {
  try {
    const messageType = message.type || 'text';
    let content = message.text?.body || `[${messageType}]`;
    
    await db.prepare(`
      INSERT INTO message_logs (phone_number, direction, message_type, message_content, whatsapp_message_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(phoneNumber, direction, messageType, content, message.id).run();
  } catch (e) {
    console.error('DB log error:', e);
  }
}

async function updateMessageStatus(db, status) {
  try {
    await db.prepare(`
      UPDATE message_logs SET status = ? WHERE whatsapp_message_id = ?
    `).bind(status.status, status.id).run();
  } catch (e) {
    console.error('Status error:', e);
  }
}
