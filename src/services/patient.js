/**
 * Patient Service - Patient data operations
 */

export class PatientService {
    constructor(db) {
        this.db = db;
    }

    async getByPhone(phoneNumber) {
        return this.db.prepare(`SELECT * FROM patients WHERE phone_number = ?`).bind(phoneNumber).first();
    }

    async getById(patientId) {
        return this.db.prepare(`SELECT * FROM patients WHERE id = ?`).bind(patientId).first();
    }

    async getByPatientId(patientId) {
        return this.db.prepare(`SELECT * FROM patients WHERE patient_id = ?`).bind(patientId).first();
    }

    async create(data) {
        const patientId = `RPL-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

        await this.db.prepare(`
            INSERT INTO patients (phone_number, name, date_of_birth, gender, blood_group, patient_id, email, address)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            data.phoneNumber, data.name, data.dob, data.gender,
            data.bloodGroup, patientId, data.email, data.address
        ).run();

        return this.getByPhone(data.phoneNumber);
    }

    async update(id, data) {
        const fields = [];
        const values = [];

        if (data.name) { fields.push('name = ?'); values.push(data.name); }
        if (data.dob) { fields.push('date_of_birth = ?'); values.push(data.dob); }
        if (data.gender) { fields.push('gender = ?'); values.push(data.gender); }
        if (data.bloodGroup) { fields.push('blood_group = ?'); values.push(data.bloodGroup); }
        if (data.email) { fields.push('email = ?'); values.push(data.email); }
        if (data.address) { fields.push('address = ?'); values.push(data.address); }
        if (data.emergencyContact) { fields.push('emergency_contact = ?'); values.push(data.emergencyContact); }

        if (fields.length === 0) return false;

        values.push(id);
        await this.db.prepare(`UPDATE patients SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
        return true;
    }

    async getAppointments(patientId, limit = 10) {
        return this.db.prepare(`
            SELECT a.*, d.name as doctor_name, dept.name as department_name
            FROM appointments a
            LEFT JOIN doctors d ON a.doctor_id = d.id
            LEFT JOIN departments dept ON a.department_id = dept.id
            WHERE a.patient_id = ?
            ORDER BY a.appointment_date DESC, a.appointment_time DESC
            LIMIT ?
        `).bind(patientId, limit).all();
    }

    async getLabReports(patientId, limit = 10) {
        return this.db.prepare(`
            SELECT lr.*, lo.order_date
            FROM lab_reports lr
            LEFT JOIN lab_orders lo ON lr.lab_order_id = lo.id
            WHERE lr.patient_id = ?
            ORDER BY lr.report_date DESC
            LIMIT ?
        `).bind(patientId, limit).all();
    }

    async getPrescriptions(patientId, limit = 10) {
        return this.db.prepare(`
            SELECT p.*, d.name as doctor_name
            FROM prescriptions p
            LEFT JOIN doctors d ON p.doctor_id = d.id
            WHERE p.patient_id = ?
            ORDER BY p.prescription_date DESC
            LIMIT ?
        `).bind(patientId, limit).all();
    }

    async getBills(patientId, status = null) {
        let query = `SELECT * FROM bills WHERE patient_id = ?`;
        const params = [patientId];

        if (status) {
            query += ` AND payment_status = ?`;
            params.push(status);
        }
        query += ` ORDER BY bill_date DESC`;

        return this.db.prepare(query).bind(...params).all();
    }
}
