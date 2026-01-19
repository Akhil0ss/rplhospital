/**
 * Patient Data Service
 * Handles all patient-related database operations
 */

export class PatientService {
    constructor(db) {
        this.db = db;
    }

    /**
     * Get or create patient record
     */
    async getOrCreatePatient(phone, name) {
        try {
            // Check if patient exists
            const existing = await this.db.prepare(
                `SELECT * FROM patients WHERE phone_number = ?`
            ).bind(phone).first();

            if (existing) {
                // Update last visit
                await this.db.prepare(
                    `UPDATE patients SET last_visit = CURRENT_TIMESTAMP, total_visits = total_visits + 1 WHERE phone_number = ?`
                ).bind(phone).run();
                return existing;
            }

            // Create new patient
            await this.db.prepare(
                `INSERT INTO patients (phone_number, name, first_visit, last_visit, total_visits) 
         VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)`
            ).bind(phone, name).run();

            return await this.db.prepare(
                `SELECT * FROM patients WHERE phone_number = ?`
            ).bind(phone).first();
        } catch (error) {
            console.error("Patient DB Error:", error);
            return null;
        }
    }

    /**
     * Get patient appointments
     */
    async getAppointments(phone, limit = 10) {
        try {
            const result = await this.db.prepare(
                `SELECT * FROM appointments WHERE phone_number = ? ORDER BY created_at DESC LIMIT ?`
            ).bind(phone, limit).all();
            return result.results || [];
        } catch (error) {
            console.error("Get Appointments Error:", error);
            return [];
        }
    }

    /**
     * Get patient lab tests
     */
    async getLabTests(phone, limit = 10) {
        try {
            const result = await this.db.prepare(
                `SELECT * FROM lab_tests WHERE phone_number = ? ORDER BY created_at DESC LIMIT ?`
            ).bind(phone, limit).all();
            return result.results || [];
        } catch (error) {
            console.error("Get Lab Tests Error:", error);
            return [];
        }
    }

    /**
     * Get patient feedback history
     */
    async getFeedback(phone) {
        try {
            const result = await this.db.prepare(
                `SELECT * FROM feedback WHERE phone_number = ? ORDER BY created_at DESC`
            ).bind(phone).all();
            return result.results || [];
        } catch (error) {
            console.error("Get Feedback Error:", error);
            return [];
        }
    }

    /**
     * Save patient feedback
     */
    async saveFeedback(phone, name, rating, feedbackText) {
        try {
            await this.db.prepare(
                `INSERT INTO feedback (phone_number, patient_name, rating, feedback_text, created_at) 
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
            ).bind(phone, name, rating, feedbackText).run();
            return true;
        } catch (error) {
            console.error("Save Feedback Error:", error);
            return false;
        }
    }

    /**
     * Get medicine reminders for patient
     */
    async getMedicineReminders(phone) {
        try {
            const result = await this.db.prepare(
                `SELECT * FROM medicine_reminders WHERE phone_number = ? AND active = 1`
            ).bind(phone).all();
            return result.results || [];
        } catch (error) {
            console.error("Get Reminders Error:", error);
            return [];
        }
    }

    /**
     * Add medicine reminder
     */
    async addMedicineReminder(phone, name, medicineName, reminderTime) {
        try {
            await this.db.prepare(
                `INSERT INTO medicine_reminders (phone_number, patient_name, medicine_name, reminder_time, active, created_at) 
         VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
         ON CONFLICT(phone_number, medicine_name) DO UPDATE SET reminder_time = ?, active = 1`
            ).bind(phone, name, medicineName, reminderTime, reminderTime).run();
            return true;
        } catch (error) {
            console.error("Add Reminder Error:", error);
            return false;
        }
    }
}
