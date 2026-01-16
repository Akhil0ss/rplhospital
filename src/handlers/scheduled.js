/**
 * Scheduled Handler - Cron jobs for reminders and notifications
 */

import { WhatsAppAPI } from '../services/whatsapp.js';
import { NotificationService } from '../services/notification.js';

export async function scheduledHandler(event, env) {
    const db = env.DB;
    const whatsapp = new WhatsAppAPI(env);
    const notifications = new NotificationService(env, whatsapp);

    console.log('Running scheduled task:', event.cron);

    try {
        // Appointment reminders (run at 8 AM)
        if (event.cron === '0 8 * * *') {
            await sendAppointmentReminders(db, whatsapp);
        }

        // Daily summary (run at 9 PM)
        if (event.cron === '0 21 * * *') {
            await sendDailySummary(db, notifications);
        }

        // Medicine reminders (run every hour)
        if (event.cron === '0 * * * *') {
            await sendMedicineReminders(db, whatsapp);
        }

    } catch (error) {
        console.error('Scheduled task error:', error);
    }
}

/**
 * Send appointment reminders for tomorrow
 */
async function sendAppointmentReminders(db, whatsapp) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];

    const appointments = await db.prepare(`
        SELECT a.*, p.name as patient_name, p.phone_number, d.name as doctor_name
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        JOIN doctors d ON a.doctor_id = d.id
        WHERE a.appointment_date = ? AND a.status = 'scheduled' AND a.reminder_sent = 0
    `).bind(dateStr).all();

    for (const apt of appointments.results || []) {
        try {
            const text = `⏰ *Appointment Reminder*\n\n` +
                `Hi ${apt.patient_name},\n\n` +
                `You have an appointment tomorrow:\n\n` +
                `👨‍⚕️ *Doctor:* ${apt.doctor_name}\n` +
                `📅 *Date:* ${new Date(apt.appointment_date).toLocaleDateString('en-IN')}\n` +
                `⏰ *Time:* ${apt.appointment_time}\n` +
                `🎫 *Token:* ${apt.token_number}\n\n` +
                `📍 Please arrive 15 mins early.\n\n` +
                `🏥 RPL Hospital\n` +
                `📞 08069640826`;

            await whatsapp.sendTextMessage(apt.phone_number, text);

            // Mark as sent
            await db.prepare(`UPDATE appointments SET reminder_sent = 1 WHERE id = ?`).bind(apt.id).run();

            console.log(`Reminder sent to ${apt.phone_number}`);
        } catch (error) {
            console.error(`Failed to send reminder to ${apt.phone_number}:`, error);
        }
    }
}

/**
 * Send daily summary to hospital
 */
async function sendDailySummary(db, notifications) {
    const today = new Date().toISOString().split('T')[0];

    const [scheduled, completed, cancelled, newPatients, labOrders, labReady, billed, collected, feedback] = await Promise.all([
        db.prepare(`SELECT COUNT(*) as c FROM appointments WHERE appointment_date = ? AND status = 'scheduled'`).bind(today).first(),
        db.prepare(`SELECT COUNT(*) as c FROM appointments WHERE appointment_date = ? AND status = 'completed'`).bind(today).first(),
        db.prepare(`SELECT COUNT(*) as c FROM appointments WHERE appointment_date = ? AND status = 'cancelled'`).bind(today).first(),
        db.prepare(`SELECT COUNT(*) as c FROM patients WHERE DATE(registered_at) = ?`).bind(today).first(),
        db.prepare(`SELECT COUNT(*) as c FROM lab_orders WHERE DATE(order_date) = ?`).bind(today).first(),
        db.prepare(`SELECT COUNT(*) as c FROM lab_reports WHERE DATE(report_date) = ? AND status = 'ready'`).bind(today).first(),
        db.prepare(`SELECT SUM(net_amount) as t FROM bills WHERE DATE(bill_date) = ?`).bind(today).first(),
        db.prepare(`SELECT SUM(paid_amount) as t FROM bills WHERE DATE(bill_date) = ?`).bind(today).first(),
        db.prepare(`SELECT AVG(rating) as avg, COUNT(*) as c FROM feedback WHERE DATE(submitted_at) = ?`).bind(today).first(),
    ]);

    const totalPatients = await db.prepare(`SELECT COUNT(*) as c FROM patients`).first();

    await notifications.sendDailySummary({
        appointmentsScheduled: scheduled?.c || 0,
        appointmentsCompleted: completed?.c || 0,
        appointmentsCancelled: cancelled?.c || 0,
        newPatients: newPatients?.c || 0,
        totalPatients: totalPatients?.c || 0,
        labOrders: labOrders?.c || 0,
        labReportsReady: labReady?.c || 0,
        totalBilled: billed?.t || 0,
        totalCollected: collected?.t || 0,
        avgRating: feedback?.avg?.toFixed(1) || 'N/A',
        feedbackCount: feedback?.c || 0,
    });
}

/**
 * Send medicine reminders
 */
async function sendMedicineReminders(db, whatsapp) {
    const now = new Date();
    const currentHour = now.getHours();
    const currentTime = `${String(currentHour).padStart(2, '0')}:00`;

    const reminders = await db.prepare(`
        SELECT mr.*, p.name as patient_name, p.phone_number
        FROM medicine_reminders mr
        JOIN patients p ON mr.patient_id = p.id
        WHERE mr.reminder_time = ? AND mr.is_active = 1
        AND (mr.end_date IS NULL OR mr.end_date >= date('now'))
    `).bind(currentTime).all();

    for (const reminder of reminders.results || []) {
        try {
            const text = `💊 *Medicine Reminder*\n\n` +
                `Hi ${reminder.patient_name},\n\n` +
                `Time to take your medicine:\n\n` +
                `💊 *${reminder.medicine_name}*\n\n` +
                `Take care! 🏥 RPL Hospital`;

            await whatsapp.sendTextMessage(reminder.phone_number, text);

            // Update last sent
            await db.prepare(`UPDATE medicine_reminders SET last_sent = datetime('now') WHERE id = ?`).bind(reminder.id).run();
        } catch (error) {
            console.error(`Failed to send medicine reminder:`, error);
        }
    }
}
