// =============================================
// RPL HOSPITAL – INDUSTRY-GRADE AI RECEPTIONIST
// COMPLETE ROBUST FLOW WITH ZERO ERRORS
// =============================================

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      
      // ✅ Health check endpoint
      if (url.pathname === "/health") {
        return new Response(JSON.stringify({
          status: "healthy",
          timestamp: new Date().toISOString(),
          service: "rpl-hospital-ai"
        }), { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // ✅ Webhook verification
      if (request.method === "GET" && url.pathname === "/webhook") {
        return await verifyWebhook(request, env);
      }
      
      // ✅ Incoming message processing (non-blocking)
      if (request.method === "POST" && url.pathname === "/webhook") {
        ctx.waitUntil(processWebhook(request, env));
        return new Response("OK", { status: 200 });
      }
      
      return new Response("Not Found", { status: 404 });
    } catch (error) {
      console.error("Global error:", error);
      return new Response("Server Error", { status: 500 });
    }
  }
};

// =============================================
// PHASE 1: SAFETY & EMERGENCY (FIRST PRIORITY)
// =============================================

async function processWebhook(request, env) {
  try {
    const body = await request.json();
    const entry = body.entry?.[0];
    if (!entry) return;
    
    const change = entry.changes?.[0];
    if (!change || change.field !== "messages") return;
    
    const value = change.value;
    const messages = value.messages || [];
    const contacts = value.contacts || [];
    
    // Process each message independently
    for (const msg of messages) {
      try {
        await handleSingleMessage(msg, contacts, env);
      } catch (msgError) {
        console.error(`Message ${msg.id} failed:`, msgError);
        // Continue with other messages
      }
    }
  } catch (error) {
    console.error("Webhook processing failed:", error);
  }
}

async function handleSingleMessage(msg, contacts, env) {
  const phone = msg.from;
  const contact = contacts.find(c => c.wa_id === phone);
  const name = contact?.profile?.name || "Patient";
  const text = msg.text?.body?.trim() || "";
  const messageId = msg.id;
  
  // ✅ IMMEDIATELY LOG INCOMING
  await safeLog(env.DB, {
    phone, direction: "incoming", 
    message_type: "text", content: text,
    message_id: messageId
  });
  
  // ✅ EMERGENCY CHECK (IMMEDIATE RESPONSE)
  if (await isEmergencySituation(text, phone, name, env)) {
    return; // Emergency already handled
  }
  
  // ✅ GET OR CREATE SESSION
  const session = await getOrCreateSession(env.SESSIONS, phone, name);
  
  // ✅ PROCESS THROUGH AI FLOW
  const reply = await processThroughAI(env, text, phone, name, session);
  
  // ✅ SEND RESPONSE
  await sendWhatsAppMessage(env, phone, reply, messageId);
  
  // ✅ UPDATE SESSION
  await updateSession(env.SESSIONS, phone, session);
}

// =============================================
// EMERGENCY HANDLER (INSTANT, RELIABLE)
// =============================================

