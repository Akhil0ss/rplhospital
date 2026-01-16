/**
 * Lab Report Flow - Check and download lab reports
 */

export class LabReportFlow {
    constructor(env, whatsapp, sessionManager) {
        this.env = env;
        this.db = env.DB;
        this.whatsapp = whatsapp;
        this.sessionManager = sessionManager;
    }

    async handle(message, phoneNumber, session) {
        const text = this.extractText(message);

        switch (text) {
            case 'lab_check_status':
                return this.checkStatus(phoneNumber, session);
            case 'lab_download':
                return this.showReportsToDownload(phoneNumber, session);
            case 'main_menu':
                await this.sessionManager.resetSession(session.id);
                const { MainMenuFlow } = await import('./main-menu.js');
                return new MainMenuFlow(this.env, this.whatsapp, this.sessionManager).showMenu(phoneNumber);
            default:
                if (text.startsWith('download_')) {
                    return this.downloadReport(text, phoneNumber);
                }
                return this.showLabMenu(phoneNumber);
        }
    }

    async showLabMenu(phoneNumber) {
        return this.whatsapp.sendButtonMessage(
            phoneNumber,
            '🔬 *Lab Reports*\n\nWhat would you like to do?',
            [
                { id: 'lab_check_status', title: 'Check Status' },
                { id: 'lab_download', title: 'Download Report' },
                { id: 'main_menu', title: '🏠 Main Menu' }
            ],
            'Lab Reports'
        );
    }

    async checkStatus(phoneNumber, session) {
        const patient = await this.sessionManager.getPatientByPhone(phoneNumber);

        if (!patient) {
            return this.whatsapp.sendTextMessage(phoneNumber,
                '❌ No patient record found.\n\nPlease register first or visit the hospital with your phone number.'
            );
        }

        const orders = await this.db.prepare(`
            SELECT lo.id, lo.order_date, lo.status, lo.total_amount,
                   d.name as doctor_name
            FROM lab_orders lo
            LEFT JOIN doctors d ON lo.doctor_id = d.id
            WHERE lo.patient_id = ?
            ORDER BY lo.order_date DESC LIMIT 5
        `).bind(patient.id).all();

        if (!orders.results?.length) {
            return this.whatsapp.sendTextMessage(phoneNumber,
                '📋 No lab orders found.\n\nType *menu* for more options.'
            );
        }

        let text = '🔬 *Your Recent Lab Orders*\n\n';
        for (const order of orders.results) {
            const statusEmoji = this.getStatusEmoji(order.status);
            text += `📅 *${new Date(order.order_date).toLocaleDateString('en-IN')}*\n`;
            text += `${statusEmoji} Status: ${order.status.replace('_', ' ').toUpperCase()}\n`;
            if (order.doctor_name) text += `👨‍⚕️ Dr. ${order.doctor_name}\n`;
            text += `💰 ₹${order.total_amount || 'N/A'}\n\n`;
        }

        return this.whatsapp.sendTextMessage(phoneNumber, text);
    }

    async showReportsToDownload(phoneNumber, session) {
        const patient = await this.sessionManager.getPatientByPhone(phoneNumber);

        if (!patient) {
            return this.whatsapp.sendTextMessage(phoneNumber,
                '❌ No patient record found.\n\nPlease register first.'
            );
        }

        const reports = await this.db.prepare(`
            SELECT lr.id, lr.report_number, lr.report_date, lr.report_url
            FROM lab_reports lr
            WHERE lr.patient_id = ? AND lr.status = 'ready'
            ORDER BY lr.report_date DESC LIMIT 10
        `).bind(patient.id).all();

        if (!reports.results?.length) {
            return this.whatsapp.sendTextMessage(phoneNumber,
                '📋 No reports available for download yet.\n\nReports will appear here once ready.'
            );
        }

        const rows = reports.results.map(r => ({
            id: `download_${r.id}`,
            title: r.report_number || `Report #${r.id}`,
            description: new Date(r.report_date).toLocaleDateString('en-IN')
        }));

        return this.whatsapp.sendListMessage(
            phoneNumber,
            '📥 *Download Reports*\n\nSelect a report to download:',
            'Select Report',
            [{ title: 'Available Reports', rows }]
        );
    }

    async downloadReport(text, phoneNumber) {
        const reportId = text.replace('download_', '');
        const report = await this.db.prepare(`
            SELECT * FROM lab_reports WHERE id = ?
        `).bind(reportId).first();

        if (!report || !report.report_url) {
            return this.whatsapp.sendTextMessage(phoneNumber,
                '❌ Report not available. Please contact the lab.'
            );
        }

        // Mark as delivered
        await this.db.prepare(`
            UPDATE lab_reports SET delivered_via_whatsapp = 1, delivered_at = datetime('now') WHERE id = ?
        `).bind(reportId).run();

        await this.whatsapp.sendDocumentMessage(
            phoneNumber,
            report.report_url,
            `Lab_Report_${report.report_number}.pdf`,
            '🔬 Here is your lab report. For any queries, contact our lab.'
        );

        return this.whatsapp.sendTextMessage(phoneNumber, 'Type *menu* for more options.');
    }

    getStatusEmoji(status) {
        const emojis = {
            ordered: '📝',
            sample_collected: '🧪',
            processing: '⏳',
            completed: '✅',
            cancelled: '❌'
        };
        return emojis[status] || '📋';
    }

    extractText(message) {
        if (message.type === 'text') return message.text?.body?.toLowerCase().trim() || '';
        if (message.interactive?.button_reply) return message.interactive.button_reply.id;
        if (message.interactive?.list_reply) return message.interactive.list_reply.id;
        return '';
    }
}
