// =============================================
// RPL HOSPITAL – COMPLETE AI RECEPTIONIST
// ALL FEATURES + ERROR FIXED
// =============================================

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      
      // ✅ HEALTH CHECK
      if (url.pathname === "/health") {
        return new Response(JSON.stringify({
          status: "active",
          service: "rpl-ai-receptionist",
          features: ["emergency", "appointment", "lab", "history", "admin_notify"],
          timestamp: new Date().toISOString()
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // ✅ WEBHOOK VERIFICATION
      if (request.method === "GET" && url.pathname === "/webhook") {
        return verifyWebhook(request, env);
      }
      
      // ✅ INCOMING MESSAGE - FIXED VERSION
      if (request.method === "POST" && url.pathname === "/webhook") {
        // IMPORTANT: Clone request before reading
        const requestClone = request.clone();
        const body = await requestClone.json();
        
        // Process in background
        ctx.waitUntil(processCompleteMessage(body, env, ctx));
        
        return new Response("OK", { status: 200 });
      }
      
      return new Response("Not Found", { status: 404 });
      
    } catch (error) {
      console.error("Fetch error:", error);
      return new Response("Server Error", { status: 500 });
    }
  }
};

// =============================================
// 1. COMPLETE MESSAGE PROCESSOR
// =============================================

async function processCompleteMessage(body, env, ctx) {
  try {
    const entry = body.entry?.[0];
    if (!entry) return;
    
    const change = entry.changes?.[0];
    if (!change || change.field !== "messages") return;
    
    const value = change.value;
    const messages = value.messages || [];
    const contacts = value.contacts || [];
    
    for (const msg of messages) {
      try {
        await handleCompleteMessage(msg, contacts, env, ctx);
      } catch (msgError) {
        console.error(`Message ${msg.id} failed:`, msgError);
      }
    }
  } catch (error) {
    console.error("Webhook processing error:", error);
  }
}

// =============================================
// 2. COMPLETE MESSAGE HANDLER (ALL FEATURES)
// =============================================

async function handleCompleteMessage(msg, contacts, env, ctx) {
  if (msg.type !== "text") return;
  
  const userPhone = msg.from;
  const contact = contacts.find(c => c.wa_id === userPhone);
  const userName = contact?.profile?.name || "मरीज";
  const userMessage = msg.text?.body?.trim() || "";
  const messageId = msg.id;
  
  console.log(`📞 ${userPhone} (${userName}): ${userMessage}`);
  
  // ✅ LOG INCOMING
  await safeLog(env.DB, userPhone, "incoming", userMessage, messageId);
  
  // ✅ GET SESSION WITH CONTEXT
  const session = await getCompleteSession(env.SESSIONS, userPhone, userName);
  
  // ✅ DETECT LANGUAGE WITH PREFERENCE
  const langInfo = detectLanguageWithContext(userMessage, session);
  
  // ✅ UPDATE SESSION LANGUAGE
  if (langInfo.isLanguageRequest) {
    session.preferredLanguage = 'hi';
    session.languageRequested = true;
  }
  
  const replyLanguage = session.preferredLanguage || langInfo.language;
  
  // ✅ CHECK EMERGENCY (PRIORITY 1)
  if (isEmergencySituation(userMessage)) {
    await handleEmergencySituation(env, userPhone, userName, userMessage, replyLanguage);
    return;
  }
  
  // ✅ GET PATIENT HISTORY FOR CONTEXT
  const patientContext = await getCompletePatientContext(env.DB, userPhone, userName);
  
  // ✅ PREPARE AI CONTEXT
  const aiContext = {
    userMessage,
    userName,
    userPhone,
    patientContext,
    language: replyLanguage,
    sessionState: session,
    hospitalInfo: {
      name: env.HOSPITAL_NAME,
      phone: env.HOSPITAL_PHONE,
      address: env.HOSPITAL_ADDRESS,
      email: env.HOSPITAL_EMAIL
    },
    doctors: [
      { id: 1, name: "Dr. Akhilesh Kumar", dept: "Physician & Diabetes" },
      { id: 2, name: "Dr. Ankit Shukla", dept: "Neurologist" },
      { id: 3, name: "Dr. A.K. Singh", dept: "ENT" },
      { id: 4, name: "Dr. Anand Mishra", dept: "Dental" }
    ],
    labTests: ["CBC", "Blood Sugar", "Thyroid", "LFT", "KFT", "Lipid Profile", "Urine Test"]
  };
  
  // ✅ CALL COMPLETE AI
  const aiResponse = await callCompleteAI(env, aiContext);
  
  // ✅ EXECUTE AI ACTIONS
  if (aiResponse.actions && aiResponse.actions.length > 0) {
    await executeAIActions(env, aiResponse.actions, userPhone, userName, replyLanguage);
  }
  
  // ✅ SEND RESPONSE TO USER
  await sendWhatsAppMessage(env, userPhone, aiResponse.reply, messageId);
  
  // ✅ UPDATE SESSION
  session.lastMessage = userMessage;
  session.lastResponse = aiResponse.reply.substring(0, 100);
  session.lastActive = Date.now();
  session.messageCount = (session.messageCount || 0) + 1;
  
  await saveCompleteSession(env.SESSIONS, userPhone, session);
  
  // ✅ LOG OUTGOING
  await safeLog(env.DB, userPhone, "outgoing", aiResponse.reply, `resp_${Date.now()}`);
  
  // ✅ NOTIFY ADMIN IF NEEDED
  if (aiResponse.notifyAdmin) {
    await notifyAdmin(env, aiResponse.notifyAdmin);
  }
}

// =============================================
// 3. COMPLETE AI ENGINE (ALL FEATURES)
// =============================================

async function callCompleteAI(env, context) {
  const systemPrompt = context.language === 'hi' ? `
# भूमिका: RPL Hospital पूर्ण AI रिसेप्शनिस्ट

# अस्पताल जानकारी:
- नाम: ${context.hospitalInfo.name}
- फोन: ${context.hospitalInfo.phone}
- पता: ${context.hospitalInfo.address}
- ईमेल: ${context.hospitalInfo.email}

# डॉक्टर:
1. डॉ. अखिलेश कुमार - फिजिशियन और शुगर विशेषज्ञ
2. डॉ. अंकित शुक्ला - न्यूरोलॉजिस्ट
3. डॉ. ए.के. सिंह - ENT विशेषज्ञ  
4. डॉ. आनंद मिश्रा - डेंटल विशेषज्ञ

# लैब टेस्ट:
CBC, Blood Sugar, Thyroid, LFT, KFT, Lipid Profile, Urine Test

# रोगी संदर्भ:
${context.patientContext}

# आपकी क्षमताएं:
1. आपातकालीन पहचान और प्रबंधन
2. डॉक्टर अपॉइंटमेंट बुकिंग
3. लैब टेस्ट बुकिंग
4. रोगी इतिहास जाँच
5. प्राकृतिक वार्तालाप
6. प्रशासनिक सूचनाएं

# प्रतिक्रिया प्रारूप (JSON):
{
  "reply": "रोगी को प्राकृतिक प्रतिक्रिया",
  "actions": [
    {
      "type": "book_appointment",
      "doctor_name": "डॉक्टर का नाम",
      "date": "दिनांक",
      "time": "समय",
      "department": "विभाग"
    }
  ],
  "notifyAdmin": "वैकल्पिक प्रशासन संदेश"
}

# महत्वपूर्ण:
- कीमतों का उल्लेख न करें
- विनम्र और सहायक रहें
- आपात स्थिति में तुरंत मार्गदर्शन करें
- प्राकृतिक हिंदी में बात करें

# वर्तमान संवाद:
रोगी: ${context.userName} (${context.userPhone})
संदेश: "${context.userMessage}"
` : `
# ROLE: RPL Hospital Complete AI Receptionist

# HOSPITAL INFORMATION:
- Name: ${context.hospitalInfo.name}
- Phone: ${context.hospitalInfo.phone}
- Address: ${context.hospitalInfo.address}
- Email: ${context.hospitalInfo.email}

# DOCTORS:
1. Dr. Akhilesh Kumar - Physician & Diabetes Specialist
2. Dr. Ankit Shukla - Neurologist
3. Dr. A.K. Singh - ENT Specialist
4. Dr. Anand Mishra - Dental Specialist

# LAB TESTS:
CBC, Blood Sugar, Thyroid, LFT, KFT, Lipid Profile, Urine Test

# PATIENT CONTEXT:
${context.patientContext}

# YOUR CAPABILITIES:
1. Emergency detection and management
2. Doctor appointment booking
3. Lab test booking
4. Patient history checking
5. Natural conversation
6. Admin notifications

# RESPONSE FORMAT (JSON):
{
  "reply": "Natural response to patient",
  "actions": [
    {
      "type": "book_appointment",
      "doctor_name": "Doctor name",
      "date": "Date",
      "time": "Time",
      "department": "Department"
    }
  ],
  "notifyAdmin": "Optional admin message"
}

# IMPORTANT:
- Never mention prices
- Be polite and helpful
- Guide immediately in emergencies
- Use natural conversation style

# CURRENT CONVERSATION:
Patient: ${context.userName} (${context.userPhone})
Message: "${context.userMessage}"
`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
            content: systemPrompt 
          },
          { 
            role: "user", 
            content: `Patient message: "${context.userMessage}"` 
          }
        ],
        temperature: 0.4,
        max_tokens: 500,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const aiResponse = JSON.parse(data.choices[0].message.content);
    
    // Ensure reply exists
    if (!aiResponse.reply) {
      aiResponse.reply = context.language === 'hi'
        ? "माफ़ करें, तकनीकी समस्या आ रही है। कृपया फिर से बताएं।"
        : "Sorry, technical issue. Please repeat your message.";
    }
    
    return aiResponse;
    
  } catch (error) {
    console.error("AI call failed:", error);
    
    // Fallback response
    return {
      reply: context.language === 'hi'
        ? "नमस्ते! मैं RPL Hospital का AI receptionist हूं। आप कैसे मदद चाहते हैं? क्या आप डॉक्टर से मिलना चाहते हैं या टेस्ट कराना चाहते हैं?"
        : "Hello! I'm RPL Hospital AI receptionist. How can I help you? Are you looking to see a doctor or get a test done?",
      actions: []
    };
  }
}

