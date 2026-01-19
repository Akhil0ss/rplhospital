/**
 * Bill Flow
 * Handles billing inquiries
 */

export class BillFlow {
    constructor(services) {
        this.services = services;
    }

    async handle(phone, name, message, state) {
        // For now, provide contact information
        // In future, integrate with billing system

        const reply = `💰 *बिल की जानकारी*\n\n` +
            `अपने बिल की जानकारी के लिए कृपया फोन करें:\n` +
            `📞 ${this.services.env.HOSPITAL_PHONE}\n\n` +
            `या अस्पताल में रिसेप्शन पर संपर्क करें।\n\n` +
            `📍 ${this.services.env.HOSPITAL_ADDRESS}\n\n` +
            `"मेनू" लिखें मुख्य मेनू के लिए।`;

        return {
            reply,
            newState: { step: 'start', flow: 'main-menu', name }
        };
    }
}
