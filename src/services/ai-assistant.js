/**
 * AI Assistant Service
 * Groq AI integration for natural language understanding
 */

export class AIAssistant {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = "https://api.groq.com/openai/v1/chat/completions";
        this.model = "llama-3.1-8b-instant";
    }

    /**
     * Analyze user intent from message
     */
    async analyzeIntent(message, context = {}) {
        if (!this.apiKey) {
            return this.fallbackIntent(message);
        }

        try {
            const prompt = `You are a hospital receptionist AI. Analyze this patient message and determine their intent.

Patient Message: "${message}"

Context: ${JSON.stringify(context)}

Respond with ONLY a JSON object with these fields:
{
  "intent": "appointment|lab_report|prescription|bill|doctor_info|emergency|feedback|registration|general",
  "confidence": 0.0-1.0,
  "entities": {
    "doctor_specialty": "string or null",
    "problem": "string or null",
    "urgency": "low|medium|high"
  }
}`;

            const response = await fetch(this.baseUrl, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.3,
                    max_tokens: 200
                })
            });

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;

            if (content) {
                return JSON.parse(content);
            }
        } catch (error) {
            console.error("AI Analysis Error:", error);
        }

        return this.fallbackIntent(message);
    }

    /**
     * Suggest doctor based on problem description
     */
    async suggestDoctor(problem, doctorsList) {
        if (!this.apiKey) {
            return this.fallbackDoctorSuggestion(problem);
        }

        try {
            const prompt = `You are a medical triage assistant. Based on the patient's problem, suggest the most appropriate doctor.

Patient's Problem: "${problem}"

Available Doctors:
${doctorsList.map(d => `- ${d.name}: ${d.specialty}`).join('\n')}

Respond with ONLY a JSON object:
{
  "suggested_doctor": "doctor_key",
  "reason": "brief reason in Hindi",
  "confidence": 0.0-1.0
}`;

            const response = await fetch(this.baseUrl, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.3,
                    max_tokens: 150
                })
            });

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;

            if (content) {
                return JSON.parse(content);
            }
        } catch (error) {
            console.error("AI Doctor Suggestion Error:", error);
        }

        return this.fallbackDoctorSuggestion(problem);
    }

    /**
     * Fallback intent detection (keyword-based)
     */
    fallbackIntent(message) {
        const lower = message.toLowerCase();

        // Emergency keywords
        if (lower.match(/खून|बेहोश|एक्सीडेंट|गंभीर|blood|accident|emergency|urgent/)) {
            return { intent: "emergency", confidence: 0.9, entities: { urgency: "high" } };
        }

        // Appointment keywords
        if (lower.match(/appointment|doctor|डॉक्टर|मिलना|बुक|book/)) {
            return { intent: "appointment", confidence: 0.8, entities: { urgency: "medium" } };
        }

        // Lab report keywords
        if (lower.match(/report|रिपोर्ट|test|टेस्ट|lab|लैब/)) {
            return { intent: "lab_report", confidence: 0.8, entities: { urgency: "low" } };
        }

        // Prescription keywords
        if (lower.match(/prescription|दवा|medicine|मेडिसिन/)) {
            return { intent: "prescription", confidence: 0.8, entities: { urgency: "low" } };
        }

        // Bill keywords
        if (lower.match(/bill|बिल|payment|पेमेंट|pay|भुगतान/)) {
            return { intent: "bill", confidence: 0.8, entities: { urgency: "low" } };
        }

        return { intent: "general", confidence: 0.5, entities: { urgency: "low" } };
    }

    /**
     * Fallback doctor suggestion (keyword-based)
     */
    fallbackDoctorSuggestion(problem) {
        const p = problem.toLowerCase();

        if (p.match(/sugar|शुगर|diabetes|मधुमेह/)) {
            return { suggested_doctor: "akhilesh", reason: "शुगर के विशेषज्ञ", confidence: 0.8 };
        }
        if (p.match(/sir|सिर|head|dimag|दिमाग|brain/)) {
            return { suggested_doctor: "ankit", reason: "दिमाग व नस रोग विशेषज्ञ", confidence: 0.8 };
        }
        if (p.match(/nose|नाक|ear|कान|throat|गला/)) {
            return { suggested_doctor: "singh", reason: "नाक, कान, गला विशेषज्ञ", confidence: 0.8 };
        }
        if (p.match(/tooth|दांत|dental|teeth/)) {
            return { suggested_doctor: "anand", reason: "दांत विशेषज्ञ", confidence: 0.8 };
        }

        return { suggested_doctor: "akhilesh", reason: "सामान्य रोग विशेषज्ञ", confidence: 0.5 };
    }
}
