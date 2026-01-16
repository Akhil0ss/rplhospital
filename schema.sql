-- RPL Hospital WABA Database Schema
-- Run with: wrangler d1 execute rpl_hospital_db --file=./schema.sql

-- ============================================
-- PATIENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT UNIQUE NOT NULL,
    name TEXT,
    date_of_birth TEXT,
    gender TEXT CHECK(gender IN ('male', 'female', 'other')),
    blood_group TEXT,
    emergency_contact TEXT,
    address TEXT,
    email TEXT,
    patient_id TEXT UNIQUE, -- Hospital's internal patient ID (e.g., RPL-2024-0001)
    registered_at TEXT DEFAULT (datetime('now')),
    last_interaction TEXT DEFAULT (datetime('now')),
    is_verified INTEGER DEFAULT 0,
    language_preference TEXT DEFAULT 'en'
);

-- ============================================
-- DEPARTMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    floor_number TEXT,
    timings TEXT,
    emergency_available INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1
);

-- ============================================
-- DOCTORS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS doctors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    department_id INTEGER REFERENCES departments(id),
    specialization TEXT,
    qualification TEXT,
    experience_years INTEGER,
    consultation_fee REAL,
    available_days TEXT, -- JSON array: ["monday", "tuesday", ...]
    available_timings TEXT, -- JSON: {"monday": {"start": "09:00", "end": "17:00"}, ...}
    max_appointments_per_day INTEGER DEFAULT 20,
    phone_number TEXT,
    is_active INTEGER DEFAULT 1
);

-- ============================================
-- APPOINTMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER REFERENCES patients(id),
    doctor_id INTEGER REFERENCES doctors(id),
    department_id INTEGER REFERENCES departments(id),
    appointment_date TEXT NOT NULL,
    appointment_time TEXT NOT NULL,
    token_number INTEGER,
    status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show', 'rescheduled')),
    visit_type TEXT DEFAULT 'consultation' CHECK(visit_type IN ('consultation', 'follow_up', 'emergency', 'lab_test', 'procedure')),
    symptoms TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    reminder_sent INTEGER DEFAULT 0,
    confirmation_sent INTEGER DEFAULT 0
);

-- ============================================
-- LAB TESTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS lab_tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    category TEXT, -- blood, urine, imaging, etc.
    description TEXT,
    price REAL,
    preparation_instructions TEXT,
    turnaround_time TEXT, -- e.g., "24 hours", "2-3 days"
    is_active INTEGER DEFAULT 1
);

-- ============================================
-- LAB ORDERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS lab_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER REFERENCES patients(id),
    doctor_id INTEGER REFERENCES doctors(id),
    order_date TEXT DEFAULT (datetime('now')),
    status TEXT DEFAULT 'ordered' CHECK(status IN ('ordered', 'sample_collected', 'processing', 'completed', 'cancelled')),
    total_amount REAL,
    paid_amount REAL DEFAULT 0,
    payment_status TEXT DEFAULT 'pending' CHECK(payment_status IN ('pending', 'partial', 'paid')),
    notes TEXT
);

-- ============================================
-- LAB ORDER ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS lab_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lab_order_id INTEGER REFERENCES lab_orders(id),
    lab_test_id INTEGER REFERENCES lab_tests(id),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed')),
    result_value TEXT,
    result_unit TEXT,
    reference_range TEXT,
    is_abnormal INTEGER DEFAULT 0,
    completed_at TEXT
);

-- ============================================
-- LAB REPORTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS lab_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lab_order_id INTEGER REFERENCES lab_orders(id),
    patient_id INTEGER REFERENCES patients(id),
    report_number TEXT UNIQUE,
    report_date TEXT DEFAULT (datetime('now')),
    report_url TEXT, -- Link to PDF report
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'ready', 'delivered')),
    delivered_via_whatsapp INTEGER DEFAULT 0,
    delivered_at TEXT
);

-- ============================================
-- PRESCRIPTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS prescriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER REFERENCES patients(id),
    doctor_id INTEGER REFERENCES doctors(id),
    appointment_id INTEGER REFERENCES appointments(id),
    prescription_number TEXT UNIQUE,
    prescription_date TEXT DEFAULT (datetime('now')),
    diagnosis TEXT,
    notes TEXT,
    follow_up_date TEXT,
    prescription_url TEXT -- Link to PDF
);

