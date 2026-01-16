/**
 * Bill Flow - Check pending bills and payment history
 */

export class BillFlow {
    constructor(env, whatsapp, sessionManager) {
        this.env = env;
        this.db = env.DB;
        this.whatsapp = whatsapp;
        this.sessionManager = sessionManager;
    }

    async handle(message, phoneNumber, session) {
        const text = this.extractText(message);

        switch (text) {
            case 'bill_pending':
                return this.showPendingBills(phoneNumber);
            case 'bill_history':
                return this.showPaymentHistory(phoneNumber);
            case 'main_menu':
                await this.sessionManager.resetSession(session.id);
                const { MainMenuFlow } = await import('./main-menu.js');
                return new MainMenuFlow(this.env, this.whatsapp, this.sessionManager).showMenu(phoneNumber);
            default:
                return this.showBillMenu(phoneNumber);
        }
    }

    async showBillMenu(phoneNumber) {
        return this.whatsapp.sendButtonMessage(
            phoneNumber,
            '💰 *Bills & Payments*\n\nSelect an option:',
            [
                { id: 'bill_pending', title: 'Pending Bills' },
                { id: 'bill_history', title: 'Payment History' },
                { id: 'main_menu', title: '🏠 Main Menu' }
            ],
            'Billing'
        );
    }

    async showPendingBills(phoneNumber) {
        const patient = await this.sessionManager.getPatientByPhone(phoneNumber);

        if (!patient) {
            return this.whatsapp.sendTextMessage(phoneNumber,
                '❌ No patient record found. Please register first.'
            );
        }

        const bills = await this.db.prepare(`
            SELECT * FROM bills 
            WHERE patient_id = ? AND payment_status IN ('pending', 'partial')
            ORDER BY bill_date DESC LIMIT 10
        `).bind(patient.id).all();

        if (!bills.results?.length) {
            return this.whatsapp.sendTextMessage(phoneNumber,
                '✅ *No Pending Bills*\n\nYou have no outstanding payments.\n\nType *menu* for more options.'
            );
        }

        let text = '💰 *Pending Bills*\n\n';
        let totalDue = 0;

        for (const bill of bills.results) {
            const due = bill.net_amount - bill.paid_amount;
            totalDue += due;
            text += `📄 *${bill.bill_number}*\n`;
            text += `📅 ${new Date(bill.bill_date).toLocaleDateString('en-IN')}\n`;
            text += `💵 Total: ₹${bill.net_amount}\n`;
            text += `✅ Paid: ₹${bill.paid_amount}\n`;
            text += `⏳ Due: ₹${due}\n`;
            if (bill.due_date) text += `📆 Due by: ${new Date(bill.due_date).toLocaleDateString('en-IN')}\n`;
            text += `\n`;
        }

        text += `━━━━━━━━━━━━━━━\n`;
        text += `💳 *Total Due: ₹${totalDue}*\n\n`;
        text += `Visit the hospital billing counter or use UPI to pay.`;

        return this.whatsapp.sendTextMessage(phoneNumber, text);
    }

    async showPaymentHistory(phoneNumber) {
        const patient = await this.sessionManager.getPatientByPhone(phoneNumber);

        if (!patient) {
            return this.whatsapp.sendTextMessage(phoneNumber,
                '❌ No patient record found.'
            );
        }

        const bills = await this.db.prepare(`
            SELECT * FROM bills 
            WHERE patient_id = ? AND payment_status = 'paid'
            ORDER BY bill_date DESC LIMIT 10
        `).bind(patient.id).all();

        if (!bills.results?.length) {
            return this.whatsapp.sendTextMessage(phoneNumber,
                '📋 No payment history found.\n\nType *menu* for more options.'
            );
        }

        let text = '📊 *Payment History*\n\n';

        for (const bill of bills.results) {
            text += `✅ *${bill.bill_number}*\n`;
            text += `📅 ${new Date(bill.bill_date).toLocaleDateString('en-IN')}\n`;
            text += `💰 ₹${bill.net_amount} | ${bill.bill_type}\n`;
            if (bill.payment_method) text += `💳 ${bill.payment_method}\n`;
            text += `\n`;
        }

        return this.whatsapp.sendTextMessage(phoneNumber, text);
    }

    extractText(message) {
        if (message.type === 'text') return message.text?.body?.toLowerCase().trim() || '';
        if (message.interactive?.button_reply) return message.interactive.button_reply.id;
        if (message.interactive?.list_reply) return message.interactive.list_reply.id;
        return '';
    }
}
