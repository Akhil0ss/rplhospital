/**
 * Emergency Flow - Emergency contacts and information
 */

export class EmergencyFlow {
    constructor(env, whatsapp, sessionManager) {
        this.env = env;
        this.db = env.DB;
        this.whatsapp = whatsapp;
        this.sessionManager = sessionManager;
    }

    async handle(message, phoneNumber, session) {
        const text = this.extractText(message);

        if (text === 'main_menu') {
            await this.sessionManager.resetSession(session.id);
            const { MainMenuFlow } = await import('./main-menu.js');
            return new MainMenuFlow(this.env, this.whatsapp, this.sessionManager).showMenu(phoneNumber);
        }

        return this.showEmergencyContacts(phoneNumber);
    }

    async showEmergencyContacts(phoneNumber) {
        const contacts = await this.db.prepare(`
            SELECT * FROM emergency_contacts WHERE is_active = 1 ORDER BY is_24x7 DESC, name
        `).all();

        let text = '🚨 *EMERGENCY CONTACTS*\n\n';
        text += '⚠️ *For life-threatening emergencies, call 108 immediately!*\n\n';
        text += '━━━━━━━━━━━━━━━\n\n';

        for (const contact of contacts.results || []) {
            text += `*${contact.name}*\n`;
            text += `📞 ${contact.phone_number}`;
            if (contact.is_24x7) text += ` _(24x7)_`;
            text += `\n`;
            if (contact.description) text += `ℹ️ ${contact.description}\n`;
            text += `\n`;
        }

        text += '━━━━━━━━━━━━━━━\n';
        text += '🏥 *RPL Hospital Emergency Ward*\n';
        text += '📍 Ground Floor, available 24x7\n\n';
        text += '_Type *menu* for more options_';

        await this.whatsapp.sendTextMessage(phoneNumber, text);

        // Also send hospital location (Dumariyaganj, Siddharthnagar coordinates)
        await this.whatsapp.sendLocationMessage(
            phoneNumber,
            27.2418, // Dumariyaganj latitude
            83.1313, // Dumariyaganj longitude
            'RPL Hospital Emergency',
            'Baidaula Chauraha, Bansi Road, Dumariyaganj, Siddharthnagar'
        );
    }

    extractText(message) {
        if (message.type === 'text') return message.text?.body?.toLowerCase().trim() || '';
        if (message.interactive?.button_reply) return message.interactive.button_reply.id;
        if (message.interactive?.list_reply) return message.interactive.list_reply.id;
        return '';
    }
}
