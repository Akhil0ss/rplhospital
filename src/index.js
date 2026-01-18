// =============================================
// RPL HOSPITAL – 100% AI RECEPTIONIST
// PURE NATURAL LANGUAGE PROCESSING
// NO STRUCTURED FLOW, NO NUMBERED OPTIONS
// =============================================

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      
      if (request.method === "GET" && url.pathname === "/webhook") {
        return verifyWebhook(request, env);
      }
      
      if (request.method === "POST" && url.pathname === "/webhook") {
        ctx.waitUntil(handleWhatsAppMessage(request, env));
        return new Response("OK", { status: 200 });
      }
      
      if (url.pathname === "/health") {
        return new Response(JSON.stringify({ 
          status: "active", 
          service: "rpl-ai-receptionist",
          mode: "100% AI Natural Language"
        }), { status: 200 });
      }
      
      return new Response("Not Found", { status: 404 });
    } catch (error) {
      console.error("Global error:", error);
      return new Response("Server Error", { status: 500 });
    }
  }
};

// =============================================
// CORE AI ENGINE – ONE FUNCTION FOR EVERYTHING
// =============================================

async function handleWhatsAppMessage(request, env) {
  try {
    const body = await request.json();
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const contact = body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0];
    
    if (!message || message.type !== "text") return;
    
    const userMessage = message.text.body;
    const userPhone = message.from;
    const userName = contact?.profile?.name || "मरीज";
    const messageId = message.id;
    
    console.log(`📱 ${userPhone} (${userName}): ${userMessage}`);
    
    // 1️⃣ LOG INCOMING MESSAGE
    await logMessage(env.DB, userPhone, "incoming", userMessage, messageId);
    
    // 2️⃣ EMERGENCY CHECK (FAST, RULE-BASED)
    if (isCriticalEmergency(userMessage)) {
      await handleEmergency(env, userPhone, userName, userMessage);
      return;
    }
    
    // 3️⃣ GET CONTEXT FROM DATABASE
    const patientContext = await getPatientContext(env.DB, userPhone, userName);
    
    // 4️⃣ CALL AI FOR FULL RESPONSE
    const aiResponse = await callMasterAI(env, {
      userMessage,
      userName,
      userPhone,
      patientContext,
      hospitalInfo: {
        name: env.HOSPITAL_NAME,
        phone: env.HOSPITAL_PHONE,
        address: env.HOSPITAL_ADDRESS,
        notificationNumber: env.HOSPITAL_NOTIFICATION_NUMBER
      }
    });
    
    // 5️⃣ EXTRACT AND EXECUTE ACTIONS FROM AI RESPONSE
    await executeAIInstructions(env, aiResponse, userPhone, userName);
    
    // 6️⃣ SEND RESPONSE TO USER
    await sendWhatsAppReply(env, userPhone, aiResponse.reply, messageId);
    
    // 7️⃣ LOG OUTGOING RESPONSE
    await logMessage(env.DB, userPhone, "outgoing", aiResponse.reply, `resp_${Date.now()}`);
    
  } catch (error) {
    console.error("Message processing failed:", error);
  }
}

// =============================================
// MASTER AI FUNCTION – ONE PROMPT TO RULE THEM ALL
// =============================================

