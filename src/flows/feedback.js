/**
 * Feedback Flow - Collect patient feedback
 */

export class FeedbackFlow {
    constructor(env, whatsapp, sessionManager) {
        this.env = env;
        this.db = env.DB;
        this.whatsapp = whatsapp;
        this.sessionManager = sessionManager;
    }

    async handle(message, phoneNumber, session) {
        const text = this.extractText(message);
        const ctx = session.contextData || {};

        switch (session.currentState) {
            case 'feedback_start':
                return this.handleRating(text, phoneNumber, session);
            case 'feedback_category':
                return this.handleCategory(text, phoneNumber, session);
            case 'feedback_comment':
                return this.handleComment(text, phoneNumber, session);
            default:
                return this.showFeedbackStart(phoneNumber);
        }
    }

    async showFeedbackStart(phoneNumber) {
        return this.whatsapp.sendButtonMessage(
            phoneNumber,
            '⭐ *Share Your Feedback*\n\nHow was your overall experience at RPL Hospital?',
            [
                { id: 'feedback_5', title: '😊 Excellent' },
                { id: 'feedback_3', title: '😐 Average' },
                { id: 'feedback_1', title: '😞 Poor' }
            ],
            'Rate Us'
        );
    }

    async handleRating(text, phoneNumber, session) {
        if (text === 'main_menu') {
            await this.sessionManager.resetSession(session.id);
            const { MainMenuFlow } = await import('./main-menu.js');
            return new MainMenuFlow(this.env, this.whatsapp, this.sessionManager).showMenu(phoneNumber);
        }

        let rating = 3;
        if (text.includes('5') || text.includes('excellent') || text.includes('good')) rating = 5;
        else if (text.includes('1') || text.includes('poor') || text.includes('bad')) rating = 1;

        const context = { rating };
        await this.sessionManager.updateSession(session.id, 'feedback_category', context);

        return this.whatsapp.sendListMessage(
            phoneNumber,
            '📋 *Feedback Category*\n\nWhat aspect would you like to rate?',
            'Select Category',
            [{
                title: 'Categories',
                rows: [
                    { id: 'cat_doctor', title: '👨‍⚕️ Doctor', description: 'Doctor consultation quality' },
                    { id: 'cat_staff', title: '👩‍⚕️ Staff', description: 'Hospital staff behavior' },
                    { id: 'cat_facility', title: '🏥 Facility', description: 'Hospital facilities' },
                    { id: 'cat_overall', title: '⭐ Overall', description: 'Overall experience' }
                ]
            }]
        );
    }

    async handleCategory(text, phoneNumber, session) {
        const categoryMap = {
            'cat_doctor': 'doctor',
            'cat_staff': 'staff',
            'cat_facility': 'facility',
            'cat_overall': 'overall'
        };

        const category = categoryMap[text] || 'overall';
        const context = { ...session.contextData, category };
        await this.sessionManager.updateSession(session.id, 'feedback_comment', context);

        return this.whatsapp.sendTextMessage(
            phoneNumber,
            '💬 *Your Comments*\n\nPlease share any additional feedback or suggestions:\n\n_(Type "skip" to submit without comments)_'
        );
    }

    async handleComment(text, phoneNumber, session) {
        const ctx = session.contextData;
        const comment = text === 'skip' ? null : text;

        const patient = await this.sessionManager.getPatientByPhone(phoneNumber);

        // Save feedback
        await this.db.prepare(`
            INSERT INTO feedback (patient_id, rating, category, feedback_text)
            VALUES (?, ?, ?, ?)
        `).bind(patient?.id || null, ctx.rating, ctx.category, comment).run();

        await this.sessionManager.resetSession(session.id);

        const emoji = ctx.rating >= 4 ? '😊' : ctx.rating >= 2 ? '😐' : '😞';
        return this.whatsapp.sendTextMessage(
            phoneNumber,
            `${emoji} *Thank You for Your Feedback!*\n\nYour feedback helps us improve our services.\n\n` +
            `⭐ Rating: ${ctx.rating}/5\n` +
            `📋 Category: ${ctx.category}\n\n` +
            `We value your opinion and will work to serve you better!\n\n` +
            `Type *menu* for more options.`
        );
    }

    extractText(message) {
        if (message.type === 'text') return message.text?.body?.toLowerCase().trim() || '';
        if (message.interactive?.button_reply) return message.interactive.button_reply.id;
        if (message.interactive?.list_reply) return message.interactive.list_reply.id;
        return '';
    }
}
