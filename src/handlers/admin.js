/**
 * Admin API Handler
 * Handles admin dashboard API requests
 */

export class AdminHandler {
    constructor(services) {
        this.services = services;
    }

    /**
     * Handle admin API requests
     */
    async handle(request, url) {
        const path = url.pathname;

        // Simple auth check (in production, use proper authentication)
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        try {
            if (path === '/api/admin/stats') {
                return await this.getStats();
            }

            if (path === '/api/admin/appointments') {
                return await this.getAppointments(url);
            }

            if (path === '/api/admin/patients') {
                return await this.getPatients(url);
            }

            if (path === '/api/admin/doctors') {
                if (request.method === 'GET') {
                    return await this.getDoctors();
                }
                if (request.method === 'POST') {
                    return await this.addDoctor(request);
                }
            }

            return new Response(JSON.stringify({ error: 'Not Found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            console.error('Admin API Error:', error);
            return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    /**
     * Get dashboard statistics
     */
    async getStats() {
        try {
            const today = new Date().toISOString().split('T')[0];

            // Get today's appointments
            const appointmentsResult = await this.services.db.prepare(
                `SELECT COUNT(*) as count FROM appointments WHERE DATE(created_at) = ?`
            ).bind(today).first();

            // Get today's lab tests
            const labTestsResult = await this.services.db.prepare(
                `SELECT COUNT(*) as count FROM lab_tests WHERE DATE(created_at) = ?`
            ).bind(today).first();

            // Get new patients today
            const patientsResult = await this.services.db.prepare(
                `SELECT COUNT(*) as count FROM patients WHERE DATE(first_visit) = ?`
            ).bind(today).first();

            // Get today's messages
            const messagesResult = await this.services.db.prepare(
                `SELECT COUNT(*) as count FROM message_logs WHERE DATE(timestamp) = ?`
            ).bind(today).first();

            // Get feedback count
            const feedbackResult = await this.services.db.prepare(
                `SELECT COUNT(*) as count FROM feedback WHERE DATE(created_at) = ?`
            ).bind(today).first();

            const stats = {
                appointments: appointmentsResult?.count || 0,
                labTests: labTestsResult?.count || 0,
                newPatients: patientsResult?.count || 0,
                messages: messagesResult?.count || 0,
                feedback: feedbackResult?.count || 0,
                date: today
            };

            return new Response(JSON.stringify(stats), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            console.error('Stats Error:', error);
            throw error;
        }
    }

    /**
     * Get appointments list
     */
    async getAppointments(url) {
        try {
            const limit = parseInt(url.searchParams.get('limit') || '50');
            const offset = parseInt(url.searchParams.get('offset') || '0');

            const result = await this.services.db.prepare(
                `SELECT * FROM appointments ORDER BY created_at DESC LIMIT ? OFFSET ?`
            ).bind(limit, offset).all();

            return new Response(JSON.stringify({
                appointments: result.results || [],
                count: result.results?.length || 0
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            console.error('Appointments Error:', error);
            throw error;
        }
    }

    /**
     * Get patients list
     */
    async getPatients(url) {
        try {
            const limit = parseInt(url.searchParams.get('limit') || '50');
            const offset = parseInt(url.searchParams.get('offset') || '0');

            const result = await this.services.db.prepare(
                `SELECT * FROM patients ORDER BY last_visit DESC LIMIT ? OFFSET ?`
            ).bind(limit, offset).all();

            return new Response(JSON.stringify({
                patients: result.results || [],
                count: result.results?.length || 0
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            console.error('Patients Error:', error);
            throw error;
        }
    }

    /**
     * Get doctors list
     */
    async getDoctors() {
        const doctors = [
            {
                id: 'akhilesh',
                name: 'डॉ. अखिलेश कुमार कसौधन',
                specialty: 'शुगर व सामान्य रोग',
                dept: 'General',
                days: 'सोमवार से शनिवार',
                timing: '2:00 PM - 7:00 PM'
            },
            {
                id: 'ankit',
                name: 'डॉ. अंकित शुक्ला',
                specialty: 'दिमाग व नस रोग',
                dept: 'Neurology',
                days: 'महीने की 15 तारीख',
                timing: '2:00 PM - 7:00 PM'
            },
            {
                id: 'singh',
                name: 'डॉ. ए.के. सिंह',
                specialty: 'नाक, कान, गला',
                dept: 'ENT',
                days: 'सोमवार',
                timing: '3:00 PM - 6:00 PM'
            },
            {
                id: 'anand',
                name: 'डॉ. आनन्द मिश्रा',
                specialty: 'दांत',
                dept: 'Dental',
                days: 'सोमवार से शनिवार',
                timing: '3:00 PM - 6:00 PM'
            }
        ];

        return new Response(JSON.stringify({ doctors }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    /**
     * Add new doctor (placeholder)
     */
    async addDoctor(request) {
        const data = await request.json();

        // In production, save to database
        console.log('Add doctor:', data);

        return new Response(JSON.stringify({
            success: true,
            message: 'Doctor added successfully'
        }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
