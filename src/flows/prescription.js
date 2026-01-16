/**
 * Prescription Flow - View prescriptions
 */

export class PrescriptionFlow {
    constructor(env, whatsapp, sessionManager) {
        this.env = env;
        this.db = env.DB;
        this.whatsapp = whatsapp;
        this.sessionManager = sessionManager;
    }

    async handle(message, phoneNumber, session) {
        const text = this.extractText(message);

        switch (text) {
            case 'prescription_recent':
                return this.showRecentPrescription(phoneNumber);
            case 'prescription_all':
                return this.showAllPrescriptions(phoneNumber);
            case 'main_menu':
                await this.sessionManager.resetSession(session.id);
                const { MainMenuFlow } = await import('./main-menu.js');
                return new MainMenuFlow(this.env, this.whatsapp, this.sessionManager).showMenu(phoneNumber);
            default:
                if (text.startsWith('rx_')) {
                    return this.showPrescriptionDetails(text, phoneNumber);
                }
                return this.showPrescriptionMenu(phoneNumber);
        }
    }

    async showPrescriptionMenu(phoneNumber) {
        return this.whatsapp.sendButtonMessage(
            phoneNumber,
            '💊 *Prescriptions*\n\nSelect an option:',
            [
                { id: 'prescription_recent', title: 'Recent Rx' },
                { id: 'prescription_all', title: 'All Prescriptions' },
                { id: 'main_menu', title: '🏠 Main Menu' }
            ],
            'Prescriptions'
        );
    }

    async showRecentPrescription(phoneNumber) {
        const patient = await this.sessionManager.getPatientByPhone(phoneNumber);
        if (!patient) {
            return this.whatsapp.sendTextMessage(phoneNumber, '❌ No patient record found. Please register first.');
        }

        const rx = await this.db.prepare(`
            SELECT p.*, d.name as doctor_name, dept.name as dept_name
            FROM prescriptions p
            LEFT JOIN doctors d ON p.doctor_id = d.id
            LEFT JOIN departments dept ON d.department_id = dept.id
            WHERE p.patient_id = ?
            ORDER BY p.prescription_date DESC LIMIT 1
        `).bind(patient.id).first();

        if (!rx) {
            return this.whatsapp.sendTextMessage(phoneNumber, '📋 No prescriptions found.\n\nType *menu* for options.');
        }

        const items = await this.db.prepare(`
            SELECT * FROM prescription_items WHERE prescription_id = ?
        `).bind(rx.id).all();

        let text = `💊 *Prescription*\n\n`;
        text += `📋 *${rx.prescription_number || `RX-${rx.id}`}*\n`;
        text += `📅 ${new Date(rx.prescription_date).toLocaleDateString('en-IN')}\n`;
        text += `👨‍⚕️ Dr. ${rx.doctor_name}\n`;
        if (rx.diagnosis) text += `🩺 ${rx.diagnosis}\n`;
        text += `\n━━━━━━━━━━━━━━━\n\n`;
        text += `*Medicines:*\n\n`;

        for (const item of items.results || []) {
            text += `💊 *${item.medicine_name}*\n`;
            text += `   📏 ${item.dosage || 'As directed'}\n`;
            text += `   ⏰ ${item.frequency || 'As needed'}\n`;
            text += `   📅 ${item.duration || 'As advised'}\n`;
            if (item.instructions) text += `   ℹ️ ${item.instructions}\n`;
            text += `\n`;
        }

        if (rx.follow_up_date) {
            text += `\n📆 *Follow-up:* ${new Date(rx.follow_up_date).toLocaleDateString('en-IN')}`;
        }

        return this.whatsapp.sendTextMessage(phoneNumber, text);
    }

    async showAllPrescriptions(phoneNumber) {
        const patient = await this.sessionManager.getPatientByPhone(phoneNumber);
        if (!patient) {
            return this.whatsapp.sendTextMessage(phoneNumber, '❌ No patient record found.');
        }

        const prescriptions = await this.db.prepare(`
            SELECT p.*, d.name as doctor_name
            FROM prescriptions p
            LEFT JOIN doctors d ON p.doctor_id = d.id
            WHERE p.patient_id = ?
            ORDER BY p.prescription_date DESC LIMIT 10
        `).bind(patient.id).all();

        if (!prescriptions.results?.length) {
            return this.whatsapp.sendTextMessage(phoneNumber, '📋 No prescriptions found.');
        }

        const rows = prescriptions.results.map(rx => ({
            id: `rx_${rx.id}`,
            title: rx.prescription_number || `RX-${rx.id}`,
            description: `${new Date(rx.prescription_date).toLocaleDateString('en-IN')} | Dr. ${rx.doctor_name}`
        }));

        return this.whatsapp.sendListMessage(
            phoneNumber,
            '💊 *Your Prescriptions*\n\nSelect to view details:',
            'View Prescription',
            [{ title: 'Prescriptions', rows }]
        );
    }

    async showPrescriptionDetails(text, phoneNumber) {
        const rxId = text.replace('rx_', '');
        const rx = await this.db.prepare(`
            SELECT p.*, d.name as doctor_name FROM prescriptions p
            LEFT JOIN doctors d ON p.doctor_id = d.id WHERE p.id = ?
        `).bind(rxId).first();

        if (!rx) {
            return this.whatsapp.sendTextMessage(phoneNumber, '❌ Prescription not found.');
        }

        if (rx.prescription_url) {
            await this.whatsapp.sendDocumentMessage(
                phoneNumber, rx.prescription_url,
                `Prescription_${rx.prescription_number}.pdf`,
                '💊 Here is your prescription'
            );
        }

        const items = await this.db.prepare(`SELECT * FROM prescription_items WHERE prescription_id = ?`).bind(rxId).all();

        let text2 = `💊 *${rx.prescription_number}*\n👨‍⚕️ Dr. ${rx.doctor_name}\n\n`;
        for (const item of items.results || []) {
            text2 += `• ${item.medicine_name} - ${item.frequency}\n`;
        }

        return this.whatsapp.sendTextMessage(phoneNumber, text2);
    }

    extractText(message) {
        if (message.type === 'text') return message.text?.body?.toLowerCase().trim() || '';
        if (message.interactive?.button_reply) return message.interactive.button_reply.id;
        if (message.interactive?.list_reply) return message.interactive.list_reply.id;
        return '';
    }
}
