// src/index.js - 100% WORKING (No DB dependency)
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Webhook verification
    if (request.method === 'GET' && url.pathname === '/webhook') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      
      if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
        return new Response(challenge, { status: 200 });
      }
      return new Response('Forbidden', { status: 403 });
    }

    // Messages
    if (request.method === 'POST' && url.pathname === '/webhook') {
      await handleMessages(request, env);
      return new Response('OK', { status: 200 });
    }

    return new Response('Not found', { status: 404 });
  }
};

async function handleMessages(request, env) {
  try {
    const body = await request.json();
    const messages = body.entry?.[0]?.changes?.[0]?.value?.messages;
    
    if (!messages) return;

    for (const message of messages) {
      const phoneNumber = message.from;
      const text = message.text?.body?.toLowerCase() || '';

      let reply = `🏥 *RPL HOSPITAL*

📅 *1.* Book Appointment
🩸 *2.* Lab Test  
💊 *3.* Medicine
📋 *4.* My Bookings
ℹ️  *5.* Info

*Reply number:*`;

      // Simple logic
      if (text === '1') reply = `👨‍⚕️ *DOCTORS:*
• Dr Amit (General) - 10AM-2PM
• Dr Priya (Gynae) - 9AM-1PM

*Send: DATE TIME*`;
      if (text === 'menu') reply = reply;

      await sendMessage(env, phoneNumber, reply);
    }
  } catch (e) {
    console.error('Error:', e);
  }
}

async function sendMessage(env, phone, text) {
  await fetch(`https://graph.facebook.com/v20.0/${env.PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "text", 
      text: { body: text }
    })
  });
}