// =============================================
// 4. AI ACTIONS EXECUTOR
// =============================================

async function executeAIActions(env, actions, phone, name, language) {
  for (const action of actions) {
    try {
      switch (action.type) {
        
        case "book_appointment":
          await bookAppointmentFromAction(env, phone, name, action, language);
          break;
          
        case "book_lab_test":
          await bookLabTestFromAction(env, phone, name, action, language);
          break;
          
        case "update_patient_record":
          await updatePatientRecord(env.DB, phone, name, action.details);
          break;
          
        case "create_followup":
          await createFollowupReminder(env, phone, name, action);
          break;
      }
    } catch (error) {
      console.error(`Action ${action.type} failed:`, error);
    }
  }
}

async function bookAppointmentFromAction(env, phone, name, action, language) {
  const doctor = action.doctor_name || "Dr. Akhilesh Kumar";
  const date = action.date || "today";
  const time = action.time || "2:00 PM";
  const department = action.department || "General";
  
  const token = Math.floor(1000 + Math.random() * 9000);
  
  try {
    // Save to appointments
    await env.DB.prepare(
      `INSERT INTO appointments 
       (phone_number, patient_name, doctor_name, department, appointment_date, appointment_time, token_number, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')`
    ).bind(phone, name, doctor, department, date, time, token).run();
    
    // Update patient record
    await updatePatientRecord(env.DB, phone, name, {
      last_appointment: date,
      last_doctor: doctor
    });
    
    console.log(`✅ Appointment booked: ${name} with ${doctor}`);
    
    // Notify admin
    const adminMsg = language === 'hi'
      ? `📅 नई अपॉइंटमेंट\n\nमरीज: ${name}\nफोन: ${phone}\nडॉक्टर: ${doctor}\nदिनांक: ${date}\nसमय: ${time}\nटोकन: ${token}`
      : `📅 New Appointment\n\nPatient: ${name}\nPhone: ${phone}\nDoctor: ${doctor}\nDate: ${date}\nTime: ${time}\nToken: ${token}`;
    
    await notifyAdmin(env, adminMsg);
    
  } catch (error) {
    console.error("Appointment booking failed:", error);
  }
}

