/**
 * Doctor Info Flow - Doctor and department information
 */

export class DoctorInfoFlow {
    constructor(env, whatsapp, sessionManager) {
        this.env = env;
        this.db = env.DB;
        this.whatsapp = whatsapp;
        this.sessionManager = sessionManager;
    }

    async handle(message, phoneNumber, session) {
        const text = this.extractText(message);

        switch (text) {
            case 'doctor_list':
                return this.showDepartmentsForDoctors(phoneNumber, session);
            case 'dept_list':
                return this.showAllDepartments(phoneNumber);
            case 'main_menu':
                await this.sessionManager.resetSession(session.id);
                const { MainMenuFlow } = await import('./main-menu.js');
                return new MainMenuFlow(this.env, this.whatsapp, this.sessionManager).showMenu(phoneNumber);
            default:
                if (text.startsWith('doclist_')) {
                    return this.showDoctorsInDept(text, phoneNumber);
                }
                return this.showDoctorMenu(phoneNumber);
        }
    }

    async showDoctorMenu(phoneNumber) {
        return this.whatsapp.sendButtonMessage(
            phoneNumber,
            '👨‍⚕️ *Doctors & Departments*\n\nWhat would you like to know?',
            [
                { id: 'doctor_list', title: 'Find Doctors' },
                { id: 'dept_list', title: 'All Departments' },
                { id: 'main_menu', title: '🏠 Main Menu' }
            ],
            'Doctor Info'
        );
    }

    async showDepartmentsForDoctors(phoneNumber, session) {
        const depts = await this.db.prepare(`
            SELECT d.id, d.name, d.code, COUNT(doc.id) as doctor_count
            FROM departments d
            LEFT JOIN doctors doc ON d.id = doc.department_id AND doc.is_active = 1
            WHERE d.is_active = 1
            GROUP BY d.id
            ORDER BY d.name
        `).all();

        const rows = (depts.results || []).map(d => ({
            id: `doclist_${d.id}`,
            title: d.name,
            description: `${d.doctor_count} doctor(s) available`
        }));

        await this.sessionManager.updateSession(session.id, 'doctor_select_dept');

        return this.whatsapp.sendListMessage(
            phoneNumber,
            '👨‍⚕️ *Find Doctors*\n\nSelect a department to see doctors:',
            'Select Department',
            [{ title: 'Departments', rows }]
        );
    }

    async showDoctorsInDept(text, phoneNumber) {
        const deptId = text.replace('doclist_', '');

        const dept = await this.db.prepare(`SELECT * FROM departments WHERE id = ?`).bind(deptId).first();
        const doctors = await this.db.prepare(`
            SELECT * FROM doctors WHERE department_id = ? AND is_active = 1
        `).bind(deptId).all();

        if (!doctors.results?.length) {
            return this.whatsapp.sendTextMessage(phoneNumber,
                `❌ No doctors available in ${dept?.name || 'this department'}.\n\nType *menu* for more options.`
            );
        }

        let text2 = `👨‍⚕️ *${dept?.name} Doctors*\n\n`;

        for (const doc of doctors.results) {
            const days = JSON.parse(doc.available_days || '[]');
            text2 += `*${doc.name}*\n`;
            text2 += `🎓 ${doc.qualification}\n`;
            text2 += `💼 ${doc.experience_years} years exp.\n`;
            text2 += `💰 ₹${doc.consultation_fee}\n`;
            text2 += `📅 ${days.map(d => d.slice(0, 3).toUpperCase()).join(', ')}\n\n`;
        }

        text2 += `_Book appointment via main menu_`;

        return this.whatsapp.sendTextMessage(phoneNumber, text2);
    }

    async showAllDepartments(phoneNumber) {
        const depts = await this.db.prepare(`
            SELECT * FROM departments WHERE is_active = 1 ORDER BY name
        `).all();

        let text = '🏥 *Hospital Departments*\n\n';

        for (const dept of depts.results || []) {
            text += `*${dept.name}* (${dept.code})\n`;
            text += `📍 ${dept.floor_number}\n`;
            text += `⏰ ${dept.timings}\n`;
            if (dept.emergency_available) text += `🚨 Emergency Available\n`;
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
