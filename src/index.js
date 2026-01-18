// =============================================
// RPL HOSPITAL – AI WHATSAPP RECEPTIONIST
// PART 1 / 3 : CORE + CONVERSATION BRAIN
// =============================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/webhook") {
      return verifyWebhook(request, env);
    }

    if (request.method === "POST" && url.pathname === "/webhook") {
      await handleIncoming(request, env, ctx);
      return new Response("OK", { status: 200 });
    }

    return new Response("Not Found", { status: 404 });
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
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// ---------------------------------------------
// Incoming WhatsApp Handler
// ---------------------------------------------
async function handleIncoming(request, env, ctx) {
  try {
    const body = await request.json();
    const value = body.entry?.[0]?.changes?.[0]?.value;
    const messages = value?.messages || [];
    const contacts = value?.contacts || [];

    for (const msg of messages) {
      const phone = msg.from;
      const contact = contacts.find(c => c.wa_id === phone);
      const name = contact?.profile?.name || "Patient";
      const text = msg.text?.body || "";

      const session = await getSession(env.SESSIONS, phone);

      const reply = await aiRouter(env, text, phone, name, session);

      await saveSession(env.SESSIONS, phone, session);
      await sendWhatsApp(env, phone, reply);
      await logMessage(env.DB, phone, "incoming", text);
    }
  } catch (e) {
    console.error("Webhook error:", e);
  }
}


// ---------------------------------------------
// Language Detection (Simple Heuristic)
// ---------------------------------------------
function detectLanguage(text) {
  const hindiChars = /[अ-ह]/;
  if (hindiChars.test(text)) return "hi";
  return "en";
}

// ---------------------------------------------
// Emergency Keywords
// ---------------------------------------------
function isEmergency(text) {
  const t = text.toLowerCase();
  const words = [
    "chest pain", "heart", "breath", "unconscious", "accident", "bleeding",
    "stroke", "seizure", "fits", "बेहोश", "सांस", "खून", "दौरा", "लकवा"
  ];
  return words.some(w => t.includes(w));
}

// ---------------------------------------------
// Groq AI Call (Respectful, Human Tone)
// ---------------------------------------------
async function askGroq(env, text, lang) {
  const systemPrompt = lang === "hi"
    ? `आप एक अस्पताल के रिसेप्शन पर बैठे एक विनम्र सहायक हैं।
मरीज से "आप" कहकर बात करें।
जिस भाषा में मरीज बोले, उसी में जवाब दें।
कोई तकनीकी शब्द या कीमत का ज़िक्र न करें।
डॉक्टर, जाँच, समय, और सहायता प्राकृतिक भाषा में बताइए।`
    : `You are a polite hospital receptionist in India.
Speak respectfully using "you".
Reply in the same language as the patient.
Do not mention prices or technical jargon.
Talk naturally like a human at a reception counter.`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama3-70b-8192",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ],
      temperature: 0.3
    })
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "कृपया अपनी बात थोड़ी और स्पष्ट बताइए।";
}

