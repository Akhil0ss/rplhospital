// =============================================
// RPL HOSPITAL – WHATSAPP AI OPD SYSTEM
// FILE: src/index.js
// PART 1 / 3  (CORE ENGINE)
// =============================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Webhook verification
    if (request.method === "GET" && url.pathname === "/webhook") {
      return verifyWebhook(request, env);
    }

    // Incoming WhatsApp messages
    if (request.method === "POST" && url.pathname === "/webhook") {
      await handleIncomingMessage(request, env, ctx);
      return new Response("OK", { status: 200 });
    }

    return new Response("Not Found", { status: 404 });
  },

  // Cron Jobs from wrangler.toml
  async scheduled(event, env, ctx) {
    if (event.cron === "0 8 * * *") {
      await sendAppointmentReminders(env);
    }
    if (event.cron === "0 21 * * *") {
      await sendDailyAdminReport(env);
    }
    if (event.cron === "0 * * * *") {
      await sendMedicineReminders(env);
    }
  }
};

// ---------------------------------------------
// Webhook Verification
// ---------------------------------------------
async function verifyWebhook(request, env) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" }
    });
  }
  return new Response("Forbidden", { status: 403 });
}

// ---------------------------------------------
// Incoming Message Handler
// ---------------------------------------------
async function handleIncomingMessage(request, env, ctx) {
  try {
    const payload = await request.json();
    const value = payload.entry?.[0]?.changes?.[0]?.value;
    const messages = value?.messages || [];
    const contacts = value?.contacts || [];

    for (const msg of messages) {
      const from = msg.from;
      const contact = contacts.find(c => c.wa_id === from);
      const name = contact?.profile?.name || "Patient";

      await logMessage(env.DB, from, "incoming", msg);

      const session = await getSession(env.SESSIONS, from);
      const reply = await mainRouter(env, msg, name, session);

      await saveSession(env.SESSIONS, from, session);
      await sendWhatsApp(env, from, reply);
    }
  } catch (err) {
    console.error("Webhook Error:", err);
  }
}

// ---------------------------------------------
// WhatsApp Sender
// ---------------------------------------------
async function sendWhatsApp(env, to, text) {
  const url = `https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text }
    })
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("WhatsApp API Error:", err);
  }
}

// ---------------------------------------------
// Admin Notification (Dashboardless Control)
// ---------------------------------------------
async function notifyAdmin(env, message) {
  return sendWhatsApp(env, env.HOSPITAL_NOTIFICATION_NUMBER, message);
}

// ---------------------------------------------
// Session Handling (KV)
// ---------------------------------------------
async function getSession(kv, phone) {
  const data = await kv.get(`session:${phone}`, { type: "json" });
  if (!data) {
    return { state: "menu", data: {} };
  }
  return data;
}

async function saveSession(kv, phone, session) {
  session.updatedAt = new Date().toISOString();
  await kv.put(`session:${phone}`, JSON.stringify(session), {
    expirationTtl: 86400
  });
}

// ---------------------------------------------
// Message Logging (D1)
// ---------------------------------------------
async function logMessage(db, phone, direction, msg) {
  try {
    const content = msg.text?.body || `[${msg.type || "unknown"}]`;
    await db.prepare(`
      INSERT INTO message_logs
      (phone_number, direction, message_type, message_content, whatsapp_message_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(phone, direction, msg.type, content, msg.id).run();
  } catch (e) {
    console.error("DB Log Error:", e);
  }
}

// ---------------------------------------------
// Main Menu (Bilingual)
// ---------------------------------------------
function mainMenu(env, name) {
  return `🏥 ${env.HOSPITAL_NAME}

नमस्ते ${name} 👋 | Welcome

1️⃣ Book OPD Appointment  
2️⃣ Talk to Doctor (Symptoms / AI)  
3️⃣ My Bookings  
4️⃣ Emergency  
5️⃣ Hospital Info  

🕑 OPD: 2 PM – 6 PM (15 min slots)
📞 Human Help: ${env.HOSPITAL_PHONE}

Reply with number.`;
}


