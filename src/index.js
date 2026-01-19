/**
 * RPL HOSPITAL - FINAL PERFECT v7.0
 * ==================================
 * Stateful conversation with proper flow management
 */

export default {
  async fetch(request, env, ctx) {
    const { method } = request;
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "active", version: "7.0" }), {
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
  }
};

const DOCTORS = {
  'akhilesh': { name: 'डॉ. अखिलेश कुमार कसौधन', specialty: 'शुगर व सामान्य रोग', dept: 'General', days: 'all', start: 14, end: 19 },
  'ankit': { name: 'डॉ. अंकित शुक्ला', specialty: 'दिमाग व नस रोग', dept: 'Neurology', days: [15], start: 14, end: 19 },
  'singh': { name: 'डॉ. ए.के. सिंह', specialty: 'नाक, कान, गला', dept: 'ENT', days: [1], start: 15, end: 18 },
  'anand': { name: 'डॉ. आनन्द मिश्रा', specialty: 'दांत', dept: 'Dental', days: 'all', start: 15, end: 18 }
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

      // Get state
      const state = await getState(env.SESSIONS, from);

      // Emergency check
      if (isEmergency(text)) {
        await handleEmergency(env, from, name, text);
        await clearState(env.SESSIONS, from);
        continue;
      }

      // Process conversation
      const result = await processConversation(env, from, name, text, state);

      await sendMessage(env, from, result.reply);
      await logMessage(env.DB, from, "outgoing", result.reply, `resp_${Date.now()}`);
      await setState(env.SESSIONS, from, result.newState);

      if (result.notify) {
        await notifyStaff(env, result.notify);
      }

    } catch (error) {
      console.error(`Error for ${from}:`, error);
      await sendMessage(env, from, "माफ़ करें, तकनीकी समस्या है। कृपया फोन करें: " + env.HOSPITAL_PHONE);
    }
  }
}

async function processConversation(env, phone, name, text, state) {
  const lower = text.toLowerCase();

  // STEP 1: Initial greeting
  if (!state.step || state.step === 'start') {
    return {
      reply: `नमस्ते ${name}! मैं आपकी कैसे मदद कर सकता हूँ? 🏥\n\nअपॉइंटमेंट के लिए "appointment" या "डॉक्टर" लिखें।`,
      newState: { step: 'waiting_intent', name }
    };
  }

  // STEP 2: Understand intent
  if (state.step === 'waiting_intent') {
    if (lower.includes('appointment') || lower.includes('doctor') || lower.includes('डॉक्टर') || lower.includes('मिलना')) {
      return {
        reply: `बिल्कुल! आपकी क्या समस्या है? कृपया बताएं।`,
        newState: { ...state, step: 'get_problem', intent: 'appointment' }
      };
    }
    return {
      reply: `मैं अपॉइंटमेंट बुक करने में मदद कर सकता हूँ। क्या आप डॉक्टर से मिलना चाहते हैं?`,
      newState: state
    };
  }

  // STEP 3: Get problem
  if (state.step === 'get_problem') {
    const suggestedDoc = suggestDoctor(text);
    const docList = `\n\n📋 हमारे डॉक्टर्स:\n1. डॉ. अखिलेश - शुगर व सामान्य रोग\n2. डॉ. अंकित - दिमाग व नस रोग\n3. डॉ. ए.के. सिंह - नाक, कान, गला\n4. डॉ. आनन्द - दांत`;

    let reply = `समझ गया।`;
    if (suggestedDoc) {
      reply += `\n\n💡 ${suggestedDoc} से मिलना बेहतर रहेगा।`;
    }
    reply += `${docList}\n\nकिस डॉक्टर से मिलना चाहेंगे? (1-4 लिखें)`;

    return {
      reply,
      newState: { ...state, step: 'select_doctor', problem: text }
    };
  }

  // STEP 4: Select doctor
  if (state.step === 'select_doctor') {
    const docKey = parseDoctor(text);
    const doctor = DOCTORS[docKey];

    return {
      reply: `ठीक है! ${doctor.name} (${doctor.specialty}) से मिलेंगे।\n\nकब आना चाहेंगे? "आज", "कल" या तारीख बताएं।`,
      newState: { ...state, step: 'select_date', doctor: docKey }
    };
  }

  // STEP 5: Select date
  if (state.step === 'select_date') {
    const date = parseDate(text);
    const doctor = DOCTORS[state.doctor];

    // Validate day
    if (!isDoctorAvailable(doctor, date)) {
      let msg = `${doctor.name} `;
      if (doctor.days[0] === 15) {
        msg += `सिर्फ महीने की 15 तारीख को उपलब्ध हैं।`;
      } else if (doctor.days[0] === 1) {
        msg += `सिर्फ सोमवार को उपलब्ध हैं।`;
      }
      msg += `\n\nकोई और तारीख चुनें।`;
      return { reply: msg, newState: state };
    }

    const slots = generateSlots(doctor.start, doctor.end);
    return {
      reply: `तारीख: ${formatDate(date)}\n\n⏰ समय चुनें:\n${slots.slice(0, 10).map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nकौन सा समय? (1-10)`,
      newState: { ...state, step: 'select_time', date: date.toISOString().split('T')[0], slots }
    };
  }

  // STEP 6: Book appointment
  if (state.step === 'select_time') {
    const slotIdx = parseInt(text.match(/\d+/)?.[0] || '1') - 1;
    const time = state.slots[slotIdx] || state.slots[0];
    const token = Math.floor(1000 + Math.random() * 9000);
    const doctor = DOCTORS[state.doctor];

    // Save to DB
    try {
      await env.DB.prepare(
        `INSERT INTO appointments (phone_number, patient_name, doctor_name, department, appointment_date, appointment_time, token_number, status, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', CURRENT_TIMESTAMP)`
      ).bind(phone, name, doctor.name, doctor.dept, state.date, time, token).run();
    } catch (e) {
      console.error("DB Error:", e);
    }

    const reply = `✅ *अपॉइंटमेंट बुक हो गई!*\n\n👤 ${name}\n🏥 ${doctor.name}\n📅 ${state.date}\n⏰ ${time}\n🎫 टोकन: *${token}*\n\nसमय पर पहुंचें। धन्यवाद! 🙏`;

    return {
      reply,
      newState: { step: 'start', name },
      notify: `📅 नई बुकिंग\n\nमरीज: ${name}\nडॉक्टर: ${doctor.name}\nतारीख: ${state.date}\nसमय: ${time}\nटोकन: ${token}\nसमस्या: ${state.problem}`
    };
  }

  // Fallback
  return {
    reply: `माफ़ करें, समझ नहीं आया। "appointment" लिखें नई बुकिंग के लिए।`,
    newState: { step: 'start', name }
  };
}

