// =============================================
// RPL HOSPITAL – ERROR FIXED VERSION
// PROPER REQUEST HANDLING WITH STREAM MANAGEMENT
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
        // IMPORTANT: Read request body BEFORE returning response
        const requestClone = request.clone();
        const body = await requestClone.json();
        
        // Process asynchronously but safely
        ctx.waitUntil(processWebhookMessage(body, env));
        
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
// FIXED WEBHOOK PROCESSOR
// =============================================

async function processWebhookMessage(body, env) {
  try {
    const entry = body.entry?.[0];
    if (!entry) return;
    
    const change = entry.changes?.[0];
    if (!change || change.field !== "messages") return;
    
    const value = change.value;
    const messages = value.messages || [];
    const contacts = value.contacts || [];
    
    // Process each message
    for (const msg of messages) {
      try {
        await handleMessage(msg, contacts, env);
      } catch (msgError) {
        console.error(`Message ${msg.id} failed:`, msgError);
      }
    }
  } catch (error) {
    console.error("Webhook processing error:", error);
  }
}

// =============================================
// MESSAGE HANDLER (SIMPLIFIED)
// =============================================

async function handleMessage(msg, contacts, env) {
  // Validate message type
  if (msg.type !== "text") return;
  
  const userPhone = msg.from;
  const contact = contacts.find(c => c.wa_id === userPhone);
  const userName = contact?.profile?.name || "मरीज";
  const userMessage = msg.text?.body?.trim() || "";
  const messageId = msg.id;
  
  console.log(`📱 ${userPhone}: ${userMessage.substring(0, 50)}...`);
  
  // Get or create session
  const session = await getSession(env.SESSIONS, userPhone);
  
  // Detect language preference
  const lang = detectLanguage(userMessage, session);
  
  // Update session language preference
  if (userMessage.toLowerCase().includes("hindi bolo") || 
      userMessage.includes("हिंदी बोलो")) {
    session.language = 'hi';
    session.languageSet = true;
  }
  
  // Generate response
  let response;
  
  // Handle specific cases
  if (userMessage.toLowerCase() === "hi" || userMessage.toLowerCase() === "hello") {
    response = session.language === 'hi' 
      ? "नमस्ते! आप RPL Hospital के AI रिसेप्शनिस्ट से बात कर रहे हैं। आप कैसे मदद चाहते हैं?"
      : "Hello! You're speaking with RPL Hospital AI receptionist. How can I help you today?";
  }
  else if (userMessage.toLowerCase().includes("hindi bolo") || 
           userMessage.includes("हिंदी बोलो")) {
    session.language = 'hi';
    response = "जी, अब मैं हिंदी में बात करूंगा। आप कैसे मदद चाहते हैं?";
  }
  else if (userMessage === "नमस्ते" || userMessage === "Namaste") {
    response = "नमस्ते! कैसे मदद कर सकता हूं?";
  }
  else {
    // Use AI for other messages
    response = await getAIResponse(env, userMessage, session.language || lang);
  }
  
  // Save session
  session.lastActive = Date.now();
  await saveSession(env.SESSIONS, userPhone, session);
  
  // Send response
  await sendWhatsApp(env, userPhone, response);
  
  // Log
  await logInteraction(env.DB, {
    phone: userPhone,
    incoming: userMessage,
    outgoing: response,
    messageId
  });
}

// =============================================
// SIMPLIFIED SESSION MANAGEMENT
// =============================================

async function getSession(kv, phone) {
  try {
    const data = await kv.get(`session_${phone}`, { type: "json" });
    if (data && Date.now() - data.lastActive < 30 * 60 * 1000) {
      return data;
    }
  } catch (error) {
    console.error("Session read error:", error);
  }
  
  // Default session
  return {
    phone: phone,
    language: null,
    lastActive: Date.now(),
    createdAt: Date.now()
  };
}

async function saveSession(kv, phone, session) {
  try {
    await kv.put(
      `session_${phone}`,
      JSON.stringify(session),
      { expirationTtl: 86400 } // 24 hours
    );
  } catch (error) {
    console.error("Session save error:", error);
  }
}

// =============================================
// IMPROVED LANGUAGE DETECTION
// =============================================

