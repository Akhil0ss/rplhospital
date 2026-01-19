/**
 * Emergency Flow
 * Handles emergency situations
 */

export class EmergencyFlow {
    constructor(services) {
        this.services = services;
    }

    async handle(phone, name, message, state) {
        const alert = `🚨 *आपातकालीन सूचना* 🚨\n\n` +
            `तुरंत अस्पताल आएं या फोन करें:\n` +
            `*${this.services.env.HOSPITAL_PHONE}*\n\n` +
            `📍 ${this.services.env.HOSPITAL_ADDRESS}\n\n` +
            `हम 24/7 उपलब्ध हैं।`;

        // Notify staff immediately
        await this.services.notification.notifyEmergency(phone, name, message);

        return {
            reply: alert,
            newState: { step: 'start', flow: 'main-menu', name }
        };
    }
}