async function callMasterAI(env, context) {
  const systemPrompt = `
# ROLE: RPL Hospital AI Receptionist
You are a 100% AI receptionist for RPL Hospital in India. You handle EVERYTHING through natural conversation.

# HOSPITAL INFORMATION:
- Name: ${context.hospitalInfo.name}
- Phone: ${context.hospitalInfo.phone}  
- Address: ${context.hospitalInfo.address}
- Emergency Number: ${context.hospitalInfo.phone}

# DOCTORS AVAILABLE:
1. Dr. Akhilesh Kumar – Physician & Diabetes Specialist
2. Dr. Ankit Shukla – Neurologist  
3. Dr. A.K. Singh – ENT Specialist
4. Dr. Anand Mishra – Dental Specialist

# LAB TESTS AVAILABLE:
CBC, Blood Sugar, Thyroid, LFT, KFT, Lipid Profile, Urine Test, X-Ray, ECG

# PATIENT CONTEXT:
${context.patientContext}

# YOUR CAPABILITIES:
1. NATURAL CONVERSATION: Reply in same language as patient (Hindi/English)
2. EMERGENCY DETECTION: Identify critical situations
3. APPOINTMENT BOOKING: Book appointments with appropriate doctors
4. LAB TEST BOOKING: Book lab tests
5. HISTORY CHECKING: Check patient's past visits
6. INFORMATION PROVIDING: Answer hospital-related queries
7. FOLLOW-UP: Ask clarifying questions when needed

# RESPONSE FORMAT (CRITICAL – MUST FOLLOW):
Return ONLY valid JSON with this structure:
{
  "reply": "Natural language reply to patient",
  "actions": [
    {
      "type": "book_appointment",
      "doctor_name": "Dr. Akhilesh Kumar",
      "date": "tomorrow", 
      "time": "3:00 PM",
      "department": "Physician"
    }
  ],
  "notify_admin": "Optional message to send admin",
  "update_context": {
    "last_intent": "appointment_booking",
    "next_step": null
  }
}

# ACTION TYPES AVAILABLE:
- "book_appointment": When patient wants doctor appointment
- "book_lab_test": When patient wants lab test
- "notify_admin": Send message to hospital admin
- "update_patient_record": Update patient in database

# IMPORTANT RULES:
1. NEVER mention prices or technical jargon
2. ALWAYS reply in patient's language
3. Be warm, respectful, and helpful
4. For appointments: Suggest specific doctor based on symptoms
5. For dates: Use natural terms like "today", "tomorrow", "Monday"
6. For times: Use 12-hour format like "2:30 PM"
7. Ask clarifying questions if information is incomplete

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
        max_tokens: 800,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = JSON.parse(data.choices[0].message.content);
    
    // Ensure reply field exists
    if (!aiResponse.reply) {
      aiResponse.reply = context.userMessage.includes("हिंदी") 
        ? "माफ़ करें, तकनीकी समस्या आ रही है। कृपया फिर से बताएं।"
        : "Sorry, facing technical issue. Please repeat your message.";
    }
    
    return aiResponse;
    
  } catch (error) {
    console.error("AI call failed:", error);
    
    // Fallback response
    return {
      reply: context.userMessage.includes("हिंदी") 
        ? "नमस्ते! आप RPL Hospital के AI रिसेप्शनिस्ट से बात कर रहे हैं। आप कैसे मदद चाहते हैं?"
        : "Hello! You're speaking with RPL Hospital AI receptionist. How can I help you today?",
      actions: [],
      update_context: { last_intent: "fallback" }
    };
  }
}

// =============================================
// AI INSTRUCTION EXECUTOR
// =============================================

async function executeAIInstructions(env, aiResponse, phone, name) {
  try {
    if (!aiResponse.actions || !Array.isArray(aiResponse.actions)) return;
    
    for (const action of aiResponse.actions) {
      switch (action.type) {
        
        case "book_appointment":
          await bookAppointmentFromAI(env, phone, name, action);
          break;
          
        case "book_lab_test":
          await bookLabTestFromAI(env, phone, name, action);
          break;
          
        case "notify_admin":
          await notifyAdmin(env, action.message || "New patient interaction");
          break;
          
        case "update_patient_record":
          await updatePatientRecord(env.DB, phone, name, action.details);
          break;
      }
    }
    
    // Send admin notification if specified
    if (aiResponse.notify_admin) {
      await notifyAdmin(env, aiResponse.notify_admin);
    }
    
  } catch (error) {
    console.error("Action execution failed:", error);
  }
}

async function bookAppointmentFromAI(env, phone, name, action) {
  try {
    const doctor = action.doctor_name || "Dr. Akhilesh Kumar";
    const date = action.date || "today";
    const time = action.time || "2:00 PM";
    const department = action.department || "General";
    
    const token = Math.floor(1000 + Math.random() * 9000);
    
    await env.DB.prepare(
      `INSERT INTO appointments 
       (phone_number, patient_name, doctor_name, department, appointment_date, appointment_time, token_number, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')`
    ).bind(phone, name, doctor, department, date, time, token).run();
    
    // Update patient record
    await updatePatientRecord(env.DB, phone, name, { last_appointment: date });
    
    console.log(`✅ Appointment booked: ${name} with ${doctor} on ${date} at ${time}`);
    
  } catch (error) {
    console.error("Appointment booking failed:", error);
  }
}

