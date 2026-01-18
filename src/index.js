// ===============================
// RPL HOSPITAL AI WHATSAPP SYSTEM
// FILE: src/index.js
// PART 1 / 4 – CORE ENGINE
// ===============================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Webhook verification (Meta)
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

  // Cron triggers (as per wrangler.toml)
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

// -------------------------------
// 1. WEBHOOK VERIFICATION
// -------------------------------
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

// -------------------------------
// 2. MESSAGE RECEIVER
// -------------------------------
async function handleIncomingMessage(request, env, ctx) {
  try {
    const payload = await request.json();
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages = value?.messages || [];
    const contacts = value?.contacts || [];

    for (const msg of messages) {
      const from = msg.from;
      const contact = contacts.find(c => c.wa_id === from);
      const name = contact?.profile?.name || "Patient";

      // Save incoming message
      await logMessage(env.DB, from, "incoming", msg);

      // Get session
      const session = await getSession(env.SESSIONS, from);

      // Process text (AI + Rules later in PART 3)
      const reply = await routeMessage(env, msg, name, session);

      // Update session
      await saveSession(env.SESSIONS, from, reply);

      // Send reply to patient
      await sendWhatsApp(env, from, reply);

      // Notify admin for every new conversation start
      if (!session || session.state === "new") {
        await notifyAdmin(env, `🆕 New patient: ${name}\n📞 ${from}`);
      }
    }
  } catch (err) {
    console.error("Webhook Error:", err);
  }
}

// -------------------------------
// 3. WHATSAPP SENDER
// -------------------------------
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

// -------------------------------
// 4. ADMIN NOTIFICATION
// -------------------------------
async function notifyAdmin(env, message) {
  return sendWhatsApp(env, env.HOSPITAL_NOTIFICATION_NUMBER, message);
}

// -------------------------------
// 5. SESSION HANDLING (KV)
// -------------------------------
async function getSession(kv, phone) {
  const data = await kv.get(`session:${phone}`, { type: "json" });
  return data || { state: "new", data: {} };
}

async function saveSession(kv, phone, lastReply) {
  const session = {
    state: "active",
    lastReply,
    updatedAt: new Date().toISOString()
  };
  await kv.put(`session:${phone}`, JSON.stringify(session), {
    expirationTtl: 86400
  });
}

