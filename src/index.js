/**
 * RPL HOSPITAL - AI AUTOMATION v10.0 (CONTEXT-AWARE)
 * ==================================================
 * Powered by Groq (Llama-3) for Natural Conversations.
 * Managed Flow: Intent -> Context -> Action -> Response.
 */

export default {
  async fetch(request, env, ctx) {
    if (request.method === "GET") {
      const url = new URL(request.url);
      if (url.pathname === "/webhook") {
        return new Response(url.searchParams.get("hub.challenge"), { status: 200 });
      }
      return new Response("AI Bot Active", { status: 200 });
    }

    if (request.method === "POST") {
      try {
        const body = await request.json();
        const value = body.entry?.[0]?.changes?.[0]?.value;
        const message = value?.messages?.[0];
        const contact = value?.contacts?.[0];

        if (message && message.type === "text") {
          ctx.waitUntil(handleAIChat(message, contact, env));
        }
        return new Response("OK", { status: 200 });
      } catch (e) {
        return new Response("Error", { status: 500 });
      }
    }
  }
};

const DOCTORS_INFO = `
Available Doctors at RPL Hospital:
1. Dr. Akhilesh Kumar (Specialist: Sugar/Diabetes & General Physician). Timing: daily 2 PM to 7 PM. 
2. Dr. Ankit Shukla (Specialist: Neurology/Brain/Nerves). Availability: Only on 15th of every month, 2-7 PM.
3. Dr. A.K. Singh (Specialist: ENT - Ear, Nose, Throat). Availability: Mondays only, 3-6 PM.
4. Dr. Anand Mishra (Specialist: Dentist/Teeth). Timing: daily 3-6 PM.
Address: Baidaula Chauraha, Bansi Road, Dumariyaganj.
`;

async function handleAIChat(message, contact, env) {
  const phone = message.from;
  const name = contact?.profile?.name || "Patient";
  const userText = message.text.body;

  // 1. Get Conversation History from KV
  const historyKey = `hist_${phone}`;
  let historyRows = await env.SESSIONS.get(historyKey);
  let history = historyRows ? JSON.parse(historyRows) : [];

  // Keep history lean (last 6 messages)
  if (history.length > 6) history = history.slice(-6);

  // 2. Prepare AI Prompt
  const systemPrompt = `
    You are the AI Front-Desk Manager of RPL Hospital. 
    Strict Rule: Talk in a helpful, professional, and friendly manner using a mix of Hindi and English (Hinglish).
    
    Current Patient: ${name}
    Hospital Info: ${DOCTORS_INFO}
    Todays Date: ${new Date().toLocaleDateString()}

    Your Goal:
    - Greet if it's a new conversation.
    - If user wants appointment, ask their problem, then suggest the right doctor.
    - Collect appointment details: Problem, Doctor Name, Date, and Time Preference.
    - Suggest slots: 10AM, 11AM, 2PM, 3PM, 4PM.
    - When all details are clear, tell them you are booking it.
    - Handle emergencies by telling them to come immediately or call ${env.HOSPITAL_PHONE}.

    Output Format (JSON strictly):
    {
      "reply": "Your message to the patient in Hinglish",
      "action": "none" or "finalize_booking",
      "data": { "doctor": "name", "date": "date", "time": "time", "problem": "issue" }
    }
    `;

  // 3. Call Groq AI
  try {
    const aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt },
          ...history,
          { role: "user", content: userText }
        ],
        response_format: { type: "json_object" }
      })
    });

    const aiData = await aiResponse.json();
    const botResponse = JSON.parse(aiData.choices[0].message.content);

    // 4. Execute Action if finalized
    if (botResponse.action === "finalize_booking") {
      const token = Math.floor(1000 + Math.random() * 9000);
      const { doctor, date, time } = botResponse.data;

      await env.DB.prepare(
        "INSERT INTO appointments (phone_number, patient_name, doctor_name, appointment_date, appointment_time, token_number, status) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(phone, name, doctor, date, time, token, 'confirmed').run();

      botResponse.reply += `\n\n✅ *Confirmed!*\n🎫 Token: ${token}\n📍 Place: RPL Hospital`;

      // Notify Hospital
      if (env.HOSPITAL_NOTIFICATION_NUMBER) {
        await sendWhatsApp(env, env.HOSPITAL_NOTIFICATION_NUMBER, `New AI Booking:\n${name} (${phone})\nDoc: ${doctor}\nTime: ${date} ${time}`);
      }
    }

    // 5. Send Response back to User
    await sendWhatsApp(env, phone, botResponse.reply);

    // 6. Update History
    history.push({ role: "user", content: userText });
    history.push({ role: "assistant", content: botResponse.reply });
    await env.SESSIONS.put(historyKey, JSON.stringify(history), { expirationTtl: 3600 });

  } catch (err) {
    console.error("AI Error:", err);
    await sendWhatsApp(env, phone, "माफ़ करें, मैं अभी आपकी बात पूरी तरह समझ नहीं पा रहा हूँ। क्या आप दोबारा बताएंगे?");
  }
}

async function sendWhatsApp(env, to, text) {
  await fetch(`https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } })
  });
}