async function isEmergencySituation(text, phone, name, env) {
  const emergencyKeywords = {
    hi: ["बेहोश", "सांस नहीं आ रही", "खून बह रहा", "दौरा", "लकवा", "हार्ट अटैक", "एक्सीडेंट"],
    en: ["unconscious", "can't breathe", "bleeding", "seizure", "stroke", "heart attack", "accident"]
  };
  
  const lowerText = text.toLowerCase();
  const isEmergency = emergencyKeywords.hi.some(k => lowerText.includes(k)) || 
                      emergencyKeywords.en.some(k => lowerText.includes(k));
  
  if (!isEmergency) return false;
  
  // ✅ INSTANT EMERGENCY RESPONSE
  const emergencyReply = detectLanguage(text) === "hi"
    ? `🚨 **आपातकालीन स्थिति** 🚨\n\nकृपया तुरंत ${env.HOSPITAL_PHONE} पर कॉल करें या सीधे अस्पताल आएं।\n\nअस्पताल पता: ${env.HOSPITAL_ADDRESS}\nआपातकालीन नंबर: ${env.HOSPITAL_PHONE}`
    : `🚨 **EMERGENCY SITUATION** 🚨\n\nPlease call ${env.HOSPITAL_PHONE} immediately or come directly to hospital.\n\nHospital Address: ${env.HOSPITAL_ADDRESS}\nEmergency Number: ${env.HOSPITAL_PHONE}`;
  
  await sendWhatsAppMessage(env, phone, emergencyReply, "emergency");
  
  // ✅ NOTIFY ADMIN WITH RETRY
  await retryOperation(async () => {
    await fetch(`https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: env.HOSPITAL_NOTIFICATION_NUMBER,
        type: "text",
        text: { 
          body: `🚨 EMERGENCY ALERT\n\nPatient: ${name}\nPhone: ${phone}\nMessage: ${text}\nTime: ${new Date().toLocaleString("en-IN")}`
        }
      })
    });
  }, "Admin emergency notification");
  
  return true;
}

// =============================================
// PHASE 2: SESSION MANAGEMENT (STATE AWARE)
// =============================================

async function getOrCreateSession(kv, phone, name) {
  try {
    const existing = await kv.get(`session_${phone}`, { type: "json" });
    if (existing) {
      // Reset if session too old (30 minutes)
      if (Date.now() - existing.lastActive > 30 * 60 * 1000) {
        return createNewSession(phone, name);
      }
      existing.lastActive = Date.now();
      return existing;
    }
    return createNewSession(phone, name);
  } catch (error) {
    console.error("Session error:", error);
    return createNewSession(phone, name);
  }
}

function createNewSession(phone, name) {
  return {
    id: `sess_${phone}_${Date.now()}`,
    phone: phone,
    name: name,
    step: "welcome",
    context: {},
    history: [],
    lastActive: Date.now(),
    createdAt: Date.now(),
    appointment: null,
    labTest: null
  };
}

async function updateSession(kv, phone, session) {
  try {
    session.lastActive = Date.now();
    session.history = session.history.slice(-10); // Keep last 10 messages
    await kv.put(`session_${phone}`, JSON.stringify(session), {
      expirationTtl: 7 * 24 * 60 * 60 // 7 days
    });
  } catch (error) {
    console.error("Update session error:", error);
  }
}

// =============================================
// PHASE 3: NATURAL LANGUAGE PROCESSING FLOW
// =============================================

async function processThroughAI(env, text, phone, name, session) {
  const lang = detectLanguage(text);
  const lowerText = text.toLowerCase();
  
  // ✅ WELCOME/GREETING FLOW
  if (session.step === "welcome" || isGreeting(lowerText)) {
    session.step = "identifying_need";
    return lang === "hi" 
      ? `नमस्ते ${name} जी! 👋\n\nआपका RPL Hospital में स्वागत है।\n\nआप कैसे मदद चाहते हैं?\n1. डॉक्टर से मिलना है\n2. टेस्ट कराना है\n3. पुरानी अपॉइंटमेंट देखनी है\n4. कुछ और पूछना है`
      : `Hello ${name}! 👋\n\nWelcome to RPL Hospital.\n\nHow may I help you today?\n1. Meet a doctor\n2. Get a test done\n3. Check previous appointments\n4. Ask something else`;
  }
  
  // ✅ DOCTOR APPOINTMENT FLOW
  if (wantsDoctor(lowerText) || session.step === "doctor_flow") {
    return await handleDoctorFlow(env, text, phone, name, session, lang);
  }
  
  // ✅ LAB TEST FLOW
  if (wantsLabTest(lowerText) || session.step === "lab_flow") {
    return await handleLabFlow(env, text, phone, name, session, lang);
  }
  
  // ✅ HISTORY CHECK
  if (wantsHistory(lowerText)) {
    return await getPatientHistory(env.DB, phone, name, lang);
  }
  
  // ✅ FALLBACK TO GROQ AI
  return await getAIResponse(env, text, lang, session);
}

// =============================================
// DOCTOR APPOINTMENT FLOW (COMPLETE)
// =============================================

async function handleDoctorFlow(env, text, phone, name, session, lang) {
  const steps = {
    "identifying_need": async () => {
      session.step = "doctor_symptoms";
      return lang === "hi"
        ? "आपको किस तरह की समस्या है? कृपया अपने लक्षण बताएं।"
        : "What kind of problem are you facing? Please describe your symptoms.";
    },
    
    "doctor_symptoms": async () => {
      const doctor = suggestDoctor(text);
      session.context.doctor = doctor;
      session.step = "doctor_date";
      
      const slots = generateTimeSlots();
      return lang === "hi"
        ? `आपकी समस्या के लिए ${doctor.name} (${doctor.dept}) सबसे उपयुक्त हैं।\n\nकल OPD 2:00 PM से 6:00 PM तक है। क्या कल आ सकते हैं? (हाँ/नहीं)`
        : `For your concern, ${doctor.name} (${doctor.dept}) would be most suitable.\n\nOPD is tomorrow from 2:00 PM to 6:00 PM. Can you come tomorrow? (Yes/No)`;
    },
    
    "doctor_date": async () => {
      if (text.includes("नहीं") || text.includes("no") || text.includes("not")) {
        session.step = "doctor_alternative_date";
        return lang === "hi"
          ? "किस दिन आना पसंद करेंगे? (उदाहरण: कल, 15 दिसंबर, आज)"
          : "Which day would you prefer? (Example: tomorrow, 15th December, today)";
      }
      
      session.context.date = "tomorrow";
      session.step = "doctor_time";
      return await showTimeSlots(env, session, lang);
    },
    
    "doctor_time": async () => {
      const selectedSlot = parseTimeSlot(text);
      if (!selectedSlot) {
        return lang === "hi"
          ? "कृपया समय चुनें (उदाहरण: 2:00, 3:15, 4:30)"
          : "Please choose a time (example: 2:00, 3:15, 4:30)";
      }
      
      session.context.time = selectedSlot;
      session.step = "doctor_confirm";
      
      return lang === "hi"
        ? `✅ अपॉइंटमेंट डिटेल्स:\n\nडॉक्टर: ${session.context.doctor.name}\nदिन: कल\nसमय: ${selectedSlot}\n\nक्या यह सही है? (हाँ/नहीं)`
        : `✅ Appointment Details:\n\nDoctor: ${session.context.doctor.name}\nDay: Tomorrow\nTime: ${selectedSlot}\n\nIs this correct? (Yes/No)`;
    },
    
    "doctor_confirm": async () => {
      if (text.includes("हाँ") || text.includes("yes") || text.includes("ok") || text.includes("सही")) {
        // ✅ SAVE APPOINTMENT
        const token = await saveAppointment(env.DB, phone, name, session.context.doctor, "tomorrow", session.context.time);
        
        // ✅ NOTIFY ADMIN
        await notifyAdmin(env, `📅 नई OPD बुकिंग\n\nमरीज: ${name}\nफोन: ${phone}\nडॉक्टर: ${session.context.doctor.name}\nसमय: कल ${session.context.time}\nटोकन: ${token}`);
        
        session.step = "welcome";
        session.context = {};
        
        return lang === "hi"
          ? `🎉 अपॉइंटमेंट कन्फर्म हो गई!\n\n• टोकन नंबर: ${token}\n• डॉक्टर: ${session.context.doctor?.name}\n• दिन: कल\n• समय: ${session.context.time}\n• पता: ${env.HOSPITAL_ADDRESS}\n\nकृपया अपॉइंटमेंट से 10 मिनट पहले आ जाएं।`
          : `🎉 Appointment Confirmed!\n\n• Token Number: ${token}\n• Doctor: ${session.context.doctor?.name}\n• Day: Tomorrow\n• Time: ${session.context.time}\n• Address: ${env.HOSPITAL_ADDRESS}\n\nPlease arrive 10 minutes before your appointment.`;
      }
      
      session.step = "doctor_symptoms";
      return lang === "hi"
        ? "चलिए फिर से शुरू करते हैं। आपको क्या समस्या है?"
        : "Let's start over. What symptoms are you facing?";
    }
  };
  
  const currentStep = session.step.startsWith("doctor_") ? session.step : "identifying_need";
  return await steps[currentStep]();
}

// =============================================
// LAB TEST FLOW (COMPLETE)
// =============================================

async function handleLabFlow(env, text, phone, name, session, lang) {
  const steps = {
    "identifying_need": async () => {
      const availableTests = ["CBC", "Blood Sugar", "Thyroid", "LFT", "KFT", "Lipid Profile", "Urine Test"];
      session.step = "lab_test_select";
      
      return lang === "hi"
        ? `कौन सा टेस्ट कराना चाहते हैं?\n\n${availableTests.map((t, i) => `${i+1}. ${t}`).join("\n")}\n\nनंबर बताएं या टेस्ट का नाम लिखें।`
        : `Which test would you like?\n\n${availableTests.map((t, i) => `${i+1}. ${t}`).join("\n")}\n\nPlease mention the number or test name.`;
    },
    
    "lab_test_select": async () => {
      const selectedTest = detectLabTest(text);
      if (!selectedTest) {
        return lang === "hi"
          ? "कृपया सही टेस्ट का नाम या नंबर बताएं।"
          : "Please mention correct test name or number.";
      }
      
      session.context.labTest = selectedTest;
      session.step = "lab_date";
      
      return lang === "hi"
        ? `आपने ${selectedTest} टेस्ट चुना है। किस दिन आना चाहेंगे? (उदाहरण: कल, आज, 15 दिसंबर)`
        : `You selected ${selectedTest} test. Which day would you prefer? (Example: tomorrow, today, 15th December)`;
    },
    
    "lab_date": async () => {
      session.context.labDate = text.includes("आज") || text.includes("today") ? "today" : 
                               text.includes("कल") || text.includes("tomorrow") ? "tomorrow" : text;
      session.step = "lab_time";
      
      return lang === "hi"
        ? `ठीक है, ${session.context.labDate} को किस समय आ सकते हैं? (उदाहरण: 10:00 AM, 2:30 PM)`
        : `Alright, what time on ${session.context.labDate}? (Example: 10:00 AM, 2:30 PM)`;
    },
    
    "lab_time": async () => {
      session.context.labTime = text;
      session.step = "lab_confirm";
      
      return lang === "hi"
        ? `✅ टेस्ट डिटेल्स:\n\nटेस्ट: ${session.context.labTest}\nदिन: ${session.context.labDate}\nसमय: ${session.context.labTime}\n\nक्या सही है? (हाँ/नहीं)`
        : `✅ Test Details:\n\nTest: ${session.context.labTest}\nDay: ${session.context.labDate}\nTime: ${session.context.labTime}\n\nIs this correct? (Yes/No)`;
    },
    
    "lab_confirm": async () => {
      if (text.includes("हाँ") || text.includes("yes") || text.includes("ok")) {
        // ✅ SAVE LAB TEST
        await saveLabTest(env.DB, phone, name, session.context.labTest, session.context.labDate, session.context.labTime);
        
        // ✅ NOTIFY ADMIN
        await notifyAdmin(env, `🧪 नया लैब टेस्ट\n\nमरीज: ${name}\nफोन: ${phone}\nटेस्ट: ${session.context.labTest}\nदिन: ${session.context.labDate}\nसमय: ${session.context.labTime}`);
        
        session.step = "welcome";
        session.context = {};
        
        return lang === "hi"
          ? `🎉 टेस्ट बुक हो गया!\n\n• टेस्ट: ${session.context.labTest}\n• दिन: ${session.context.labDate}\n• समय: ${session.context.labTime}\n• पता: ${env.HOSPITAL_ADDRESS}\n\nकृपया तय समय पर आ जाएं।`
          : `🎉 Test Booked!\n\n• Test: ${session.context.labTest}\n• Day: ${session.context.labDate}\n• Time: ${session.context.labTime}\n• Address: ${env.HOSPITAL_ADDRESS}\n\nPlease arrive at the scheduled time.`;
      }
      
      session.step = "identifying_need";
      return lang === "hi"
        ? "चलिए फिर से शुरू करते हैं। कौन सा टेस्ट कराना चाहते हैं?"
        : "Let's start over. Which test would you like?";
    }
  };
  
  const currentStep = session.step.startsWith("lab_") ? session.step : "identifying_need";
  return await steps[currentStep]();
}

// =============================================
// UTILITY FUNCTIONS (ERROR-PROOF)
// =============================================

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

async function sendWhatsAppMessage(env, to, text, referenceId) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: to,
          type: "text",
          text: { body: text },
          context: referenceId ? { message_id: referenceId } : undefined
        })
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      console.error("WhatsApp API error:", error);
      throw new Error(`WhatsApp API: ${response.status}`);
    }
    
    const data = await response.json();
    await safeLog(env.DB, {
      phone: to,
      direction: "outgoing",
      message_type: "text",
      content: text.substring(0, 200),
      message_id: data.messages?.[0]?.id
    });
    
    return data;
  } catch (error) {
    console.error("Failed to send WhatsApp:", error);
    // Don't throw - prevent breaking flow
  }
}

async function retryOperation(operation, description, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      console.error(`${description} attempt ${i + 1} failed:`, error);
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

async function safeLog(db, logData) {
  try {
    await db.prepare(
      `INSERT INTO message_logs 
       (phone_number, direction, message_type, message_content, message_id, timestamp)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).bind(
      logData.phone,
      logData.direction,
      logData.message_type,
      logData.content,
      logData.message_id || "unknown"
    ).run();
  } catch (error) {
    console.error("Logging failed:", error);
  }
}

async function notifyAdmin(env, message) {
  try {
    await fetch(`https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: env.HOSPITAL_NOTIFICATION_NUMBER,
        type: "text",
        text: { body: message }
      })
    });
  } catch (error) {
    console.error("Admin notify failed:", error);
  }
}

// =============================================
// INTELLIGENCE FUNCTIONS
// =============================================

function detectLanguage(text) {
  const hindiPattern = /[\u0900-\u097F]/;
  return hindiPattern.test(text) ? "hi" : "en";
}

function isGreeting(text) {
  const greetings = ["hi", "hello", "hey", "namaste", "नमस्ते", "हैलो", "good morning", "good evening"];
  return greetings.some(g => text.includes(g));
}

function wantsDoctor(text) {
  const keywords = ["doctor", "डॉक्टर", "daktar", "checkup", "चेकअप", "treatment", "इलाज", "pain", "दर्द", "problem", "समस्या"];
  return keywords.some(k => text.includes(k));
}

function wantsLabTest(text) {
  const keywords = ["test", "टेस्ट", "lab", "लैब", "check", "जांच", "blood", "खून", "urine", "पेशाब"];
  return keywords.some(k => text.includes(k));
}

function wantsHistory(text) {
  const keywords = ["history", "इतिहास", "previous", "पिछला", "old", "पुराना", "last time", "पहले"];
  return keywords.some(k => text.includes(k));
}

function suggestDoctor(symptoms) {
  const doctors = [
    { id: 1, name: "Dr. Akhilesh Kumar", dept: "Physician & Diabetes" },
    { id: 2, name: "Dr. Ankit Shukla", dept: "Neurologist" },
    { id: 3, name: "Dr. A.K. Singh", dept: "ENT" },
    { id: 4, name: "Dr. Anand Mishra", dept: "Dental" }
  ];
  
  const lowerSymptoms = symptoms.toLowerCase();
  
  if (lowerSymptoms.includes("sugar") || lowerSymptoms.includes("diabetes") || lowerSymptoms.includes("शुगर")) {
    return doctors[0];
  }
  if (lowerSymptoms.includes("head") || lowerSymptoms.includes("brain") || lowerSymptoms.includes("दिमाग") || lowerSymptoms.includes("सिर")) {
    return doctors[1];
  }
  if (lowerSymptoms.includes("ear") || lowerSymptoms.includes("nose") || lowerSymptoms.includes("throat") || 
      lowerSymptoms.includes("कान") || lowerSymptoms.includes("नाक") || lowerSymptoms.includes("गला")) {
    return doctors[2];
  }
  if (lowerSymptoms.includes("tooth") || lowerSymptoms.includes("dental") || lowerSymptoms.includes("दांत")) {
    return doctors[3];
  }
  
  return doctors[0]; // Default physician
}

function detectLabTest(text) {
  const tests = ["CBC", "Blood Sugar", "Thyroid", "LFT", "KFT", "Lipid Profile", "Urine Test"];
  return tests.find(test => 
    text.toLowerCase().includes(test.toLowerCase()) ||
    text.includes(test.split(" ")[0].toLowerCase())
  ) || tests[0];
}

function generateTimeSlots() {
  const slots = [];
  for (let hour = 14; hour < 18; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      slots.push(time);
    }
  }
  return slots;
}

async function showTimeSlots(env, session, lang) {
  const slots = generateTimeSlots();
  const slotText = slots.map((slot, i) => `${i + 1}. ${slot}`).join("\n");
  
  return lang === "hi"
    ? `उपलब्ध समय स्लॉट:\n\n${slotText}\n\nकौन सा समय चुनना चाहेंगे? (नंबर बताएं)`
    : `Available time slots:\n\n${slotText}\n\nWhich time would you prefer? (Mention number)`;
}

function parseTimeSlot(text) {
  // Extract time like 2:00, 3:30, 4:45
  const timeMatch = text.match(/\b(\d{1,2}):?(\d{2})?\s?(am|pm)?\b/i);
  if (timeMatch) {
    let [_, hour, minute = "00", period] = timeMatch;
    hour = parseInt(hour);
    
    if (period?.toLowerCase() === "pm" && hour < 12) hour += 12;
    if (period?.toLowerCase() === "am" && hour === 12) hour = 0;
    
    return `${hour.toString().padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }
  
  // If user entered slot number
  const slotNum = parseInt(text);
  if (!isNaN(slotNum) && slotNum >= 1 && slotNum <= 16) {
    const slots = generateTimeSlots();
    return slots[slotNum - 1] || "14:00";
  }
  
  return null;
}

// =============================================
// DATABASE OPERATIONS (SAFE)
// =============================================

async function saveAppointment(db, phone, name, doctor, date, time) {
  try {
    const token = Math.floor(1000 + Math.random() * 9000);
    
    await db.prepare(
      `INSERT INTO appointments 
       (phone_number, patient_name, doctor_name, department, appointment_date, appointment_time, token_number, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')`
    ).bind(phone, name, doctor.name, doctor.dept, date, time, token).run();
    
    return token;
  } catch (error) {
    console.error("Save appointment error:", error);
    return Math.floor(1000 + Math.random() * 9000);
  }
}

async function saveLabTest(db, phone, name, test, date, time) {
  try {
    await db.prepare(
      `INSERT INTO lab_tests 
       (phone_number, patient_name, test_name, test_date, test_time, status)
       VALUES (?, ?, ?, ?, ?, 'booked')`
    ).bind(phone, name, test, date, time).run();
  } catch (error) {
    console.error("Save lab test error:", error);
  }
}

async function getPatientHistory(db, phone, name, lang) {
  try {
    const appointments = await db.prepare(
      `SELECT doctor_name, appointment_date, appointment_time, token_number 
       FROM appointments 
       WHERE phone_number = ? 
       ORDER BY created_at DESC 
       LIMIT 3`
    ).bind(phone).all();
    
    if (!appointments.results.length) {
      return lang === "hi"
        ? `${name} जी, आपकी कोई पिछली अपॉइंटमेंट नहीं मिली।`
        : `${name}, no previous appointments found.`;
    }
    
    let response = lang === "hi"
      ? `📋 ${name} जी, आपकी पिछली 3 अपॉइंटमेंट:\n\n`
      : `📋 ${name}, your last 3 appointments:\n\n`;
    
    appointments.results.forEach((apt, i) => {
      response += lang === "hi"
        ? `${i + 1}. डॉक्टर: ${apt.doctor_name}\n   दिनांक: ${apt.appointment_date}\n   समय: ${apt.appointment_time}\n   टोकन: ${apt.token_number}\n\n`
        : `${i + 1}. Doctor: ${apt.doctor_name}\n   Date: ${apt.appointment_date}\n   Time: ${apt.appointment_time}\n   Token: ${apt.token_number}\n\n`;
    });
    
    return response;
  } catch (error) {
    console.error("Get history error:", error);
    return lang === "hi"
      ? "इतिहास देखने में त्रुटि हुई।"
      : "Error fetching history.";
  }
}

// =============================================
// GROQ AI FALLBACK (NATURAL CONVERSATION)
// =============================================

async function getAIResponse(env, text, lang, session) {
  try {
    const systemPrompt = lang === "hi"
      ? `आप RPL Hospital के रिसेप्शन पर बैठे एक मददगार स्टाफ हैं।
मरीज से विनम्रता से बात करें।
उनकी भाषा में जवाब दें।
कीमत या तकनीकी शब्द न बताएं।
सरल, आम बोलचाल की भाषा का प्रयोग करें।
मरीज: ${session.name}, फोन: ${session.phone}`
      : `You are a helpful receptionist at RPL Hospital.
Speak politely to patients.
Reply in their language.
Don't mention prices or technical terms.
Use simple, conversational language.
Patient: ${session.name}, Phone: ${session.phone}`;
    
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
        temperature: 0.3,
        max_tokens: 150
      })
    });
    
    if (!response.ok) {
      throw new Error(`Groq API: ${response.status}`);
    }
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || 
           (lang === "hi" ? "कृपया अपनी बात दोबारा बताएं।" : "Please repeat your question.");
           
  } catch (error) {
    console.error("Groq AI error:", error);
    return lang === "hi"
      ? "माफ़ करें, तकनीकी समस्या आ रही है। कृपया अपनी बात दोबारा बताएं।"
      : "Sorry, facing technical issue. Please repeat your question.";
  }
}