// -------------------------------
// 6. MESSAGE LOGGING (D1)
// -------------------------------
async function logMessage(db, phone, direction, msg) {
  try {
    const content = msg.text?.body || `[${msg.type || "unknown"}]`;
    await db.prepare(`
      INSERT INTO message_logs
      (phone_number, direction, message_type, message_content, whatsapp_message_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(phone, direction, msg.type, content, msg.id).run();
  } catch (e) {
    console.error("DB log error:", e);
  }
}

// -------------------------------
// 7. BASIC ROUTER (Placeholder)
// Real logic, OPD, AI, slots – PART 2 & 3
// -------------------------------
async function routeMessage(env, msg, name, session) {
  const text = msg.text?.body?.toLowerCase() || "";

  if (["hi", "hello", "start", "menu"].includes(text) || session.state === "new") {
    return `🏥 ${env.HOSPITAL_NAME}

नमस्ते ${name} 👋
Welcome to RPL Hospital AI Reception.

1️⃣ Appointment Booking  
2️⃣ Talk to Doctor (Symptoms)  
3️⃣ My Bookings  
4️⃣ Emergency  
5️⃣ Hospital Info  

Reply with number.
📞 For human help call: ${env.HOSPITAL_PHONE}`;
  }

  return `आपका संदेश प्राप्त हुआ है।
Your message is received.

Type MENU to start again.
📞 ${env.HOSPITAL_PHONE}`;
}

// -------------------------------
// 8. CRON PLACEHOLDERS (PART 4 will fill)
// -------------------------------
async function sendAppointmentReminders(env) {
  await notifyAdmin(env, "⏰ Morning Reminder Job Executed");
}

async function sendDailyAdminReport(env) {
  await notifyAdmin(env, "📊 Daily OPD Summary Job Executed");
}

async function sendMedicineReminders(env) {
  // Future expansion
}

// ===============================
// PART 2 / 4 – OPD & APPOINTMENT ENGINE
// ===============================

// OPD Configuration
const OPD_START_HOUR = 14; // 2 PM
const OPD_END_HOUR = 18;   // 6 PM
const SLOT_MINUTES = 15;

// Doctors & Departments (Real RPL Hospital)
const DOCTORS = [
  { id: 1, name: "Dr. Akhilesh Kumar", dept: "Diabetes", lang: "Hindi/English" },
  { id: 2, name: "Dr. Ankit Shukla", dept: "General Physician", lang: "Hindi/English" },
  { id: 3, name: "Dr. A.K. Singh", dept: "ENT", lang: "Hindi/English" },
  { id: 4, name: "Dr. Anand Mishra", dept: "Dental", lang: "Hindi/English" }
];

// Extend router with appointment logic
async function routeMessage(env, msg, name, session) {
  const text = msg.text?.body?.toLowerCase().trim() || "";

  // MAIN MENU
  if (["hi", "hello", "start", "menu"].includes(text) || session.state === "new") {
    return `🏥 ${env.HOSPITAL_NAME}

नमस्ते ${name} 👋
Welcome to RPL Hospital AI Reception.

1️⃣ Appointment Booking  
2️⃣ Talk to Doctor (Symptoms)  
3️⃣ My Bookings  
4️⃣ Emergency  
5️⃣ Hospital Info  

Reply with number.
📞 Human Help: ${env.HOSPITAL_PHONE}`;
  }

  // APPOINTMENT START
  if (text === "1") {
    session.state = "choose_doctor";
    return getDoctorMenu();
  }

  // DOCTOR SELECTION
  if (session.state === "choose_doctor" && ["1","2","3","4"].includes(text)) {
    const doctor = DOCTORS.find(d => d.id === parseInt(text));
    session.data = { doctor };
    session.state = "choose_date";
    return `👨‍⚕️ ${doctor.name} (${doctor.dept})

कृपया तारीख भेजें (DD-MM-YYYY)
Please send appointment date (DD-MM-YYYY)`;
  }

  // DATE SELECTION
  if (session.state === "choose_date") {
    const date = text;
    session.data.date = date;
    session.state = "choose_slot";
    const slots = generateSlots();
    return `📅 Date: ${date}

Available Slots (2 PM – 6 PM):
${slots.join("\n")}

Reply slot number`;
  }

  // SLOT SELECTION
  if (session.state === "choose_slot") {
    const slotIndex = parseInt(text) - 1;
    const slots = generateSlots();
    if (!slots[slotIndex]) return "Invalid slot. Try again.";

    session.data.slot = slots[slotIndex];
    session.state = "confirm";

    return `✅ Confirm Appointment

Doctor: ${session.data.doctor.name}
Date: ${session.data.date}
Time: ${session.data.slot}

Reply YES to confirm
Payment at Hospital`;
  }

  // CONFIRM BOOKING
  if (session.state === "confirm" && text === "yes") {
    const token = await saveAppointment(env.DB, session.data);
    await notifyAdmin(env, `📌 New Appointment\nDoctor: ${session.data.doctor.name}\nDate: ${session.data.date}\nTime: ${session.data.slot}\nToken: ${token}`);

    session.state = "done";
    return `🎫 Appointment Confirmed!

Doctor: ${session.data.doctor.name}
Date: ${session.data.date}
Time: ${session.data.slot}
Token No: ${token}

Payment at Hospital
📞 Help: ${env.HOSPITAL_PHONE}`;
  }

  // MY BOOKINGS
  if (text === "3") {
    return await getMyBookings(env.DB, msg.from, name);
  }

  return `समझ नहीं आया।
I didn’t understand.

Type MENU to start again.
📞 ${env.HOSPITAL_PHONE}`;
}

// Generate 15-minute slots
function generateSlots() {
  const slots = [];
  let current = new Date();
  current.setHours(OPD_START_HOUR, 0, 0, 0);

  const end = new Date();
  end.setHours(OPD_END_HOUR, 0, 0, 0);

  let i = 1;
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

// Save appointment in DB
async function saveAppointment(db, data) {
  const token = Math.floor(1000 + Math.random() * 9000);
  await db.prepare(`
    INSERT INTO appointments (doctor_name, department, appointment_date, appointment_time, token_number)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    data.doctor.name,
    data.doctor.dept,
    data.date,
    data.slot,
    token
  ).run();

  return token;
}

// Fetch user bookings
async function getMyBookings(db, phone, name) {
  const rows = await db.prepare(`
    SELECT * FROM appointments
    WHERE phone_number = ?
    ORDER BY created_at DESC
    LIMIT 5
  `).bind(phone).all();

  if (!rows.results.length) {
    return `📋 ${name}, कोई booking नहीं मिली।
No bookings found.

Type MENU to book.`;
  }

  let text = `📋 ${name}, आपकी bookings:\n\n`;
  rows.results.forEach(b => {
    text += `👨‍⚕️ ${b.doctor_name}
📅 ${b.appointment_date}
⏰ ${b.appointment_time}
🎫 Token: ${b.token_number}\n\n`;
  });

  return text;
}


// ===============================
// PART 3 / 4 – GROQ AI TRIAGE & EMERGENCY
// ===============================

// Emergency keyword list (Hindi + English)
const EMERGENCY_KEYWORDS = [
  "chest pain", "heart attack", "saans nahi aa rahi", "breathless",
  "unconscious", "बेहोश", "accident", "bahut bleeding", "खून बह रहा",
  "stroke", "लकवा", "fits", "seizure", "pregnancy pain", "delivery pain"
];

// Department mapping rules
const DEPT_RULES = [
  { dept: "Cardiology", keywords: ["chest", "heart", "bp", "pressure"] },
  { dept: "Diabetes", keywords: ["sugar", "glucose", "diabetes"] },
  { dept: "ENT", keywords: ["ear", "kan", "throat", "gala", "nose", "naak"] },
  { dept: "Dental", keywords: ["tooth", "daant", "dard"] },
  { dept: "Gynecology", keywords: ["period", "pregnancy", "bleeding"] },
  { dept: "General", keywords: ["fever", "bukhar", "pain", "dard", "vomit"] }
];

// Groq AI call
async function askGroq(env, userText) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama3-70b-8192",
      messages: [
        {
          role: "system",
          content: "You are a hospital triage assistant. Detect emergency. Suggest department. Reply in simple Hindi and English mix."
        },
        { role: "user", content: userText }
      ],
      temperature: 0.2
    })
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "Please describe your problem in detail.";
}