async function bookLabTestFromAction(env, phone, name, action, language) {
  const test = action.test_name || "General Checkup";
  const date = action.date || "today";
  const time = action.time || "10:00 AM";
  
  try {
    await env.DB.prepare(
      `INSERT INTO lab_tests 
       (phone_number, patient_name, test_name, test_date, test_time, status)
       VALUES (?, ?, ?, ?, ?, 'booked')`
    ).bind(phone, name, test, date, time).run();
    
    console.log(`✅ Lab test booked: ${test} for ${name}`);
    
    // Notify admin
    const adminMsg = language === 'hi'
      ? `🧪 नया लैब टेस्ट\n\nमरीज: ${name}\nफोन: ${phone}\nटेस्ट: ${test}\nदिनांक: ${date}\nसमय: ${time}`
      : `🧪 New Lab Test\n\nPatient: ${name}\nPhone: ${phone}\nTest: ${test}\nDate: ${date}\nTime: ${time}`;
    
    await notifyAdmin(env, adminMsg);
    
  } catch (error) {
    console.error("Lab test booking failed:", error);
  }
}

// =============================================
// 5. EMERGENCY HANDLER
// =============================================

function isEmergencySituation(text) {
  const lowerText = text.toLowerCase();
  const emergencies = [
    "बेहोश", "सांस नहीं", "खून बह रहा", "दौरा", "लकवा", "हार्ट अटैक", "एक्सीडेंट",
    "unconscious", "can't breathe", "bleeding", "seizure", "stroke", "heart attack", "accident"
  ];
  
  return emergencies.some(emergency => lowerText.includes(emergency));
}

