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

        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            if (path === '/' || path === '/health') {
                return new Response(JSON.stringify({
                    status: 'ok',
                    service: 'RPL Hospital WABA',
                    timestamp: new Date().toISOString()
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            if (path === '/webhook' && request.method === 'GET') {
                return verifyWebhook(request, env);
            }

            if (path === '/webhook' && request.method === 'POST') {
                // 🔧 FIX: read body once, pass to handler
                const body = await request.json();
                ctx.waitUntil(handleWebhook(request, env, body));

                return new Response(JSON.stringify({ status: 'received' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            if (path.startsWith('/api/admin')) {
                const response = await handleAdminAPI(request, env, path);
                const newHeaders = new Headers(response.headers);
                Object.entries(corsHeaders).forEach(([key, value]) => {
                    newHeaders.set(key, value);
                });
                return new Response(response.body, {
                    status: response.status,
                    headers: newHeaders
                });
            }

            if (path.startsWith('/api/patient')) {
                return await handlePatientAPI(request, env, path, corsHeaders);
            }

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

    async scheduled(event, env, ctx) {
        const { scheduledHandler } = await import('./handlers/scheduled.js');
        ctx.waitUntil(scheduledHandler(event, env));
    }
};

async function handlePatientAPI(request, env, path, corsHeaders) {
    const { PatientService } = await import('./services/patient.js');
    const patientService = new PatientService(env.DB);

    if (path === '/api/patient/verify' && request.method === 'POST') {
        const { phone, otp } = await request.json();
        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}
