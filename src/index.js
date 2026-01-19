/**
 * RPL HOSPITAL - WhatsApp Business API Bot
 * Version 8.0 - Modular Architecture
 * =====================================
 * Complete hospital management system with AI-powered assistance
 */

import { WhatsAppService } from './services/whatsapp.js';
import { SessionService } from './services/session.js';
import { PatientService } from './services/patient.js';
import { NotificationService } from './services/notification.js';
import { AIAssistant } from './services/ai-assistant.js';
import { WebhookHandler } from './handlers/webhook.js';
import { AdminHandler } from './handlers/admin.js';
import { ScheduledHandler } from './handlers/scheduled.js';

export default {
  /**
   * Main fetch handler
   */
  async fetch(request, env, ctx) {
    const { method } = request;
    const url = new URL(request.url);

    // Initialize services
    const services = initializeServices(env);

    // Health check endpoint
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "active",
        version: "8.0",
        name: "RPL Hospital WhatsApp Bot",
        features: [
          "Appointment Booking",
          "Lab Reports",
          "Prescriptions",
          "Bills & Payments",
          "Doctor Information",
          "Emergency Handling",
          "Patient Feedback",
          "Patient Registration",
          "AI Assistant"
        ]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // WhatsApp webhook verification (GET)
    if (method === "GET" && url.pathname === "/webhook") {
      const webhookHandler = new WebhookHandler(services);
      return webhookHandler.handleVerification(url);
    }

    // WhatsApp webhook incoming messages (POST)
    if (method === "POST" && url.pathname === "/webhook") {
      const webhookHandler = new WebhookHandler(services);
      return await webhookHandler.handleIncoming(request, ctx);
    }

    // Admin API endpoints
    if (url.pathname.startsWith("/api/admin/")) {
      const adminHandler = new AdminHandler(services);
      return await adminHandler.handle(request, url);
    }

    // 404 for unknown routes
    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  },

  /**
   * Scheduled cron job handler
   */
  async scheduled(event, env, ctx) {
    const services = initializeServices(env);
    const scheduledHandler = new ScheduledHandler(services);
    await scheduledHandler.handle(event);
  }
};

/**
 * Initialize all services
 */
function initializeServices(env) {
  const whatsapp = new WhatsAppService(env);
  const session = new SessionService(env.SESSIONS);
  const patient = new PatientService(env.DB);
  const notification = new NotificationService(whatsapp, env);
  const ai = new AIAssistant(env.GROQ_API_KEY);

  return {
    whatsapp,
    session,
    patient,
    notification,
    ai,
    db: env.DB,
    env
  };
}