async function handleEmergencySituation(env, phone, name, message, language) {
  // Immediate response
  const emergencyReply = language === 'hi'
    ? `🚨 **आपातकालीन स्थिति** 🚨\n\nकृपया तुरंत ${env.HOSPITAL_PHONE} पर कॉल करें या सीधे अस्पताल आएं।\n\nपता: ${env.HOSPITAL_ADDRESS}\nआपातकालीन नंबर: ${env.HOSPITAL_PHONE}\n\nअपना नाम और लक्षण रिसेप्शन पर बताएं।`
    : `🚨 **EMERGENCY SITUATION** 🚨\n\nPlease call ${env.HOSPITAL_PHONE} immediately or come directly to hospital.\n\nAddress: ${env.HOSPITAL_ADDRESS}\nEmergency Number: ${env.HOSPITAL_PHONE}\n\nTell your name and symptoms at reception.`;
  
  await sendWhatsAppMessage(env, phone, emergencyReply, "emergency");
  
  // Urgent admin notification
  const adminMsg = language === 'hi'
    ? `🚨🚨 आपातकालीन चेतावनी 🚨🚨\n\nमरीज: ${name}\nफोन: ${phone}\nसंदेश: ${message}\nसमय: ${new Date().toLocaleString("en-IN")}\n\nतुरंत संपर्क करें!`
    : `🚨🚨 EMERGENCY ALERT 🚨🚨\n\nPatient: ${name}\nPhone: ${phone}\nMessage: ${message}\nTime: ${new Date().toLocaleString("en-IN")}\n\nContact immediately!`;
  
  await notifyAdmin(env, adminMsg);
}