// Emergency detection
function isEmergency(text) {
  return EMERGENCY_KEYWORDS.some(k => text.includes(k));
}

// Department guess by rules
function detectDepartment(text) {
  for (const rule of DEPT_RULES) {
    for (const k of rule.keywords) {
      if (text.includes(k)) return rule.dept;
    }
  }
  return "General";
}

// Extend routeMessage with AI & Emergency
async function routeMessage(env, msg, name, session) {
  const text = msg.text?.body?.toLowerCase().trim() || "";

  // Emergency check
  if (isEmergency(text)) {
    const alert = `🚨 EMERGENCY ALERT

Patient: ${name}
Number: ${msg.from}
Message: ${msg.text.body}

Advise immediate call: ${env.HOSPITAL_PHONE}`;
    await notifyAdmin(env, alert);

    return `🚨 यह इमरजेंसी लग रही है!
This looks like an emergency.

कृपया तुरंत कॉल करें:
📞 ${env.HOSPITAL_PHONE}

या सीधे अस्पताल आएं।`;
  }

  // Symptom AI
  if (text.startsWith("2") || text.includes("pain") || text.includes("dard") || text.length > 15) {
    const dept = detectDepartment(text);
    const aiReply = await askGroq(env, text);

    let doctorSuggestion = DOCTORS.find(d => d.dept.toLowerCase().includes(dept.toLowerCase())) || DOCTORS[1];

    return `🤖 AI Analysis:

${aiReply}

Suggested Department: ${dept}
Doctor: ${doctorSuggestion.name}

Reply 1 to book appointment with this doctor.
Reply MENU to go back.

📞 Emergency Call: ${env.HOSPITAL_PHONE}`;
  }

  // Fallback to appointment engine (PART 2 logic)
  return await appointmentRouter(env, msg, name, session);
}

