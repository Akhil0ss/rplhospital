/**
 * RPL HOSPITAL - PROFESSIONAL AI v11.0 (PROTOPROCESSOR)
 * ======================================================
 * Professional protocol-driven AI for high-end hospital automation.
 */

export default {
  async fetch(request, env, ctx) {
    if (request.method === "GET") {
      const url = new URL(request.url);
      if (url.pathname === "/webhook") return new Response(url.searchParams.get("hub.challenge"), { status: 200 });
      return new Response("Hospital AI Active", { status: 200 });
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

const HOSPITAL_DOCS = `
*RPL Hospital Doctors & Specialization:*
1. *Dr. Akhilesh Kumar Kasaudhan* - General Physician & Diabetes Specialist. (Daily: 02:00 PM - 07:00 PM)
2. *Dr. Ankit Shukla* - Senior Neurologist (Brain & Nerves). (Only 15th of every Month: 02:00 PM - 07:00 PM)
3. *Dr. A.K. Singh* - ENT Specialist (Ear, Nose, Throat). (Mondays Only: 03:00 PM - 06:00 PM)
4. *Dr. Anand Mishra* - Dental Surgeon. (Daily: 03:00 PM - 06:00 PM)

*Location:* Baidaula Chauraha, Bansi Road, Dumariyaganj, Siddharthnagar.
`;

async function handleAIChat(message, contact, env) {
  const phone = message.from;
  const name = contact?.profile?.name || "Patient";
  const userText = message.text.body;

  // Get History & Logic State
  const historyKey = `hist_v11_${phone}`;
  let history = JSON.parse(await env.SESSIONS.get(historyKey) || "[]");
  if (history.length > 8) history = history.slice(-8);

  // AI SYSTEM PROTOCOL
  const seniorProtocol = `
    You are the 'Senior Healthcare Coordinator' at RPL Hospital (Elite Front Desk). 
    Your demeanor must be extremely professional, polished, and polite (Aap code). 
    Strictly avoid informal slang. Use sophisticated Hinglish that sounds clinical yet helpful.
    
    *CONVERSATIONAL ETIQUETTE:*
    - Greet Gracefully: "नमस्ते! RPL Hospital में आपका हार्दिक स्वागत है।"
    - Address the patient by name (if known) with respect.
    - Use bullet points for services/options.
    - End with a professional sign-off: "धन्यवाद, आपकी सेवा में तत्पर - RPL AI टीम।"

    *STEP-BY-STEP CLINICAL PROTOCOL:*
    1. **Triage & Greeting**: Acknowledge the patient and understand their specific health concern in detail.
    2. **Professional Recommendation**: Based on symptoms, recommend the most suitable Doctor from our specialized list.
    3. **Schedule Negotiation**: Inquire about their date preference and offer available time slots elegantly.
    4. **Confirmation Summary**: Present a formal "Appointment Summary" with bold headers. Ask for a final "YES" to confirm booking.
    5. **Final Execution**: Trigger 'finalize_booking' ONLY after explicit confirmation.

    *HOSPITAL DATA:*
    ${HOSPITAL_DOCS}
    Today: ${new Date().toLocaleDateString('hi-IN')}

    *STRICT JSON RESPONSE FORMAT:*
    {
      "reply": "Professional message with bold headers and clear formatting",
      "action": "none" | "finalize_booking",
      "data": { "doctor": "name", "date": "date", "time": "time", "problem": "issue" }
    }
    `;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: seniorProtocol },
          ...history,
          { role: "user", content: userText }
        ],
        temperature: 0.2, // Consistent and professional responses
        response_format: { type: "json_object" }
      })
    });

    const aiData = await response.json();
    const output = JSON.parse(aiData.choices[0].message.content);

    // ACTION: Finalize Appointment
    if (output.action === "finalize_booking") {
      const token = Math.floor(1000 + Math.random() * 9000);
      const { doctor, date, time, problem } = output.data;

      await env.DB.prepare(
        "INSERT INTO appointments (phone_number, patient_name, doctor_name, appointment_date, appointment_time, token_number, status) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(phone, name, doctor, date, time, token, 'confirmed').run();

      output.reply = `✨ *Appointment Confirmed!* ✨\n\n` +
        `👤 *Patient:* ${name}\n` +
        `👨‍⚕️ *Doctor:* ${doctor}\n` +
        `📅 *Date:* ${date}\n` +
        `⏰ *Time:* ${time}\n` +
        `🎫 *Token No:* ${token}\n\n` +
        `📍 *Location:* Baidaula Chauraha, Bansi Road, Dumariyaganj.\n\n` +
        `Please reach 15 minutes before your time. Thank you! 🙏`;

      // Staff Notification
      if (env.HOSPITAL_NOTIFICATION_NUMBER) {
        await sendWhatsApp(env, env.HOSPITAL_NOTIFICATION_NUMBER, `🏥 *New Patient Booking*\n\nName: ${name}\nPhone: ${phone}\nDoc: ${doctor}\nProblem: ${problem}\nTime: ${date} ${time}`);
      }
    }

    await sendWhatsApp(env, phone, output.reply);

    // Update Context
    history.push({ role: "user", content: userText });
    history.push({ role: "assistant", content: output.reply });
    await env.SESSIONS.put(historyKey, JSON.stringify(history), { expirationTtl: 3600 });

  } catch (err) {
    console.error(err);
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