function detectLanguage(text, session) {
  // If user has set preference, use it
  if (session?.language === 'hi') return 'hi';
  if (session?.language === 'en') return 'en';
  
  // Detect from text
  const lowerText = text.toLowerCase();
  
  // Hindi patterns
  const hindiPatterns = [
    /[\u0900-\u097F]/, // Hindi characters
    /\b(नमस्ते|हैलो|हां|नहीं|कैसे|क्या|में|हूं|है|हैं|बोलो|हिंदी|कृपया|धन्यवाद|जी)\b/,
    /hindi\s+bolo/i,
    /हिंदी\s+बोलो/i
  ];
  
  // If any Hindi pattern matches
  for (const pattern of hindiPatterns) {
    if (pattern.test(text)) return 'hi';
  }
  
  // English patterns
  const englishPatterns = [
    /\b(hi|hello|hey|good|morning|afternoon|evening|appointment|doctor|test)\b/i,
    /^[a-zA-Z\s,.!?]+$/ // Only English characters
  ];
  
  for (const pattern of englishPatterns) {
    if (pattern.test(lowerText)) return 'en';
  }
  
  // Default to Hindi for Indian numbers
  return 'hi';
}

// =============================================
// AI RESPONSE GENERATOR
// =============================================

async function getAIResponse(env, message, lang) {
  const systemPrompt = lang === 'hi' ? `
आप RPL Hospital के AI receptionist हैं।
हमेशा विनम्र और helpful रहें।
कीमतों का जिक्र न करें।
आपात स्थिति में तुरंत मदद करें।

अस्पताल जानकारी:
- नाम: RPL Hospital
- फोन: ${env.HOSPITAL_PHONE}
- पता: ${env.HOSPITAL_ADDRESS}

डॉक्टर:
1. डॉ. अखिलेश कुमार - फिजिशियन और शुगर
2. डॉ. अंकित शुक्ला - न्यूरोलॉजिस्ट
3. डॉ. ए.के. सिंह - ENT
4. डॉ. आनंद मिश्रा - डेंटल

टेस्ट: CBC, Blood Sugar, Thyroid, LFT, KFT, Lipid, Urine

मरीज का मैसेज: "${message}"

उचित जवाब दें:` : `
You are RPL Hospital's AI receptionist.
Always be polite and helpful.
Never mention prices.
Help immediately in emergencies.

Hospital Info:
- Name: RPL Hospital
- Phone: ${env.HOSPITAL_PHONE}
- Address: ${env.HOSPITAL_ADDRESS}

Doctors:
1. Dr. Akhilesh Kumar - Physician & Diabetes
2. Dr. Ankit Shukla - Neurologist
3. Dr. A.K. Singh - ENT
4. Dr. Anand Mishra - Dental

Tests: CBC, Blood Sugar, Thyroid, LFT, KFT, Lipid, Urine

Patient message: "${message}"

Provide appropriate response:`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ],
        temperature: 0.5,
        max_tokens: 150
      })
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
    
  } catch (error) {
    console.error("AI error:", error);
    return lang === 'hi' 
      ? "माफ़ करें, तकनीकी समस्या आ रही है। कृपया फिर से बताएं।"
      : "Sorry, technical issue. Please repeat your message.";
  }
}

// =============================================
// UTILITY FUNCTIONS (ERROR HANDLED)
// =============================================

async function sendWhatsApp(env, to, text) {
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
          text: { body: text }
        })
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      console.error("WhatsApp API error:", error);
    }
    
  } catch (error) {
    console.error("Send WhatsApp error:", error);
  }
}

async function logInteraction(db, data) {
  try {
    // Log incoming
    await db.prepare(
      `INSERT INTO message_logs (phone_number, direction, message_content, timestamp)
       VALUES (?, 'incoming', ?, CURRENT_TIMESTAMP)`
    ).bind(data.phone, data.incoming.substring(0, 500)).run();
    
    // Log outgoing
    await db.prepare(
      `INSERT INTO message_logs (phone_number, direction, message_content, timestamp)
       VALUES (?, 'outgoing', ?, CURRENT_TIMESTAMP)`
    ).bind(data.phone, data.outgoing.substring(0, 500)).run();
    
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