function suggestDoctor(problem) {
  const p = problem.toLowerCase();
  if (p.includes('sugar') || p.includes('शुगर') || p.includes('diabetes')) return 'डॉ. अखिलेश';
  if (p.includes('sir') || p.includes('सिर') || p.includes('dimag') || p.includes('दिमाग')) return 'डॉ. अंकित';
  if (p.includes('nose') || p.includes('ear') || p.includes('नाक') || p.includes('कान')) return 'डॉ. ए.के. सिंह';
  if (p.includes('tooth') || p.includes('दांत')) return 'डॉ. आनन्द';
  return null;
}

function parseDoctor(text) {
  const lower = text.toLowerCase();
  if (lower.includes('1') || lower.includes('akhilesh') || lower.includes('अखिलेश')) return 'akhilesh';
  if (lower.includes('2') || lower.includes('ankit') || lower.includes('अंकित')) return 'ankit';
  if (lower.includes('3') || lower.includes('singh') || lower.includes('सिंह')) return 'singh';
  if (lower.includes('4') || lower.includes('anand') || lower.includes('आनन्द')) return 'anand';
  return 'akhilesh';
}

function parseDate(text) {
  const lower = text.toLowerCase();
  if (lower.includes('आज') || lower.includes('aaj') || lower.includes('today')) {
    return new Date();
  }
  if (lower.includes('कल') || lower.includes('kal') || lower.includes('tomorrow')) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

function isDoctorAvailable(doctor, date) {
  if (doctor.days === 'all') return true;
  if (Array.isArray(doctor.days)) {
    if (doctor.days[0] === 15) return date.getDate() === 15;
    if (doctor.days[0] === 1) return date.getDay() === 1; // Monday
  }
  return true;
}

function generateSlots(startHour, endHour) {
  const slots = [];
  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += 10) {
      const period = h >= 12 ? 'PM' : 'AM';
      const displayHour = h > 12 ? h - 12 : h;
      slots.push(`${displayHour}:${m.toString().padStart(2, '0')} ${period}`);
    }
  }
  return slots;
}

function formatDate(date) {
  const months = ['जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function isEmergency(text) {
  const keywords = ["खून", "बेहोश", "एक्सीडेंट", "गंभीर", "blood", "accident", "emergency"];
  return keywords.some(k => text.toLowerCase().includes(k));
}

async function handleEmergency(env, from, name, text) {
  const alert = `🚨 *आपातकालीन सूचना* 🚨\n\nतुरंत अस्पताल आएं या फोन करें:\n*${env.HOSPITAL_PHONE}*\n\n📍 बैदौला चौराहा, बंसी रोड, डुमरियागंज`;
  await sendMessage(env, from, alert);
  await notifyStaff(env, `🚨 EMERGENCY: ${name} (${from}) - ${text}`);
}

async function getState(kv, phone) {
  try {
    const val = await kv.get(`state_${phone}`);
    if (val) {
      const state = JSON.parse(val);
      if (Date.now() - state.timestamp < 600000) return state; // 10 min
    }
  } catch (e) { }
  return { step: 'start' };
}

async function setState(kv, phone, state) {
  state.timestamp = Date.now();
  await kv.put(`state_${phone}`, JSON.stringify(state), { expirationTtl: 3600 });
}

async function clearState(kv, phone) {
  await kv.delete(`state_${phone}`);
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