// ---------------------------------------------
// WhatsApp Sender
// ---------------------------------------------
async function sendWhatsApp(env, to, text) {
  await fetch(`https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
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
}

// ---------------------------------------------
// Admin Notification
// ---------------------------------------------
async function notifyAdmin(env, message) {
  return sendWhatsApp(env, env.HOSPITAL_NOTIFICATION_NUMBER, message);
}

// ---------------------------------------------
// Session (KV)
// ---------------------------------------------
async function getSession(kv, phone) {
  const s = await kv.get(`session:${phone}`, { type: "json" });
  return s || { step: "idle", memory: {} };
}

async function saveSession(kv, phone, session) {
  await kv.put(`session:${phone}`, JSON.stringify(session), { expirationTtl: 86400 });
}

// ---------------------------------------------
// Message Logging (D1)
// ---------------------------------------------
async function logMessage(db, phone, direction, content) {
  try {
    await db.prepare(`
      INSERT INTO message_logs (phone_number, direction, message_type, message_content)
      VALUES (?, ?, ?, ?)
    `).bind(phone, direction, "text", content).run();
  } catch (e) {
    console.error("DB log error:", e);
  }
}

// =============================================
// PART 2 / 3 : OPD + DOCTORS + LAB + PATIENT DB
// =============================================

// OPD Configuration
const OPD_START = 14; // 2 PM
const OPD_END = 18;   // 6 PM
const SLOT_MINUTES = 15;

// Doctor Directory (RPL Hospital)
const DOCTORS = [
  { id: 1, name: "Dr. Akhilesh Kumar", dept: "Physician & Diabetes" },
  { id: 2, name: "Dr. Ankit Shukla", dept: "Neurologist" },
  { id: 3, name: "Dr. A.K. Singh", dept: "ENT" },
  { id: 4, name: "Dr. Anand Mishra", dept: "Dental" }
];

// Lab Test List (extendable)
const LAB_TESTS = [
  "CBC", "Blood Sugar", "Thyroid", "LFT", "KFT", "Lipid Profile", "Urine Test"
];

// Generate OPD Slots
function generateSlots() {
  const slots = [];
  let start = new Date();
  start.setHours(OPD_START, 0, 0, 0);

  let end = new Date();
  end.setHours(OPD_END, 0, 0, 0);

  let i = 1;
  let current = new Date(start);

  while (current < end) {
    const next = new Date(current.getTime() + SLOT_MINUTES * 60000);
    slots.push(`${i}. ${formatTime(current)} – ${formatTime(next)}`);
    current = next;
    i++;
  }
  return slots;
}

function formatTime(date) {
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

// Save Patient (Master Record)
async function savePatient(db, phone, name) {
  const existing = await db.prepare(`SELECT * FROM patients WHERE phone_number = ?`).bind(phone).first();
  if (existing) {
    await db.prepare(`
      UPDATE patients SET last_visit = CURRENT_TIMESTAMP, total_visits = total_visits + 1
      WHERE phone_number = ?
    `).bind(phone).run();
  } else {
    await db.prepare(`
      INSERT INTO patients (phone_number, name, first_visit, last_visit, total_visits)
      VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
    `).bind(phone, name).run();
  }
}

// Save OPD Appointment
async function saveAppointment(db, phone, name, doctor, date, time) {
  const token = Math.floor(1000 + Math.random() * 9000);

  await db.prepare(`
    INSERT INTO appointments
    (phone_number, doctor_name, department, appointment_date, appointment_time, token_number)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(phone, doctor.name, doctor.dept, date, time, token).run();

  return token;
}

// Save Lab Test Booking
async function saveLabTest(db, phone, name, test, date, time) {
  await db.prepare(`
    INSERT INTO lab_tests
    (phone_number, patient_name, test_name, test_date, test_time, status)
    VALUES (?, ?, ?, ?, ?, 'booked')
  `).bind(phone, name, test, date, time).run();
}

// Fetch Patient Appointments
async function getPatientHistory(db, phone, name) {
  const rows = await db.prepare(`
    SELECT doctor_name, appointment_date, appointment_time, token_number
    FROM appointments WHERE phone_number = ?
    ORDER BY created_at DESC LIMIT 5
  `).bind(phone).all();

  if (!rows.results.length) {
    return `जी ${name}, अभी तक आपकी कोई पुरानी OPD एंट्री नहीं मिली है।`;
  }

  let text = `जी ${name}, आपकी पिछली OPD बुकिंग:\n\n`;
  rows.results.forEach(r => {
    text += `👨‍⚕️ ${r.doctor_name}\n📅 ${r.appointment_date}\n⏰ ${r.appointment_time}\n🎫 Token: ${r.token_number}\n\n`;
  });

  return text;
}

// AI Intent Helper (Doctor Suggestion by Symptoms)
function suggestDoctorBySymptoms(text) {
  const t = text.toLowerCase();

  if (t.includes("sugar") || t.includes("diabetes") || t.includes("कमजोरी") || t.includes("शुगर"))
    return DOCTORS[0]; // Akhilesh Kumar

  if (t.includes("head") || t.includes("dimaag") || t.includes("fits") || t.includes("दौरा") || t.includes("लकवा"))
    return DOCTORS[1]; // Ankit Shukla

  if (t.includes("ear") || t.includes("nose") || t.includes("throat") || t.includes("kan") || t.includes("naak"))
    return DOCTORS[2]; // ENT

  if (t.includes("tooth") || t.includes("daant") || t.includes("dental"))
    return DOCTORS[3]; // Dental

  return DOCTORS[0]; // Default Physician
}

// Detect Lab Test Intent
function detectLabTest(text) {
  return LAB_TESTS.find(t => text.toLowerCase().includes(t.toLowerCase()));
 }

// Greeting handling
if (["hi", "hello", "namaste", "hii", "hey"].includes(t)) {
  return lang === "hi"
    ? `नमस्ते ${name} जी। आप किस समस्या के लिए बात कर रहे हैं? डॉक्टर दिखाना है, जाँच करानी है, या कोई और जानकारी चाहिए?`
    : `Hello ${name}. How can I help you today? Are you looking for a doctor, a lab test, or some information?`;
}

 // =============================================
// PART 3 / 3 : FULL CONVERSATION FLOW & FINAL AI BRAIN
// =============================================

async function aiRouter(env, userText, phone, name, session) {
  const lang = detectLanguage(userText);
  const t = userText.toLowerCase();

  // 1. Emergency
  if (isEmergency(userText)) {
    await notifyAdmin(env, `🚨 EMERGENCY ALERT\nName: ${name}\nPhone: ${phone}\nMsg: ${userText}`);
    return lang === "hi"
      ? `यह स्थिति गंभीर लग रही है। कृपया तुरंत ${env.HOSPITAL_PHONE} पर कॉल करें या सीधे अस्पताल आइए।`
      : `This looks serious. Please call ${env.HOSPITAL_PHONE} immediately or come to the hospital.`;
  }

  // 2. If patient asking about previous visit
  if (t.includes("history") || t.includes("pichhli") || t.includes("pehle") || t.includes("last time")) {
    return await getPatientHistory(env.DB, phone, name);
  }

  // 3. Lab test intent
  const labTest = detectLabTest(userText);
  if (labTest && !session.step) {
    session.step = "lab_date";
    session.lab = { test: labTest };
    return lang === "hi"
      ? `जी, ${labTest} की जाँच उपलब्ध है। किस तारीख को आना चाहेंगे?`
      : `${labTest} test is available. Which date would you like to come?`;
  }

  if (session.step === "lab_date") {
    session.lab.date = userText;
    session.step = "lab_time";
    return lang === "hi"
      ? `ठीक है, ${userText} को किस समय आना चाहेंगे?`
      : `Alright, what time on ${userText}?`;
  }

  if (session.step === "lab_time") {
    session.lab.time = userText;
    await saveLabTest(env.DB, phone, name, session.lab.test, session.lab.date, session.lab.time);
    await savePatient(env.DB, phone, name);

    await notifyAdmin(env, `🧪 New Lab Booking\nPatient: ${name}\nPhone: ${phone}\nTest: ${session.lab.test}\nDate: ${session.lab.date}\nTime: ${session.lab.time}`);

    session.step = null;
    session.lab = null;

    return lang === "hi"
      ? `आपकी ${session.lab?.test || ""} की जाँच बुक हो गई है। कृपया तय समय पर आइए।`
      : `Your lab test has been booked. Please come at the scheduled time.`;
  }

  // 4. OPD / Doctor intent
  const doctor = suggestDoctorBySymptoms(userText);

  if (!session.step) {
    session.step = "opd_date";
    session.doctor = doctor;
    return lang === "hi"
      ? `आपकी समस्या के लिए ${doctor.name} (${doctor.dept}) उपयुक्त रहेंगे। आप किस तारीख को दिखाना चाहेंगे?`
      : `For your concern, ${doctor.name} (${doctor.dept}) would be suitable. Which date would you like to visit?`;
  }

  if (session.step === "opd_date") {
    session.date = userText;
    session.step = "opd_slot";

    const slots = generateSlots().join("\n");
    return lang === "hi"
      ? `ठीक है, ${userText} को OPD 2 से 6 बजे तक है। उपलब्ध समय:\n${slots}\nआप कौन सा समय चाहेंगे?`
      : `OPD is from 2 PM to 6 PM on ${userText}. Available slots:\n${slots}\nWhich time suits you?`;
  }

  if (session.step === "opd_slot") {
    session.slot = userText;
    session.step = "confirm";

    return lang === "hi"
      ? `आपका अपॉइंटमेंट ${session.doctor.name} के साथ ${session.date} को ${session.slot} पर तय किया जा रहा है। क्या मैं इसे पक्का कर दूँ?`
      : `Shall I confirm your appointment with ${session.doctor.name} on ${session.date} at ${session.slot}?`;
  }

  if (session.step === "confirm" && (t.includes("haan") || t.includes("yes") || t.includes("ok"))) {
    const token = await saveAppointment(
      env.DB,
      phone,
      name,
      session.doctor,
      session.date,
      session.slot
    );

    await savePatient(env.DB, phone, name);

    await notifyAdmin(env, `📌 New OPD Booking\nPatient: ${name}\nPhone: ${phone}\nDoctor: ${session.doctor.name}\nDate: ${session.date}\nTime: ${session.slot}\nToken: ${token}`);

    session.step = null;
    session.doctor = null;

    return lang === "hi"
      ? `आपका अपॉइंटमेंट पक्का हो गया है।\nडॉक्टर: ${session.doctor?.name || ""}\nतारीख: ${session.date}\nसमय: ${session.slot}\nटोकन: ${token}\nकृपया 10 मिनट पहले पहुँचे।`
      : `Your appointment is confirmed.\nDoctor: ${session.doctor?.name || ""}\nDate: ${session.date}\nTime: ${session.slot}\nToken: ${token}\nPlease arrive 10 minutes early.`;
  }

  // 5. Fallback – polite, natural
  const groqReply = await askGroq(env, userText, lang);
  return groqReply;
}
