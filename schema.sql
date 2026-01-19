-- =====================================================
-- RPL Hospital Database Schema (D1 Compatible v8.0)
-- =====================================================
-- Cloudflare D1 Compatible Schema
-- =====================================================

-- =====================================================
-- PATIENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    age INTEGER,
    gender TEXT,
    address TEXT,
    first_visit TEXT DEFAULT (datetime('now')),
    last_visit TEXT DEFAULT (datetime('now')),
    total_visits INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone_number);
CREATE INDEX IF NOT EXISTS idx_patients_last_visit ON patients(last_visit);

-- =====================================================
-- APPOINTMENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT NOT NULL,
    patient_name TEXT NOT NULL,
    doctor_name TEXT NOT NULL,
    department TEXT,
    problem_description TEXT,
    appointment_date TEXT NOT NULL,
    appointment_time TEXT NOT NULL,
    token_number INTEGER,
    status TEXT DEFAULT 'confirmed',
    reminder_sent INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_appointments_phone ON appointments(phone_number);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

-- =====================================================
-- LAB TESTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS lab_tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT NOT NULL,
    patient_name TEXT NOT NULL,
    test_name TEXT NOT NULL,
    test_date TEXT NOT NULL,
    test_time TEXT,
    status TEXT DEFAULT 'booked',
    report_url TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lab_tests_phone ON lab_tests(phone_number);
CREATE INDEX IF NOT EXISTS idx_lab_tests_status ON lab_tests(status);

-- =====================================================
-- MEDICINE REMINDERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS medicine_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT NOT NULL,
    patient_name TEXT NOT NULL,
    medicine_name TEXT NOT NULL,
    reminder_time TEXT NOT NULL,
    dosage TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_medicine_unique ON medicine_reminders(phone_number, medicine_name);
CREATE INDEX IF NOT EXISTS idx_medicine_active ON medicine_reminders(active);

-- =====================================================
-- PRESCRIPTION REQUESTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS prescription_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT NOT NULL,
    patient_name TEXT NOT NULL,
    medicine_name TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prescription_status ON prescription_requests(status);

-- =====================================================
-- FEEDBACK TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT NOT NULL,
    patient_name TEXT NOT NULL,
    rating INTEGER,
    feedback_text TEXT,
    category TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_feedback_phone ON feedback(phone_number);
CREATE INDEX IF NOT EXISTS idx_feedback_rating ON feedback(rating);

-- =====================================================
-- MESSAGE LOGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS message_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT NOT NULL,
    direction TEXT NOT NULL,
    message_type TEXT DEFAULT 'text',
    message_content TEXT,
    message_id TEXT,
    timestamp TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_message_phone ON message_logs(phone_number);
CREATE INDEX IF NOT EXISTS idx_message_timestamp ON message_logs(timestamp);

-- =====================================================
-- DOCTORS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS doctors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    specialty TEXT NOT NULL,
    department TEXT NOT NULL,
    availability_days TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    experience TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_doctors_key ON doctors(doctor_key);
CREATE INDEX IF NOT EXISTS idx_doctors_active ON doctors(active);

-- =====================================================
-- BILLS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT NOT NULL,
    patient_name TEXT NOT NULL,
    bill_number TEXT UNIQUE NOT NULL,
    amount REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    payment_method TEXT,
    payment_date TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bills_phone ON bills(phone_number);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);

-- =====================================================
-- INITIAL DATA - Insert default doctors
-- =====================================================
INSERT OR IGNORE INTO doctors (doctor_key, name, specialty, department, availability_days, start_time, end_time, experience, active)
VALUES 
    ('akhilesh', 'डॉ. अखिलेश कुमार कसौधन', 'शुगर व सामान्य रोग', 'General', 'all', 14, 19, '15+ वर्ष', 1),
    ('ankit', 'डॉ. अंकित शुक्ला', 'दिमाग व नस रोग', 'Neurology', '15', 14, 19, '10+ वर्ष', 1),
    ('singh', 'डॉ. ए.के. सिंह', 'नाक, कान, गला', 'ENT', '1', 15, 18, '20+ वर्ष', 1),
    ('anand', 'डॉ. आनन्द मिश्रा', 'दांत', 'Dental', 'all', 15, 18, '12+ वर्ष', 1);
