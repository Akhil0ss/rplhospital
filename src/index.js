/**
 * RPL HOSPITAL - HYBRID AI RECEPTIONIST v5.1 FINAL
 * =================================================
 * State-based flow + AI intelligence for perfect natural conversation
 */

export default {
  async fetch(request, env, ctx) {
    const { method } = request;
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "active", version: "5.1-hybrid" }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
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
        const messages = body.entry?.[0]?.changes?.[0]?.value?.messages;
        const contacts = body.entry?.[0]?.changes?.[0]?.value?.contacts || [];

        if (messages) {
          ctx.waitUntil(processMessages(messages, contacts, env));
        }

        return new Response("OK", { status: 200 });
      } catch (err) {
        console.error("Webhook Error:", err);
        return new Response("Error", { status: 500 });
      }
    }

    return new Response("Not Found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    console.log("Cron disabled for zero-cost operation");
  }
};

async function processMessages(messages, contacts, env) {
  for (const msg of messages) {
    if (msg.type !== "text") continue;

    const from = msg.from;
    const name = contacts.find(c => c.wa_id === from)?.profile?.name || "मरीज";
    const text = msg.text.body.trim();
    const msgId = msg.id;

    try {
      await markAsRead(env, msgId);
      await logMessage(env.DB, from, "incoming", text, msgId);

      // Get conversation state
      const state = await getConversationState(env.SESSIONS, from, name);

      // Emergency check (highest priority)
      if (isEmergency(text)) {
        await handleEmergency(env, from, name, text);
        await clearState(env.SESSIONS, from);
        continue;
      }

      // HYBRID FLOW: Use AI to understand + State to guide
      const response = await hybridFlowHandler(env, from, name, text, state);

      // Send reply
      await sendMessage(env, from, response.message);
      await logMessage(env.DB, from, "outgoing", response.message, `resp_${Date.now()}`);

      // Update state
      await saveConversationState(env.SESSIONS, from, response.newState);

      // Staff notification
      if (response.notify) {
        await notifyStaff(env, response.notify);
      }

    } catch (error) {
      console.error(`Error for ${from}:`, error);
      await sendMessage(env, from, "माफ़ करें, तकनीकी समस्या है। कृपया फोन करें: " + env.HOSPITAL_PHONE);
    }
  }
}