-- ============================================
-- PRESCRIPTION ITEMS (MEDICINES) TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS prescription_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prescription_id INTEGER REFERENCES prescriptions(id),
    medicine_name TEXT NOT NULL,
    dosage TEXT,
    frequency TEXT, -- e.g., "1-0-1", "twice daily"
    duration TEXT, -- e.g., "7 days", "2 weeks"
    instructions TEXT, -- e.g., "after meals", "before sleep"
    quantity INTEGER
);

-- ============================================
-- BILLS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER REFERENCES patients(id),
    bill_number TEXT UNIQUE NOT NULL,
    bill_date TEXT DEFAULT (datetime('now')),
    bill_type TEXT CHECK(bill_type IN ('consultation', 'lab', 'pharmacy', 'procedure', 'admission', 'combined')),
    total_amount REAL NOT NULL,
    discount_amount REAL DEFAULT 0,
    tax_amount REAL DEFAULT 0,
    net_amount REAL NOT NULL,
    paid_amount REAL DEFAULT 0,
    payment_status TEXT DEFAULT 'pending' CHECK(payment_status IN ('pending', 'partial', 'paid', 'refunded')),
    payment_method TEXT,
    due_date TEXT,
    notes TEXT,
    related_appointment_id INTEGER REFERENCES appointments(id),
    related_lab_order_id INTEGER REFERENCES lab_orders(id)
);

-- ============================================
-- BILL ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS bill_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id INTEGER REFERENCES bills(id),
    description TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_price REAL NOT NULL,
    total_price REAL NOT NULL
);

-- ============================================
-- MEDICINE REMINDERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS medicine_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER REFERENCES patients(id),
    prescription_id INTEGER REFERENCES prescriptions(id),
    medicine_name TEXT NOT NULL,
    reminder_time TEXT NOT NULL, -- Time in HH:MM format
    frequency TEXT, -- daily, weekly, etc.
    start_date TEXT NOT NULL,
    end_date TEXT,
    is_active INTEGER DEFAULT 1,
    last_sent TEXT
);

-- ============================================
-- CHAT SESSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS chat_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT NOT NULL,
    patient_id INTEGER REFERENCES patients(id),
    current_state TEXT DEFAULT 'main_menu',
    context_data TEXT, -- JSON for storing current flow context
    started_at TEXT DEFAULT (datetime('now')),
    last_activity TEXT DEFAULT (datetime('now')),
    is_active INTEGER DEFAULT 1
);

-- ============================================
-- MESSAGE LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS message_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT NOT NULL,
    direction TEXT CHECK(direction IN ('incoming', 'outgoing')),
    message_type TEXT, -- text, image, document, interactive, etc.
    message_content TEXT,
    whatsapp_message_id TEXT,
    status TEXT DEFAULT 'sent' CHECK(status IN ('sent', 'delivered', 'read', 'failed')),
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- FEEDBACK TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER REFERENCES patients(id),
    appointment_id INTEGER REFERENCES appointments(id),
    rating INTEGER CHECK(rating >= 1 AND rating <= 5),
    category TEXT CHECK(category IN ('doctor', 'staff', 'facility', 'overall', 'other')),
    feedback_text TEXT,
    submitted_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- EMERGENCY CONTACTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS emergency_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL, -- Ambulance, Blood Bank, Emergency Ward, etc.
    phone_number TEXT NOT NULL,
    is_24x7 INTEGER DEFAULT 0,
    description TEXT,
    is_active INTEGER DEFAULT 1
);

