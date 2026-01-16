/**
 * Admin API Handler
 */

export async function handleAdminAPI(request, env, path) {
    const db = env.DB;

    // Simple API key auth (add proper auth in production)
    const authHeader = request.headers.get('Authorization');
    // For now, skip auth for demo. Add: if (!authHeader) return unauthorized();

    const method = request.method;
    const endpoint = path.replace('/api/admin', '');

    try {
        // Dashboard stats
        if (endpoint === '/stats' && method === 'GET') {
            return await getDashboardStats(db);
        }

        // Appointments
        if (endpoint === '/appointments' && method === 'GET') {
            return await getAppointments(db, request);
        }

        // Patients
        if (endpoint === '/patients' && method === 'GET') {
            return await getPatients(db, request);
        }

        // Doctors
        if (endpoint === '/doctors' && method === 'GET') {
            return await getDoctors(db);
        }
        if (endpoint === '/doctors' && method === 'POST') {
            return await createDoctor(db, request);
        }

        // Lab Reports - mark as ready
        if (endpoint.startsWith('/lab-reports/') && method === 'PUT') {
            return await updateLabReport(db, endpoint, request);
        }

        // Send notification
        if (endpoint === '/notify' && method === 'POST') {
            return await sendNotification(env, request);
        }

        return jsonResponse({ error: 'Not Found' }, 404);
    } catch (error) {
        console.error('Admin API Error:', error);
        return jsonResponse({ error: error.message }, 500);
    }
}

async function getDashboardStats(db) {
    const today = new Date().toISOString().split('T')[0];

    const [appointments, patients, pendingBills, feedback] = await Promise.all([
        db.prepare(`SELECT COUNT(*) as count FROM appointments WHERE appointment_date = ?`).bind(today).first(),
        db.prepare(`SELECT COUNT(*) as count FROM patients`).first(),
        db.prepare(`SELECT SUM(net_amount - paid_amount) as total FROM bills WHERE payment_status != 'paid'`).first(),
        db.prepare(`SELECT AVG(rating) as avg FROM feedback`).first(),
    ]);

    return jsonResponse({
        todayAppointments: appointments?.count || 0,
        totalPatients: patients?.count || 0,
        pendingAmount: pendingBills?.total || 0,
        avgRating: feedback?.avg?.toFixed(1) || 'N/A',
    });
}

async function getAppointments(db, request) {
    const url = new URL(request.url);
    const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
    const status = url.searchParams.get('status');

    let query = `
        SELECT a.*, p.name as patient_name, p.phone_number, d.name as doctor_name
        FROM appointments a
        LEFT JOIN patients p ON a.patient_id = p.id
        LEFT JOIN doctors d ON a.doctor_id = d.id
        WHERE a.appointment_date = ?
    `;
    const params = [date];

    if (status) {
        query += ` AND a.status = ?`;
        params.push(status);
    }
    query += ` ORDER BY a.appointment_time`;

    const result = await db.prepare(query).bind(...params).all();
    return jsonResponse(result.results || []);
}

async function getPatients(db, request) {
    const url = new URL(request.url);
    const search = url.searchParams.get('search');
    const limit = parseInt(url.searchParams.get('limit')) || 50;

    let query = `SELECT * FROM patients`;
    const params = [];

    if (search) {
        query += ` WHERE name LIKE ? OR phone_number LIKE ? OR patient_id LIKE ?`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    query += ` ORDER BY registered_at DESC LIMIT ?`;
    params.push(limit);

    const result = await db.prepare(query).bind(...params).all();
    return jsonResponse(result.results || []);
}

async function getDoctors(db) {
    const result = await db.prepare(`
        SELECT d.*, dept.name as department_name 
        FROM doctors d 
        LEFT JOIN departments dept ON d.department_id = dept.id
        ORDER BY d.name
    `).all();
    return jsonResponse(result.results || []);
}

async function createDoctor(db, request) {
    const data = await request.json();
    await db.prepare(`
        INSERT INTO doctors (name, department_id, specialization, qualification, experience_years, consultation_fee, available_days, available_timings)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        data.name, data.department_id, data.specialization, data.qualification,
        data.experience_years, data.consultation_fee,
        JSON.stringify(data.available_days), JSON.stringify(data.available_timings)
    ).run();
    return jsonResponse({ success: true });
}

async function updateLabReport(db, endpoint, request) {
    const reportId = endpoint.split('/')[2];
    const data = await request.json();

    await db.prepare(`
        UPDATE lab_reports SET status = ?, report_url = ? WHERE id = ?
    `).bind(data.status, data.report_url, reportId).run();

    return jsonResponse({ success: true });
}

async function sendNotification(env, request) {
    const { WhatsAppAPI } = await import('../services/whatsapp.js');
    const wa = new WhatsAppAPI(env);
    const { phone, message } = await request.json();

    await wa.sendTextMessage(phone, message);
    return jsonResponse({ success: true });
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}
