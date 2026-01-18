// =============================================
// RPL HOSPITAL – FIXED AI RECEPTIONIST
// PROPER LANGUAGE DETECTION + CONTEXT AWARE
// =============================================

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      
      if (request.method === "GET" && url.pathname === "/webhook") {
        return verifyWebhook(request, env);
      }
      
      if (request.method === "POST" && url.pathname === "/webhook") {
        ctx.waitUntil(processMessage(request, env));
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
// IMPROVED LANGUAGE DETECTION
// =============================================

function detectLanguageAndIntent(text) {
  const lowerText = text.toLowerCase().trim();
  
  // HINDI DETECTION (IMPROVED)
  const hindiIndicators = [
    // Hindi characters
    /[\u0900-\u097F]/,
    // Common Hindi words
    /\b(नमस्ते|हैलो|हां|नहीं|कैसे|क्या|में|हूं|है|हैं|बोलो|बोल|हिंदी|कृपया|धन्यवाद|जी|ठीक|अच्छा)\b/,
    // Hindi instruction patterns
    /hindi\s+bolo/i,
    /हिंदी\s+बोलो/i,
    /हिंदी\s+में\s+बात/i
  ];
  
  const isHindi = hindiIndicators.some(pattern => pattern.test(text));
  
  // INTENT DETECTION
  const intents = {
    greeting: /\b(hi|hello|hey|नमस्ते|हैलो|हाय|गुड\s*मॉर्निंग)\b/i.test(lowerText),
    languageRequest: /(hindi|हिंदी).*(bolo|बोलो|speak|talk)/i.test(text) ||
                    /(bolo|बोलो).*(hindi|हिंदी)/i.test(text),
    emergency: /\b(emergency|आपात|बेहोश|सांस|खून|दर्द|एक्सीडेंट|accident)\b/i.test(lowerText),
    appointment: /\b(appointment|डॉक्टर|दिखाना|चेकअप|consult|कंसल्ट)\b/i.test(lowerText),
    labtest: /\b(test|टेस्ट|जांच|लैब|blood|खून|urine|पेशाब)\b/i.test(lowerText)
  };
  
  return {
    language: isHindi ? 'hi' : 'en',
    intents: intents,
    isLanguageSwitchRequest: intents.languageRequest
  };
}

// =============================================
// CONTEXT-AWARE MESSAGE PROCESSOR
// =============================================

async function processMessage(request, env) {
  try {
    const body = await request.json();
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const contact = body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0];
    
    if (!message || message.type !== "text") return;
    
    const userPhone = message.from;
    const userName = contact?.profile?.name || "मरीज";
    const userMessage = message.text.body;
    const messageId = message.id;
    
    console.log(`📞 ${userPhone}: "${userMessage}"`);
    
    // GET OR CREATE SESSION WITH CONTEXT
    const session = await getOrCreateSession(env.SESSIONS, userPhone, userName);
    
    // DETECT LANGUAGE AND INTENT
    const detection = detectLanguageAndIntent(userMessage);
    
    // UPDATE SESSION WITH PREFERRED LANGUAGE
    if (detection.isLanguageSwitchRequest) {
      session.preferredLanguage = 'hi';
      session.languageSwitchRequested = true;
    }
    
    // USE PREFERRED LANGUAGE IF SET, OTHERWUSE DETECTED
    const replyLanguage = session.preferredLanguage || detection.language;
    
    // STORE IN CONVERSATION HISTORY
    if (!session.conversation) session.conversation = [];
    session.conversation.push({
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString()
    });
    
    // KEEP ONLY LAST 10 MESSAGES
    if (session.conversation.length > 10) {
      session.conversation = session.conversation.slice(-10);
    }
    
    // GENERATE RESPONSE BASED ON CONTEXT
    let response;
    
    // CASE 1: User explicitly asking for Hindi
    if (userMessage.toLowerCase().includes("hindi bolo") || 
        userMessage.includes("हिंदी बोलो")) {
      session.preferredLanguage = 'hi';
      response = "जी अबसे हिंदी में बात करूंगा! आप कैसे मदद चाहते हैं? क्या आप डॉक्टर से मिलना चाहते हैं या कोई टेस्ट कराना चाहते हैं?";
    }
    // CASE 2: Simple greeting in Hindi
    else if (userMessage === "नमस्ते" || userMessage === "Namaste") {
      response = "नमस्ते! आप RPL Hospital के AI रिसेप्शनिस्ट से बात कर रहे हैं। आप कैसे मदद चाहते हैं?";
    }
    // CASE 3: English greeting
    else if (userMessage.toLowerCase() === "hi" || userMessage.toLowerCase() === "hello") {
      // Check if user previously asked for Hindi
      if (session.preferredLanguage === 'hi') {
        response = "नमस्ते! आप कैसे मदद चाहते हैं?";
      } else {
        response = "Hello! You're speaking with RPL Hospital AI receptionist. How can I help you today?";
      }
    }
    // CASE 4: Handle mixed or unclear messages
    else {
      // Use AI for proper response
      response = await getContextAwareAIResponse(env, {
        userMessage,
        userName,
        userPhone,
        session,
        preferredLanguage: replyLanguage,
        conversationHistory: session.conversation
      });
    }
    
    // SAVE RESPONSE TO CONVERSATION HISTORY
    session.conversation.push({
      role: 'assistant',
      content: response,
      timestamp: new Date().toISOString()
    });
    
    // UPDATE SESSION
    session.lastActive = Date.now();
    await env.SESSIONS.put(
      `session_${userPhone}`,
      JSON.stringify(session),
      { expirationTtl: 86400 } // 24 hours
    );
    
    // SEND RESPONSE
    await sendWhatsApp(env, userPhone, response, messageId);
    
    // LOG
    await logMessage(env.DB, userPhone, "incoming", userMessage);
    await logMessage(env.DB, userPhone, "outgoing", response);
    
  } catch (error) {
    console.error("Process error:", error);
  }
}

