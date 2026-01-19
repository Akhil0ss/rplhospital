/**
 * RPL HOSPITAL - COMPLETE AI RECEPTIONIST v5.0 FINAL
 * ===================================================
 * PROPER CONVERSATION FLOW WITH STATE MANAGEMENT
 */

export default {
  async fetch(request, env, ctx) {
    const { method } = request;
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "active", version: "5.0" }), {
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
    const text = msg.text.body.trim().toLowerCase();
    const msgId = msg.id;

    try {
      await markAsRead(env, msgId);
      await logMessage(env.DB, from, "incoming", text, msgId);

      // Get conversation state
      const state = await getConversationState(env.SESSIONS, from, name);

      // Emergency check
      if (isEmergency(text)) {
        await handleEmergency(env, from, name, text);
        await clearState(env.SESSIONS, from);
        continue;
      }

      // Process based on state
      const response = await handleConversationFlow(env, from, name, text, state);

      // Send reply
      await sendMessage(env, from, response.message);
      await logMessage(env.DB, from, "outgoing", response.message, `resp_${Date.now()}`);

      // Update state
      await saveConversationState(env.SESSIONS, from, response.newState);

      // Staff notification if needed
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
// CONVERSATION FLOW HANDLER
// ============================================
async function handleConversationFlow(env, phone, name, text, state) {
  // STEP 0: First message - Welcome
  if (!state.step || state.step === 'new') {
    return {
      message: `नमस्ते ${name}! RPL Hospital में आपका स्वागत है। 🏥\n\nकृपया अपना नाम बताएं।`,
      newState: { step: 'name', name, phone, timestamp: Date.now() }
    };
  }

  // STEP 1: Get patient name
  if (state.step === 'name') {
    return {
      message: `धन्यवाद ${text}! आपकी क्या समस्या है? कृपया बताएं।`,
      newState: { ...state, step: 'problem', patientName: text }
    };
  }

  // STEP 2: Get problem/symptoms
  if (state.step === 'problem') {
    const suggestedDoctor = suggestDoctor(text);
    const doctorList = `\n\n📋 हमारे डॉक्टर्स:\n1. डॉ. अखिलेश कुमार कसौधन - शुगर व सामान्य रोग\n2. डॉ. अंकित शुक्ला - दिमाग व नस रोग\n3. डॉ. ए.के. सिंह - नाक, कान, गला\n4. डॉ. आनन्द मिश्रा - दांत`;

    return {
      message: `समझ गया।${suggestedDoctor ? `\n\n💡 आपकी समस्या के लिए *${suggestedDoctor}* से मिलना बेहतर रहेगा।` : ''}${doctorList}\n\nकिस डॉक्टर से मिलना चाहेंगे? (1, 2, 3, या 4)`,
      newState: { ...state, step: 'doctor', problem: text }
    };
  }

  // STEP 3: Select doctor
  if (state.step === 'doctor') {
    const doctors = {
      '1': { name: 'डॉ. अखिलेश कुमार कसौधन', dept: 'General', specialty: 'शुगर व सामान्य रोग' },
      '2': { name: 'डॉ. अंकित शुक्ला', dept: 'Neurology', specialty: 'दिमाग व नस रोग' },
      '3': { name: 'डॉ. ए.के. सिंह', dept: 'ENT', specialty: 'नाक, कान, गला' },
      '4': { name: 'डॉ. आनन्द मिश्रा', dept: 'Dental', specialty: 'दांत' }
    };

    const choice = text.match(/[1-4]/) ? text.match(/[1-4]/)[0] : null;
    const doctor = choice ? doctors[choice] : doctors['1'];

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return {
      message: `बढ़िया! ${doctor.name} (${doctor.specialty}) से मिलेंगे।\n\nकब आना चाहेंगे?\n1. आज (${formatDate(today)})\n2. कल (${formatDate(tomorrow)})\n\nया कोई और तारीख बताएं (DD-MM-YYYY)`,
      newState: { ...state, step: 'date', selectedDoctor: doctor }
    };
  }

  // STEP 4: Select date
  if (state.step === 'date') {
    let selectedDate;
    if (text.includes('1') || text.includes('आज') || text.includes('aaj')) {
      selectedDate = new Date();
    } else if (text.includes('2') || text.includes('कल') || text.includes('kal')) {
      selectedDate = new Date();
      selectedDate.setDate(selectedDate.getDate() + 1);
    } else {
      selectedDate = parseDate(text) || new Date();
    }

    const slots = generateTimeSlots();
    const slotMessage = `तारीख: *${formatDate(selectedDate)}*\n\n⏰ उपलब्ध समय:\n${slots.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nकौन सा समय ठीक रहेगा? (1-${slots.length})`;

    return {
      message: slotMessage,
      newState: { ...state, step: 'time', selectedDate: selectedDate.toISOString().split('T')[0], availableSlots: slots }
    };
  }

  // STEP 5: Select time slot & Book
  if (state.step === 'time') {
    const slotIndex = parseInt(text.match(/\d+/)?.[0]) - 1;
    const selectedTime = state.availableSlots[slotIndex] || state.availableSlots[0];
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

    const confirmationMessage = `✅ *अपॉइंटमेंट बुक हो गई!*\n\n👤 नाम: ${state.patientName}\n🏥 डॉक्टर: ${state.selectedDoctor.name}\n📅 तारीख: ${state.selectedDate}\n⏰ समय: ${selectedTime}\n🎫 टोकन नंबर: *${token}*\n\nकृपया समय पर पहुंचें। धन्यवाद! 🙏`;

    // Notify staff
    const staffNotification = `📅 *नई अपॉइंटमेंट*\n\nमरीज: ${state.patientName}\nडॉक्टर: ${state.selectedDoctor.name}\nतारीख: ${state.selectedDate}\nसमय: ${selectedTime}\nटोकन: ${token}\nसमस्या: ${state.problem}`;

    return {
      message: confirmationMessage,
      newState: { step: 'new', name, phone },
      notify: staffNotification
    };
  }

  // Default fallback
  return {
    message: "माफ़ करें, समझ नहीं आया। कृपया फिर से बताएं।",
    newState: { step: 'new', name, phone }
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================
function suggestDoctor(problem) {
  const p = problem.toLowerCase();
  if (p.includes('sugar') || p.includes('diabetes') || p.includes('शुगर') || p.includes('मधुमेह')) {
    return 'डॉ. अखिलेश कुमार कसौधन';
  }
  if (p.includes('sir') || p.includes('dimag') || p.includes('सिर') || p.includes('दिमाग')) {
    return 'डॉ. अंकित शुक्ला';
  }
  if (p.includes('nose') || p.includes('ear') || p.includes('throat') || p.includes('नाक') || p.includes('कान')) {
    return 'डॉ. ए.के. सिंह';
  }
  if (p.includes('tooth') || p.includes('teeth') || p.includes('दांत')) {
    return 'डॉ. आनन्द मिश्रा';
  }
  return null;
}

function generateTimeSlots() {
  const slots = [];
  for (let hour = 10; hour <= 18; hour++) {
    for (let min = 0; min < 60; min += 10) {
      const time = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour > 12 ? hour - 12 : hour;
      slots.push(`${displayHour}:${min.toString().padStart(2, '0')} ${period}`);
    }
  }
  return slots.slice(0, 20); // First 20 slots
}

function formatDate(date) {
  const months = ['जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function parseDate(text) {
  const match = text.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (match) {
    return new Date(match[3], match[2] - 1, match[1]);
  }
  return null;
}

function isEmergency(text) {
  const keywords = ["खून", "बेहोश", "एक्सीडेंट", "गंभीर", "blood", "accident", "emergency"];
  return keywords.some(k => text.includes(k));
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
      // Reset if older than 10 minutes
      if (Date.now() - state.timestamp > 600000) {
        return { step: 'new', name, phone };
      }
      return state;
    }
  } catch (e) { }
  return { step: 'new', name, phone };
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
