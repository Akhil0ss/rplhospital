/**
 * Notification Service - Send notifications to hospital admin and patients
 */

export class NotificationService {
    constructor(env, whatsapp) {
        this.env = env;
        this.whatsapp = whatsapp;
        this.hospitalNumber = env.HOSPITAL_NOTIFICATION_NUMBER || '919455060456';
    }

    /**
     * Notify hospital about new appointment
     */
    async notifyNewAppointment(appointment, patient, doctor) {
        const text = `🆕 *New Appointment Booked*\n\n` +
            `👤 *Patient:* ${patient.name || 'N/A'}\n` +
            `📱 ${patient.phone_number}\n` +
            `🆔 ${patient.patient_id || 'New'}\n\n` +
            `👨‍⚕️ *Doctor:* ${doctor.name}\n` +
            `📅 *Date:* ${appointment.appointment_date}\n` +
            `⏰ *Time:* ${appointment.appointment_time}\n` +
            `🎫 *Token:* ${appointment.token_number}\n` +
            (appointment.symptoms ? `📝 *Symptoms:* ${appointment.symptoms}\n` : '') +
            `\n⏱️ ${new Date().toLocaleString('en-IN')}`;

        return this.whatsapp.sendTextMessage(this.hospitalNumber, text);
    }

    /**
     * Notify hospital about new patient registration
     */
    async notifyNewPatient(patient) {
        const text = `🆕 *New Patient Registered*\n\n` +
            `👤 *Name:* ${patient.name}\n` +
            `📱 *Phone:* ${patient.phone_number}\n` +
            `🆔 *ID:* ${patient.patient_id}\n` +
            `📅 *DOB:* ${patient.date_of_birth || 'N/A'}\n` +
            `⚧️ *Gender:* ${patient.gender || 'N/A'}\n` +
            `🩸 *Blood:* ${patient.blood_group || 'N/A'}\n` +
            `\n⏱️ ${new Date().toLocaleString('en-IN')}`;

        return this.whatsapp.sendTextMessage(this.hospitalNumber, text);
    }

    /**
     * Notify hospital about feedback
     */
    async notifyFeedback(feedback, patient) {
        const stars = '⭐'.repeat(feedback.rating);
        const text = `📝 *New Feedback Received*\n\n` +
            `${stars} (${feedback.rating}/5)\n\n` +
            `👤 ${patient?.name || 'Anonymous'}\n` +
            `📱 ${patient?.phone_number || 'N/A'}\n` +
            `📋 Category: ${feedback.category}\n` +
            (feedback.feedback_text ? `💬 "${feedback.feedback_text}"\n` : '') +
            `\n⏱️ ${new Date().toLocaleString('en-IN')}`;

        return this.whatsapp.sendTextMessage(this.hospitalNumber, text);
    }

    /**
     * Notify hospital about emergency inquiry
     */
    async notifyEmergencyInquiry(phoneNumber, patientName) {
        const text = `🚨 *Emergency Contact Viewed*\n\n` +
            `👤 ${patientName || 'Unknown'}\n` +
            `📱 ${phoneNumber}\n` +
            `\n⚠️ Patient may need emergency assistance!\n` +
            `⏱️ ${new Date().toLocaleString('en-IN')}`;

        return this.whatsapp.sendTextMessage(this.hospitalNumber, text);
    }

    /**
     * Notify patient about appointment reminder
     */
    async sendAppointmentReminder(patient, appointment, doctor) {
        const text = `⏰ *Appointment Reminder*\n\n` +
            `Hi ${patient.name || 'there'},\n\n` +
            `This is a reminder for your appointment:\n\n` +
            `👨‍⚕️ *Doctor:* ${doctor.name}\n` +
            `📅 *Date:* ${new Date(appointment.appointment_date).toLocaleDateString('en-IN')}\n` +
            `⏰ *Time:* ${appointment.appointment_time}\n` +
            `🎫 *Token:* ${appointment.token_number}\n\n` +
            `📍 Please arrive 15 minutes early.\n\n` +
            `🏥 RPL Hospital`;

        return this.whatsapp.sendTextMessage(patient.phone_number, text);
    }

    /**
     * Notify patient about lab report ready
     */
    async sendLabReportReady(patient, report) {
        const text = `🔬 *Lab Report Ready*\n\n` +
            `Hi ${patient.name || 'there'},\n\n` +
            `Your lab report is now available:\n\n` +
            `📋 *Report:* ${report.report_number}\n` +
            `📅 *Date:* ${new Date(report.report_date).toLocaleDateString('en-IN')}\n\n` +
            `Reply "reports" to download your report.\n\n` +
            `🏥 RPL Hospital`;

        return this.whatsapp.sendTextMessage(patient.phone_number, text);
    }

    /**
     * Notify patient about bill generated
     */
    async sendBillNotification(patient, bill) {
        const text = `💰 *Bill Generated*\n\n` +
            `Hi ${patient.name || 'there'},\n\n` +
            `A new bill has been generated:\n\n` +
            `📄 *Bill No:* ${bill.bill_number}\n` +
            `💵 *Amount:* ₹${bill.net_amount}\n` +
            `📅 *Date:* ${new Date(bill.bill_date).toLocaleDateString('en-IN')}\n\n` +
            `Reply "bills" to view details.\n\n` +
            `🏥 RPL Hospital`;

        return this.whatsapp.sendTextMessage(patient.phone_number, text);
    }

    /**
     * Send daily summary to hospital
     */
    async sendDailySummary(stats) {
        const text = `📊 *Daily Summary - RPL Hospital*\n` +
            `📅 ${new Date().toLocaleDateString('en-IN')}\n\n` +
            `📋 *Appointments:*\n` +
            `   • Scheduled: ${stats.appointmentsScheduled}\n` +
            `   • Completed: ${stats.appointmentsCompleted}\n` +
            `   • Cancelled: ${stats.appointmentsCancelled}\n\n` +
            `👥 *Patients:*\n` +
            `   • New Registrations: ${stats.newPatients}\n` +
            `   • Total Active: ${stats.totalPatients}\n\n` +
            `🔬 *Lab:*\n` +
            `   • Orders: ${stats.labOrders}\n` +
            `   • Reports Ready: ${stats.labReportsReady}\n\n` +
            `💰 *Revenue:*\n` +
            `   • Bills: ₹${stats.totalBilled}\n` +
            `   • Collected: ₹${stats.totalCollected}\n\n` +
            `⭐ *Feedback:* ${stats.avgRating}/5 (${stats.feedbackCount} reviews)`;

        return this.whatsapp.sendTextMessage(this.hospitalNumber, text);
    }
}
