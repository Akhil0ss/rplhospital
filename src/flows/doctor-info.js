/**
 * Doctor Info Flow
 * Provides information about doctors
 */

const DOCTORS = {
    'akhilesh': {
        name: 'डॉ. अखिलेश कुमार कसौधन',
        specialty: 'शुगर व सामान्य रोग',
        dept: 'General Medicine',
        days: 'सोमवार से शनिवार',
        timing: '2:00 PM - 7:00 PM',
        experience: '15+ वर्ष'
    },
    'ankit': {
        name: 'डॉ. अंकित शुक्ला',
        specialty: 'दिमाग व नस रोग',
        dept: 'Neurology',
        days: 'महीने की 15 तारीख',
        timing: '2:00 PM - 7:00 PM',
        experience: '10+ वर्ष'
    },
    'singh': {
        name: 'डॉ. ए.के. सिंह',
        specialty: 'नाक, कान, गला',
        dept: 'ENT',
        days: 'सोमवार',
        timing: '3:00 PM - 6:00 PM',
        experience: '20+ वर्ष'
    },
    'anand': {
        name: 'डॉ. आनन्द मिश्रा',
        specialty: 'दांत',
        dept: 'Dental',
        days: 'सोमवार से शनिवार',
        timing: '3:00 PM - 6:00 PM',
        experience: '12+ वर्ष'
    }
};

export class DoctorInfoFlow {
    constructor(services) {
        this.services = services;
    }

    async handle(phone, name, message, state) {
        const step = state.step || 'start';

        if (step === 'start') {
            const reply = `👨‍⚕️ *हमारे डॉक्टर्स*\n\n` +
                `1️⃣ डॉ. अखिलेश - शुगर व सामान्य रोग\n` +
                `2️⃣ डॉ. अंकित - दिमाग व नस रोग\n` +
                `3️⃣ डॉ. ए.के. सिंह - नाक, कान, गला\n` +
                `4️⃣ डॉ. आनन्द - दांत\n\n` +
                `किस डॉक्टर की जानकारी चाहिए? (1-4 लिखें)\n\n` +
                `या "सभी" लिखें सभी डॉक्टर्स की जानकारी के लिए।`;

            return {
                reply,
                newState: { step: 'select_doctor', flow: 'doctor-info', name }
            };
        }

        if (step === 'select_doctor') {
            const lower = message.toLowerCase();

            if (lower.includes('सभी') || lower.includes('all')) {
                return this.showAllDoctors(name);
            }

            const docKey = this.parseDoctor(message);
            const doctor = DOCTORS[docKey];

            if (!doctor) {
                return {
                    reply: `कृपया 1 से 4 के बीच संख्या चुनें।`,
                    newState: state
                };
            }

            return this.showDoctorDetails(doctor, name);
        }

        return {
            reply: `"मेनू" लिखें मुख्य मेनू के लिए।`,
            newState: { step: 'start', flow: 'main-menu', name }
        };
    }

    showDoctorDetails(doctor, name) {
        const reply = `👨‍⚕️ *${doctor.name}*\n\n` +
            `🏥 विभाग: ${doctor.dept}\n` +
            `💼 विशेषज्ञता: ${doctor.specialty}\n` +
            `📅 उपलब्धता: ${doctor.days}\n` +
            `⏰ समय: ${doctor.timing}\n` +
            `🎓 अनुभव: ${doctor.experience}\n\n` +
            `अपॉइंटमेंट बुक करने के लिए "appointment" लिखें।\n\n` +
            `"मेनू" लिखें मुख्य मेनू के लिए।`;

        return {
            reply,
            newState: { step: 'start', flow: 'main-menu', name }
        };
    }

    showAllDoctors(name) {
        let reply = `👨‍⚕️ *RPL Hospital - डॉक्टर्स की जानकारी*\n\n`;

        Object.values(DOCTORS).forEach((doctor, idx) => {
            reply += `${idx + 1}. *${doctor.name}*\n`;
            reply += `   ${doctor.specialty}\n`;
            reply += `   📅 ${doctor.days}\n`;
            reply += `   ⏰ ${doctor.timing}\n\n`;
        });

        reply += `अपॉइंटमेंट बुक करने के लिए "appointment" लिखें।\n\n`;
        reply += `"मेनू" लिखें मुख्य मेनू के लिए।`;

        return {
            reply,
            newState: { step: 'start', flow: 'main-menu', name }
        };
    }

    parseDoctor(text) {
        const lower = text.toLowerCase();
        if (lower.includes('1') || lower.includes('akhilesh') || lower.includes('अखिलेश')) return 'akhilesh';
        if (lower.includes('2') || lower.includes('ankit') || lower.includes('अंकित')) return 'ankit';
        if (lower.includes('3') || lower.includes('singh') || lower.includes('सिंह')) return 'singh';
        if (lower.includes('4') || lower.includes('anand') || lower.includes('आनन्द')) return 'anand';
        return 'akhilesh';
    }
}
