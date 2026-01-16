/**
 * AI Assistant Service - Groq LLM for natural language understanding
 */

export class AIAssistant {
    constructor(env, whatsapp) {
        this.env = env;
        this.whatsapp = whatsapp;
        this.apiKey = env.GROQ_API_KEY;
        this.model = 'llama-3.1-8b-instant';
    }

    /**
     * Process natural language query
     */
    async processQuery(query, phoneNumber, context = {}) {
        if (!this.apiKey) {
            return this.fallbackResponse(query);
        }

        try {
            const systemPrompt = this.getSystemPrompt(context);
            const response = await this.callGroq(systemPrompt, query);

            if (response.intent) {
                return { intent: response.intent, entities: response.entities || {} };
            }

            return { response: response.reply || response };
        } catch (error) {
            console.error('AI Assistant error:', error);
            return this.fallbackResponse(query);
        }
    }

    getSystemPrompt(context) {
        return `You are a helpful hospital assistant for RPL Hospital. 
Your role is to understand patient queries and classify them into intents.

Available intents:
- BOOK_APPOINTMENT: Patient wants to book a doctor appointment
- CHECK_REPORTS: Patient wants to check lab reports
- VIEW_BILLS: Patient wants to see bills/payments
- DOCTOR_INFO: Patient wants doctor/department information
- EMERGENCY: Emergency related query
- PRESCRIPTION: Patient wants to see prescriptions
- HOSPITAL_INFO: General hospital information
- FEEDBACK: Patient wants to give feedback
- REGISTER: New patient registration
- GREET: Simple greeting
- UNKNOWN: Cannot determine intent

Respond in JSON format:
{
  "intent": "INTENT_NAME",
  "entities": { "department": "", "doctor": "", "date": "" },
  "reply": "Brief helpful response"
}

Patient context: ${JSON.stringify(context)}`;
    }

    async callGroq(systemPrompt, userMessage) {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.3,
                max_tokens: 200,
                response_format: { type: 'json_object' }
            }),
        });

        const data = await response.json();

        if (data.choices?.[0]?.message?.content) {
            try {
                return JSON.parse(data.choices[0].message.content);
            } catch {
                return { reply: data.choices[0].message.content };
            }
        }

        throw new Error('Invalid Groq response');
    }

    fallbackResponse(query) {
        const lower = query.toLowerCase();

        // Simple keyword matching fallback
        if (lower.includes('appointment') || lower.includes('book') || lower.includes('doctor')) {
            return { intent: 'BOOK_APPOINTMENT' };
        }
        if (lower.includes('report') || lower.includes('test') || lower.includes('lab')) {
            return { intent: 'CHECK_REPORTS' };
        }
        if (lower.includes('bill') || lower.includes('payment') || lower.includes('pay')) {
            return { intent: 'VIEW_BILLS' };
        }
        if (lower.includes('emergency') || lower.includes('urgent') || lower.includes('ambulance')) {
            return { intent: 'EMERGENCY' };
        }
        if (lower.includes('prescription') || lower.includes('medicine') || lower.includes('rx')) {
            return { intent: 'PRESCRIPTION' };
        }
        if (lower.includes('feedback') || lower.includes('complaint') || lower.includes('review')) {
            return { intent: 'FEEDBACK' };
        }
        if (lower.includes('register') || lower.includes('new patient')) {
            return { intent: 'REGISTER' };
        }
        if (lower.includes('hi') || lower.includes('hello') || lower.includes('hey')) {
            return { intent: 'GREET' };
        }

        return { intent: 'UNKNOWN' };
    }

    /**
     * Generate contextual response
     */
    async generateResponse(prompt, context = '') {
        if (!this.apiKey) return null;

        try {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        { role: 'system', content: `You are RPL Hospital assistant. Be brief and helpful. ${context}` },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.7,
                    max_tokens: 150,
                }),
            });

            const data = await response.json();
            return data.choices?.[0]?.message?.content || null;
        } catch (error) {
            console.error('Groq API error:', error);
            return null;
        }
    }
}
