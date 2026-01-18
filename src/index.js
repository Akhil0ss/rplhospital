// src/index.js - COMPLETE RPL HOSPITAL BOT (D1 + KV)
import { Ai } from '@cloudflare/ai';

// D1 & KV already bound in wrangler.toml
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Webhook verification
    if (request.method === 'GET' && url.pathname === '/webhook') {
      return verifyWebhook(request, env);
    }

    // Webhook messages
    if (request.method === 'POST' && url.pathname === '/webhook') {
      await handleWebhook(request, env, ctx);
      return new Response('OK', { status: 200 });
    }

    return new Response('Not found', { status: 404 });
  }
};

async function verifyWebhook(request, env) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

async function handleWebhook(request, env, ctx) {
  try {
    const body = await request.json();
    const messages = body.entry?.[0]?.changes?.[0]?.value?.messages;
    
    if (!messages?.length) return;

    const contacts = body.entry?.[0]?.changes?.[0]?.value?.contacts || [];
    
    for (const message of messages) {
      const phoneNumber = message.from;
      const contact = contacts.find(c => c.wa_id === phoneNumber);
      const senderName = contact?.profile?.name || 'Patient';

      // Safe DB operations
      await logMessageSafe(env.DB, phoneNumber, 'incoming', message);
      
      // Get user session
      const session = await getSession(env.DB, env.KV_SESSIONS, phoneNumber);
      const reply = await processMessage(env, message, phoneNumber, senderName, session);
      
      // Update session
      await updateSession(env.DB, env.KV_SESSIONS, phoneNumber, reply);
      
      // Send reply
      await sendWhatsAppMessage(env, phoneNumber, reply);
    }
  } catch (error) {
    console.error('Webhook error:', error);
  }
}

async function processMessage(env, message, phoneNumber, senderName, session) {
  const text = (message.text?.body || '').toLowerCase().trim();
  
  // Main menu
  if (!session.state || ['menu', 'start', 'hi', 'hello'].includes(text)) {
    return mainMenu(senderName);
  }

  // Appointment booking
  if (['1', 'appointment', 'doctor'].includes(text) || session.state === 'appointment_doctor') {
    if (session.state === 'appointment_date') {
      return confirmAppointment(phoneNumber, senderName, session.data.doctor, text);
    }
    return appointmentMenu(senderName);
  }

  // Lab tests
  if (['2', 'lab', 'test'].includes(text)) {
    return labTestsMenu();
  }

  // Pharmacy
  if (['3', 'medicine', 'pharmacy'].includes(text)) {
    return pharmacyMenu();
  }

  // Bookings
  if (['4', 'bookings', 'history'].includes(text)) {
    const bookings = await getUserBookings(env.DB, phoneNumber);
    return bookings.length ? formatBookings(bookings) : noBookings(senderName);
  }

  // Hospital info
  if (['5', 'info', 'hospital'].includes(text)) {
    return hospitalInfo();
  }

  // Default fallback
  return mainMenu(senderName);
}

// === MENU FUNCTIONS ===
function mainMenu(name) {
  return `🏥 *RPL HOSPITAL BOT* (${name})

📅 *1.* Appointment Booking
🩸 *2.* Lab Tests  
💊 *3.* Pharmacy
📋 *4.* My Bookings
ℹ️  *5.* Hospital Info

*Reply number*`;
}

function appointmentMenu(name) {
  return `👨‍⚕️ *DOCTORS AVAILABLE*

1️⃣ *Dr. Amit Sharma* - General (₹350)
2️⃣ *Dr. Priya Singh* - Gynecology (₹500) 
3️⃣ *Dr. Raj Kumar* - Cardiology (₹800)

*Reply doctor number*`;
}

function labTestsMenu() {
  return `🩸 *LAB TESTS*

• CBC Complete - ₹320
• Blood Sugar - ₹120
• Lipid Profile - ₹550
• LFT - ₹850

*Send test name or MENU*`;
}

function pharmacyMenu() {
  return `💊 *PHARMACY 24×7*

• Dolo 650mg - ₹25
• Azithromycin - ₹90
• Vitamin D3 - ₹180

*Send medicine name*`;
}

function hospitalInfo() {
  return `🏥 *RPL HOSPITAL*

📍 Main Road, Near City Centre
📞 *OPD:* 919140225588
🆘 *Emergency:* 24×7

🕒 *OPD:* 8AM-9PM
*Reports ready:* 4-6 hours`;
}

// === DB OPERATIONS (Safe) ===
async function logMessageSafe(db, phoneNumber, direction, message) {
  try {
    if (!db) return;
    const content = message.text?.body || `[${message.type}]`;
    await db.prepare(`
      INSERT INTO message_logs (phone_number, direction, message_type, message_content, whatsapp_message_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(phoneNumber, direction, message.type, content, message.id).run();
  } catch (e) {
    console.error('Log error:', e);
  }
}

async function getSession(db, kv, phoneNumber) {
  try {
    // Try KV first (faster)
    let session = await kv.get(`session:${phoneNumber}`, { type: 'json' });
    
    if (!session && db) {
      // Fallback to D1
      const result = await db.prepare('SELECT * FROM chat_sessions WHERE phone_number = ?')
        .bind(phoneNumber).first();
      session = result || { state: 'menu', data: {} };
    }
    
    return session || { state: 'menu', data: {} };
  } catch (e) {
    return { state: 'menu', data: {} };
  }
}

async function updateSession(db, kv, phoneNumber, lastReply) {
  try {
    const session = {
      phone_number: phoneNumber,
      state: 'menu',
      last_message: lastReply,
      updated_at: new Date().toISOString()
    };
    
    // Update KV (fast)
    await kv.put(`session:${phoneNumber}`, JSON.stringify(session), { 
      expirationTtl: 86400 
    });
    
    // Update D1 (persistent)
    if (db) {
      await db.prepare(`
        INSERT INTO chat_sessions (phone_number, current_state, last_message, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(phone_number) 
        DO UPDATE SET current_state = ?, last_message = ?, updated_at = ?
      `).bind(
        phoneNumber, 'menu', lastReply, new Date().toISOString(),
        'menu', lastReply, new Date().toISOString()
      ).run();
    }
  } catch (e) {
    console.error('Session update error:', e);
  }
}

async function getUserBookings(db, phoneNumber) {
  try {
    if (!db) return [];
    return await db.prepare(`
      SELECT * FROM appointments WHERE phone_number = ? AND status = 'confirmed'
      ORDER BY created_at DESC LIMIT 5
    `).bind(phoneNumber).all();
  } catch (e) {
    return [];
  }
}

// === HELPER FUNCTIONS ===
function confirmAppointment(phone, name, doctor, date) {
  return `✅ *APPOINTMENT CONFIRMED*

👨‍⚕️ ${doctor}
📅 ${date}
📱 ${name} (${phone})

*Status:* Call 919140225588 to confirm
*Reply MENU*`;
}

function formatBookings(bookings) {
  let text = '📋 *YOUR BOOKINGS*

';
  bookings.forEach(b => {
    text += `👨‍⚕️ ${b.doctor_name}
📅 ${b.appointment_date}
📋 ${b.status}

`;
  });
  text += '*Reply MENU*';
  return text;
}

function noBookings(name) {
  return `📋 *${name}* - No bookings found

*Book now: Reply 1*`;
}

async function sendWhatsAppMessage(env, phoneNumber, text) {
  try {
    await fetch(`https://graph.facebook.com/v20.0/${env.PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phoneNumber,
        type: "text",
        text: { body: text }
      })
    });
  } catch (e) {
    console.error('WhatsApp send error:', e);
  }
}
