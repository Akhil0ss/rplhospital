/**
 * Lab Report Flow
 * Handles lab report inquiries
 */

export class LabReportFlow {
    constructor(services) {
        this.services = services;
    }

    async handle(phone, name, message, state) {
        const step = state.step || 'start';

        if (step === 'start') {
            // Get patient's lab tests
            const tests = await this.services.patient.getLabTests(phone, 5);

            if (tests.length === 0) {
                return {
                    reply: `आपकी कोई लैब रिपोर्ट नहीं मिली।\n\n` +
                        `अधिक जानकारी के लिए फोन करें: ${this.services.env.HOSPITAL_PHONE}\n\n` +
                        `"मेनू" लिखें मुख्य मेनू के लिए।`,
                    newState: { step: 'start', flow: 'main-menu', name }
                };
            }

            let reply = `🔬 *आपकी लैब रिपोर्ट्स:*\n\n`;
            tests.forEach((test, idx) => {
                reply += `${idx + 1}. ${test.test_name}\n`;
                reply += `   📅 ${test.test_date}\n`;
                reply += `   स्थिति: ${this.getStatusEmoji(test.status)} ${test.status}\n\n`;
            });

            reply += `अधिक जानकारी के लिए फोन करें: ${this.services.env.HOSPITAL_PHONE}\n\n`;
            reply += `"मेनू" लिखें मुख्य मेनू के लिए।`;

            return {
                reply,
                newState: { step: 'start', flow: 'main-menu', name }
            };
        }

        return {
            reply: `"मेनू" लिखें मुख्य मेनू के लिए।`,
            newState: { step: 'start', flow: 'main-menu', name }
        };
    }

    getStatusEmoji(status) {
        const statusMap = {
            'booked': '📝',
            'processing': '⏳',
            'ready': '✅',
            'delivered': '📧'
        };
        return statusMap[status] || '📋';
    }
}
