/**
 * Session Management Service
 * Handles user conversation state using Cloudflare KV
 */

export class SessionService {
    constructor(kv) {
        this.kv = kv;
        this.sessionTimeout = 600000; // 10 minutes
    }

    /**
     * Get user session state
     */
    async getState(phone) {
        try {
            const key = `state_${phone}`;
            const val = await this.kv.get(key);

            if (val) {
                const state = JSON.parse(val);
                // Check if session is still valid
                if (Date.now() - state.timestamp < this.sessionTimeout) {
                    return state;
                }
            }
        } catch (error) {
            console.error("Get State Error:", error);
        }

        // Return default state
        return { step: 'start', flow: 'main-menu' };
    }

    /**
     * Set user session state
     */
    async setState(phone, state) {
        try {
            state.timestamp = Date.now();
            const key = `state_${phone}`;
            await this.kv.put(key, JSON.stringify(state), {
                expirationTtl: 3600 // 1 hour
            });
        } catch (error) {
            console.error("Set State Error:", error);
        }
    }

    /**
     * Clear user session
     */
    async clearState(phone) {
        try {
            const key = `state_${phone}`;
            await this.kv.delete(key);
        } catch (error) {
            console.error("Clear State Error:", error);
        }
    }

    /**
     * Update specific state fields
     */
    async updateState(phone, updates) {
        const currentState = await this.getState(phone);
        const newState = { ...currentState, ...updates };
        await this.setState(phone, newState);
        return newState;
    }

    /**
     * Check if session is active
     */
    async isActive(phone) {
        const state = await this.getState(phone);
        return state.step !== 'start';
    }
}
