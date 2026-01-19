/**
 * Main Menu Flow
 * Entry point for all conversations
 */

export class MainMenuFlow {
    constructor(services) {
        this.services = services;
    }

    async handle(phone, name, message, state) {
        const lower = message.toLowerCase();

        // If user is at start or wants menu
        if (state.step === 'start' || lower.match(/menu|मेनू|start|शुरू|hi|hello|नमस्ते/)) {
            return this.showMainMenu(name);
        }

        // Use AI to detect intent
        const intent = await this.services.ai.analyzeIntent(message);

        // Route to appropriate flow based on intent
        switch (intent.intent) {
            case 'appointment':
                return {
                    reply: `बिल्कुल! मैं आपकी अपॉइंटमेंट बुक करने में मदद करूंगा।`,
                    newState: { step: 'start', flow: 'appointment', name }
                };

            case 'lab_report':
                return {
                    reply: `ठीक है, मैं आपकी लैब रिपोर्ट की जानकारी देता हूँ।`,
                    newState: { step: 'start', flow: 'lab-report', name }
                };

            case 'prescription':
                return {
                    reply: `आपकी प्रिस्क्रिप्शन की जानकारी देखते हैं।`,
                    newState: { step: 'start', flow: 'prescription', name }
                };

            case 'bill':
                return {
                    reply: `आपके बिल की जानकारी देखते हैं।`,
                    newState: { step: 'start', flow: 'bill', name }
                };

            case 'doctor_info':
                return {
                    reply: `हमारे डॉक्टर्स की जानकारी देखें।`,
                    newState: { step: 'start', flow: 'doctor-info', name }
                };

            case 'feedback':
                return {
                    reply: `आपका फीडबैक हमारे लिए महत्वपूर्ण है।`,
                    newState: { step: 'start', flow: 'feedback', name }
                };

            case 'registration':
                return {
                    reply: `नए मरीज का पंजीकरण शुरू करते हैं।`,
                    newState: { step: 'start', flow: 'registration', name }
                };

            default:
                return this.showMainMenu(name);
        }
    }

    showMainMenu(name) {
        const menuText = `नमस्ते ${name}! 🏥\n\n` +
            `*RPL Hospital* में आपका स्वागत है।\n\n` +
            `मैं आपकी कैसे मदद कर सकता हूँ?\n\n` +
            `📋 *सेवाएं:*\n` +
            `1️⃣ अपॉइंटमेंट बुक करें\n` +
            `2️⃣ लैब रिपोर्ट देखें\n` +
            `3️⃣ प्रिस्क्रिप्शन देखें\n` +
            `4️⃣ बिल देखें\n` +
            `5️⃣ डॉक्टर की जानकारी\n` +
            `6️⃣ फीडबैक दें\n` +
            `7️⃣ नया पंजीकरण\n` +
            `🚨 आपातकाल\n\n` +
            `कृपया संख्या या सेवा का नाम लिखें।`;

        return {
            reply: menuText,
            newState: { step: 'waiting_selection', flow: 'main-menu', name }
        };
    }
}
