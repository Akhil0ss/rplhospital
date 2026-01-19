/**
 * Appointment Booking Flow
 * Handles complete appointment booking process
 */

const DOCTORS = {
    'akhilesh': {
        name: 'डॉ. अखिलेश कुमार कसौधन',
        specialty: 'शुगर व सामान्य रोग',
        dept: 'General',
        days: 'all',
        start: 14,
        end: 19
    },
    'ankit': {
        name: 'डॉ. अंकित शुक्ला',
        specialty: 'दिमाग व नस रोग',
        dept: 'Neurology',
        days: [15],
        start: 14,
        end: 19
    },
    'singh': {
        name: 'डॉ. ए.के. सिंह',
        specialty: 'नाक, कान, गला',
        dept: 'ENT',
        days: [1],
        start: 15,
        end: 18
    },
    'anand': {
        name: 'डॉ. आनन्द मिश्रा',
        specialty: 'दांत',
        dept: 'Dental',
        days: 'all',
        start: 15,
        end: 18
    }
};

export class AppointmentFlow {
    constructor(services) {
        this.services = services;
    }

    async handle(phone, name, message, state) {
        const step = state.step || 'start';

        switch (step) {
            case 'start':
                return this.askProblem(name, state);

            case 'get_problem':
                return await this.suggestDoctor(message, state);

            case 'select_doctor':
                return this.confirmDoctor(message, state);

            case 'select_date':
                return this.showTimeSlots(message, state);

            case 'select_time':
                return await this.confirmBooking(phone, name, message, state);

            default:
                return this.askProblem(name, state);
        }
    }

    askProblem(name, state) {
        return {
            reply: `ठीक है ${name}!\n\nआपकी क्या समस्या है? कृपया बताएं।`,
            newState: { ...state, step: 'get_problem', flow: 'appointment' }
        };
    }

    async suggestDoctor(problem, state) {
        // Use AI to suggest doctor
        const doctorsList = Object.entries(DOCTORS).map(([key, doc]) => ({
            key,
            name: doc.name,
            specialty: doc.specialty
        }));

        let suggestion = { confidence: 0 };
        try {
            suggestion = await this.services.ai.suggestDoctor(problem, doctorsList);
        } catch (e) {
            console.error("AI Doctor Suggestion Failed, falling back to keywords");
        }

        const docList = `\n\n📋 *हमारे डॉक्टर्स:*\n` +
            `1. डॉ. अखिलेश - शुगर व सामान्य रोग\n` +
            `2. डॉ. अंकित - दिमाग व नस रोग\n` +
            `3. डॉ. ए.के. सिंह - नाक, कान, गला\n` +
            `4. डॉ. आनन्द - दांत`;

        let reply = `समझ गया।`;

        if (suggestion.confidence > 0.6) {
            const suggestedDoc = DOCTORS[suggestion.suggested_doctor];
            reply += `\n\n💡 ${suggestedDoc.name} से मिलना बेहतर रहेगा।\n${suggestion.reason}`;
        } else {
            // Manual keyword fallback if AI confidence is low or failed
            const lower = problem.toLowerCase();
            if (lower.includes('sugar') || lower.includes('शुगर')) reply += `\n\n💡 डॉ. अखिलेश (शुगर विशेषज्ञ) से मिलना बेहतर रहेगा।`;
            else if (lower.includes('दिमाग') || lower.includes('sir')) reply += `\n\n💡 डॉ. अंकित (दिमाग विशेषज्ञ) से मिलना बेहतर रहेगा।`;
        }

        reply += `${docList}\n\nकिस डॉक्टर से मिलना चाहेंगे? (1-4 लिखें)`;

        return {
            reply,
            newState: { ...state, step: 'select_doctor', problem, flow: 'appointment' }
        };
    }

    confirmDoctor(message, state) {
        const docKey = this.parseDoctor(message);
        const doctor = DOCTORS[docKey];

        if (!doctor) {
            return {
                reply: `कृपया 1 से 4 के बीच संख्या चुनें।`,
                newState: state
            };
        }

        return {
            reply: `ठीक है! ${doctor.name} (${doctor.specialty}) से मिलेंगे।\n\n` +
                `कब आना चाहेंगे?\n` +
                `• "आज"\n` +
                `• "कल"\n` +
                `• या तारीख बताएं`,
            newState: { ...state, step: 'select_date', doctor: docKey, flow: 'appointment' }
        };
    }

