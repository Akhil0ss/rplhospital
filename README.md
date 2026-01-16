# RPL Hospital - WhatsApp Business API Automation

A comprehensive WhatsApp chatbot for hospital management built on Cloudflare Workers.

## Features

- 📅 **Appointment Booking** - Book appointments with doctors
- 🔬 **Lab Reports** - Check status and download reports
- 💊 **Prescriptions** - View prescriptions and medicines
- 💰 **Bills & Payments** - Check pending bills and payment history
- 👨‍⚕️ **Doctor Info** - Find doctors and department information
- 🚨 **Emergency** - Quick access to emergency contacts
- ⭐ **Feedback** - Collect patient feedback
- 📝 **Registration** - New patient registration
- 🤖 **AI Assistant** - Natural language understanding with Groq

## Setup

### Prerequisites

- Node.js 18+
- Cloudflare account
- Wrangler CLI
- Meta WhatsApp Business API access

### Installation

1. **Clone and install dependencies:**
```bash
cd rpl-hospital-waba
npm install
```

2. **Create D1 Database:**
```bash
wrangler d1 create rpl_hospital_db
```
Copy the database_id and update `wrangler.toml`

3. **Run database migrations:**
```bash
npm run db:migrate
```

4. **Add secrets:**
```bash
# WhatsApp Access Token (required)
wrangler secret put WHATSAPP_ACCESS_TOKEN

# Groq API Key (optional, for AI features)
wrangler secret put GROQ_API_KEY
```

5. **Deploy:**
```bash
npm run deploy
```

### Meta WhatsApp Configuration

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create/select your WhatsApp Business App
3. Configure Webhook:
   - **Callback URL:** `https://your-worker.workers.dev/webhook`
   - **Verify Token:** `rplhospital`
4. Subscribe to messages webhook field

## Configuration

Update `wrangler.toml` with your details:

```toml
[vars]
HOSPITAL_NAME = "RPL Hospital"
HOSPITAL_PHONE = "08069640826"
HOSPITAL_ADDRESS = "Baidaula Chauraha, Bansi Road, Dumariyaganj, Siddharthnagar, UP, 272189"
WHATSAPP_PHONE_NUMBER_ID = "973417615848807"
WHATSAPP_VERIFY_TOKEN = "rplhospital"
WHATSAPP_BUSINESS_ACCOUNT_ID = "866871359575360"
HOSPITAL_NOTIFICATION_NUMBER = "919455060456"
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/webhook` | GET | WhatsApp webhook verification |
| `/webhook` | POST | Incoming WhatsApp messages |
| `/api/admin/stats` | GET | Dashboard statistics |
| `/api/admin/appointments` | GET | List appointments |
| `/api/admin/patients` | GET | List patients |
| `/api/admin/doctors` | GET/POST | Manage doctors |

## Message Flow

```
User sends "Hi"
    ↓
Main Menu (List of options)
    ↓
User selects "Book Appointment"
    ↓
Select Department → Select Doctor → Select Date → Select Time → Confirm
    ↓
Appointment Confirmed + Notification to Hospital
```

## Scheduled Tasks

Add to `wrangler.toml` for cron triggers:

```toml
[triggers]
crons = [
    "0 8 * * *",   # Appointment reminders at 8 AM
    "0 21 * * *",  # Daily summary at 9 PM
    "0 * * * *"    # Medicine reminders every hour
]
```

## Project Structure

```
rpl-hospital-waba/
├── src/
│   ├── index.js              # Main entry point
│   ├── handlers/
│   │   ├── webhook.js        # WhatsApp webhook handler
│   │   ├── admin.js          # Admin API handler
│   │   └── scheduled.js      # Cron job handler
│   ├── services/
│   │   ├── whatsapp.js       # WhatsApp API client
│   │   ├── session.js        # Session management
│   │   ├── message-processor.js
│   │   ├── notification.js   # Notification service
│   │   ├── patient.js        # Patient data service
│   │   └── ai-assistant.js   # Groq AI integration
│   └── flows/
│       ├── main-menu.js      # Main menu flow
│       ├── appointment.js    # Appointment booking
│       ├── lab-report.js     # Lab reports
│       ├── prescription.js   # Prescriptions
│       ├── bill.js           # Bills & payments
│       ├── doctor-info.js    # Doctor information
│       ├── emergency.js      # Emergency contacts
│       ├── feedback.js       # Patient feedback
│       └── registration.js   # Patient registration
├── schema.sql                # D1 database schema
├── wrangler.toml            # Cloudflare config
└── package.json
```

## Hospital Admin Notifications

The hospital WhatsApp number (919455060456) receives:
- 🆕 New appointment bookings
- 👤 New patient registrations
- 📝 Patient feedback
- 📊 Daily summary reports

## License

MIT License - RPL Hospital
