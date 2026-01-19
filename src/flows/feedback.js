/**
 * Feedback Flow
 * Collects patient feedback
 */

export class FeedbackFlow {
    constructor(services) {
        this.services = services;
    }

    async handle(phone, name, message, state) {
        const step = state.step || 'start';

        if (step === 'start') {
            return {
                reply: `⭐ *फीडबैक दें*\n\n` +
                    `आपका अनुभव कैसा रहा?\n\n` +
                    `कृपया 1 से 5 के बीच रेटिंग दें:\n` +
                    `1 - बहुत खराब\n` +
                    `2 - खराब\n` +
                    `3 - ठीक\n` +
                    `4 - अच्छा\n` +
                    `5 - बहुत अच्छा`,
                newState: { step: 'get_rating', flow: 'feedback', name }
            };
        }

        if (step === 'get_rating') {
            const rating = parseInt(message.match(/[1-5]/)?.[0]);

            if (!rating || rating < 1 || rating > 5) {
                return {
                    reply: `कृपया 1 से 5 के बीच संख्या दें।`,
                    newState: state
                };
            }

            const stars = '⭐'.repeat(rating);
            return {
                reply: `धन्यवाद! आपकी रेटिंग: ${stars}\n\n` +
                    `कृपया अपना फीडबैक विस्तार से लिखें:\n` +
                    `(या "skip" लिखें छोड़ने के लिए)`,
                newState: { step: 'get_feedback', rating, flow: 'feedback', name }
            };
        }

        if (step === 'get_feedback') {
            const lower = message.toLowerCase();
            const feedbackText = lower === 'skip' ? '' : message;

            // Save feedback
            await this.services.patient.saveFeedback(phone, name, state.rating, feedbackText);

            // Notify staff
            await this.services.notification.notifyFeedback(phone, name, state.rating, feedbackText || 'कोई टिप्पणी नहीं');

            return {
                reply: `🙏 *धन्यवाद ${name}!*\n\n` +
                    `आपका फीडबैक हमारे लिए बहुत महत्वपूर्ण है।\n` +
                    `हम आपकी सेवा में सुधार के लिए प्रतिबद्ध हैं।\n\n` +
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