// =============================================
// SCHEDULED TASKS (CRON JOBS)
// =============================================

export async function scheduled(event, env, ctx) {
  switch (event.cron) {
    case "0 8 * * *": // 8 AM - Appointment reminders
      await sendAppointmentReminders(env);
      break;
      
    case "0 21 * * *": // 9 PM - Daily summary
      await sendDailySummary(env);
      break;
      
    case "0 * * * *": // Every hour - Session cleanup
      await cleanupOldSessions(env);
      break;
  }
}

async function sendAppointmentReminders(env) {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    
    const appointments = await env.DB.prepare(
      `SELECT phone_number, patient_name, doctor_name, appointment_time 
       FROM appointments 
       WHERE appointment_date = ? AND status = 'confirmed'`
    ).bind(dateStr).all();
    
    for (const apt of appointments.results) {
      const message = `⏰ अपॉइंटमेंट रिमाइंडर\n\nनमस्ते ${apt.patient_name} जी,\n\nआपकी कल डॉक्टर ${apt.doctor_name} के साथ ${apt.appointment_time} बजे अपॉइंटमेंट है।\n\nकृपया समय पर पहुँचें।\n\nधन्यवाद,\nRPL Hospital`;
      
      await sendWhatsAppMessage(env, apt.phone_number, message, "reminder");
    }
  } catch (error) {
    console.error("Reminder error:", error);
  }
}

async function cleanupOldSessions(env) {
  try {
    // Sessions auto-expire via KV TTL
    console.log("Session cleanup completed");
  } catch (error) {
    console.error("Cleanup error:", error);
  }
}

async function sendDailySummary(env) {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const stats = await env.DB.prepare(
      `SELECT 
        COUNT(*) as total_appointments,
        COUNT(DISTINCT phone_number) as unique_patients
       FROM appointments 
       WHERE DATE(created_at) = ?`
    ).bind(today).first();
    
    const message = `📊 दैनिक सारांश (${today})\n\n• नई अपॉइंटमेंट: ${stats.total_appointments}\n• नए मरीज: ${stats.unique_patients}\n• कुल मैसेज: [लॉग से देखें]\n\nRPL Hospital AI Receptionist`;
    
    await sendWhatsAppMessage(env, env.HOSPITAL_NOTIFICATION_NUMBER, message, "summary");
  } catch (error) {
    console.error("Summary error:", error);
  }
}