// ============================================
// HYBRID FLOW HANDLER (AI + State)
// ============================================
async function hybridFlowHandler(env, phone, name, text, state) {
  const lowerText = text.toLowerCase();

  // STEP 0: First message - Welcome
  if (!state.step || state.step === 'new') {
    return {
      message: `नमस्ते ${name}! RPL Hospital में आपका स्वागत है। 🏥\n\nकृपया अपना नाम बताएं।`,
      newState: { step: 'name', contactName: name, phone, timestamp: Date.now() }
    };
  }

  // STEP 1: Get patient name
  if (state.step === 'name') {
    return {
      message: `धन्यवाद ${text}! आपकी क्या समस्या है? कृपया विस्तार से बताएं।`,
      newState: { ...state, step: 'problem', patientName: text }
    };
  }

  // STEP 2: Analyze problem with AI + Suggest doctor
  if (state.step === 'problem') {
    const aiAnalysis = await analyzeSymptoms(env, text);
    const suggestedDoctor = aiAnalysis.suggestedDoctor;
    const severity = aiAnalysis.severity;

    const doctorList = `\n\n📋 हमारे डॉक्टर्स:\n1. डॉ. अखिलेश कुमार कसौधन - शुगर व सामान्य रोग (सुबह 2-शाम 7)\n2. डॉ. अंकित शुक्ला - दिमाग व नस रोग (महीने की 15 तारीख)\n3. डॉ. ए.के. सिंह - नाक, कान, गला (सोमवार)\n4. डॉ. आनन्द मिश्रा - दांत (रोज)`;

    let message = `समझ गया।`;
    if (severity === 'urgent') {
      message += `\n\n⚠️ यह गंभीर लग रहा है। जल्द से जल्द डॉक्टर से मिलें।`;
    }
    if (suggestedDoctor) {
      message += `\n\n💡 आपकी समस्या के लिए *${suggestedDoctor}* से मिलना बेहतर रहेगा।`;
    }
    message += `${doctorList}\n\nकिस डॉक्टर से मिलना चाहेंगे? (1-4 या नाम बताएं)`;

    return {
      message,
      newState: { ...state, step: 'doctor', problem: text, aiSuggestion: suggestedDoctor }
    };
  }

  // STEP 3: Select doctor (AI understands both number and name)
  if (state.step === 'doctor') {
    const doctor = await selectDoctor(env, text);

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return {
      message: `बढ़िया! ${doctor.name} (${doctor.specialty}) से मिलेंगे।\n\nकब आना चाहेंगे?\n1. आज (${formatDate(today)})\n2. कल (${formatDate(tomorrow)})\n\nया कोई और तारीख बताएं।`,
      newState: { ...state, step: 'date', selectedDoctor: doctor }
    };
  }

  // STEP 4: Select date (AI understands natural language)
  if (state.step === 'date') {
    const selectedDate = await parseNaturalDate(env, text);
    const slots = generateTimeSlots();

    const slotMessage = `तारीख: *${formatDate(selectedDate)}*\n\n⏰ उपलब्ध समय:\n${slots.slice(0, 12).map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nकौन सा समय ठीक रहेगा?`;

    return {
      message: slotMessage,
      newState: { ...state, step: 'time', selectedDate: selectedDate.toISOString().split('T')[0], availableSlots: slots }
    };
  }

  // STEP 5: Select time & Book
  if (state.step === 'time') {
    const selectedTime = await parseTimeSlot(text, state.availableSlots);
    const token = Math.floor(1000 + Math.random() * 9000);

    // Save to database
    try {
      await env.DB.prepare(
        `INSERT INTO appointments (phone_number, patient_name, doctor_name, department, appointment_date, appointment_time, token_number, status, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', CURRENT_TIMESTAMP)`
      ).bind(
        phone,
        state.patientName,
        state.selectedDoctor.name,
        state.selectedDoctor.dept,
        state.selectedDate,
        selectedTime,
        token
      ).run();
    } catch (e) {
      console.error("DB Error:", e);
    }

    const confirmationMessage = `✅ *अपॉइंटमेंट बुक हो गई!*\n\n👤 नाम: ${state.patientName}\n🏥 डॉक्टर: ${state.selectedDoctor.name}\n📅 तारीख: ${formatDate(new Date(state.selectedDate))}\n⏰ समय: ${selectedTime}\n🎫 टोकन नंबर: *${token}*\n\n📍 पता: बैदौला चौराहा, बंसी रोड, डुमरियागंज\n\nकृपया समय पर पहुंचें। धन्यवाद! 🙏`;

    const staffNotification = `📅 *नई अपॉइंटमेंट*\n\nमरीज: ${state.patientName}\nफोन: ${phone}\nडॉक्टर: ${state.selectedDoctor.name}\nतारीख: ${state.selectedDate}\nसमय: ${selectedTime}\nटोकन: ${token}\nसमस्या: ${state.problem}`;

    return {
      message: confirmationMessage,
      newState: { step: 'new', contactName: name, phone },
      notify: staffNotification
    };
  }

  // Fallback
  return {
    message: "माफ़ करें, समझ नहीं आया। कृपया फिर से बताएं।",
    newState: { step: 'new', contactName: name, phone }
  };
}

// ============================================
// AI HELPER FUNCTIONS
// ============================================
async function analyzeSymptoms(env, symptoms) {
  const prompt = `Analyze this patient symptom and suggest appropriate doctor from RPL Hospital.
Symptoms: "${symptoms}"

Doctors:
1. Dr. Akhilesh Kumar Kasaudhan - Diabetes & General Medicine
2. Dr. Ankit Shukla - Neurology (Brain, Nerves)
3. Dr. A.K. Singh - ENT (Ear, Nose, Throat)
4. Dr. Anand Mishra - Dental

Respond in JSON:
{
  "suggestedDoctor": "डॉ. [name]",
  "severity": "normal|urgent",
  "reasoning": "brief reason in Hindi"
}`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  } catch (e) {
    return { suggestedDoctor: null, severity: "normal" };
  }
}

