/**
 * Session Manager Service
 * Manages chat sessions and conversation state
 */

export class SessionManager {
    constructor(db) {
        this.db = db;
        this.sessionTimeout = 30 * 60 * 1000; // 30 minutes
    }

    async getSession(phoneNumber) {
        const result = await this.db.prepare(`
            SELECT * FROM chat_sessions 
            WHERE phone_number = ? AND is_active = 1
            ORDER BY last_activity DESC LIMIT 1
        `).bind(phoneNumber).first();

        if (result) {
            const lastActivity = new Date(result.last_activity).getTime();
            if (Date.now() - lastActivity > this.sessionTimeout) {
                await this.deactivateSession(result.id);
                return this.createSession(phoneNumber);
            }
            return {
                id: result.id,
                phoneNumber: result.phone_number,
                patientId: result.patient_id,
                currentState: result.current_state,
                contextData: result.context_data ? JSON.parse(result.context_data) : {},
            };
        }
        return this.createSession(phoneNumber);
    }

    async createSession(phoneNumber) {
        const patient = await this.db.prepare(
            `SELECT id FROM patients WHERE phone_number = ?`
        ).bind(phoneNumber).first();

        const result = await this.db.prepare(`
            INSERT INTO chat_sessions (phone_number, patient_id, current_state, context_data)
            VALUES (?, ?, 'main_menu', '{}') RETURNING *
        `).bind(phoneNumber, patient?.id || null).first();

        return {
            id: result.id,
            phoneNumber: result.phone_number,
            patientId: result.patient_id,
            currentState: 'main_menu',
            contextData: {},
        };
    }

    async updateSession(sessionId, state, contextData = null) {
        const contextJson = contextData ? JSON.stringify(contextData) : null;
        if (contextJson) {
            await this.db.prepare(`
                UPDATE chat_sessions SET current_state = ?, context_data = ?, last_activity = datetime('now') WHERE id = ?
            `).bind(state, contextJson, sessionId).run();
        } else {
            await this.db.prepare(`
                UPDATE chat_sessions SET current_state = ?, last_activity = datetime('now') WHERE id = ?
            `).bind(state, sessionId).run();
        }
    }

    async updateContext(sessionId, contextData) {
        await this.db.prepare(`
            UPDATE chat_sessions SET context_data = ?, last_activity = datetime('now') WHERE id = ?
        `).bind(JSON.stringify(contextData), sessionId).run();
    }

    async linkPatient(sessionId, patientId) {
        await this.db.prepare(`
            UPDATE chat_sessions SET patient_id = ? WHERE id = ?
        `).bind(patientId, sessionId).run();
    }

    async deactivateSession(sessionId) {
        await this.db.prepare(`UPDATE chat_sessions SET is_active = 0 WHERE id = ?`).bind(sessionId).run();
    }

    async resetSession(sessionId) {
        await this.db.prepare(`
            UPDATE chat_sessions SET current_state = 'main_menu', context_data = '{}' WHERE id = ?
        `).bind(sessionId).run();
    }

    async getPatientByPhone(phoneNumber) {
        return this.db.prepare(`SELECT * FROM patients WHERE phone_number = ?`).bind(phoneNumber).first();
    }
}