async function bookLabTestFromAI(env, phone, name, action) {
  try {
    const test = action.test_name || "General Checkup";
    const date = action.date || "today";
    const time = action.time || "10:00 AM";
    
    await env.DB.prepare(
      `INSERT INTO lab_tests 
       (phone_number, patient_name, test_name, test_date, test_time, status)
       VALUES (?, ?, ?, ?, ?, 'booked')`
    ).bind(phone, name, test, date, time).run();
    
    console.log(`✅ Lab test booked: ${test} for ${name} on ${date} at ${time}`);
    
  } catch (error) {
    console.error("Lab test booking failed:", error);
  }
}

// =============================================
// EMERGENCY HANDLER (FAST, RELIABLE)
// =============================================

function isCriticalEmergency(text) {
  const lowerText = text.toLowerCase();
  const emergencyPatterns = [
    "बेहोश", "सांस नहीं", "खून बह रहा", "दौरा", "हार्ट अटैक", "एक्सीडेंट",
    "unconscious", "can't breathe", "bleeding heavily", "seizure", "heart attack", "accident"
  ];
  
  return emergencyPatterns.some(pattern => lowerText.includes(pattern));
}

async function handleEmergency(env, phone, name, message) {
  // IMMEDIATE RESPONSE
  const emergencyReply = message.includes("हिंदी") || /[अ-ह]/.test(message)
    ? `🚨 **आपातकालीन स्थिति** 🚨\n\nकृपया तुरंत ${env.HOSPITAL_PHONE} पर कॉल करें या सीधे अस्पताल आएं।\n\nपता: ${env.HOSPITAL_ADDRESS}\nआपातकालीन नंबर: ${env.HOSPITAL_PHONE}`
    : `🚨 **EMERGENCY SITUATION** 🚨\n\nPlease call ${env.HOSPITAL_PHONE} immediately or come directly to hospital.\n\nAddress: ${env.HOSPITAL_ADDRESS}\nEmergency Number: ${env.HOSPITAL_PHONE}`;
  
  await sendWhatsAppReply(env, phone, emergencyReply, "emergency");
  
  // NOTIFY ADMIN
  await notifyAdmin(env, 
    `🚨 EMERGENCY ALERT 🚨\n\nPatient: ${name}\nPhone: ${phone}\nMessage: ${message}\nTime: ${new Date().toLocaleString("en-IN")}`
  );
}

// =============================================
// PATIENT CONTEXT BUILDER
// =============================================