// Wrapper to avoid conflict with earlier logic
async function appointmentRouter(env, msg, name, session) {
  const text = msg.text?.body?.toLowerCase().trim() || "";

  if (["hi", "hello", "start", "menu"].includes(text) || session.state === "new") {
    return `🏥 ${env.HOSPITAL_NAME}

नमस्ते ${name} 👋
Welcome to RPL Hospital AI Reception.

1️⃣ Appointment Booking  
2️⃣ Talk to Doctor (Symptoms)  
3️⃣ My Bookings  
4️⃣ Emergency  
5️⃣ Hospital Info  

Reply with number.
📞 Human Help: ${env.HOSPITAL_PHONE}`;
  }

  // Reuse appointment flow from PART 2
  return await handleAppointmentFlow(env, msg, name, session);
  }


  // ===============================
// PART 4 / 4 – ADMIN REPORTS, CRON, HOSPITAL INFO, FINAL ROUTER
// ===============================

// Hospital Info
function hospitalInfo(env) {
  return `🏥 ${env.HOSPITAL_NAME}

📍 ${env.HOSPITAL_ADDRESS}
📞 OPD / Help: ${env.HOSPITAL_PHONE}

🕑 OPD Time:
2:00 PM – 6:00 PM
(15 Minute Slot System)

Departments:
• General Physician
• Diabetes
• ENT
• Dental
• Gynecology

Payment: At Hospital Only`;
}

// Daily Admin Analytics
async function sendDailyAdminReport(env) {
  try {
    const total = await env.DB.prepare(`SELECT COUNT(*) as c FROM appointments`).first();
    const today = await env.DB.prepare(`
      SELECT COUNT(*) as c FROM appointments 
      WHERE date(created_at) = date('now')
    `).first();

    const msg = `📊 RPL Hospital Daily Report

Total Appointments: ${total.c}
Today Appointments: ${today.c}

OPD Timing: 2PM–6PM
Slot: 15 Minutes

System Status: OK`;

    await notifyAdmin(env, msg);
  } catch (e) {
    await notifyAdmin(env, "⚠️ Daily report generation failed");
  }
}

// Appointment Reminder Cron
async function sendAppointmentReminders(env) {
  const rows = await env.DB.prepare(`
    SELECT phone_number, doctor_name, appointment_time 
    FROM appointments
    WHERE date(appointment_date) = date('now')
  `).all();

  for (const r of rows.results) {
    await sendWhatsApp(env, r.phone_number,
      `⏰ Reminder from ${env.HOSPITAL_NAME}

Today Appointment:
Doctor: ${r.doctor_name}
Time: ${r.appointment_time}

Please reach 10 minutes early.
📞 ${env.HOSPITAL_PHONE}`);
  }
}

// Medicine Reminder Placeholder
async function sendMedicineReminders(env) {
  // Future expansion
}

// ===============================
// FINAL ROUTER HOOK (single entry)
// ===============================
async function handleAppointmentFlow(env, msg, name, session) {
  const text = msg.text?.body?.toLowerCase().trim() || "";

  if (text === "5") return hospitalInfo(env);

  if (text === "4") {
    return `🚨 Emergency Case

कृपया तुरंत कॉल करें:
📞 ${env.HOSPITAL_PHONE}

या अस्पताल आएं तुरंत।

Admin को सूचना भेजी जा रही है...`;
  }

  // fallback to PART 2 booking logic
  return await routeMessage(env, msg, name, session);
}

// ===============================
// END OF FILE
// ===============================
