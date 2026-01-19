/**
 * Scheduled Tasks Handler
 * Handles cron job triggers
 */

export class ScheduledHandler {
    constructor(services) {
        this.services = services;
    }

    /**
     * Handle scheduled cron triggers
     */
    async handle(event) {
        const cron = event.cron;
        console.log(`Running scheduled task: ${cron}`);

        try {
            // 8 AM - Appointment reminders
            if (cron === '0 8 * * *') {
                await this.sendAppointmentReminders();
            }

            // 9 PM - Daily summary
            if (cron === '0 21 * * *') {
                await this.sendDailySummary();
            }

            // Every hour - Medicine reminders
            if (cron === '0 * * * *') {
                await this.sendMedicineReminders();
            }

            console.log(`Scheduled task completed: ${cron}`);
        } catch (error) {
            console.error(`Scheduled task error (${cron}):`, error);
        }
    }

    /**
     * Send appointment reminders for today
     */
    async sendAppointmentReminders() {
        try {
            const today = new Date().toISOString().split('T')[0];

            // Get today's appointments
            const result = await this.services.db.prepare(
                `SELECT * FROM appointments WHERE appointment_date = ? AND status = 'confirmed'`
            ).bind(today).all();

            const appointments = result.results || [];

            for (const apt of appointments) {
                const message = `🔔 *अपॉइंटमेंट याद दिलाना*\n\n` +
                    `आज आपकी अपॉइंटमेंट है:\n\n` +
                    `🏥 डॉक्टर: ${apt.doctor_name}\n` +
                    `⏰ समय: ${apt.appointment_time}\n` +
                    `🎫 टोकन: ${apt.token_number}\n\n` +
                    `कृपया समय पर पहुंचें। धन्यवाद!`;

                try {
                    await this.services.whatsapp.sendMessage(apt.phone_number, message);
                } catch (error) {
                    console.error(`Failed to send reminder to ${apt.phone_number}:`, error);
                }

                // Small delay to avoid rate limiting
                await this.delay(100);
            }

            console.log(`Sent ${appointments.length} appointment reminders`);
        } catch (error) {
            console.error('Appointment reminders error:', error);
        }
    }

    /**
     * Send daily summary to staff
     */
    async sendDailySummary() {
        try {
            const today = new Date().toISOString().split('T')[0];

            // Get today's stats
            const appointmentsResult = await this.services.db.prepare(
                `SELECT COUNT(*) as count FROM appointments WHERE DATE(created_at) = ?`
            ).bind(today).first();

            const labTestsResult = await this.services.db.prepare(
                `SELECT COUNT(*) as count FROM lab_tests WHERE DATE(created_at) = ?`
            ).bind(today).first();

            const patientsResult = await this.services.db.prepare(
                `SELECT COUNT(*) as count FROM patients WHERE DATE(first_visit) = ?`
            ).bind(today).first();

            const messagesResult = await this.services.db.prepare(
                `SELECT COUNT(*) as count FROM message_logs WHERE DATE(timestamp) = ?`
            ).bind(today).first();

            const feedbackResult = await this.services.db.prepare(
                `SELECT COUNT(*) as count FROM feedback WHERE DATE(created_at) = ?`
            ).bind(today).first();

            const stats = {
                appointments: appointmentsResult?.count || 0,
                labTests: labTestsResult?.count || 0,
                newPatients: patientsResult?.count || 0,
                messages: messagesResult?.count || 0,
                feedback: feedbackResult?.count || 0
            };

            await this.services.notification.sendDailySummary(stats);

            console.log('Daily summary sent');
        } catch (error) {
            console.error('Daily summary error:', error);
        }
    }

    /**
     * Send medicine reminders
     */
    async sendMedicineReminders() {
        try {
            const currentHour = new Date().getHours();
            const currentTime = `${currentHour}:00`;

            // Get active reminders for this hour
            const result = await this.services.db.prepare(
                `SELECT * FROM medicine_reminders WHERE active = 1 AND reminder_time LIKE ?`
            ).bind(`%${currentHour}%`).all();

            const reminders = result.results || [];

            for (const reminder of reminders) {
                const message = `💊 *दवा याद दिलाना*\n\n` +
                    `${reminder.medicine_name} लेने का समय हो गया है।\n\n` +
                    `समय: ${reminder.reminder_time}\n\n` +
                    `स्वस्थ रहें! 🙏`;

                try {
                    await this.services.whatsapp.sendMessage(reminder.phone_number, message);
                } catch (error) {
                    console.error(`Failed to send medicine reminder to ${reminder.phone_number}:`, error);
                }

                // Small delay to avoid rate limiting
                await this.delay(100);
            }

            console.log(`Sent ${reminders.length} medicine reminders`);
        } catch (error) {
            console.error('Medicine reminders error:', error);
        }
    }

    /**
     * Utility delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
