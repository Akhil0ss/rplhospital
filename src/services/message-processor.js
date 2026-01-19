/**
 * Message Processor Service
 * Routes messages to appropriate flow handlers
 */

import { MainMenuFlow } from '../flows/main-menu.js';
import { AppointmentFlow } from '../flows/appointment.js';
import { LabReportFlow } from '../flows/lab-report.js';
import { PrescriptionFlow } from '../flows/prescription.js';
import { BillFlow } from '../flows/bill.js';
import { DoctorInfoFlow } from '../flows/doctor-info.js';
import { EmergencyFlow } from '../flows/emergency.js';
import { FeedbackFlow } from '../flows/feedback.js';
import { RegistrationFlow } from '../flows/registration.js';

export class MessageProcessor {
    constructor(services) {
        this.services = services;

        // Initialize all flow handlers
        this.flows = {
            'main-menu': new MainMenuFlow(services),
            'appointment': new AppointmentFlow(services),
            'lab-report': new LabReportFlow(services),
            'prescription': new PrescriptionFlow(services),
            'bill': new BillFlow(services),
            'doctor-info': new DoctorInfoFlow(services),
            'emergency': new EmergencyFlow(services),
            'feedback': new FeedbackFlow(services),
            'registration': new RegistrationFlow(services)
        };
    }

    /**
     * Process incoming message
     */
    async processMessage(phone, name, message, messageId) {
        try {
            // Mark message as read (Non-critical, don't crash if fails)
            try { await this.services.whatsapp.markAsRead(messageId); } catch (e) { }

            // Log incoming message (Non-critical)
            try { await this.logMessage(phone, 'incoming', message, messageId); } catch (e) { }

            // Get current session state
            let state;
            try {
                state = await this.services.session.getState(phone);
            } catch (e) {
                state = { step: 'start', flow: 'main-menu' };
            }

            // Ensure patient exists (Important)
            try {
                await this.services.patient.getOrCreatePatient(phone, name);
            } catch (e) {
                console.error("Patient DB Error:", e);
            }

            // Check for emergency first
            if (this.isEmergency(message)) {
                const emergencyFlow = this.flows['emergency'];
                const result = await emergencyFlow.handle(phone, name, message, {});
                await this.sendResponse(phone, result);
                await this.services.session.clearState(phone);
                return;
            }

            // Route to appropriate flow
            let currentFlow = state.flow || 'main-menu';

            // Safety: if user wants to reset
            if (message.toLowerCase().match(/^(menu|मेनू|stop|hi|hello|नमस्ते|शुरू|start)$/)) {
                currentFlow = 'main-menu';
                state = { step: 'start', flow: 'main-menu' };
            }

            const flowHandler = this.flows[currentFlow];

            if (!flowHandler) {
                console.error(`Unknown flow: ${currentFlow}`);
                await this.sendResponse(phone, {
                    reply: "नमस्ते! कृपया 'मेनू' लिखकर शुरुआत करें।",
                    newState: { step: 'start', flow: 'main-menu', name }
                });
                return;
            }

            // Process message through flow
            const result = await flowHandler.handle(phone, name, message, state);

            // Send response
            await this.sendResponse(phone, result);

            // Update session state
            if (result.newState) {
                await this.services.session.setState(phone, result.newState);
            }

            // Handle notifications
            if (result.notify) {
                try { await this.services.notification.notifyStaff(result.notify); } catch (e) { }
            }

        } catch (error) {
            console.error(`Critical Message Processing Error for ${phone}:`, error);
            await this.sendErrorResponse(phone);
        }
    }

    /**
     * Send response to user
     */
    async sendResponse(phone, result) {
        if (result.reply) {
            await this.services.whatsapp.sendMessage(phone, result.reply);
            await this.logMessage(phone, 'outgoing', result.reply, `resp_${Date.now()}`);
        }

        if (result.list) {
            await this.services.whatsapp.sendListMessage(
                phone,
                result.list.body,
                result.list.button,
                result.list.sections
            );
        }

        if (result.buttons) {
            await this.services.whatsapp.sendButtons(
                phone,
                result.buttons.body,
                result.buttons.buttons
            );
        }

        if (result.document) {
            await this.services.whatsapp.sendDocument(
                phone,
                result.document.url,
                result.document.filename,
                result.document.caption
            );
        }
    }

    /**
     * Check if message indicates emergency
     */
    isEmergency(message) {
        const keywords = [
            'खून', 'बेहोश', 'एक्सीडेंट', 'गंभीर',
            'blood', 'accident', 'emergency', 'urgent',
            'critical', 'unconscious', 'bleeding'
        ];
        const lower = message.toLowerCase();
        return keywords.some(k => lower.includes(k));
    }

    /**
     * Send fallback response
     */
    async sendFallbackResponse(phone) {
        const message = `माफ़ करें, कुछ गड़बड़ हो गई। कृपया "मेनू" लिखें या फोन करें: ${this.services.env.HOSPITAL_PHONE}`;
        await this.services.whatsapp.sendMessage(phone, message);
    }

    /**
     * Send error response
     */
    async sendErrorResponse(phone) {
        const message = `माफ़ करें, तकनीकी समस्या है। कृपया फोन करें: ${this.services.env.HOSPITAL_PHONE}`;
        await this.services.whatsapp.sendMessage(phone, message);
    }

    /**
     * Log message to database
     */
    async logMessage(phone, direction, content, messageId) {
        try {
            await this.services.db.prepare(
                `INSERT INTO message_logs (phone_number, direction, message_type, message_content, message_id, timestamp) 
         VALUES (?, ?, 'text', ?, ?, CURRENT_TIMESTAMP)`
            ).bind(phone, direction, content.substring(0, 500), messageId).run();
        } catch (error) {
            console.error("Log Message Error:", error);
        }
    }
}