// =============================================
// 6. SESSION MANAGEMENT (COMPLETE)
// =============================================

async function getCompleteSession(kv, phone, name) {
  try {
    const sessionData = await kv.get(`session_${phone}`, { type: "json" });
    
    if (sessionData) {
      // Check if session expired (1 hour)
      if (Date.now() - sessionData.lastActive > 60 * 60 * 1000) {
        return createNewCompleteSession(phone, name);
      }
      return sessionData;
    }
    
    return createNewCompleteSession(phone, name);
    
  } catch (error) {
    console.error("Session read error:", error);
    return createNewCompleteSession(phone, name);
  }
}

function createNewCompleteSession(phone, name) {
  return {
    id: `sess_${Date.now()}`,
    phone: phone,
    name: name,
    preferredLanguage: null,
    lastIntent: null,
    lastAppointment: null,
    lastLabTest: null,
    messageCount: 0,
    lastActive: Date.now(),
    createdAt: Date.now(),
    metadata: {}
  };
}

async function saveCompleteSession(kv, phone, session) {
  try {
    await kv.put(
      `session_${phone}`,
      JSON.stringify(session),
      { expirationTtl: 7 * 24 * 60 * 60 } // 7 days
    );
  } catch (error) {
    console.error("Session save error:", error);
  }
}

// =============================================
// 7. PATIENT CONTEXT BUILDER
// =============================================

async function getCompletePatientContext(db, phone, name) {
  try {
    let context = `रोगी: ${name}\nफोन: ${phone}\n\n`;
    
    // Check patient record
    const patient = await db.prepare(
      `SELECT * FROM patients WHERE phone_number = ?`
    ).bind(phone).first();
    
    if (patient) {
      context += `पहली विज़िट: ${patient.first_visit || "Unknown"}\n`;
      context += `कुल विज़िट: ${patient.total_visits || 0}\n`;
    } else {
      context += `स्थिति: नया रोगी\n`;
    }
    
    // Last 2 appointments
    const appointments = await db.prepare(
      `SELECT doctor_name, appointment_date, appointment_time 
       FROM appointments 
       WHERE phone_number = ? 
       ORDER BY created_at DESC 
       LIMIT 2`
    ).bind(phone).all();
    
    if (appointments.results.length > 0) {
      context += "\nहाल की अपॉइंटमेंट:\n";
      appointments.results.forEach((apt, i) => {
        context += `${i+1}. डॉ. ${apt.doctor_name} - ${apt.appointment_date} ${apt.appointment_time}\n`;
      });
    }
    
    // Last lab test
    const labTests = await db.prepare(
      `SELECT test_name, test_date 
       FROM lab_tests 
       WHERE phone_number = ? 
       ORDER BY created_at DESC 
       LIMIT 1`
    ).bind(phone).all();
    
    if (labTests.results.length > 0) {
      context += `\nआखिरी टेस्ट: ${labTests.results[0].test_name} (${labTests.results[0].test_date})\n`;
    }
    
    return context;
    
  } catch (error) {
    console.error("Patient context error:", error);
    return `रोगी: ${name}\nफोन: ${phone}\nस्थिति: इतिहास लोड नहीं हो सका`;
  }
}

async function updatePatientRecord(db, phone, name, details) {
  try {
    const existing = await db.prepare(
      `SELECT * FROM patients WHERE phone_number = ?`
    ).bind(phone).first();
    
    if (existing) {
      // Update existing
      await db.prepare(
        `UPDATE patients 
         SET last_visit = CURRENT_TIMESTAMP,
             total_visits = total_visits + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE phone_number = ?`
      ).bind(phone).run();
    } else {
      // Create new
      await db.prepare(
        `INSERT INTO patients 
         (phone_number, name, first_visit, last_visit, total_visits)
         VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)`
      ).bind(phone, name).run();
    }
    
  } catch (error) {
    console.error("Patient update error:", error);
  }
}

// =============================================
// 8. UTILITY FUNCTIONS
// =============================================

