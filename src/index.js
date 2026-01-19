/**
 * RPL HOSPITAL - AI RECEPTIONIST v4.1 (ZERO COST OPTIMIZED)
 * ==========================================================
 * STRICT 24-HOUR WINDOW COMPLIANCE - USER-INITIATED ONLY
 * All messages sent ONLY when user messages first (within 24h window)
 */

export default {
  async fetch(request, env, ctx) {
    const { method } = request;
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "active",
        version: "4.1-zero-cost",
        messaging: "user-initiated-only"
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (method === "GET" && url.pathname === "/webhook") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
        return new Response(challenge, { status: 200 });
      }
      return new Response("Forbidden", { status: 403 });
    }

    if (method === "POST" && url.pathname === "/webhook") {
      try {
        const body = await request.json();
        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;

        if (value?.messages) {
          ctx.waitUntil(processMessages(value, env, ctx));
        }

        return new Response("EVENT_RECEIVED", { status: 200 });
      } catch (err) {
        console.error("Webhook Error:", err);
        return new Response("Error", { status: 500 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },

  // CRON JOBS - DISABLED (Zero Cost Strategy)
  async scheduled(event, env, ctx) {
    // All automated messages are DISABLED to comply with 24-hour window
    // Reminders will be shown when user initiates conversation
    console.log("Cron disabled for zero-cost operation");
  }
};

// ============================================
// MESSAGE PROCESSOR (24-Hour Window Aware)
// ============================================
async function processMessages(value, env, ctx) {
  const messages = value.messages;
  const contacts = value.contacts || [];

  for (const msg of messages) {
    if (msg.type !== "text") continue;

    const from = msg.from;
    const name = contacts.find(c => c.wa_id === from)?.profile?.name || "मरीज";
    const text = msg.text.body.trim();
    const msgId = msg.id;

    try {
      // Mark as read (free within 24h window)
      await markAsRead(env, msgId);

      // Log to DB
      await logMessage(env.DB, from, "incoming", text, msgId);

      // Get/Update Session with 24h window timestamp
      const session = await getSession(env.SESSIONS, from, name);
      session.lastUserMessage = Date.now(); // Track for 24h window
      session.windowExpiry = Date.now() + (24 * 60 * 60 * 1000); // 24 hours from now

      // Emergency Priority
      if (isEmergency(text)) {
        await handleEmergency(env, from, name, text, session);
        await saveSession(env.SESSIONS, from, session);
        continue;
      }

      // Check for pending reminders/notifications (show when user messages)
      const pendingItems = await checkPendingNotifications(env.DB, from);

      // Get Patient Context
      const history = await getPatientHistory(env.DB, from);
      const queueInfo = await getQueueStatus(env.DB);

      // AI Processing
      const ai = await callAI(env, {
        name, from, history, text, session, queueInfo, pendingItems
      });

      // Execute Actions
      if (ai.actions?.length > 0) {
        await executeActions(env, from, name, ai.actions);
      }

      // Send Reply (within 24h window - safe)
      await sendMessage(env, from, ai.reply, msgId);

      // Update Session
      session.lastInteraction = Date.now();
      session.lastIntent = ai.intent || "general";
      session.conversationCount = (session.conversationCount || 0) + 1;
      await saveSession(env.SESSIONS, from, session);

      // Log outgoing
      await logMessage(env.DB, from, "outgoing", ai.reply, `resp_${Date.now()}`);

      // Staff Notification (only for critical items)
      if (ai.staffNote) {
        await notifyStaff(env, `🏥 ${name}: ${ai.staffNote}`);
      }

    } catch (error) {
      console.error(`Error for ${from}:`, error);
      // Send error message (still within 24h window since user just messaged)
      await sendMessage(env, from, "नमस्ते! तकनीकी समस्या है। कृपया फोन करें: " + env.HOSPITAL_PHONE);
    }
  }
}

// ============================================
// CHECK PENDING NOTIFICATIONS (Show when user messages)
// ============================================
async function checkPendingNotifications(db, phone) {
  try {
    const items = [];

    // Check upcoming appointments (tomorrow)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];

    const apt = await db.prepare(
      `SELECT doctor_name, appointment_time, token_number 
             FROM appointments 
             WHERE phone_number = ? AND appointment_date = ? AND status = 'confirmed'`
    ).bind(phone, dateStr).first();

    if (apt) {
      items.push(`⏰ याद रखें: कल ${apt.appointment_time} बजे ${apt.doctor_name} के साथ अपॉइंटमेंट है। टोकन: ${apt.token_number}`);
    }

    // Check medicine reminders for today
    const currentHour = new Date().getHours();
    const reminders = await db.prepare(
      `SELECT medicine_name, reminder_time 
             FROM medicine_reminders 
             WHERE phone_number = ? AND active = 1`
    ).bind(phone).all();

    for (const rem of reminders.results) {
      const reminderHour = parseInt(rem.reminder_time.split(':')[0]);
      if (reminderHour === currentHour) {
        items.push(`💊 दवाई का समय: ${rem.medicine_name}`);
      }
    }

    return items.length > 0 ? items.join('\n\n') : null;
  } catch (e) {
    return null;
  }
}

// ============================================
// AI ENGINE (Enhanced with Pending Items)
// ============================================
async function callAI(env, ctx) {
  const pendingInfo = ctx.pendingItems ? `\n\nPENDING ITEMS:\n${ctx.pendingItems}` : '';

  const systemPrompt = `You are RPL Hospital's AI receptionist. Respond in NATURAL CONVERSATIONAL HINDI.

HOSPITAL: RPL Hospital, Baidaula Chauraha, Dumariyaganj | Phone: ${env.HOSPITAL_PHONE}

DOCTORS:
- डॉ. अखिलेश कुमार कसौधन: शुगर व सामान्य रोग (सुबह 2-शाम 7)
- डॉ. अंकित शुक्ला: दिमाग व नस रोग (महीने की 15 तारीख, दोपहर 2-शाम 7)
- डॉ. ए.के. सिंह: नाक-कान-गला (सोमवार, दोपहर 3-शाम 6)
- डॉ. आनन्द मिश्रा: दांत (रोज, दोपहर 3-शाम 6)

PATIENT: ${ctx.name}
HISTORY: ${ctx.history}${pendingInfo}

STRICT RULES:
1. NEVER say "RPL Hospital में आपका स्वागत है" or any welcome message unless it's the FIRST message
2. Be DIRECT and HELPFUL - answer the question asked
3. If user says "hello/hi", just greet warmly and ask how you can help
4. If booking appointment, ask: doctor preference, date, time - ONE question at a time
5. Use simple Hindi, like talking to a friend
6. Use emojis sparingly: 🏥 📅 💊
7. Keep responses SHORT (2-3 lines max)
8. If user asks about symptoms, suggest relevant doctor and offer to book

EXAMPLES:
User: "Hello"
You: "नमस्ते! कैसे मदद करूँ?"

User: "Appointment chahiye"
You: "बिल्कुल! किस डॉक्टर से मिलना है?"

User: "Dr Akhilesh"
You: "ठीक है! कब आना चाहेंगे? आज या कल?"

User: "Kal 4 baje"
You: "परफेक्ट! कल शाम 4 बजे डॉ. अखिलेश के साथ बुक कर दी। टोकन: [number]"

OUTPUT JSON:
{
  "reply": "Direct Hindi response (no welcome unless first message)",
  "intent": "appointment|lab_test|general|symptom|emergency",
  "actions": [{"type": "book_appointment", "doctor_name": "...", "date": "...", "time": "...", "department": "..."}],
  "staffNote": "Brief note if critical"
}

USER MESSAGE: "${ctx.text}"
`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.GROQ_API_KEY} `,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: ctx.text }
        ],
        temperature: 0.5,
        max_tokens: 600,
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  } catch (e) {
    console.error("AI Error:", e);
    return {
      reply: "नमस्ते! मैं RPL Hospital का AI सहायक हूँ। मैं आपकी कैसे मदद कर सकता हूँ?",
      intent: "general",
      actions: []
    };
  }
}

// ============================================
// ACTION EXECUTOR
// ============================================
async function executeActions(env, phone, name, actions) {
  for (const action of actions) {
    try {
      switch (action.type) {
        case "book_appointment":
          await bookAppointment(env, phone, name, action);
          break;
        case "book_lab_test":
          await bookLabTest(env, phone, name, action);
          break;
        case "set_reminder":
          await setMedicineReminder(env, phone, name, action);
          break;
        case "request_prescription":
          await requestPrescriptionRefill(env, phone, name, action);
          break;
        case "collect_feedback":
          await collectFeedback(env, phone, name, action);
          break;
      }
    } catch (err) {
      console.error("Action Error:", err);
    }
  }
}

async function bookAppointment(env, phone, name, action) {
  const token = Math.floor(1000 + Math.random() * 9000);
  const date = action.date || new Date().toISOString().split('T')[0];
  const time = action.time || "10:00 AM";

  await env.DB.prepare(
    `INSERT INTO appointments(phone_number, patient_name, doctor_name, department, appointment_date, appointment_time, token_number, status, created_at)
VALUES(?, ?, ?, ?, ?, ?, ?, 'confirmed', CURRENT_TIMESTAMP)`
  ).bind(phone, name, action.doctor_name, action.department || "General", date, time, token).run();

  await notifyStaff(env, `📅 बुकिंग: ${action.doctor_name} | ${name} | ${time} | Token: ${token} `);
}

async function bookLabTest(env, phone, name, action) {
  const date = action.date || new Date().toISOString().split('T')[0];
  const time = action.time || "09:00 AM";

  await env.DB.prepare(
    `INSERT INTO lab_tests(phone_number, patient_name, test_name, test_date, test_time, status, created_at)
VALUES(?, ?, ?, ?, ?, 'booked', CURRENT_TIMESTAMP)`
  ).bind(phone, name, action.test_name, date, time).run();

  await notifyStaff(env, `🧪 टेस्ट: ${action.test_name} | ${name} `);
}

async function setMedicineReminder(env, phone, name, action) {
  await env.DB.prepare(
    `INSERT INTO medicine_reminders(phone_number, patient_name, medicine_name, reminder_time, active, created_at)
VALUES(?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
         ON CONFLICT(phone_number, medicine_name) DO UPDATE SET reminder_time = ?, active = 1`
  ).bind(phone, name, action.medicine_name, action.reminder_time, action.reminder_time).run();
}

async function requestPrescriptionRefill(env, phone, name, action) {
  await env.DB.prepare(
    `INSERT INTO prescription_requests(phone_number, patient_name, medicine_name, status, created_at)
VALUES(?, ?, ?, 'pending', CURRENT_TIMESTAMP)`
  ).bind(phone, name, action.medicine_name).run();

  await notifyStaff(env, `💊 Refill: ${action.medicine_name} | ${name} `);
}

async function collectFeedback(env, phone, name, action) {
  await env.DB.prepare(
    `INSERT INTO feedback(phone_number, patient_name, rating, feedback_text, created_at)
VALUES(?, ?, ?, ?, CURRENT_TIMESTAMP)`
  ).bind(phone, name, action.rating, action.feedback_text || "").run();
}

// ============================================
// HELPER FUNCTIONS
// ============================================
async function getQueueStatus(db) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const count = await db.prepare(
      `SELECT COUNT(*) as waiting FROM appointments WHERE appointment_date = ? AND status = 'confirmed'`
    ).bind(today).first();
    return `आज ${count.waiting} मरीज`;
  } catch (e) {
    return "जानकारी उपलब्ध नहीं";
  }
}

async function getPatientHistory(db, phone) {
  try {
    const apt = await db.prepare(
      `SELECT doctor_name, appointment_date FROM appointments WHERE phone_number = ? ORDER BY id DESC LIMIT 1`
    ).bind(phone).first();

    if (apt) return `पिछली बार: ${apt.doctor_name} (${apt.appointment_date})`;
  } catch (e) { }
  return "नया मरीज";
}

async function handleEmergency(env, from, name, text, session) {
  const alert = `🚨 * आपातकालीन सूचना * 🚨\n\nनमस्ते ${name}, \n\nतुरंत अस्पताल आएं या फोन करें: \n * ${env.HOSPITAL_PHONE}*\n\n📍 बैदौला चौराहा, बंसी रोड, डुमरियागंज\n\nडॉक्टर को सूचित कर दिया गया है।`;
  await sendMessage(env, from, alert);
  await notifyStaff(env, `🚨 EMERGENCY: ${name} (${from}) - ${text} `);
}

function isEmergency(text) {
  const keywords = ["खून", "बेहोश", "एक्सीडेंट", "गंभीर", "दर्द", "सांस", "blood", "accident", "emergency"];
  return keywords.some(k => text.toLowerCase().includes(k));
}

async function markAsRead(env, messageId) {
  try {
    await fetch(`https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId
      })
    });
  } catch (e) { }
}

async function sendMessage(env, to, text, refId) {
  try {
    await fetch(`https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: text },
        context: refId ? { message_id: refId } : undefined
      })
    });
  } catch (e) {
    console.error("Send Error:", e);
  }
}

async function notifyStaff(env, msg) {
  if (env.HOSPITAL_NOTIFICATION_NUMBER) {
    await sendMessage(env, env.HOSPITAL_NOTIFICATION_NUMBER, msg);
  }
}

async function logMessage(db, phone, direction, content, msgId) {
  try {
    await db.prepare(
      `INSERT INTO message_logs (phone_number, direction, message_type, message_content, message_id, timestamp) 
             VALUES (?, ?, 'text', ?, ?, CURRENT_TIMESTAMP)`
    ).bind(phone, direction, content.substring(0, 500), msgId).run();
  } catch (e) { }
}

async function getSession(kv, phone, name) {
  try {
    const val = await kv.get(`patient_${phone}`);
    if (val) return JSON.parse(val);
  } catch (e) { }
  return { name, start: Date.now(), conversationCount: 0 };
}

async function saveSession(kv, phone, session) {
  await kv.put(`patient_${phone}`, JSON.stringify(session), { expirationTtl: 86400 });
}
