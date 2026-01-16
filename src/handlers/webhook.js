/**
 * WhatsApp Webhook Handler
 * Handles incoming messages and webhook verification
 */

import { WhatsAppAPI } from '../services/whatsapp.js';
import { MessageProcessor } from '../services/message-processor.js';
import { SessionManager } from '../services/session.js';

/**
 * Verify webhook subscription from Meta
 */
export function verifyWebhook(request, env) {
    const url = new URL(request.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
        console.log('Webhook verified successfully');
        return new Response(challenge, { status: 200 });
    }

    console.error('Webhook verification failed');
    return new Response('Forbidden', { status: 403 });
}

/**
 * Handle incoming webhook messages
 */
export async function handleWebhook(request, env) {
    try {
        const body = await request.json();
        console.log('Webhook received:', JSON.stringify(body, null, 2));

        // Check if this is a WhatsApp message
        if (!body.entry?.[0]?.changes?.[0]?.value?.messages) {
            console.log('No messages in webhook');
            return;
        }

        const value = body.entry[0].changes[0].value;
        const messages = value.messages;
        const contacts = value.contacts;

        // Initialize services
        const whatsapp = new WhatsAppAPI(env);
        const sessionManager = new SessionManager(env.DB);
        const processor = new MessageProcessor(env, whatsapp, sessionManager);

        // Process each message
        for (const message of messages) {
            const phoneNumber = message.from;
            const contact = contacts?.find(c => c.wa_id === phoneNumber);
            const senderName = contact?.profile?.name || 'User';

            console.log(`Processing message from ${phoneNumber} (${senderName}):`, message);

            try {
                // Log incoming message
                await logMessage(env.DB, phoneNumber, 'incoming', message);

                // Mark message as read
                await whatsapp.markAsRead(message.id);

                // Process the message based on type
                await processor.processMessage(message, phoneNumber, senderName);

            } catch (error) {
                console.error(`Error processing message from ${phoneNumber}:`, error);

                // Send error message to user
                await whatsapp.sendTextMessage(
                    phoneNumber,
                    '❌ Sorry, something went wrong. Please try again or type "menu" to start over.'
                );
            }
        }

        // Handle status updates (delivered, read, etc.)
        if (value.statuses) {
            for (const status of value.statuses) {
                await updateMessageStatus(env.DB, status);
            }
        }

    } catch (error) {
        console.error('Webhook handler error:', error);
    }
}

/**
 * Log message to database
 */
async function logMessage(db, phoneNumber, direction, message) {
    const messageType = message.type || 'text';
    let content = '';

    switch (messageType) {
        case 'text':
            content = message.text?.body || '';
            break;
        case 'interactive':
            if (message.interactive?.type === 'button_reply') {
                content = `Button: ${message.interactive.button_reply.id} - ${message.interactive.button_reply.title}`;
            } else if (message.interactive?.type === 'list_reply') {
                content = `List: ${message.interactive.list_reply.id} - ${message.interactive.list_reply.title}`;
            }
            break;
        case 'image':
            content = `[Image] ${message.image?.caption || ''}`;
            break;
        case 'document':
            content = `[Document] ${message.document?.filename || ''}`;
            break;
        case 'location':
            content = `[Location] ${message.location?.latitude}, ${message.location?.longitude}`;
            break;
        default:
            content = `[${messageType}]`;
    }

    try {
        await db.prepare(`
            INSERT INTO message_logs (phone_number, direction, message_type, message_content, whatsapp_message_id)
            VALUES (?, ?, ?, ?, ?)
        `).bind(phoneNumber, direction, messageType, content, message.id).run();
    } catch (error) {
        console.error('Error logging message:', error);
    }
}

/**
 * Update message status in database
 */
async function updateMessageStatus(db, status) {
    try {
        await db.prepare(`
            UPDATE message_logs 
            SET status = ?
            WHERE whatsapp_message_id = ?
        `).bind(status.status, status.id).run();
    } catch (error) {
        console.error('Error updating message status:', error);
    }
}
