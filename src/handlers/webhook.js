/**
 * Webhook Handler
 * Handles incoming WhatsApp webhook events
 */

import { MessageProcessor } from '../services/message-processor.js';

export class WebhookHandler {
    constructor(services) {
        this.services = services;
        this.processor = new MessageProcessor(services);
    }

    /**
     * Handle GET request for webhook verification
     */
    handleVerification(url) {
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        if (mode === "subscribe" && token === this.services.env.WHATSAPP_VERIFY_TOKEN) {
            console.log("Webhook verified successfully");
            return new Response(challenge, { status: 200 });
        }

        console.log("Webhook verification failed");
        return new Response("Forbidden", { status: 403 });
    }

    /**
     * Handle POST request for incoming messages
     */
    async handleIncoming(request, ctx) {
        try {
            const body = await request.json();

            // Extract messages and contacts
            const entry = body.entry?.[0];
            const changes = entry?.changes?.[0];
            const value = changes?.value;

            const messages = value?.messages || [];
            const contacts = value?.contacts || [];

            if (messages.length > 0) {
                // Process messages asynchronously
                ctx.waitUntil(this.processMessages(messages, contacts));
            }

            return new Response("OK", { status: 200 });
        } catch (error) {
            console.error("Webhook Error:", error);
            return new Response("Error", { status: 500 });
        }
    }

    /**
     * Process incoming messages
     */
    async processMessages(messages, contacts) {
        for (const msg of messages) {
            // Only process text messages for now
            if (msg.type !== "text") {
                console.log(`Skipping non-text message: ${msg.type}`);
                continue;
            }

            const from = msg.from;
            const text = msg.text.body.trim();
            const msgId = msg.id;

            // Get contact name
            const contact = contacts.find(c => c.wa_id === from);
            const name = contact?.profile?.name || "मरीज";

            try {
                await this.processor.processMessage(from, name, text, msgId);
            } catch (error) {
                console.error(`Error processing message from ${from}:`, error);

                // Send error message to user
                try {
                    await this.services.whatsapp.sendMessage(
                        from,
                        `माफ़ करें, तकनीकी समस्या है। कृपया फोन करें: ${this.services.env.HOSPITAL_PHONE}`
                    );
                } catch (sendError) {
                    console.error("Failed to send error message:", sendError);
                }
            }
        }
    }
}
