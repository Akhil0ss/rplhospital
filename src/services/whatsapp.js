/**
 * WhatsApp API Service
 * Handles all WhatsApp Business API interactions
 */

export class WhatsAppService {
    constructor(env) {
        this.env = env;
        this.phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
        this.accessToken = env.WHATSAPP_ACCESS_TOKEN;
        this.baseUrl = `https://graph.facebook.com/v20.0/${this.phoneNumberId}`;
    }

    /**
     * Send a text message
     */
    async sendMessage(to, text) {
        try {
            const response = await fetch(`${this.baseUrl}/messages`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    messaging_product: "whatsapp",
                    to: to,
                    type: "text",
                    text: { body: text }
                })
            });

            const data = await response.json();
            if (!response.ok) {
                console.error("WhatsApp API Error:", data);
                throw new Error(data.error?.message || "Failed to send message");
            }
            return data;
        } catch (error) {
            console.error("Send Message Error:", error);
            throw error;
        }
    }

    /**
     * Send an interactive list message
     */
    async sendListMessage(to, bodyText, buttonText, sections) {
        try {
            const response = await fetch(`${this.baseUrl}/messages`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    messaging_product: "whatsapp",
                    to: to,
                    type: "interactive",
                    interactive: {
                        type: "list",
                        body: { text: bodyText },
                        action: {
                            button: buttonText,
                            sections: sections
                        }
                    }
                })
            });

            const data = await response.json();
            if (!response.ok) {
                console.error("WhatsApp List Error:", data);
                throw new Error(data.error?.message || "Failed to send list");
            }
            return data;
        } catch (error) {
            console.error("Send List Error:", error);
            throw error;
        }
    }

    /**
     * Send interactive buttons
     */
    async sendButtons(to, bodyText, buttons) {
        try {
            const response = await fetch(`${this.baseUrl}/messages`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    messaging_product: "whatsapp",
                    to: to,
                    type: "interactive",
                    interactive: {
                        type: "button",
                        body: { text: bodyText },
                        action: {
                            buttons: buttons.map((btn, idx) => ({
                                type: "reply",
                                reply: {
                                    id: btn.id || `btn_${idx}`,
                                    title: btn.title
                                }
                            }))
                        }
                    }
                })
            });

            const data = await response.json();
            if (!response.ok) {
                console.error("WhatsApp Buttons Error:", data);
                throw new Error(data.error?.message || "Failed to send buttons");
            }
            return data;
        } catch (error) {
            console.error("Send Buttons Error:", error);
            throw error;
        }
    }

    /**
     * Mark message as read
     */
    async markAsRead(messageId) {
        try {
            await fetch(`${this.baseUrl}/messages`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    messaging_product: "whatsapp",
                    status: "read",
                    message_id: messageId
                })
            });
        } catch (error) {
            console.error("Mark Read Error:", error);
        }
    }

    /**
     * Send document/PDF
     */
    async sendDocument(to, documentUrl, filename, caption = "") {
        try {
            const response = await fetch(`${this.baseUrl}/messages`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    messaging_product: "whatsapp",
                    to: to,
                    type: "document",
                    document: {
                        link: documentUrl,
                        filename: filename,
                        caption: caption
                    }
                })
            });

            const data = await response.json();
            if (!response.ok) {
                console.error("WhatsApp Document Error:", data);
                throw new Error(data.error?.message || "Failed to send document");
            }
            return data;
        } catch (error) {
            console.error("Send Document Error:", error);
            throw error;
        }
    }
}
