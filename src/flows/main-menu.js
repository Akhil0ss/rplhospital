/**
 * Main Menu Flow - Entry point for all conversations
 */

export class MainMenuFlow {
    constructor(env, whatsapp, sessionManager) {
        this.env = env;
        this.db = env.DB;
        this.whatsapp = whatsapp;
        this.sessionManager = sessionManager;
    }

    async handle(message, phoneNumber, senderName, session) {
        const messageText = this.extractText(message);

        // Handle button/list responses
        switch (messageText) {
            case 'book_appointment':
            case '1':
                await this.sessionManager.updateSession(session.id, 'appointment_start');
                return this.redirectToAppointment(phoneNumber, session);
            case 'check_reports':
            case '2':
                await this.sessionManager.updateSession(session.id, 'lab_menu');
                return this.redirectToLabReports(phoneNumber);
            case 'view_bills':
            case '3':
                await this.sessionManager.updateSession(session.id, 'bill_menu');
                return this.redirectToBills(phoneNumber);
            case 'doctor_info':
            case '4':
                await this.sessionManager.updateSession(session.id, 'doctor_menu');
                return this.redirectToDoctorInfo(phoneNumber);
            case 'prescription':
            case '5':
                await this.sessionManager.updateSession(session.id, 'prescription_menu');
                return this.redirectToPrescription(phoneNumber);
            case 'emergency':
            case '6':
                await this.sessionManager.updateSession(session.id, 'emergency_menu');
                return this.redirectToEmergency(phoneNumber);
            case 'hospital_info':
            case '7':
                return this.showHospitalInfo(phoneNumber);
            case 'feedback':
            case '8':
                await this.sessionManager.updateSession(session.id, 'feedback_start');
                return this.redirectToFeedback(phoneNumber);
            case 'register':
                await this.sessionManager.updateSession(session.id, 'registration_start');
                return this.redirectToRegistration(phoneNumber);
            default:
                return this.showMenu(phoneNumber, senderName);
        }
    }

    async showMenu(phoneNumber, senderName = 'there') {
        const patient = await this.sessionManager.getPatientByPhone(phoneNumber);
        const greeting = patient ? `Hello ${patient.name || senderName}! 👋` : `Hello ${senderName}! 👋`;

        const bodyText = `${greeting}\n\nWelcome to *RPL Hospital* 🏥\nYour Health, Our Priority\n\nHow can we help you today?`;

        const sections = [
            {
                title: '📋 Services',
                rows: [
                    { id: 'book_appointment', title: '📅 Book Appointment', description: 'Schedule a doctor visit' },
                    { id: 'check_reports', title: '🔬 Lab Reports', description: 'View your test results' },
                    { id: 'prescription', title: '💊 Prescriptions', description: 'View your prescriptions' },
                    { id: 'view_bills', title: '💰 Bills & Payments', description: 'Check billing details' },
                ]
            },
            {
                title: '📞 Information',
                rows: [
                    { id: 'doctor_info', title: '👨‍⚕️ Doctors & Departments', description: 'Find doctors & timings' },
                    { id: 'hospital_info', title: '🏥 Hospital Info', description: 'Location, timings & more' },
                    { id: 'emergency', title: '🚨 Emergency', description: 'Emergency contacts' },
                    { id: 'feedback', title: '⭐ Feedback', description: 'Share your experience' },
                ]
            }
        ];

        if (!patient) {
            sections[0].rows.push({ id: 'register', title: '📝 Register', description: 'New patient registration' });
        }

        return this.whatsapp.sendListMessage(
            phoneNumber,
            bodyText,
            'Select Option',
            sections,
            '🏥 RPL Hospital',
            'Reply with option number or select from menu'
        );
    }

    async redirectToAppointment(phoneNumber, session) {
        const { AppointmentFlow } = await import('./appointment.js');
        const flow = new AppointmentFlow(this.env, this.whatsapp, this.sessionManager);
        return flow.showDepartmentSelection(phoneNumber);
    }

    async redirectToLabReports(phoneNumber) {
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

    async redirectToBills(phoneNumber) {
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

    async redirectToDoctorInfo(phoneNumber) {
        return this.whatsapp.sendButtonMessage(
            phoneNumber,
            '👨‍⚕️ *Doctors & Departments*\n\nWhat would you like to know?',
            [
                { id: 'doctor_list', title: 'Find Doctors' },
                { id: 'dept_list', title: 'Departments' },
                { id: 'main_menu', title: '🏠 Main Menu' }
            ],
            'Doctor Info'
        );
    }

    async redirectToPrescription(phoneNumber) {
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

    async redirectToEmergency(phoneNumber) {
        const contacts = await this.db.prepare(
            `SELECT * FROM emergency_contacts WHERE is_active = 1 ORDER BY is_24x7 DESC LIMIT 5`
        ).all();

        let text = '🚨 *EMERGENCY CONTACTS*\n\n';
        for (const contact of contacts.results || []) {
            text += `*${contact.name}*\n📞 ${contact.phone_number}${contact.is_24x7 ? ' (24x7)' : ''}\n\n`;
        }
        text += '⚠️ For life-threatening emergencies, call 108 immediately!';

        return this.whatsapp.sendTextMessage(phoneNumber, text);
    }

    async redirectToFeedback(phoneNumber) {
        return this.whatsapp.sendButtonMessage(
            phoneNumber,
            '⭐ *Share Your Feedback*\n\nHow was your experience at RPL Hospital?',
            [
                { id: 'feedback_good', title: '😊 Good' },
                { id: 'feedback_average', title: '😐 Average' },
                { id: 'feedback_poor', title: '😞 Poor' }
            ],
            'Feedback'
        );
    }

    async redirectToRegistration(phoneNumber) {
        return this.whatsapp.sendTextMessage(
            phoneNumber,
            '📝 *New Patient Registration*\n\nPlease enter your full name:'
        );
    }

    async showHospitalInfo(phoneNumber) {
        const info = await this.db.prepare(`SELECT key, value FROM hospital_info`).all();
        const infoMap = {};
        for (const row of info.results || []) {
            infoMap[row.key] = row.value;
        }

        const text = `🏥 *${infoMap.name || 'RPL Hospital'}*\n${infoMap.tagline || ''}\n\n` +
            `📍 *Address:*\n${infoMap.address || 'N/A'}\n\n` +
            `📞 *Phone:* ${infoMap.phone || 'N/A'}\n` +
            `📧 *Email:* ${infoMap.email || 'N/A'}\n` +
            `🌐 *Website:* ${infoMap.website || 'N/A'}\n\n` +
            `⏰ *OPD Timings:* ${infoMap.opd_timings || 'N/A'}\n` +
            `🚨 *Emergency:* ${infoMap.emergency_timings || '24 Hours'}\n` +
            `👥 *Visiting Hours:* ${infoMap.visiting_hours || 'N/A'}`;

        return this.whatsapp.sendTextMessage(phoneNumber, text);
    }

    extractText(message) {
        if (message.type === 'text') return message.text?.body?.toLowerCase().trim() || '';
        if (message.interactive?.button_reply) return message.interactive.button_reply.id;
        if (message.interactive?.list_reply) return message.interactive.list_reply.id;
        return '';
    }
}
