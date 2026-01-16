/**
 * RPL Hospital - WhatsApp Business API Automation
 * Cloudflare Worker Entry Point
 */

import { handleWebhook, verifyWebhook } from './handlers/webhook.js';
import { handleAdminAPI } from './handlers/admin.js';

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };

        // Handle preflight requests
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // Health check endpoint
            if (path === '/' || path === '/health') {
                return new Response(JSON.stringify({
                    status: 'ok',
                    service: 'RPL Hospital WABA',
                    timestamp: new Date().toISOString()
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // WhatsApp Webhook Verification (GET)
            if (path === '/webhook' && request.method === 'GET') {
                return verifyWebhook(request, env);
            }

            // WhatsApp Webhook Messages (POST)
            if (path === '/webhook' && request.method === 'POST') {
                // Process webhook asynchronously
                ctx.waitUntil(handleWebhook(request.clone(), env));
                return new Response(JSON.stringify({ status: 'received' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // Admin API endpoints
            if (path.startsWith('/api/admin')) {
                const response = await handleAdminAPI(request, env, path);
                // Add CORS headers to response
                const newHeaders = new Headers(response.headers);
                Object.entries(corsHeaders).forEach(([key, value]) => {
                    newHeaders.set(key, value);
                });
                return new Response(response.body, {
                    status: response.status,
                    headers: newHeaders
                });
            }

            // Public API endpoints for patient verification
            if (path.startsWith('/api/patient')) {
                return await handlePatientAPI(request, env, path, corsHeaders);
            }

            // 404 for unknown routes
            return new Response(JSON.stringify({ error: 'Not Found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });

        } catch (error) {
            console.error('Worker error:', error);
            return new Response(JSON.stringify({
                error: 'Internal Server Error',
                message: error.message
            }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    },

    // Scheduled tasks for reminders
    async scheduled(event, env, ctx) {
        const { scheduledHandler } = await import('./handlers/scheduled.js');
        ctx.waitUntil(scheduledHandler(event, env));
    }
};

/**
 * Handle Patient API requests
 */
async function handlePatientAPI(request, env, path, corsHeaders) {
    const { PatientService } = await import('./services/patient.js');
    const patientService = new PatientService(env.DB);

    if (path === '/api/patient/verify' && request.method === 'POST') {
        const { phone, otp } = await request.json();
        // Implement OTP verification logic
        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}