async function getPatientContext(db, phone, name) {
  try {
    // Check if patient exists
    const patient = await db.prepare(
      `SELECT * FROM patients WHERE phone_number = ?`
    ).bind(phone).first();
    
    // Get last 3 appointments
    const appointments = await db.prepare(
      `SELECT doctor_name, appointment_date, appointment_time 
       FROM appointments 
       WHERE phone_number = ? 
       ORDER BY created_at DESC 
       LIMIT 3`
    ).bind(phone).all();
    
    // Get recent lab tests
    const labTests = await db.prepare(
      `SELECT test_name, test_date 
       FROM lab_tests 
       WHERE phone_number = ? 
       ORDER BY created_at DESC 
       LIMIT 2`
    ).bind(phone).all();
    
    let context = `Patient: ${name}\nPhone: ${phone}\n`;
    
    if (patient) {
      context += `First Visit: ${patient.first_visit || "Not recorded"}\n`;
      context += `Total Visits: ${patient.total_visits || 0}\n`;
    } else {
      context += "Status: New Patient\n";
    }
    
    if (appointments.results.length > 0) {
      context += "\nRecent Appointments:\n";
      appointments.results.forEach((apt, i) => {
        context += `${i+1}. Dr. ${apt.doctor_name} on ${apt.appointment_date} at ${apt.appointment_time}\n`;
      });
    }
    
    if (labTests.results.length > 0) {
      context += "\nRecent Lab Tests:\n";
      labTests.results.forEach((test, i) => {
        context += `${i+1}. ${test.test_name} on ${test.test_date}\n`;
      });
    }
    
    return context;
    
  } catch (error) {
    console.error("Context building failed:", error);
    return `Patient: ${name}\nPhone: ${phone}\nStatus: Could not load full history`;
  }
}

async function updatePatientRecord(db, phone, name, details) {
  try {
    // Check if patient exists
    const existing = await db.prepare(
      `SELECT * FROM patients WHERE phone_number = ?`
    ).bind(phone).first();
    
    if (existing) {
      // Update existing patient
      await db.prepare(
        `UPDATE patients 
         SET last_visit = CURRENT_TIMESTAMP, 
             total_visits = total_visits + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE phone_number = ?`
      ).bind(phone).run();
    } else {
      // Create new patient
      await db.prepare(
        `INSERT INTO patients 
         (phone_number, name, first_visit, last_visit, total_visits)
         VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)`
      ).bind(phone, name).run();
    }
    
  } catch (error) {
    console.error("Patient update failed:", error);
  }
}

// =============================================
// UTILITY FUNCTIONS
// =============================================

async function sendWhatsAppReply(env, to, text, referenceId) {
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
      throw new Error(`WhatsApp API error: ${response.status}`);
    }
    
    return await response.json();
    
  } catch (error) {
    console.error("Failed to send WhatsApp:", error);
  }
}

async function notifyAdmin(env, message) {
  try {
    await sendWhatsAppReply(
      env, 
      env.HOSPITAL_NOTIFICATION_NUMBER, 
      message, 
      `admin_${Date.now()}`
    );
  } catch (error) {
    console.error("Admin notification failed:", error);
  }
}

async function logMessage(db, phone, direction, content, messageId) {
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
    console.error("Logging failed:", error);
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
// DATABASE SCHEMA (RUN THIS FIRST)
// =============================================
/*
-- Run these SQL commands in your D1 database:

CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone_number TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  first_visit TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_visit TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  total_visits INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone_number TEXT NOT NULL,
  patient_name TEXT NOT NULL,
  doctor_name TEXT NOT NULL,
  department TEXT NOT NULL,
  appointment_date TEXT NOT NULL,
  appointment_time TEXT NOT NULL,
  token_number INTEGER NOT NULL,
  status TEXT DEFAULT 'confirmed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lab_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone_number TEXT NOT NULL,
  patient_name TEXT NOT NULL,
  test_name TEXT NOT NULL,
  test_date TEXT NOT NULL,
  test_time TEXT NOT NULL,
  status TEXT DEFAULT 'booked',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS message_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone_number TEXT NOT NULL,
  direction TEXT NOT NULL, -- 'incoming' or 'outgoing'
  message_type TEXT NOT NULL,
  message_content TEXT NOT NULL,
  message_id TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone_number);
CREATE INDEX IF NOT EXISTS idx_appointments_phone ON appointments(phone_number);
CREATE INDEX IF NOT EXISTS idx_lab_tests_phone ON lab_tests(phone_number);
CREATE INDEX IF NOT EXISTS idx_message_logs_phone ON message_logs(phone_number);
*/
