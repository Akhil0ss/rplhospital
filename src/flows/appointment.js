/**
 * Appointment Booking Flow
 */

export class AppointmentFlow {
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
            case 'appointment_start':
                return this.showDepartmentSelection(phoneNumber);
            case 'appointment_dept':
                return this.handleDeptSelection(text, phoneNumber, session);
            case 'appointment_doctor':
                return this.handleDoctorSelection(text, phoneNumber, session);
            case 'appointment_date':
                return this.handleDateSelection(text, phoneNumber, session);
            case 'appointment_time':
                return this.handleTimeSelection(text, phoneNumber, session);
            case 'appointment_confirm':
                return this.handleConfirmation(text, phoneNumber, session);
            case 'appointment_symptoms':
                return this.handleSymptoms(text, phoneNumber, session);
            default:
                return this.showDepartmentSelection(phoneNumber);
        }
    }

    async showDepartmentSelection(phoneNumber) {
        const depts = await this.db.prepare(
            `SELECT id, name, code FROM departments WHERE is_active = 1 AND code != 'LAB' AND code != 'PHARM' ORDER BY name`
        ).all();

        const rows = (depts.results || []).map(d => ({
            id: `dept_${d.id}`,
            title: d.name,
            description: d.code
        }));

        await this.whatsapp.sendListMessage(
            phoneNumber,
            '📅 *Book Appointment*\n\nPlease select a department:',
            'Select Department',
            [{ title: 'Departments', rows }],
            'Appointment Booking'
        );

        // Update state
        const session = await this.sessionManager.getSession(phoneNumber);
        await this.sessionManager.updateSession(session.id, 'appointment_dept');
    }

    async handleDeptSelection(text, phoneNumber, session) {
        if (text === 'main_menu') {
            await this.sessionManager.resetSession(session.id);
            const { MainMenuFlow } = await import('./main-menu.js');
            return new MainMenuFlow(this.env, this.whatsapp, this.sessionManager).showMenu(phoneNumber);
        }

        const deptId = text.replace('dept_', '');
        const context = { ...session.contextData, departmentId: deptId };

        // Get doctors for department
        const doctors = await this.db.prepare(
            `SELECT id, name, specialization, consultation_fee FROM doctors WHERE department_id = ? AND is_active = 1`
        ).bind(deptId).all();

        if (!doctors.results?.length) {
            await this.whatsapp.sendTextMessage(phoneNumber, '❌ No doctors available for this department. Please try another.');
            return this.showDepartmentSelection(phoneNumber);
        }

        const rows = doctors.results.map(d => ({
            id: `doc_${d.id}`,
            title: d.name,
            description: `${d.specialization} | ₹${d.consultation_fee}`
        }));

        await this.sessionManager.updateSession(session.id, 'appointment_doctor', context);

        return this.whatsapp.sendListMessage(
            phoneNumber,
            '👨‍⚕️ *Select Doctor*\n\nChoose your preferred doctor:',
            'Select Doctor',
            [{ title: 'Available Doctors', rows }]
        );
    }

    async handleDoctorSelection(text, phoneNumber, session) {
        const docId = text.replace('doc_', '');
        const context = { ...session.contextData, doctorId: docId };

        const doctor = await this.db.prepare(`SELECT * FROM doctors WHERE id = ?`).bind(docId).first();
        if (!doctor) {
            return this.whatsapp.sendTextMessage(phoneNumber, '❌ Doctor not found. Please try again.');
        }

        // Get available days
        const availableDays = JSON.parse(doctor.available_days || '[]');
        const dates = this.getNextAvailableDates(availableDays, 5);

        const rows = dates.map((d, i) => ({
            id: `date_${d.value}`,
            title: d.display,
            description: d.day
        }));

        await this.sessionManager.updateSession(session.id, 'appointment_date', context);

        return this.whatsapp.sendListMessage(
            phoneNumber,
            `📅 *Select Date*\n\n*Doctor:* ${doctor.name}\n*Fee:* ₹${doctor.consultation_fee}\n\nChoose appointment date:`,
            'Select Date',
            [{ title: 'Available Dates', rows }]
        );
    }

    async handleDateSelection(text, phoneNumber, session) {
        const dateValue = text.replace('date_', '');
        const context = { ...session.contextData, appointmentDate: dateValue };

        const doctor = await this.db.prepare(`SELECT * FROM doctors WHERE id = ?`)
            .bind(session.contextData.doctorId).first();

        const timings = JSON.parse(doctor.available_timings || '{}');
        const dayName = new Date(dateValue).toLocaleDateString('en-US', { weekday: 'lowercase' });
        const dayTiming = timings[dayName] || { start: '09:00', end: '17:00' };

        const slots = this.generateTimeSlots(dayTiming.start, dayTiming.end);
        const rows = slots.slice(0, 10).map(s => ({
            id: `time_${s.value}`,
            title: s.display,
            description: 'Available'
        }));

        await this.sessionManager.updateSession(session.id, 'appointment_time', context);

        return this.whatsapp.sendListMessage(
            phoneNumber,
            `⏰ *Select Time*\n\n*Date:* ${new Date(dateValue).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}\n\nChoose appointment time:`,
            'Select Time',
            [{ title: 'Time Slots', rows }]
        );
    }

    async handleTimeSelection(text, phoneNumber, session) {
        const timeValue = text.replace('time_', '');
        const context = { ...session.contextData, appointmentTime: timeValue };
        await this.sessionManager.updateSession(session.id, 'appointment_symptoms', context);

        return this.whatsapp.sendTextMessage(
            phoneNumber,
            '📝 *Symptoms/Reason*\n\nPlease briefly describe your symptoms or reason for visit:\n\n(Type "skip" to proceed without)'
        );
    }

    async handleSymptoms(text, phoneNumber, session) {
        const symptoms = text === 'skip' ? null : text;
        const context = { ...session.contextData, symptoms };
        await this.sessionManager.updateSession(session.id, 'appointment_confirm', context);

        const doctor = await this.db.prepare(`SELECT name, consultation_fee FROM doctors WHERE id = ?`)
            .bind(context.doctorId).first();
        const dept = await this.db.prepare(`SELECT name FROM departments WHERE id = ?`)
            .bind(context.departmentId).first();

        const summary = `📋 *Appointment Summary*\n\n` +
            `🏥 *Department:* ${dept?.name}\n` +
            `👨‍⚕️ *Doctor:* ${doctor?.name}\n` +
            `📅 *Date:* ${new Date(context.appointmentDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}\n` +
            `⏰ *Time:* ${context.appointmentTime}\n` +
            `💰 *Fee:* ₹${doctor?.consultation_fee}\n` +
            (symptoms ? `📝 *Symptoms:* ${symptoms}\n` : '') +
            `\nConfirm booking?`;

        return this.whatsapp.sendButtonMessage(phoneNumber, summary, [
            { id: 'apt_confirm', title: '✅ Confirm' },
            { id: 'apt_cancel', title: '❌ Cancel' }
        ]);
    }

    async handleConfirmation(text, phoneNumber, session) {
        if (text === 'apt_cancel' || text === 'main_menu') {
            await this.sessionManager.resetSession(session.id);
            return this.whatsapp.sendTextMessage(phoneNumber, '❌ Appointment cancelled.');
        }

        const ctx = session.contextData;
        let patient = await this.sessionManager.getPatientByPhone(phoneNumber);

        if (!patient) {
            // Create basic patient record
            await this.db.prepare(`
                INSERT INTO patients (phone_number, patient_id) 
                VALUES (?, ?)
            `).bind(phoneNumber, `RPL-${Date.now()}`).run();
            patient = await this.sessionManager.getPatientByPhone(phoneNumber);
        }

        // Get token number
        const tokenResult = await this.db.prepare(`
            SELECT COUNT(*) + 1 as token FROM appointments 
            WHERE doctor_id = ? AND appointment_date = ? AND status != 'cancelled'
        `).bind(ctx.doctorId, ctx.appointmentDate).first();

        // Create appointment
        await this.db.prepare(`
            INSERT INTO appointments (patient_id, doctor_id, department_id, appointment_date, appointment_time, token_number, symptoms, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')
        `).bind(patient.id, ctx.doctorId, ctx.departmentId, ctx.appointmentDate, ctx.appointmentTime, tokenResult?.token || 1, ctx.symptoms).run();

        const doctor = await this.db.prepare(`SELECT name FROM doctors WHERE id = ?`).bind(ctx.doctorId).first();

        await this.sessionManager.resetSession(session.id);

        return this.whatsapp.sendTextMessage(phoneNumber,
            `✅ *Appointment Confirmed!*\n\n` +
            `🎫 *Token:* ${tokenResult?.token || 1}\n` +
            `👨‍⚕️ *Doctor:* ${doctor?.name}\n` +
            `📅 *Date:* ${new Date(ctx.appointmentDate).toLocaleDateString('en-IN')}\n` +
            `⏰ *Time:* ${ctx.appointmentTime}\n\n` +
            `📍 Please arrive 15 mins early.\n\n` +
            `Type *menu* for more options.`
        );
    }

    getNextAvailableDates(availableDays, count) {
        const dates = [];
        const dayMap = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
        const availableNums = availableDays.map(d => dayMap[d.toLowerCase()]);

        let current = new Date();
        current.setDate(current.getDate() + 1); // Start from tomorrow

        while (dates.length < count) {
            if (availableNums.includes(current.getDay())) {
                dates.push({
                    value: current.toISOString().split('T')[0],
                    display: current.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                    day: current.toLocaleDateString('en-IN', { weekday: 'long' })
                });
            }
            current.setDate(current.getDate() + 1);
        }
        return dates;
    }

    generateTimeSlots(start, end) {
        const slots = [];
        let [startH] = start.split(':').map(Number);
        let [endH] = end.split(':').map(Number);

        for (let h = startH; h < endH; h++) {
            slots.push({ value: `${h}:00`, display: `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? 'PM' : 'AM'}` });
            slots.push({ value: `${h}:30`, display: `${h > 12 ? h - 12 : h}:30 ${h >= 12 ? 'PM' : 'AM'}` });
        }
        return slots;
    }

    extractText(message) {
        if (message.type === 'text') return message.text?.body?.toLowerCase().trim() || '';
        if (message.interactive?.button_reply) return message.interactive.button_reply.id;
        if (message.interactive?.list_reply) return message.interactive.list_reply.id;
        return '';
    }
}