function detectLanguageWithContext(text, session) {
  // Check session preference first
  if (session.preferredLanguage) {
    return {
      language: session.preferredLanguage,
      isLanguageRequest: false
    };
  }
  
  const lowerText = text.toLowerCase();
  
  // Hindi detection
  const hindiPatterns = [
    /[\u0900-\u097F]/, // Hindi chars
    /\b(नमस्ते|हिंदी|बोलो|कैसे|क्या|में|हूं|है|धन्यवाद|जी|ठीक)\b/,
    /hindi\s+bolo/i,
    /हिंदी\s+बोलो/i
  ];
  
  const isHindi = hindiPatterns.some(pattern => pattern.test(text));
  const isLanguageRequest = /(hindi|हिंदी).*(bolo|बोलो|speak)/i.test(text);
  
  return {
    language: isHindi ? 'hi' : 'en',
    isLanguageRequest: isLanguageRequest
  };
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
      const errorText = await response.text();
      console.error(`WhatsApp API error ${response.status}: ${errorText}`);
    }
    
  } catch (error) {
    console.error("WhatsApp send error:", error);
  }
}

async function notifyAdmin(env, message) {
  try {
 await sendWhatsAppMessage(
      env,
      env.HOSPITAL_NOTIFICATION_NUMBER,
      message,
      `admin_${Date.now()}`
    );
  } catch (error) {
    console.error("Admin notify error:", error);
  }
}

async function safeLog(db, phone, direction, content, messageId) {
  try {
    await db.prepare(
      `INSERT INTO message_logs 
       (phone_number, direction, message_type, message_content, message_id, timestamp)
       VALUES (?, ?, 'text', ?, ?, CURRENT_TIMESTAMP)`
    ).bind(
      phone,
      direction,
      content.substring(0, 500),
      messageId || `unknown_${Date.now()}`
    ).run();
  } catch (error) {
    console.error("Log error:", error);
  }
}

function verifyWebhook(request, env) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  
  if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  
  return new Response("Forbidden", { status: 403 });
}

// =============================================
// 9. SCHEDULED TASKS (CRON JOBS)
// =============================================

export async function scheduled(event, env, ctx) {
  switch (event.cron) {
    case "0 8 * * *": // 8 AM - Appointment reminders
      await sendAppointmentReminders(env);
      break;
      
    case "0 21 * * *": // 9 PM - Daily summary
      await sendDailySummary(env);
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
       WHERE appointment_date LIKE ? AND status = 'confirmed'`
    ).bind(`%${dateStr}%`).all();
    
    for (const apt of appointments.results) {
      const message = `⏰ अपॉइंटमेंट रिमाइंडर\n\nनमस्ते ${apt.patient_name} जी,\n\nआपकी कल डॉक्टर ${apt.doctor_name} के साथ ${apt.appointment_time} बजे अपॉइंटमेंट है।\n\nकृपया समय पर पहुँचें।\n\nधन्यवाद,\nRPL Hospital`;
      
      await sendWhatsAppMessage(env, apt.phone_number, message, "reminder");
    }
  } catch (error) {
    console.error("Reminder error:", error);
  }
}

async function sendDailySummary(env) {
  try {
    const today = new Date().toLocaleDateString("en-IN");
    
    const stats = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total_messages,
        COUNT(DISTINCT phone_number) as unique_pessages
      FROM message_logs 
      WHERE DATE(timestamp) = DATE('now')
    `).first();
    
    const appointments = await env.DB.prepare(`
      SELECT COUNT(*) as new_appointments
      FROM appointments 
      WHERE DATE(created_at) = DATE('now')
    `).first();
    
    const message = `📊 दैनिक सारांश (${today})\n\n• नए संदेश: ${stats.total_messages}\n• नए मरीज: ${stats.unique_pessages}\n• नई अपॉइंटमेंट: ${appointments.new_appointments}\n\nRPL Hospital AI Receptionist`;
    
    await notifyAdmin(env, message);
  } catch (error) {
    console.error("Summary error:", error);
  }
  }