-- ============================================
-- HOSPITAL INFO TABLE (Key-Value Store)
-- ============================================
CREATE TABLE IF NOT EXISTS hospital_info (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone_number);
CREATE INDEX IF NOT EXISTS idx_patients_patient_id ON patients(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_patient ON lab_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_reports_patient ON lab_reports(patient_id);
CREATE INDEX IF NOT EXISTS idx_bills_patient ON bills(patient_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_phone ON chat_sessions(phone_number);
CREATE INDEX IF NOT EXISTS idx_message_logs_phone ON message_logs(phone_number);

-- ============================================
-- INSERT DEFAULT DATA
-- ============================================

-- Default Departments
INSERT OR IGNORE INTO departments (name, code, description, floor_number, timings, emergency_available) VALUES
('General Medicine', 'GEN', 'General health checkups and treatments', 'Ground Floor', '09:00 AM - 05:00 PM', 1),
('Cardiology', 'CARD', 'Heart and cardiovascular system', '1st Floor', '09:00 AM - 04:00 PM', 1),
('Orthopedics', 'ORTHO', 'Bones, joints, and musculoskeletal system', '1st Floor', '10:00 AM - 05:00 PM', 1),
('Pediatrics', 'PED', 'Child healthcare', 'Ground Floor', '09:00 AM - 06:00 PM', 1),
('Gynecology', 'GYN', 'Women health and maternity', '2nd Floor', '10:00 AM - 04:00 PM', 1),
('Dermatology', 'DERM', 'Skin, hair, and nail conditions', '2nd Floor', '10:00 AM - 03:00 PM', 0),
('ENT', 'ENT', 'Ear, Nose, and Throat', '1st Floor', '09:00 AM - 04:00 PM', 0),
('Ophthalmology', 'OPH', 'Eye care and vision', '2nd Floor', '09:00 AM - 05:00 PM', 0),
('Neurology', 'NEURO', 'Brain and nervous system', '3rd Floor', '10:00 AM - 04:00 PM', 1),
('Laboratory', 'LAB', 'Diagnostic tests and reports', 'Ground Floor', '07:00 AM - 08:00 PM', 1),
('Radiology', 'RAD', 'X-Ray, CT Scan, MRI, Ultrasound', 'Basement', '08:00 AM - 06:00 PM', 1),
('Emergency', 'ER', 'Emergency and trauma care', 'Ground Floor', '24 Hours', 1),
('Pharmacy', 'PHARM', 'Medicines and prescriptions', 'Ground Floor', '08:00 AM - 10:00 PM', 1);

-- Sample Doctors
INSERT OR IGNORE INTO doctors (name, department_id, specialization, qualification, experience_years, consultation_fee, available_days, available_timings, max_appointments_per_day) VALUES
('Dr. Rajesh Kumar', 1, 'General Physician', 'MBBS, MD', 15, 500, '["monday","tuesday","wednesday","thursday","friday"]', '{"monday":{"start":"09:00","end":"14:00"},"tuesday":{"start":"09:00","end":"14:00"},"wednesday":{"start":"09:00","end":"14:00"},"thursday":{"start":"09:00","end":"14:00"},"friday":{"start":"09:00","end":"14:00"}}', 25),
('Dr. Priya Sharma', 2, 'Cardiologist', 'MBBS, DM Cardiology', 12, 1000, '["monday","wednesday","friday"]', '{"monday":{"start":"10:00","end":"16:00"},"wednesday":{"start":"10:00","end":"16:00"},"friday":{"start":"10:00","end":"16:00"}}', 15),
('Dr. Anil Gupta', 3, 'Orthopedic Surgeon', 'MBBS, MS Ortho', 18, 800, '["tuesday","thursday","saturday"]', '{"tuesday":{"start":"10:00","end":"17:00"},"thursday":{"start":"10:00","end":"17:00"},"saturday":{"start":"10:00","end":"14:00"}}', 20),
('Dr. Meera Patel', 4, 'Pediatrician', 'MBBS, DCH', 10, 600, '["monday","tuesday","wednesday","thursday","friday","saturday"]', '{"monday":{"start":"09:00","end":"18:00"},"tuesday":{"start":"09:00","end":"18:00"},"wednesday":{"start":"09:00","end":"18:00"},"thursday":{"start":"09:00","end":"18:00"},"friday":{"start":"09:00","end":"18:00"},"saturday":{"start":"09:00","end":"14:00"}}', 30),
('Dr. Sunita Reddy', 5, 'Gynecologist', 'MBBS, DGO, DNB', 14, 900, '["monday","wednesday","friday"]', '{"monday":{"start":"10:00","end":"16:00"},"wednesday":{"start":"10:00","end":"16:00"},"friday":{"start":"10:00","end":"16:00"}}', 15);

-- Sample Lab Tests
INSERT OR IGNORE INTO lab_tests (name, code, category, description, price, preparation_instructions, turnaround_time) VALUES
('Complete Blood Count (CBC)', 'CBC', 'blood', 'Complete blood cell analysis', 350, 'No special preparation required', '4-6 hours'),
('Blood Sugar Fasting', 'BSF', 'blood', 'Fasting blood glucose test', 100, 'Fasting for 8-12 hours required', '2 hours'),
('Blood Sugar PP', 'BSPP', 'blood', 'Post-meal blood glucose test', 100, 'Test 2 hours after meal', '2 hours'),
('Lipid Profile', 'LIPID', 'blood', 'Cholesterol and triglycerides', 600, 'Fasting for 10-12 hours required', '6-8 hours'),
('Thyroid Profile (T3, T4, TSH)', 'THYROID', 'blood', 'Thyroid function tests', 800, 'No special preparation required', '24 hours'),
('Liver Function Test (LFT)', 'LFT', 'blood', 'Liver health assessment', 700, 'Fasting for 8 hours recommended', '6-8 hours'),
('Kidney Function Test (KFT)', 'KFT', 'blood', 'Kidney health assessment', 650, 'No special preparation required', '6-8 hours'),
('Urine Routine & Microscopy', 'URM', 'urine', 'Complete urine analysis', 150, 'Collect midstream morning sample', '4 hours'),
('HbA1c', 'HBA1C', 'blood', '3-month average blood sugar', 500, 'No special preparation required', '24 hours'),
('Vitamin D', 'VITD', 'blood', 'Vitamin D level test', 1200, 'No special preparation required', '24-48 hours'),
('Vitamin B12', 'VITB12', 'blood', 'Vitamin B12 level test', 900, 'Fasting for 6-8 hours preferred', '24-48 hours'),
('X-Ray Chest PA', 'XRAY-CHEST', 'imaging', 'Chest X-ray', 400, 'Remove metallic objects', '30 minutes'),
('Ultrasound Abdomen', 'USG-ABD', 'imaging', 'Abdominal ultrasound', 1200, 'Fasting for 6 hours, full bladder', '30 minutes'),
('ECG', 'ECG', 'cardio', 'Electrocardiogram', 300, 'No special preparation required', '15 minutes'),
('COVID-19 RT-PCR', 'COVID-PCR', 'molecular', 'COVID-19 detection test', 500, 'No special preparation required', '24 hours');

-- Emergency Contacts
INSERT OR IGNORE INTO emergency_contacts (name, role, phone_number, is_24x7, description) VALUES
('Ambulance Service', 'Ambulance', '108', 1, 'Government ambulance service'),
('RPL Hospital Ambulance', 'Ambulance', '08069640826', 1, 'RPL Hospital ambulance'),
('RPL Emergency Ward', 'Emergency', '08069640826', 1, 'Hospital emergency department'),
('RPL Blood Bank', 'Blood Bank', '08069640826', 1, 'RPL Hospital blood bank'),
('Police', 'Police', '100', 1, 'Police emergency'),
('Fire Brigade', 'Fire', '101', 1, 'Fire emergency'),
('Child Helpline', 'Child', '1098', 1, 'Child protection helpline'),
('Women Helpline', 'Women Safety', '1091', 1, 'Women safety helpline');

-- Hospital Info
INSERT OR IGNORE INTO hospital_info (key, value) VALUES
('name', 'RPL Hospital'),
('tagline', 'Your Health, Our Priority'),
('address', 'Baidaula Chauraha, Bansi Road, Dumariyaganj, Siddharthnagar, UP, 272189'),
('phone', '08069640826'),
('whatsapp', '919455060456'),
('email', 'info@rplhospital.com'),
('website', 'www.rplhospital.com'),
('visiting_hours', '10:00 AM - 12:00 PM, 05:00 PM - 07:00 PM'),
('opd_timings', '09:00 AM - 05:00 PM'),
('emergency_timings', '24 Hours'),
('about', 'RPL Hospital is a leading multispecialty hospital in Siddharthnagar providing quality healthcare services with state-of-the-art facilities and experienced medical professionals.');
