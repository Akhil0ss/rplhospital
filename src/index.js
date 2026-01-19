/**
 * RPL HOSPITAL - CONVERSATIONAL AI v6.0 FINAL
 * ============================================
 * Natural conversation with doctor timing validation
 */

export default {
  async fetch(request, env, ctx) {
    const { method } = request;
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "active", version: "6.0" }), {
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

// Doctor schedules with timing validation
const DOCTORS = {
  'akhilesh': {
    name: 'डॉ. अखिलेश कुमार कसौधन',
    specialty: 'शुगर व सामान्य रोग',
    dept: 'General',
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    startTime: '14:00', // 2 PM
    endTime: '19:00',   // 7 PM
    keywords: ['akhilesh', 'अखिलेश', 'sugar', 'शुगर', 'diabetes', 'general', 'सामान्य']
  },
  'ankit': {
    name: 'डॉ. अंकित शुक्ला',
    specialty: 'दिमाग व नस रोग',
    dept: 'Neurology',
    days: [15], // Only 15th of month
    startTime: '14:00',
    endTime: '19:00',
    keywords: ['ankit', 'अंकित', 'neuro', 'brain', 'दिमाग', 'सिर', 'नस']
  },
  'singh': {
    name: 'डॉ. ए.के. सिंह',
    specialty: 'नाक, कान, गला',
    dept: 'ENT',
    days: ['monday'],
    startTime: '15:00', // 3 PM
    endTime: '18:00',   // 6 PM
    keywords: ['singh', 'सिंह', 'ent', 'nose', 'ear', 'throat', 'नाक', 'कान', 'गला']
  },
  'anand': {
    name: 'डॉ. आनन्द मिश्रा',
    specialty: 'दांत',
    dept: 'Dental',
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    startTime: '15:00',
    endTime: '18:00',
    keywords: ['anand', 'आनन्द', 'mishra', 'dental', 'tooth', 'teeth', 'दांत']
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

      // Emergency check
      if (isEmergency(text)) {
        await handleEmergency(env, from, name, text);
        continue;
      }

      // AI-powered conversational response
      const response = await getAIResponse(env, from, name, text);

      await sendMessage(env, from, response.message);
      await logMessage(env.DB, from, "outgoing", response.message, `resp_${Date.now()}`);

      if (response.notify) {
        await notifyStaff(env, response.notify);
      }

    } catch (error) {
      console.error(`Error for ${from}:`, error);
      await sendMessage(env, from, "माफ़ करें, तकनीकी समस्या है। कृपया फोन करें: " + env.HOSPITAL_PHONE);
    }
  }
}

async function getAIResponse(env, phone, name, text) {
  const history = await getRecentHistory(env.DB, phone);

  const systemPrompt = `You are RPL Hospital's friendly AI receptionist. Have natural conversations in Hindi.

HOSPITAL INFO:
- Location: Baidaula Chauraha, Dumariyaganj
- Phone: ${env.HOSPITAL_PHONE}

DOCTORS & SCHEDULES:
1. डॉ. अखिलेश कुमार कसौधन - शुगर व सामान्य रोग (रोज सुबह 2-शाम 7)
2. डॉ. अंकित शुक्ला - दिमाग व नस रोग (महीने की 15 तारीख, दोपहर 2-शाम 7)
3. डॉ. ए.के. सिंह - नाक, कान, गला (सोमवार, दोपहर 3-शाम 6)
4. डॉ. आनन्द मिश्रा - दांत (रोज, दोपहर 3-शाम 6)

CONVERSATION STYLE:
- Be friendly and helpful like a human receptionist
- Ask ONE question at a time
- Keep responses SHORT (2-3 lines)
- Use emojis sparingly
- If user wants appointment, collect: problem, doctor preference, date, time
- Validate doctor availability based on day/time
- If doctor not available, suggest alternative

PATIENT HISTORY:
${history}

RESPONSE FORMAT (JSON):
{
  "message": "Your natural Hindi response",
  "intent": "greeting|appointment|query|booking",
  "extractedInfo": {
    "problem": "...",
    "doctor": "akhilesh|ankit|singh|anand",
    "date": "YYYY-MM-DD",
    "time": "HH:MM"
  },
  "needsBooking": true/false,
  "staffNote": "..."
}

USER: "${text}"`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: systemPrompt }],
        temperature: 0.6,
        max_tokens: 400,
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();
    const aiResponse = JSON.parse(data.choices[0].message.content);

    // If booking needed, validate and book
    if (aiResponse.needsBooking && aiResponse.extractedInfo) {
      const bookingResult = await validateAndBook(env, phone, name, aiResponse.extractedInfo);
      return bookingResult;
    }

    return { message: aiResponse.message };

  } catch (e) {
    console.error("AI Error:", e);
    return { message: "नमस्ते! मैं आपकी कैसे मदद कर सकता हूँ? 🏥" };
  }
}

