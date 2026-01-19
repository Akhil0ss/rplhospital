/**
 * Registration Flow
 * Handles new patient registration
 */

export class RegistrationFlow {
    constructor(services) {
        this.services = services;
    }

    async handle(phone, name, message, state) {
        const step = state.step || 'start';

        if (step === 'start') {
            return {
                reply: `📝 *नया पंजीकरण*\n\n` +
                    `आपका पूरा नाम बताएं:`,
                newState: { step: 'get_name', flow: 'registration', name }
            };
        }

        if (step === 'get_name') {
            return {
                reply: `आपकी उम्र बताएं:`,
                newState: { step: 'get_age', fullName: message, flow: 'registration', name }
            };
        }

        if (step === 'get_age') {
            const age = parseInt(message);
            if (!age || age < 1 || age > 120) {
                return {
                    reply: `कृपया सही उम्र बताएं।`,
                    newState: state
                };
            }

            return {
                reply: `लिंग बताएं:\n1. पुरुष\n2. महिला\n3. अन्य`,
                newState: { ...state, step: 'get_gender', age, flow: 'registration' }
            };
        }

        if (step === 'get_gender') {
            const gender = this.parseGender(message);

            return {
                reply: `पता बताएं:`,
                newState: { ...state, step: 'get_address', gender, flow: 'registration' }
            };
        }

        if (step === 'get_address') {
            // Save patient registration
            await this.services.patient.getOrCreatePatient(phone, state.fullName);

            // Notify staff
            await this.services.notification.notifyNewPatient(phone, state.fullName);

            return {
                reply: `✅ *पंजीकरण सफल!*\n\n` +
                    `👤 नाम: ${state.fullName}\n` +
                    `📞 फोन: ${phone}\n` +
                    `🎂 उम्र: ${state.age}\n` +
                    `⚧ लिंग: ${state.gender}\n` +
                    `📍 पता: ${message}\n\n` +
                    `आपका पंजीकरण हो गया है।\n` +
                    `अब आप अपॉइंटमेंट बुक कर सकते हैं।\n\n` +
                    `"appointment" लिखें अपॉइंटमेंट के लिए।\n` +
                    `"मेनू" लिखें मुख्य मेनू के लिए।`,
                newState: { step: 'start', flow: 'main-menu', name: state.fullName }
            };
        }

        return {
            reply: `"मेनू" लिखें मुख्य मेनू के लिए।`,
            newState: { step: 'start', flow: 'main-menu', name }
        };
    }

    parseGender(text) {
        const lower = text.toLowerCase();
        if (lower.includes('1') || lower.includes('male') || lower.includes('पुरुष')) return 'पुरुष';
        if (lower.includes('2') || lower.includes('female') || lower.includes('महिला')) return 'महिला';
        return 'अन्य';
    }
}
