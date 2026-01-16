/**
 * Registration Flow - New patient registration
 */

export class RegistrationFlow {
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
            case 'registration_start':
            case 'registration_name':
                return this.handleName(text, phoneNumber, session);
            case 'registration_dob':
                return this.handleDOB(text, phoneNumber, session);
            case 'registration_gender':
                return this.handleGender(text, phoneNumber, session);
            case 'registration_blood':
                return this.handleBloodGroup(text, phoneNumber, session);
            case 'registration_confirm':
                return this.handleConfirmation(text, phoneNumber, session);
            default:
                return this.startRegistration(phoneNumber, session);
        }
    }

    async startRegistration(phoneNumber, session) {
        // Check if already registered
        const existing = await this.sessionManager.getPatientByPhone(phoneNumber);
        if (existing && existing.name) {
            return this.whatsapp.sendTextMessage(
                phoneNumber,
                `✅ You're already registered as *${existing.name}*\n\nPatient ID: ${existing.patient_id}\n\nType *menu* for options.`
            );
        }

        await this.sessionManager.updateSession(session.id, 'registration_name');
        return this.whatsapp.sendTextMessage(
            phoneNumber,
            '📝 *New Patient Registration*\n\nWelcome to RPL Hospital!\n\nPlease enter your *full name*:'
        );
    }

    async handleName(text, phoneNumber, session) {
        if (text.length < 2) {
            return this.whatsapp.sendTextMessage(phoneNumber, '❌ Please enter a valid name.');
        }

        const context = { name: text.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') };
        await this.sessionManager.updateSession(session.id, 'registration_dob', context);

        return this.whatsapp.sendTextMessage(
            phoneNumber,
            `👋 Hello *${context.name}*!\n\nPlease enter your *date of birth*:\n\n_(Format: DD/MM/YYYY or DD-MM-YYYY)_`
        );
    }

    async handleDOB(text, phoneNumber, session) {
        // Parse date
        const dateRegex = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/;
        const match = text.match(dateRegex);

        if (!match) {
            return this.whatsapp.sendTextMessage(phoneNumber, '❌ Invalid date format. Please use DD/MM/YYYY');
        }

        const [, day, month, year] = match;
        const dob = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

        const context = { ...session.contextData, dob };
        await this.sessionManager.updateSession(session.id, 'registration_gender', context);

        return this.whatsapp.sendButtonMessage(
            phoneNumber,
            '👤 *Select Gender*:',
            [
                { id: 'gender_male', title: '👨 Male' },
                { id: 'gender_female', title: '👩 Female' },
                { id: 'gender_other', title: '🧑 Other' }
            ]
        );
    }

    async handleGender(text, phoneNumber, session) {
        const genderMap = { 'gender_male': 'male', 'gender_female': 'female', 'gender_other': 'other' };
        const gender = genderMap[text] || text.replace('gender_', '');

        const context = { ...session.contextData, gender };
        await this.sessionManager.updateSession(session.id, 'registration_blood', context);

        return this.whatsapp.sendListMessage(
            phoneNumber,
            '🩸 *Select Blood Group*:\n\n_(Select "Unknown" if not sure)_',
            'Blood Group',
            [{
                title: 'Blood Groups',
                rows: [
                    { id: 'blood_apos', title: 'A+' },
                    { id: 'blood_aneg', title: 'A-' },
                    { id: 'blood_bpos', title: 'B+' },
                    { id: 'blood_bneg', title: 'B-' },
                    { id: 'blood_opos', title: 'O+' },
                    { id: 'blood_oneg', title: 'O-' },
                    { id: 'blood_abpos', title: 'AB+' },
                    { id: 'blood_abneg', title: 'AB-' },
                    { id: 'blood_unknown', title: 'Unknown' }
                ]
            }]
        );
    }

    async handleBloodGroup(text, phoneNumber, session) {
        const bloodMap = {
            'blood_apos': 'A+', 'blood_aneg': 'A-',
            'blood_bpos': 'B+', 'blood_bneg': 'B-',
            'blood_opos': 'O+', 'blood_oneg': 'O-',
            'blood_abpos': 'AB+', 'blood_abneg': 'AB-',
            'blood_unknown': null
        };

        const bloodGroup = bloodMap[text] || null;
        const context = { ...session.contextData, bloodGroup };
        await this.sessionManager.updateSession(session.id, 'registration_confirm', context);

        const summary = `📋 *Registration Summary*\n\n` +
            `👤 *Name:* ${context.name}\n` +
            `📅 *DOB:* ${new Date(context.dob).toLocaleDateString('en-IN')}\n` +
            `⚧️ *Gender:* ${context.gender}\n` +
            `🩸 *Blood Group:* ${bloodGroup || 'Not specified'}\n` +
            `📱 *Phone:* ${phoneNumber}\n\n` +
            `Is this information correct?`;

        return this.whatsapp.sendButtonMessage(phoneNumber, summary, [
            { id: 'reg_confirm', title: '✅ Confirm' },
            { id: 'reg_cancel', title: '❌ Cancel' }
        ]);
    }

    async handleConfirmation(text, phoneNumber, session) {
        if (text === 'reg_cancel') {
            await this.sessionManager.resetSession(session.id);
            return this.whatsapp.sendTextMessage(phoneNumber, '❌ Registration cancelled.\n\nType *menu* for options.');
        }

        const ctx = session.contextData;
        const patientId = `RPL-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

        // Create or update patient record
        const existing = await this.sessionManager.getPatientByPhone(phoneNumber);

        if (existing) {
            await this.db.prepare(`
                UPDATE patients SET 
                    name = ?, date_of_birth = ?, gender = ?, blood_group = ?, 
                    patient_id = ?, is_verified = 1
                WHERE phone_number = ?
            `).bind(ctx.name, ctx.dob, ctx.gender, ctx.bloodGroup, patientId, phoneNumber).run();
        } else {
            await this.db.prepare(`
                INSERT INTO patients (phone_number, name, date_of_birth, gender, blood_group, patient_id, is_verified)
                VALUES (?, ?, ?, ?, ?, ?, 1)
            `).bind(phoneNumber, ctx.name, ctx.dob, ctx.gender, ctx.bloodGroup, patientId).run();
        }

        // Link patient to session
        const patient = await this.sessionManager.getPatientByPhone(phoneNumber);
        await this.sessionManager.linkPatient(session.id, patient.id);
        await this.sessionManager.resetSession(session.id);

        return this.whatsapp.sendTextMessage(
            phoneNumber,
            `✅ *Registration Successful!*\n\n` +
            `Welcome to RPL Hospital, *${ctx.name}*!\n\n` +
            `🆔 Your Patient ID: *${patientId}*\n\n` +
            `Please save this ID for future reference.\n\n` +
            `Type *menu* to explore our services.`
        );
    }

    extractText(message) {
        if (message.type === 'text') return message.text?.body?.trim() || '';
        if (message.interactive?.button_reply) return message.interactive.button_reply.id;
        if (message.interactive?.list_reply) return message.interactive.list_reply.id;
        return '';
    }
}
