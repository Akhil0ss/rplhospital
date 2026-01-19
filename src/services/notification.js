/**
 * Notification Service
 * Handles staff notifications and alerts
 */

export class NotificationService {
    constructor(whatsappService, env) {
        this.whatsapp = whatsappService;
        this.staffNumber = env.HOSPITAL_NOTIFICATION_NUMBER;
    }

    /**
     * Send notification to hospital staff
     */
    async notifyStaff(message) {
        if (!this.staffNumber) {
            console.warn("Staff notification number not configured");
            return;
        }

        try {
            await this.whatsapp.sendMessage(this.staffNumber, message);
        } catch (error) {
            console.error("Staff Notification Error:", error);
        }
    }

    /**
     * Notify about new appointment
     */
    async notifyNewAppointment(appointmentData) {
        const message = `📅 *नई अपॉइंटमेंट*\n\n` +
            `👤 मरीज: ${appointmentData.patientName}\n` +
            `📞 फोन: ${appointmentData.phone}\n` +
            `🏥 डॉक्टर: ${appointmentData.doctorName}\n` +
            `📅 तारीख: ${appointmentData.date}\n` +
            `⏰ समय: ${appointmentData.time}\n` +
            `🎫 टोकन: ${appointmentData.token}\n` +
            `📝 समस्या: ${appointmentData.problem || 'N/A'}`;

        await this.notifyStaff(message);
    }

    /**
     * Notify about emergency
     */
    async notifyEmergency(phone, name, message) {
        const alert = `🚨 *आपातकालीन सूचना* 🚨\n\n` +
            `👤 मरीज: ${name}\n` +
            `📞 फोन: ${phone}\n` +
            `📝 संदेश: ${message}\n\n` +
            `कृपया तुरंत संपर्क करें!`;

        await this.notifyStaff(alert);
    }

    /**
     * Notify about new patient registration
     */
    async notifyNewPatient(phone, name) {
        const message = `👤 *नया मरीज पंजीकृत*\n\n` +
            `नाम: ${name}\n` +
            `फोन: ${phone}\n` +
            `समय: ${new Date().toLocaleString('hi-IN', { timeZone: 'Asia/Kolkata' })}`;

        await this.notifyStaff(message);
    }

    /**
     * Notify about patient feedback
     */
    async notifyFeedback(phone, name, rating, feedback) {
        const stars = '⭐'.repeat(rating);
        const message = `⭐ *नया फीडबैक*\n\n` +
            `👤 मरीज: ${name}\n` +
            `📞 फोन: ${phone}\n` +
            `रेटिंग: ${stars} (${rating}/5)\n` +
            `📝 फीडबैक: ${feedback}`;

        await this.notifyStaff(message);
    }

    /**
     * Send daily summary
     */
    async sendDailySummary(stats) {
        const message = `📊 *दैनिक सारांश*\n\n` +
            `📅 अपॉइंटमेंट: ${stats.appointments}\n` +
            `🔬 लैब टेस्ट: ${stats.labTests}\n` +
            `👥 नए मरीज: ${stats.newPatients}\n` +
            `⭐ फीडबैक: ${stats.feedback}\n` +
            `💬 कुल संदेश: ${stats.messages}\n\n` +
            `तारीख: ${new Date().toLocaleDateString('hi-IN')}`;

        await this.notifyStaff(message);
    }
}
