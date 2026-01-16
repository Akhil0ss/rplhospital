/**
 * WhatsApp Cloud API Service
 * Handles all WhatsApp message sending operations
 */

export class WhatsAppAPI {
    constructor(env) {
        this.accessToken = env.WHATSAPP_ACCESS_TOKEN;
        this.phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
        this.apiVersion = 'v18.0';
        this.baseUrl = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}`;
    }

    /**
     * Make API request to WhatsApp
     */
    async makeRequest(endpoint, body) {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('WhatsApp API Error:', data);
            throw new Error(data.error?.message || 'WhatsApp API request failed');
        }

        return data;
    }

    /**
     * Mark message as read
     */
    async markAsRead(messageId) {
        try {
            await this.makeRequest('/messages', {
                messaging_product: 'whatsapp',
                status: 'read',
                message_id: messageId,
            });
        } catch (error) {
            console.error('Error marking message as read:', error);
        }
    }

    /**
     * Send text message
     */
    async sendTextMessage(to, text, previewUrl = false) {
        return this.makeRequest('/messages', {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'text',
            text: {
                preview_url: previewUrl,
                body: text,
            },
        });
    }

    /**
     * Send interactive button message
     */
    async sendButtonMessage(to, bodyText, buttons, headerText = null, footerText = null) {
        const message = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'interactive',
            interactive: {
                type: 'button',
                body: {
                    text: bodyText,
                },
                action: {
                    buttons: buttons.map((btn, index) => ({
                        type: 'reply',
                        reply: {
                            id: btn.id || `btn_${index}`,
                            title: btn.title.substring(0, 20), // Max 20 chars
                        },
                    })),
                },
            },
        };

        if (headerText) {
            message.interactive.header = {
                type: 'text',
                text: headerText,
            };
        }

        if (footerText) {
            message.interactive.footer = {
                text: footerText,
            };
        }

        return this.makeRequest('/messages', message);
    }

    /**
     * Send interactive list message
     */
    async sendListMessage(to, bodyText, buttonText, sections, headerText = null, footerText = null) {
        const message = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'interactive',
            interactive: {
                type: 'list',
                body: {
                    text: bodyText,
                },
                action: {
                    button: buttonText.substring(0, 20), // Max 20 chars
                    sections: sections.map(section => ({
                        title: section.title?.substring(0, 24) || 'Options', // Max 24 chars
                        rows: section.rows.map(row => ({
                            id: row.id,
                            title: row.title.substring(0, 24), // Max 24 chars
                            description: row.description?.substring(0, 72) || '', // Max 72 chars
                        })),
                    })),
                },
            },
        };

        if (headerText) {
            message.interactive.header = {
                type: 'text',
                text: headerText,
            };
        }

        if (footerText) {
            message.interactive.footer = {
                text: footerText,
            };
        }

        return this.makeRequest('/messages', message);
    }

    /**
     * Send template message
     */
    async sendTemplateMessage(to, templateName, languageCode = 'en', components = []) {
        return this.makeRequest('/messages', {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'template',
            template: {
                name: templateName,
                language: {
                    code: languageCode,
                },
                components: components,
            },
        });
    }

    /**
     * Send image message
     */
    async sendImageMessage(to, imageUrl, caption = null) {
        const message = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'image',
            image: {
                link: imageUrl,
            },
        };

        if (caption) {
            message.image.caption = caption;
        }

        return this.makeRequest('/messages', message);
    }

    /**
     * Send document message
     */
    async sendDocumentMessage(to, documentUrl, filename, caption = null) {
        const message = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'document',
            document: {
                link: documentUrl,
                filename: filename,
            },
        };

        if (caption) {
            message.document.caption = caption;
        }

        return this.makeRequest('/messages', message);
    }

    /**
     * Send location message
     */
    async sendLocationMessage(to, latitude, longitude, name = null, address = null) {
        return this.makeRequest('/messages', {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'location',
            location: {
                latitude: latitude,
                longitude: longitude,
                name: name,
                address: address,
            },
        });
    }

    /**
     * Send contact message
     */
    async sendContactMessage(to, contacts) {
        return this.makeRequest('/messages', {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'contacts',
            contacts: contacts,
        });
    }

    /**
     * Send reaction to a message
     */
    async sendReaction(to, messageId, emoji) {
        return this.makeRequest('/messages', {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'reaction',
            reaction: {
                message_id: messageId,
                emoji: emoji,
            },
        });
    }

    /**
     * Upload media and get media ID
     */
    async uploadMedia(mediaData, mimeType) {
        const formData = new FormData();
        formData.append('messaging_product', 'whatsapp');
        formData.append('file', new Blob([mediaData], { type: mimeType }));
        formData.append('type', mimeType);

        const response = await fetch(`${this.baseUrl}/media`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
            },
            body: formData,
        });

        return response.json();
    }

    /**
     * Get media URL from media ID
     */
    async getMediaUrl(mediaId) {
        const response = await fetch(`https://graph.facebook.com/${this.apiVersion}/${mediaId}`, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
            },
        });

        return response.json();
    }

    /**
     * Download media from URL
     */
    async downloadMedia(mediaUrl) {
        const response = await fetch(mediaUrl, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
            },
        });

        return response.arrayBuffer();
    }
}