// =============================================
// PART 2 / 3  (OPD, SLOT, TOKEN, BOOKING LOGIC)
// =============================================

// OPD CONFIG
const OPD_START_HOUR = 14; // 2 PM
const OPD_END_HOUR = 18;   // 6 PM
const SLOT_MINUTES = 15;

// DOCTORS (RPL Hospital)
const DOCTORS = [
  { id: 1, name: "Dr. Akhilesh Kumar", dept: "Diabetes" },
  { id: 2, name: "Dr. Ankit Shukla", dept: "General Physician" },
  { id: 3, name: "Dr. A.K. Singh", dept: "ENT" },
  { id: 4, name: "Dr. Anand Mishra", dept: "Dental" }
];

// SLOT GENERATOR
function generateSlots() {
  const slots = [];
  const start = new Date();
  start.setHours(OPD_START_HOUR, 0, 0, 0);
  const end = new Date();
  end.setHours(OPD_END_HOUR, 0, 0, 0);

  let i = 1;
  let current = new Date(start);

  while (current < end) {
    const next = new Date(current.getTime() + SLOT_MINUTES * 60000);
    slots.push(`${i}. ${formatTime(current)} - ${formatTime(next)}`);
    current = next;
    i++;
  }
  return slots;
}

function formatTime(date) {
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

// APPOINTMENT SAVE
async function saveAppointment(db, phone, data) {
  const token = Math.floor(1000 + Math.random() * 9000);

  await db.prepare(`
    INSERT INTO appointments
    (phone_number, doctor_name, department, appointment_date, appointment_time, token_number)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    phone,
    data.doctor.name,
    data.doctor.dept,
    data.date,
    data.slot,
    token
  ).run();

  return token;
}

// FETCH MY BOOKINGS
async function getMyBookings(db, phone, name) {
  const rows = await db.prepare(`
    SELECT * FROM appointments
    WHERE phone_number = ?
    ORDER BY created_at DESC
    LIMIT 5
  `).bind(phone).all();

  if (!rows.results.length) {
    return `📋 ${name}

कोई booking नहीं मिली।
No bookings found.

MENU लिखें।`;
  }

  let text = `📋 ${name} - Your Appointments:\n\n`;
  rows.results.forEach(b => {
    text += `👨‍⚕️ ${b.doctor_name}
📅 ${b.appointment_date}
⏰ ${b.appointment_time}
🎫 Token: ${b.token_number}\n\n`;
  });

  return text + `MENU लिखें।`;
}

// EXTEND MAIN ROUTER WITH OPD FLOW
async function mainRouter(env, msg, name, session) {
  const text = msg.text?.body?.toLowerCase().trim() || "";

  // MAIN MENU
  if (!text || ["hi", "hello", "start", "menu"].includes(text)) {
    session.state = "menu";
    return mainMenu(env, name);
  }

  // APPOINTMENT START
  if (text === "1") {
    session.state = "choose_doctor";
    return `👨‍⚕️ Doctor चुनें / Choose Doctor:

1. Dr. Akhilesh Kumar (Diabetes, Physician)
2. Dr. Ankit Shukla (Neurologist)
3. Dr. A.K. Singh (ENT)
4. Dr. Anand Mishra (Dental)

Reply 1-4`;
  }

  // DOCTOR SELECT
  if (session.state === "choose_doctor" && ["1","2","3","4"].includes(text)) {
    const doctor = DOCTORS.find(d => d.id === parseInt(text));
    session.data.doctor = doctor;
    session.state = "choose_date";

    return `👨‍⚕️ ${doctor.name} selected.

तारीख भेजें (DD-MM-YYYY)
Send Date (DD-MM-YYYY)`;
  }

  // DATE SELECT
  if (session.state === "choose_date") {
    session.data.date = text;
    session.state = "choose_slot";
    const slots = generateSlots();

    return `📅 Date: ${text}

Available Slots (2 PM – 6 PM):
${slots.join("\n")}

Slot number भेजें।`;
  }

  // SLOT SELECT
  if (session.state === "choose_slot") {
    const slots = generateSlots();
    const index = parseInt(text) - 1;

    if (!slots[index]) return "गलत slot. फिर से चुनें।";

    session.data.slot = slots[index];
    session.state = "confirm";

    return `✅ Confirm Appointment

Doctor: ${session.data.doctor.name}
Date: ${session.data.date}
Time: ${session.data.slot}

YES लिखकर confirm करें।
Payment: Hospital में।`;
  }

  // CONFIRM
  if (session.state === "confirm" && text === "yes") {
    const token = await saveAppointment(env.DB, msg.from, session.data);

    await notifyAdmin(env, `📌 New OPD Booking

Patient: ${name}
Phone: ${msg.from}
Doctor: ${session.data.doctor.name}
Date: ${session.data.date}
Time: ${session.data.slot}
Token: ${token}`);

    session.state = "menu";
    session.data = {};

    return `🎫 Appointment Confirmed!

Doctor: ${session.data?.doctor?.name || ""}
Date: ${session.data?.date || ""}
Time: ${session.data?.slot || ""}
Token No: ${token}

🕑 OPD: 2 PM – 6 PM
Payment: Hospital में
📞 Help: ${env.HOSPITAL_PHONE}`;
  }

  // MY BOOKINGS
  if (text === "3") {
    return await getMyBookings(env.DB, msg.from, name);
  }

  // FALLBACK
  return `समझ नहीं आया।
I didn’t understand.

MENU लिखें।
📞 ${env.HOSPITAL_PHONE}`;
}


// =============================================
// PART 3 / 3  (GROQ AI, EMERGENCY, CRON, FINAL MERGE)
// =============================================

// --------- EMERGENCY KEYWORDS (HI + EN) ----------
const EMERGENCY_WORDS = [
  "chest pain","heart attack","saans","breath","unconscious","बेहोश",
  "accident","bleeding","खून","stroke","लकवा","seizure","fits",
  "pregnancy pain","delivery","labour"
];

// --------- GROQ AI CLIENT ----------
async function askGroq(env, text) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama3-70b-8192",
      messages: [
        { role: "system", content: "You are a hospital triage assistant. Reply in simple Hindi-English mix." },
        { role: "user", content: text }
      ],
      temperature: 0.2
    })
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "Please explain your problem clearly.";
}

// --------- EMERGENCY CHECK ----------
function isEmergency(text) {
  return EMERGENCY_WORDS.some(w => text.includes(w));
}

// --------- HOSPITAL INFO ----------
function hospitalInfo(env) {
  return `🏥 ${env.HOSPITAL_NAME}

📍 ${env.HOSPITAL_ADDRESS}
🕑 OPD: 2 PM – 6 PM (15 min slots)
📞 Help / Emergency Call: ${env.HOSPITAL_PHONE}

Departments:
• Physician
• Diabetes
• Neurologist
• ENT
• Dental
• Gynecology

Payment: Hospital par hi.`;
}

// --------- FINAL MAIN ROUTER (OVERRIDES PREVIOUS) ----------
async function mainRouter(env, msg, name, session) {
  const text = msg.text?.body?.toLowerCase().trim() || "";

  // MENU
  if (!text || ["hi","hello","start","menu"].includes(text)) {
    session.state = "menu";
    return mainMenu(env, name);
  }

  // EMERGENCY
  if (isEmergency(text) || text === "4") {
    await notifyAdmin(env, `🚨 EMERGENCY ALERT

Patient: ${name}
Phone: ${msg.from}
Message: ${msg.text.body}

Call immediately: ${env.HOSPITAL_PHONE}`);
    return `🚨 यह इमरजेंसी लग रही है!
This looks like an emergency.

तुरंत कॉल करें:
📞 ${env.HOSPITAL_PHONE}

या सीधे अस्पताल आएं।`;
  }

  // AI SYMPTOM CHAT
  if (text === "2" || text.length > 12) {
    const aiReply = await askGroq(env, text);
    return `🤖 AI Doctor (Preliminary):

${aiReply}

यदि OPD appointment चाहिए तो 1 लिखें।
Type 1 to book appointment.
📞 Emergency: ${env.HOSPITAL_PHONE}`;
  }

  // HOSPITAL INFO
  if (text === "5") {
    return hospitalInfo(env);
  }

  // MY BOOKINGS
  if (text === "3") {
    return await getMyBookings(env.DB, msg.from, name);
  }

  // APPOINTMENT FLOW (PART-2 LOGIC REUSED)
  if (text === "1") {
    session.state = "choose_doctor";
    return `👨‍⚕️ Doctor चुनें / Choose Doctor:

1. Dr. Akhilesh Kumar (Diabetes)
2. Dr. Ankit Shukla (Physician)
3. Dr. A.K. Singh (ENT)
4. Dr. Anand Mishra (Dental)

Reply 1-4`;
  }

  if (session.state === "choose_doctor" && ["1","2","3","4"].includes(text)) {
    const doctor = DOCTORS.find(d => d.id === parseInt(text));
    session.data.doctor = doctor;
    session.state = "choose_date";
    return `👨‍⚕️ ${doctor.name} selected.

तारीख भेजें (DD-MM-YYYY)
Send Date (DD-MM-YYYY)`;
  }

  if (session.state === "choose_date") {
    session.data.date = text;
    session.state = "choose_slot";
    const slots = generateSlots();
    return `📅 Date: ${text}

Available Slots (2 PM – 6 PM):
${slots.join("\n")}

Slot number भेजें।`;
  }

  if (session.state === "choose_slot") {
    const slots = generateSlots();
    const index = parseInt(text) - 1;
    if (!slots[index]) return "गलत slot. फिर से चुनें।";
    session.data.slot = slots[index];
    session.state = "confirm";
    return `✅ Confirm Appointment

Doctor: ${session.data.doctor.name}
Date: ${session.data.date}
Time: ${session.data.slot}

YES लिखकर confirm करें।
Payment: Hospital में।`;
  }

  if (session.state === "confirm" && text === "yes") {
    const token = await saveAppointment(env.DB, msg.from, session.data);

    await notifyAdmin(env, `📌 New OPD Booking

Patient: ${name}
Phone: ${msg.from}
Doctor: ${session.data.doctor.name}
Date: ${session.data.date}
Time: ${session.data.slot}
Token: ${token}`);

    session.state = "menu";
    session.data = {};

    return `🎫 Appointment Confirmed!

Doctor: ${session.data?.doctor?.name || ""}
Date: ${session.data?.date || ""}
Time: ${session.data?.slot || ""}
Token No: ${token}

🕑 OPD: 2 PM – 6 PM
Payment: Hospital में
📞 Help: ${env.HOSPITAL_PHONE}`;
  }

  return `समझ नहीं आया।
I didn’t understand.

MENU लिखें।
📞 ${env.HOSPITAL_PHONE}`;
}

// --------- CRON JOB LOGIC ----------
async function sendAppointmentReminders(env) {
  const rows = await env.DB.prepare(`
    SELECT phone_number, doctor_name, appointment_time 
    FROM appointments
    WHERE appointment_date = date('now')
  `).all();

  for (const r of rows.results) {
    await sendWhatsApp(env, r.phone_number,
      `⏰ Reminder from ${env.HOSPITAL_NAME}

Today Appointment:
Doctor: ${r.doctor_name}
Time: ${r.appointment_time}

Please come 10 minutes early.
📞 ${env.HOSPITAL_PHONE}`);
  }
}

async function sendDailyAdminReport(env) {
  const total = await env.DB.prepare(`SELECT COUNT(*) as c FROM appointments`).first();
  const today = await env.DB.prepare(`
    SELECT COUNT(*) as c FROM appointments 
    WHERE date(appointment_date) = date('now')
  `).first();

  const msg = `📊 RPL Hospital Daily Report

Total Appointments: ${total.c}
Today: ${today.c}
OPD: 2PM–6PM (15 min slots)

System Status: OK`;

  await notifyAdmin(env, msg);
}

async function sendMedicineReminders(env) {
  // Future extension
}