    showTimeSlots(message, state) {
        const date = this.parseDate(message);
        const doctor = DOCTORS[state.doctor];

        // Validate doctor availability
        if (!this.isDoctorAvailable(doctor, date)) {
            let msg = `${doctor.name} `;
            if (doctor.days[0] === 15) {
                msg += `सिर्फ महीने की 15 तारीख को उपलब्ध हैं।`;
            } else if (doctor.days[0] === 1) {
                msg += `सिर्फ सोमवार को उपलब्ध हैं।`;
            }
            msg += `\n\nकोई और तारीख चुनें।`;
            return { reply: msg, newState: state };
        }

        const slots = this.generateSlots(doctor.start, doctor.end);
        const dateStr = this.formatDate(date);

        return {
            reply: `📅 तारीख: ${dateStr}\n\n` +
                `⏰ *समय चुनें:*\n` +
                slots.slice(0, 10).map((s, i) => `${i + 1}. ${s}`).join('\n') +
                `\n\nकौन सा समय? (1-10)`,
            newState: {
                ...state,
                step: 'select_time',
                date: date.toISOString().split('T')[0],
                slots,
                flow: 'appointment'
            }
        };
    }

    async confirmBooking(phone, name, message, state) {
        const slotIdx = parseInt(message.match(/\d+/)?.[0] || '1') - 1;
        const time = state.slots[slotIdx] || state.slots[0];
        const token = Math.floor(1000 + Math.random() * 9000);
        const doctor = DOCTORS[state.doctor];

        // Save to database
        try {
            await this.services.db.prepare(
                `INSERT INTO appointments (phone_number, patient_name, doctor_name, department, appointment_date, appointment_time, token_number, status, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', CURRENT_TIMESTAMP)`
            ).bind(phone, name, doctor.name, doctor.dept, state.date, time, token).run();
        } catch (error) {
            console.error("Appointment DB Error:", error);
        }

        const reply = `✅ *अपॉइंटमेंट बुक हो गई!*\n\n` +
            `👤 ${name}\n` +
            `🏥 ${doctor.name}\n` +
            `📅 ${state.date}\n` +
            `⏰ ${time}\n` +
            `🎫 टोकन: *${token}*\n\n` +
            `समय पर पहुंचें। धन्यवाद! 🙏\n\n` +
            `"मेनू" लिखें अन्य सेवाओं के लिए।`;

        // Notify staff
        await this.services.notification.notifyNewAppointment({
            patientName: name,
            phone,
            doctorName: doctor.name,
            date: state.date,
            time,
            token,
            problem: state.problem
        });

        return {
            reply,
            newState: { step: 'start', flow: 'main-menu', name }
        };
    }

    // Helper methods
    parseDoctor(text) {
        const lower = text.toLowerCase();
        if (lower.includes('1') || lower.includes('akhilesh') || lower.includes('अखिलेश')) return 'akhilesh';
        if (lower.includes('2') || lower.includes('ankit') || lower.includes('अंकित')) return 'ankit';
        if (lower.includes('3') || lower.includes('singh') || lower.includes('सिंह')) return 'singh';
        if (lower.includes('4') || lower.includes('anand') || lower.includes('आनन्द')) return 'anand';
        return 'akhilesh';
    }

    parseDate(text) {
        const lower = text.toLowerCase();
        if (lower.includes('आज') || lower.includes('aaj') || lower.includes('today')) {
            return new Date();
        }
        if (lower.includes('कल') || lower.includes('kal') || lower.includes('tomorrow')) {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            return tomorrow;
        }
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow;
    }

    isDoctorAvailable(doctor, date) {
        if (doctor.days === 'all') return true;
        if (Array.isArray(doctor.days)) {
            if (doctor.days[0] === 15) return date.getDate() === 15;
            if (doctor.days[0] === 1) return date.getDay() === 1;
        }
        return true;
    }

    generateSlots(startHour, endHour) {
        const slots = [];
        for (let h = startHour; h < endHour; h++) {
            for (let m = 0; m < 60; m += 10) {
                const period = h >= 12 ? 'PM' : 'AM';
                const displayHour = h > 12 ? h - 12 : h;
                slots.push(`${displayHour}:${m.toString().padStart(2, '0')} ${period}`);
            }
        }
        return slots;
    }

    formatDate(date) {
        const months = ['जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
        return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    }
}