// =============================================
// IMPROVED SESSION MANAGEMENT
// =============================================

async function getOrCreateSession(kv, phone, name) {
  try {
    const sessionData = await kv.get(`session_${phone}`, { type: "json" });
    
    if (sessionData) {
      // Check if session is expired (30 minutes)
      if (Date.now() - sessionData.lastActive > 30 * 60 * 1000) {
        return createNewSession(phone, name);
      }
      return sessionData;
    }
    
    return createNewSession(phone, name);
    
  } catch (error) {
    console.error("Session error:", error);
    return createNewSession(phone, name);
  }
}

function createNewSession(phone, name) {
  return {
    id: `sess_${Date.now()}_${phone}`,
    phone: phone,
    name: name,
    preferredLanguage: null,
    conversation: [],
    lastIntent: null,
    pendingAction: null,
    lastActive: Date.now(),
    createdAt: Date.now()
  };
}

// =============================================
// CONTEXT-AWARE AI RESPONSE
// =============================================

async function getContextAwareAIResponse(env, context) {
  const { userMessage, userName, userPhone, session, preferredLanguage, conversationHistory } = context;
  
  // Prepare conversation history for AI
  const historyText = conversationHistory
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n');
  
  const systemPrompt = preferredLanguage === 'hi' ? `
# भूमिका: RPL Hospital AI रिसेप्शनिस्ट
आप एक AI receptionist हैं जो RPL Hospital के लिए काम करती हैं।

# महत्वपूर्ण जानकारी:
- अस्पताल: RPL Hospital
- फोन: ${env.HOSPITAL_PHONE}
- पता: ${env.HOSPITAL_ADDRESS}

# डॉक्टर:
1. डॉ. अखिलेश कुमार - फिजिशियन और शुगर विशेषज्ञ
2. डॉ. अंकित शुक्ला - न्यूरोलॉजिस्ट
3. डॉ. ए.के. सिंह - ENT
4. डॉ. आनंद मिश्रा - डेंटल

# निर्देश:
1. हमेशा विनम्र और मददगार रहें
2. कीमतों का जिक्र न करें
3. आपात स्थिति में तुरंत गाइड करें
4. प्राकृतिक हिंदी में बात करें
5. पिछली conversation को याद रखें

# Conversation History:
${historyText}

# Patient:
नाम: ${userName}
फोन: ${userPhone}

# Current Message:
मरीज: "${userMessage}"

अब उचित जवाब दें:` : `
# ROLE: RPL Hospital AI Receptionist
You are an AI receptionist working for RPL Hospital.

# IMPORTANT INFORMATION:
- Hospital: RPL Hospital
- Phone: ${env.HOSPITAL_PHONE}
- Address: ${env.HOSPITAL_ADDRESS}

# DOCTORS:
1. Dr. Akhilesh Kumar - Physician & Diabetes Specialist
2. Dr. Ankit Shukla - Neurologist
3. Dr. A.K. Singh - ENT Specialist
4. Dr. Anand Mishra - Dental Specialist

# INSTRUCTIONS:
1. Always be polite and helpful
2. Never mention prices
3. Guide immediately in emergencies
4. Use natural conversation style
5. Remember conversation history

# Conversation History:
${historyText}

# Patient:
Name: ${userName}
Phone: ${userPhone}

# Current Message:
Patient: "${userMessage}"

Now provide an appropriate response:`;

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
          { role: "user", content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 200
      })
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    let reply = data.choices[0].message.content.trim();
    
    // Ensure response is in correct language
    if (preferredLanguage === 'hi') {
      // Check if AI replied in English when Hindi was requested
      const hindiChars = /[\u0900-\u097F]/;
      if (!hindiChars.test(reply)) {
        reply = "माफ़ करें, हिंदी में जवाब देने में समस्या हो रही है। कृपया अपनी बात दोबारा बताएं।";
      }
    }
    
    return reply;
    
  } catch (error) {
    console.error("AI response error:", error);
    
    // Fallback responses
    if (preferredLanguage === 'hi') {
      return "नमस्ते! मैं RPL Hospital का AI रिसेप्शनिस्ट हूं। आप कैसे मदद चाहते हैं? क्या आप डॉक्टर से मिलना चाहते हैं या कोई टेस्ट कराना चाहते हैं?";
    } else {
      return "Hello! I'm RPL Hospital AI receptionist. How can I help you today? Are you looking to see a doctor or get a test done?";
    }
  }
}

// =============================================
// UTILITY FUNCTIONS
// =============================================

async function sendWhatsApp(env, to, text, referenceId) {
  try {
    await fetch(`https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
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
    });
  } catch (error) {
    console.error("Send WhatsApp error:", error);
  }
}

async function logMessage(db, phone, direction, content) {
  try {
    await db.prepare(
      `INSERT INTO message_logs (phone_number, direction, message_type, message_content, timestamp)
       VALUES (?, ?, 'text', ?, CURRENT_TIMESTAMP)`
    ).bind(phone, direction, content.substring(0, 500)).run();
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