async function validateAndBook(env, phone, patientName, info) {
  const doctor = DOCTORS[info.doctor];
  if (!doctor) {
    return { message: "कृपया सही डॉक्टर चुनें।" };
  }

  // Parse date
  const appointmentDate = new Date(info.date);
  const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][appointmentDate.getDay()];
  const dateNum = appointmentDate.getDate();

  // Check doctor availability
  let available = false;
  if (Array.isArray(doctor.days)) {
    if (typeof doctor.days[0] === 'number') {
      available = doctor.days.includes(dateNum);
    } else {
      available = doctor.days.includes(dayName);
    }
  }

  if (!available) {
    let availMsg = '';
    if (doctor.name.includes('अंकित')) {
      availMsg = `${doctor.name} सिर्फ महीने की 15 तारीख को उपलब्ध हैं।`;
    } else if (doctor.name.includes('सिंह')) {
      availMsg = `${doctor.name} सिर्फ सोमवार को उपलब्ध हैं।`;
    }
    return { message: `${availMsg}\n\nकोई और तारीख चुनें या दूसरे डॉक्टर से मिलें।` };
  }

  // Validate time
  const [reqHour, reqMin] = info.time.split(':').map(Number);
  const [startHour] = doctor.startTime.split(':').map(Number);
  const [endHour] = doctor.endTime.split(':').map(Number);

  if (reqHour < startHour || reqHour >= endHour) {
    return {
      message: `${doctor.name} ${formatTime(doctor.startTime)} से ${formatTime(doctor.endTime)} तक उपलब्ध हैं।\n\nकृपया इस समय के बीच का समय चुनें।`
    };
  }

  // Book appointment
  const token = Math.floor(1000 + Math.random() * 9000);

  try {
    await env.DB.prepare(
      `INSERT INTO appointments (phone_number, patient_name, doctor_name, department, appointment_date, appointment_time, token_number, status, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', CURRENT_TIMESTAMP)`
    ).bind(phone, patientName, doctor.name, doctor.dept, info.date, info.time, token).run();
  } catch (e) {
    console.error("DB Error:", e);
  }

  const confirmMsg = `✅ *अपॉइंटमेंट बुक हो गई!*\n\n👤 ${patientName}\n🏥 ${doctor.name}\n📅 ${formatDate(appointmentDate)}\n⏰ ${formatTime(info.time)}\n🎫 टोकन: *${token}*\n\nसमय पर पहुंचें। धन्यवाद! 🙏`;

  return {
    message: confirmMsg,
    notify: `📅 नई बुकिंग\n\nमरीज: ${patientName}\nडॉक्टर: ${doctor.name}\nतारीख: ${info.date}\nसमय: ${info.time}\nटोकन: ${token}`
  };
}

function formatTime(time24) {
  const [hour, min] = time24.split(':').map(Number);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour > 12 ? hour - 12 : hour;
  return `${hour12}:${min.toString().padStart(2, '0')} ${period}`;
}

function formatDate(date) {
  const months = ['जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

async function getRecentHistory(db, phone) {
  try {
    const logs = await db.prepare(
      `SELECT message_content, direction FROM message_logs WHERE phone_number = ? ORDER BY timestamp DESC LIMIT 5`
    ).bind(phone).all();

    return logs.results.map(l => `${l.direction}: ${l.message_content}`).join('\n');
  } catch (e) {
    return "No history";
  }
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