async function selectDoctor(env, input) {
  const doctors = {
    '1': { name: 'डॉ. अखिलेश कुमार कसौधन', dept: 'General', specialty: 'शुगर व सामान्य रोग' },
    '2': { name: 'डॉ. अंकित शुक्ला', dept: 'Neurology', specialty: 'दिमाग व नस रोग' },
    '3': { name: 'डॉ. ए.के. सिंह', dept: 'ENT', specialty: 'नाक, कान, गला' },
    '4': { name: 'डॉ. आनन्द मिश्रा', dept: 'Dental', specialty: 'दांत' }
  };

  // Check if number
  const match = input.match(/[1-4]/);
  if (match) return doctors[match[0]];

  // AI-based name matching
  const lowerInput = input.toLowerCase();
  if (lowerInput.includes('akhilesh') || lowerInput.includes('sugar') || lowerInput.includes('अखिलेश')) return doctors['1'];
  if (lowerInput.includes('ankit') || lowerInput.includes('neuro') || lowerInput.includes('अंकित')) return doctors['2'];
  if (lowerInput.includes('singh') || lowerInput.includes('ent') || lowerInput.includes('सिंह')) return doctors['3'];
  if (lowerInput.includes('anand') || lowerInput.includes('dental') || lowerInput.includes('आनन्द')) return doctors['4'];

  return doctors['1']; // Default
}

async function parseNaturalDate(env, input) {
  const lowerInput = input.toLowerCase();

  // Today
  if (lowerInput.includes('1') || lowerInput.includes('आज') || lowerInput.includes('aaj') || lowerInput.includes('today')) {
    return new Date();
  }

  // Tomorrow
  if (lowerInput.includes('2') || lowerInput.includes('कल') || lowerInput.includes('kal') || lowerInput.includes('tomorrow')) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  // DD-MM-YYYY format
  const dateMatch = input.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dateMatch) {
    return new Date(dateMatch[3], dateMatch[2] - 1, dateMatch[1]);
  }

  // Default to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

async function parseTimeSlot(input, availableSlots) {
  // Check if number (slot index)
  const match = input.match(/\d+/);
  if (match) {
    const index = parseInt(match[0]) - 1;
    if (index >= 0 && index < availableSlots.length) {
      return availableSlots[index];
    }
  }

  // Default to first slot
  return availableSlots[0];
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function generateTimeSlots() {
  const slots = [];
  for (let hour = 10; hour <= 18; hour++) {
    for (let min = 0; min < 60; min += 10) {
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour > 12 ? hour - 12 : hour;
      slots.push(`${displayHour}:${min.toString().padStart(2, '0')} ${period}`);
    }
  }
  return slots;
}

function formatDate(date) {
  const months = ['जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function isEmergency(text) {
  const keywords = ["खून", "बेहोश", "एक्सीडेंट", "गंभीर", "blood", "accident", "emergency", "unconscious"];
  return keywords.some(k => text.toLowerCase().includes(k));
}

async function handleEmergency(env, from, name, text) {
  const alert = `🚨 *आपातकालीन सूचना* 🚨\n\nतुरंत अस्पताल आएं या फोन करें:\n*${env.HOSPITAL_PHONE}*\n\n📍 बैदौला चौराहा, बंसी रोड, डुमरियागंज`;
  await sendMessage(env, from, alert);
  await notifyStaff(env, `🚨 EMERGENCY: ${name} (${from}) - ${text}`);
}

async function getConversationState(kv, phone, name) {
  try {
    const val = await kv.get(`conv_${phone}`);
    if (val) {
      const state = JSON.parse(val);
      if (Date.now() - state.timestamp > 600000) {
        return { step: 'new', contactName: name, phone };
      }
      return state;
    }
  } catch (e) { }
  return { step: 'new', contactName: name, phone };
}

async function saveConversationState(kv, phone, state) {
  state.timestamp = Date.now();
  await kv.put(`conv_${phone}`, JSON.stringify(state), { expirationTtl: 3600 });
}

async function clearState(kv, phone) {
  await kv.delete(`conv_${phone}`);
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

async function sendMessage(env, to, text) {
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
        text: { body: text }
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
