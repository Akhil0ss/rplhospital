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

        // Show menu ONLY if explicitly requested or first time
        if (state.step === 'start' || lower.match(/^(menu|मेनू|start|शुरू)$/)) {
            return this.showMainMenu(name);
        }

        // If waiting for selection, process it
        if (state.step === 'waiting_selection') {
            return this.handleSelection(message, name);
        }

        // Default: show menu
        return this.showMainMenu(name);
    }

    handleSelection(message, name) {
        const lower = message.toLowerCase();

        // Number-based selection
        if (lower.includes('1') || lower.includes('appointment') || lower.includes('अपॉइंटमेंट')) {
            return {
                reply: `बिल्कुल! मैं आपकी अपॉइंटमेंट बुक करने में मदद करूंगा।`,
                newState: { step: 'start', flow: 'appointment', name }
            };
        }

        if (lower.includes('2') || lower.includes('lab') || lower.includes('रिपोर्ट')) {
            return {
                reply: `ठीक है, मैं आपकी लैब रिपोर्ट की जानकारी देता हूँ।`,
                newState: { step: 'start', flow: 'lab-report', name }
            };
        }

        if (lower.includes('3') || lower.includes('prescription') || lower.includes('प्रिस्क्रिप्शन') || lower.includes('दवा')) {
            return {
                reply: `आपकी प्रिस्क्रिप्शन की जानकारी देखते हैं।`,
                newState: { step: 'start', flow: 'prescription', name }
            };
        }

        if (lower.includes('4') || lower.includes('bill') || lower.includes('बिल')) {
            return {
                reply: `आपके बिल की जानकारी देखते हैं।`,
                newState: { step: 'start', flow: 'bill', name }
            };
        }

        if (lower.includes('5') || lower.includes('doctor') || lower.includes('डॉक्टर')) {
            return {
                reply: `हमारे डॉक्टर्स की जानकारी देखें।`,
                newState: { step: 'start', flow: 'doctor-info', name }
            };
        }

        if (lower.includes('6') || lower.includes('feedback') || lower.includes('फीडबैक')) {
            return {
                reply: `आपका फीडबैक हमारे लिए महत्वपूर्ण है।`,
                newState: { step: 'start', flow: 'feedback', name }
            };
        }

        if (lower.includes('7') || lower.includes('registration') || lower.includes('पंजीकरण')) {
            return {
                reply: `नए मरीज का पंजीकरण शुरू करते हैं।`,
                newState: { step: 'start', flow: 'registration', name }
            };
        }

        // Invalid selection
        return {
            reply: `कृपया 1 से 7 के बीच संख्या चुनें या सेवा का नाम लिखें।\n\n"मेनू" लिखें मुख्य मेनू देखने के लिए।`,
            newState: { step: 'waiting_selection', flow: 'main-menu', name }
        };
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
