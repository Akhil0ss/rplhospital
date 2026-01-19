/**
 * Prescription Flow
 * Handles prescription inquiries
 */

export class PrescriptionFlow {
    constructor(services) {
        this.services = services;
    }

    async handle(phone, name, message, state) {
        const step = state.step || 'start';

        if (step === 'start') {
            // Get patient's medicine reminders (as proxy for prescriptions)
            const reminders = await this.services.patient.getMedicineReminders(phone);

            if (reminders.length === 0) {
                return {
                    reply: `आपकी कोई प्रिस्क्रिप्शन रिकॉर्ड नहीं मिली।\n\n` +
                        `अधिक जानकारी के लिए फोन करें: ${this.services.env.HOSPITAL_PHONE}\n\n` +
                        `"मेनू" लिखें मुख्य मेनू के लिए।`,
                    newState: { step: 'start', flow: 'main-menu', name }
                };
            }

            let reply = `💊 *आपकी दवाइयां:*\n\n`;
            reminders.forEach((reminder, idx) => {
                reply += `${idx + 1}. ${reminder.medicine_name}\n`;
                reply += `   ⏰ समय: ${reminder.reminder_time}\n\n`;
            });

            reply += `📝 नई दवा याद दिलाने के लिए "दवा जोड़ें" लिखें।\n\n`;
            reply += `"मेनू" लिखें मुख्य मेनू के लिए।`;

            return {
                reply,
                newState: { step: 'show_options', flow: 'prescription', name }
            };
        }

        if (step === 'show_options') {
            const lower = message.toLowerCase();

            if (lower.includes('दवा') || lower.includes('add') || lower.includes('जोड़')) {
                return {
                    reply: `दवा का नाम बताएं:`,
                    newState: { step: 'get_medicine_name', flow: 'prescription', name }
                };
            }

            return {
                reply: `"मेनू" लिखें मुख्य मेनू के लिए।`,
                newState: { step: 'start', flow: 'main-menu', name }
            };
        }

        if (step === 'get_medicine_name') {
            return {
                reply: `दवा लेने का समय बताएं (जैसे: "सुबह 8 बजे"):`,
                newState: { step: 'get_reminder_time', medicine: message, flow: 'prescription', name }
            };
        }

        if (step === 'get_reminder_time') {
            // Save reminder
            await this.services.patient.addMedicineReminder(phone, name, state.medicine, message);

            return {
                reply: `✅ दवा याद दिलाने वाला जोड़ दिया गया!\n\n` +
                    `💊 ${state.medicine}\n` +
                    `⏰ ${message}\n\n` +
                    `"मेनू" लिखें मुख्य मेनू के लिए।`,
                newState: { step: 'start', flow: 'main-menu', name }
            };
        }

        return {
            reply: `"मेनू" लिखें मुख्य मेनू के लिए।`,
            newState: { step: 'start', flow: 'main-menu', name }
        };
    }
}
