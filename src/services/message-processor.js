/**
 * Message Processor - Core message handling logic
 * Routes messages to appropriate flow handlers
 */

import { MainMenuFlow } from '../flows/main-menu.js';
import { AppointmentFlow } from '../flows/appointment.js';
import { LabReportFlow } from '../flows/lab-report.js';
import { BillFlow } from '../flows/bill.js';
import { DoctorInfoFlow } from '../flows/doctor-info.js';
import { EmergencyFlow } from '../flows/emergency.js';
import { FeedbackFlow } from '../flows/feedback.js';
import { RegistrationFlow } from '../flows/registration.js';
import { PrescriptionFlow } from '../flows/prescription.js';
import { AIAssistant } from './ai-assistant.js';

export class MessageProcessor {
    constructor(env, whatsapp, sessionManager) {
        this.env = env;
        this.db = env.DB;
        this.whatsapp = whatsapp;
        this.sessionManager = sessionManager;

        // Initialize flows
        this.flows = {
            mainMenu: new MainMenuFlow(env, whatsapp, sessionManager),
            appointment: new AppointmentFlow(env, whatsapp, sessionManager),
            labReport: new LabReportFlow(env, whatsapp, sessionManager),
            bill: new BillFlow(env, whatsapp, sessionManager),
            doctorInfo: new DoctorInfoFlow(env, whatsapp, sessionManager),
            emergency: new EmergencyFlow(env, whatsapp, sessionManager),
            feedback: new FeedbackFlow(env, whatsapp, sessionManager),
            registration: new RegistrationFlow(env, whatsapp, sessionManager),
            prescription: new PrescriptionFlow(env, whatsapp, sessionManager),
        };

        this.ai = new AIAssistant(env, whatsapp);
    }

    async processMessage(message, phoneNumber, senderName) {
        const session = await this.sessionManager.getSession(phoneNumber);
        const messageText = this.extractMessageText(message);
        const messageType = message.type;

        // Global commands
        if (this.isGlobalCommand(messageText)) {
            return this.handleGlobalCommand(messageText, phoneNumber, session);
        }

        // Route based on current state
        const statePrefix = session.currentState.split('_')[0];

        switch (statePrefix) {
            case 'main':
                return this.flows.mainMenu.handle(message, phoneNumber, senderName, session);
            case 'appointment':
                return this.flows.appointment.handle(message, phoneNumber, session);
            case 'lab':
                return this.flows.labReport.handle(message, phoneNumber, session);
            case 'bill':
                return this.flows.bill.handle(message, phoneNumber, session);
            case 'doctor':
                return this.flows.doctorInfo.handle(message, phoneNumber, session);
            case 'emergency':
                return this.flows.emergency.handle(message, phoneNumber, session);
            case 'feedback':
                return this.flows.feedback.handle(message, phoneNumber, session);
            case 'registration':
                return this.flows.registration.handle(message, phoneNumber, session);
            case 'prescription':
                return this.flows.prescription.handle(message, phoneNumber, session);
            default:
                return this.flows.mainMenu.showMenu(phoneNumber, senderName);
        }
    }

    extractMessageText(message) {
        switch (message.type) {
            case 'text':
                return message.text?.body?.toLowerCase().trim() || '';
            case 'interactive':
                if (message.interactive?.type === 'button_reply') {
                    return message.interactive.button_reply.id;
                } else if (message.interactive?.type === 'list_reply') {
                    return message.interactive.list_reply.id;
                }
                return '';
            default:
                return '';
        }
    }

    isGlobalCommand(text) {
        const commands = ['menu', 'home', 'start', 'hi', 'hello', 'help', 'cancel', 'back', '0', 'main'];
        return commands.includes(text);
    }

    async handleGlobalCommand(command, phoneNumber, session) {
        if (['menu', 'home', 'start', 'hi', 'hello', '0', 'main'].includes(command)) {
            await this.sessionManager.resetSession(session.id);
            return this.flows.mainMenu.showMenu(phoneNumber);
        }
        if (command === 'help') {
            return this.whatsapp.sendTextMessage(phoneNumber,
                `🏥 *RPL Hospital Help*\n\nType:\n• *menu* - Main menu\n• *help* - This help\n• *cancel* - Cancel current action\n\nOr use the menu buttons to navigate.`
            );
        }
        if (['cancel', 'back'].includes(command)) {
            await this.sessionManager.resetSession(session.id);
            return this.flows.mainMenu.showMenu(phoneNumber);
        }
    }
}
