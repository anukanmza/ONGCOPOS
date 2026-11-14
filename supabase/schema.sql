-- ============================================================================
-- ONG CO POS — Supabase PostgreSQL Schema & Initial Seed Data
-- วิธีใช้: คัดลอกโค้ดทั้งหมดนี้ไปวางในเมนู "SQL Editor" บนเว็บ Supabase แล้วกด "Run"
-- ============================================================================

-- 1. ตารางหมวดหมู่สินค้า (Categories)
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category_type TEXT NOT NULL CHECK (category_type IN ('GROCERY', 'FOOD'))
);

-- 2. ตารางสินค้าของชำและเมนูอาหาร (Products)
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  barcode TEXT UNIQUE,
  name TEXT NOT NULL,
  voice_aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'ชิ้น',
  purchase_unit TEXT NOT NULL DEFAULT 'แพ็ค',
  conversion_rate NUMERIC(12,2) NOT NULL DEFAULT 1,
  item_type TEXT NOT NULL CHECK (item_type IN ('GROCERY', 'FOOD')),
  track_stock BOOLEAN NOT NULL DEFAULT true,
  stock_qty NUMERIC(12,2) NOT NULL DEFAULT 0,
  low_stock_threshold NUMERIC(12,2) NOT NULL DEFAULT 5,
  modifier_group_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  send_to_kitchen BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- 2.1 ตารางกลุ่มตัวเลือกพิเศษ (Modifier Groups)
CREATE TABLE IF NOT EXISTS modifier_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  selection_type TEXT NOT NULL DEFAULT 'MULTIPLE' CHECK (selection_type IN ('SINGLE', 'MULTIPLE')),
  is_required BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 3. ตารางตัวเลือกเสริมอาหาร (Product Modifiers)
CREATE TABLE IF NOT EXISTS product_modifiers (
  id TEXT PRIMARY KEY,
  group_id TEXT REFERENCES modifier_groups(id) ON DELETE SET NULL,
  product_id TEXT,
  name TEXT NOT NULL,
  voice_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  extra_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  extra_cost NUMERIC(12,2) NOT NULL DEFAULT 0
);

-- 4. ตารางคลังวัตถุดิบอาหารสดในครัว (Ingredients)
CREATE TABLE IF NOT EXISTS ingredients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  stock_unit TEXT NOT NULL DEFAULT 'กรัม',
  purchase_unit TEXT NOT NULL DEFAULT 'กิโลกรัม',
  conversion_rate NUMERIC(12,2) NOT NULL DEFAULT 1000,
  current_qty NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_per_unit NUMERIC(12,4) NOT NULL DEFAULT 0,
  low_stock_threshold NUMERIC(12,2) NOT NULL DEFAULT 500
);

-- 5. ตารางผูกสูตรอาหารกับวัตถุดิบ (Recipe BOM Items)
CREATE TABLE IF NOT EXISTS recipe_items (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  modifier_id TEXT REFERENCES product_modifiers(id) ON DELETE CASCADE,
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity_used NUMERIC(12,2) NOT NULL DEFAULT 0
);

-- 6. ตารางโต๊ะอาหารและโซน (Dining Tables)
CREATE TABLE IF NOT EXISTS dining_tables (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  zone_name TEXT NOT NULL DEFAULT 'โซนในร้าน',
  capacity INTEGER NOT NULL DEFAULT 4,
  voice_aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'BILLING')),
  current_order_id TEXT
);
ALTER TABLE dining_tables ADD COLUMN IF NOT EXISTS capacity INTEGER NOT NULL DEFAULT 4;

-- 6.1 ตารางสมาชิกลูกค้า (Customers)
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  tier TEXT NOT NULL DEFAULT 'ขาประจำ',
  points INTEGER NOT NULL DEFAULT 0,
  total_spent NUMERIC(12,2) NOT NULL DEFAULT 0,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6.2 ตารางจุดรับของเดลิเวอรี่ตลาดอินโดจีน (Delivery Drop-off Points)
CREATE TABLE IF NOT EXISTS delivery_points (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  landmark_desc TEXT DEFAULT '',
  map_x NUMERIC(5,2) NOT NULL DEFAULT 50,
  map_y NUMERIC(5,2) NOT NULL DEFAULT 50,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. ตารางบิลขาย (Orders)
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_type TEXT NOT NULL CHECK (order_type IN ('RETAIL', 'DINE_IN')),
  table_id TEXT,
  bill_title TEXT DEFAULT '',
  bill_note TEXT DEFAULT '',
  customer_id TEXT,
  customer_name TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PAID', 'CANCELLED', 'VOIDED')),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'CASH',
  cash_received NUMERIC(12,2) DEFAULT 0,
  change_amount NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS bill_title TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bill_note TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT DEFAULT '';
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('OPEN', 'PAID', 'CANCELLED', 'VOIDED'));
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;

-- 8. ตารางรายการในบิล (Order Items)
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  item_type TEXT NOT NULL,
  order_round INTEGER NOT NULL DEFAULT 1,
  quantity INTEGER NOT NULL DEFAULT 1,
  returned_qty INTEGER NOT NULL DEFAULT 0,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  modifiers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  recipe_snapshot_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  item_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (item_status IN ('ACTIVE', 'RETURNED_RESTOCK', 'VOID_WASTE')),
  kitchen_status TEXT NOT NULL DEFAULT 'NONE' CHECK (kitchen_status IN ('NONE', 'PENDING', 'COOKING', 'SERVED', 'CANCELLED', 'CANCEL_REQUESTED', 'CANCELLED_ACK')),
  input_source TEXT NOT NULL DEFAULT 'TOUCH' CHECK (input_source IN ('BARCODE', 'TOUCH', 'VOICE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_kitchen_status_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_kitchen_status_check CHECK (kitchen_status IN ('NONE', 'PENDING', 'COOKING', 'SERVED', 'CANCELLED', 'CANCEL_REQUESTED', 'CANCELLED_ACK'));

-- 9. ตารางใบรับสินค้าเข้าสต็อก (Stock-In Receipts)
CREATE TABLE IF NOT EXISTS stock_in_receipts (
  id TEXT PRIMARY KEY,
  receipt_type TEXT NOT NULL DEFAULT 'MIXED',
  supplier_name TEXT NOT NULL DEFAULT 'ร้านค้าส่งทั่วไป',
  note TEXT DEFAULT '',
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  record_as_expense BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT NOT NULL DEFAULT 'เจ้าของร้าน',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. ตารางรายการย่อยในใบรับของเข้าสต็อก (Stock-In Items)
CREATE TABLE IF NOT EXISTS stock_in_items (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL REFERENCES stock_in_receipts(id) ON DELETE CASCADE,
  item_target_type TEXT NOT NULL CHECK (item_target_type IN ('GROCERY', 'INGREDIENT')),
  product_id TEXT,
  ingredient_id TEXT,
  item_name TEXT NOT NULL,
  unit_label TEXT NOT NULL,
  input_qty NUMERIC(12,2) NOT NULL,
  conversion_rate NUMERIC(12,2) NOT NULL DEFAULT 1,
  qty_before NUMERIC(12,2) NOT NULL,
  qty_added NUMERIC(12,2) NOT NULL,
  qty_after NUMERIC(12,2) NOT NULL,
  purchase_cost_per_base_unit NUMERIC(12,4) NOT NULL DEFAULT 0,
  total_line_cost NUMERIC(12,2) NOT NULL DEFAULT 0
);

-- 11. ตารางประวัติความเคลื่อนไหวสต็อก (Inventory Audit Logs)
CREATE TABLE IF NOT EXISTS inventory_logs (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('GROCERY', 'INGREDIENT')),
  product_id TEXT,
  ingredient_id TEXT,
  item_name TEXT NOT NULL,
  change_qty NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2) NOT NULL,
  unit TEXT NOT NULL,
  reason TEXT NOT NULL,
  reference_id TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. ตารางรายจ่ายรายวัน (Daily Expenses)
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  expense_date TEXT NOT NULL,
  reference_id TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ปิด RLS ชั่วคราวสำหรับการใช้งานภายในร้าน (หรือปรับ Policy ตามต้องการ)
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_modifiers DISABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients DISABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE dining_tables DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_in_receipts DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_in_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;

ALTER TABLE products ADD COLUMN IF NOT EXISTS modifier_group_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE product_modifiers ADD COLUMN IF NOT EXISTS group_id TEXT;

-- ============================================================================
-- ข้อมูลเริ่มต้น (Seed Data)
-- ============================================================================

INSERT INTO modifier_groups (id, name, selection_type, is_required, sort_order) VALUES
  ('GRP-SPICY', 'ระดับความเผ็ด', 'SINGLE', false, 1),
  ('GRP-TOPPING', 'ท็อปปิ้งไข่ & เพิ่มเติม', 'MULTIPLE', false, 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO categories (id, name, category_type) VALUES
  ('CAT-DRINK', 'เครื่องดื่ม & น้ำแข็ง (ของชำ)', 'GROCERY'),
  ('CAT-SNACK', 'ขนม & บะหมี่กึ่งสำเร็จรูป (ของชำ)', 'GROCERY'),
  ('CAT-PANTRY', 'เครื่องปรุง & ของใช้ในครัวเรือน (ของชำ)', 'GROCERY'),
  ('CAT-RICE', 'อาหารจานเดียว / ตามสั่ง (ครัว)', 'FOOD'),
  ('CAT-NOODLE', 'ก๋วยเตี๋ยว & ยำ/ต้มยำ (ครัว)', 'FOOD'),
  ('CAT-APPETIZER', 'ของทานเล่น & กับข้าว (ครัว)', 'FOOD')
ON CONFLICT (id) DO NOTHING;

INSERT INTO ingredients (id, name, stock_unit, purchase_unit, conversion_rate, current_qty, cost_per_unit, low_stock_threshold) VALUES
  ('ING-PORK-MINCE', 'หมูสับอนามัย', 'กรัม', 'กิโลกรัม', 1000, 3500, 0.18, 800),
  ('ING-CRISPY-PORK', 'หมูกรอบทำเอง', 'กรัม', 'กิโลกรัม', 1000, 1800, 0.35, 500),
  ('ING-CHICKEN', 'เนื้ออก/สะโพกไก่หั่น', 'กรัม', 'กิโลกรัม', 1000, 2500, 0.12, 600),
  ('ING-SHRIMP', 'กุ้งขาวสดแกะเปลือก', 'กรัม', 'กิโลกรัม', 1000, 1400, 0.32, 400),
  ('ING-EGG', 'ไข่ไก่สดเบอร์ 2', 'ฟอง', 'แผง (30 ฟอง)', 30, 75, 4.20, 15),
  ('ING-RICE', 'ข้าวหอมมะลิหุงสุก', 'กรัม', 'หม้อใหญ่ (5 กก.)', 5000, 8000, 0.03, 1500),
  ('ING-BASIL', 'ใบกะเพรา & พริกกระเทียม', 'กรัม', 'กิโลกรัม', 1000, 950, 0.10, 200),
  ('ING-NOODLE-PACK', 'เส้นมาม่า/ไวไว (สำหรับครัว)', 'ก้อน', 'แพ็ค (10 ก้อน)', 10, 35, 5.50, 10),
  ('ING-SEASONING', 'ชุดเครื่องปรุงผัด/น้ำมันพืช', 'ช้อนโต๊ะ', 'ขวดใหญ่ (60 ช้อน)', 60, 120, 2.50, 25)
ON CONFLICT (id) DO NOTHING;

INSERT INTO products (id, category_id, barcode, name, voice_aliases, price, cost, unit, purchase_unit, conversion_rate, item_type, track_stock, stock_qty, low_stock_threshold, send_to_kitchen, is_active) VALUES
  ('G-001', 'CAT-DRINK', '8851959132012', 'โค้ก ขวดเล็ก (325 มล.)', '["โค้ก","โค้กเล็ก","โค้กขวดเล็ก","น้ำโค้ก"]'::jsonb, 15, 11, 'ขวด', 'แพ็ค (12 ขวด)', 12, 'GROCERY', true, 48, 12, false, true),
  ('G-002', 'CAT-DRINK', '8851959142011', 'โค้ก ขวดใหญ่ (1.25 ลิตร)', '["โค้กใหญ่","โค้กขวดใหญ่","โค้กลิตร"]'::jsonb, 32, 25, 'ขวด', 'แพ็ค (6 ขวด)', 6, 'GROCERY', true, 18, 6, false, true),
  ('G-003', 'CAT-DRINK', '8850999320007', 'น้ำดื่มสิงห์ ขวดเล็ก (600 มล.)', '["น้ำเปล่า","น้ำดื่ม","น้ำสิงห์","น้ำดื่มสิงห์","น้ำเล็ก"]'::jsonb, 10, 5.5, 'ขวด', 'แพ็ค (12 ขวด)', 12, 'GROCERY', true, 72, 24, false, true),
  ('G-004', 'CAT-DRINK', '8851123212021', 'เครื่องดื่ม M-150', '["เอ็มร้อย","เอ็มร้อยห้าสิบ","เอ็มขวด"]'::jsonb, 12, 9.5, 'ขวด', 'กล่อง (10 ขวด)', 10, 'GROCERY', true, 35, 10, false, true),
  ('G-005', 'CAT-DRINK', '8850228000105', 'น้ำแข็งหลอด (ถังเสิร์ฟโต๊ะ)', '["น้ำแข็ง","น้ำแข็งถัง","น้ำแข็งหลอด"]'::jsonb, 20, 6, 'ถัง', 'กระสอบ (20 ถัง)', 20, 'GROCERY', true, 40, 8, false, true),
  ('G-006', 'CAT-DRINK', '8858891302216', 'อิชิตัน กรีนที รสน้ำผึ้งมะนาว', '["อิชิตัน","ชาเขียว","อิชิตันน้ำผึ้งมะนาว"]'::jsonb, 20, 15, 'ขวด', 'ลัง (24 ขวด)', 24, 'GROCERY', true, 22, 6, false, true),
  ('G-007', 'CAT-SNACK', '8850987101083', 'มาม่า รสหมูสับ (ซอง)', '["มาม่า","มาม่าหมูสับ","มาม่าซอง"]'::jsonb, 7, 5.5, 'ซอง', 'กล่อง (30 ซอง)', 30, 'GROCERY', true, 60, 15, false, true),
  ('G-008', 'CAT-SNACK', '8850987101014', 'มาม่า รสต้มยำกุ้ง (ซอง)', '["มาม่าต้มยำ","มาม่าต้มยำกุ้ง"]'::jsonb, 7, 5.5, 'ซอง', 'กล่อง (30 ซอง)', 30, 'GROCERY', true, 45, 15, false, true),
  ('G-009', 'CAT-SNACK', '8850718801017', 'เลย์ มันฝรั่งแผ่นเรียบห่อกลาง', '["เลย์","ขนมเลย์","มันฝรั่งเลย์"]'::jsonb, 20, 15.5, 'ห่อ', 'แพ็ค (6 ห่อ)', 6, 'GROCERY', true, 16, 6, false, true),
  ('G-010', 'CAT-SNACK', '8850157400107', 'สาหร่ายเถ้าแก่น้อย บิ๊กโรล', '["เถ้าแก่น้อย","สาหร่าย"]'::jsonb, 10, 7.5, 'ซอง', 'กล่อง (12 ซอง)', 12, 'GROCERY', true, 24, 6, false, true),
  ('G-011', 'CAT-PANTRY', '8850545111114', 'น้ำปลาแท้ ทิพรส (700 มล.)', '["น้ำปลา","น้ำปลาทิพรส","ทิพรส"]'::jsonb, 35, 28, 'ขวด', 'ลัง (12 ขวด)', 12, 'GROCERY', true, 14, 4, false, true),
  ('G-012', 'CAT-PANTRY', '8850250000357', 'น้ำมันพืช มรกต (1 ลิตร)', '["น้ำมันพืช","น้ำมันมรกต","น้ำมันขวด"]'::jsonb, 48, 40, 'ขวด', 'ลัง (12 ขวด)', 12, 'GROCERY', true, 9, 4, false, true),
  ('G-013', 'CAT-PANTRY', '8850007011019', 'ซอสหอยนางรม ตราแม่ครัว (600 มล.)', '["ซอสหอย","น้ำมันหอย","ซอสตราแม่ครัว"]'::jsonb, 45, 36, 'ขวด', 'ลัง (12 ขวด)', 12, 'GROCERY', true, 11, 4, false, true),
  ('F-001', 'CAT-RICE', NULL, 'ข้าวกะเพราหมูสับ', '["กะเพราหมูสับ","ข้าวกะเพราหมูสับ","กระเพราหมูสับ","กะเพราหมู"]'::jsonb, 55, 29.8, 'จาน', 'จาน', 1, 'FOOD', false, 0, 0, true, true),
  ('F-002', 'CAT-RICE', NULL, 'ข้าวกะเพราหมูกรอบ', '["กะเพราหมูกรอบ","ข้าวกะเพราหมูกรอบ","กระเพราหมูกรอบ"]'::jsonb, 65, 45.0, 'จาน', 'จาน', 1, 'FOOD', false, 0, 0, true, true),
  ('F-003', 'CAT-RICE', NULL, 'ข้าวกะเพราไก่', '["กะเพราไก่","ข้าวกะเพราไก่","กระเพราไก่"]'::jsonb, 50, 23.2, 'จาน', 'จาน', 1, 'FOOD', false, 0, 0, true, true),
  ('F-004', 'CAT-RICE', NULL, 'ข้าวผัดกุ้งสด', '["ข้าวผัดกุ้ง","ข้าวผัดกุ้งสด"]'::jsonb, 65, 42.1, 'จาน', 'จาน', 1, 'FOOD', false, 0, 0, true, true),
  ('F-005', 'CAT-RICE', NULL, 'ข้าวไข่เจียวหมูสับ', '["ข้าวไข่เจียว","ข้าวไข่เจียวหมูสับ","ไข่เจียวหมูสับ"]'::jsonb, 45, 24.1, 'จาน', 'จาน', 1, 'FOOD', false, 0, 0, true, true),
  ('F-006', 'CAT-NOODLE', NULL, 'มาม่าผัดขี้เมาหมูกรอบ', '["มาม่าผัด","มาม่าขี้เมา","มาม่าผัดขี้เมา","ผัดมาม่า"]'::jsonb, 60, 43.0, 'จาน', 'จาน', 1, 'FOOD', false, 0, 0, true, true),
  ('F-007', 'CAT-NOODLE', NULL, 'ต้มยำกุ้งน้ำข้น (ถ้วย)', '["ต้มยำกุ้ง","ต้มยำกุ้งน้ำข้น","ต้มยำ"]'::jsonb, 90, 49.8, 'ถ้วย', 'ถ้วย', 1, 'FOOD', false, 0, 0, true, true),
  ('F-008', 'CAT-APPETIZER', NULL, 'หมูกรอบคั่วพริกเกลือ (กับข้าว)', '["หมูกรอบคั่วพริกเกลือ","คั่วพริกเกลือ"]'::jsonb, 85, 55.0, 'จาน', 'จาน', 1, 'FOOD', false, 0, 0, true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO product_modifiers (id, group_id, product_id, name, voice_keywords, extra_price, extra_cost) VALUES
  ('MOD-LESS-SPICY', 'GRP-SPICY', NULL, 'เผ็ดน้อย', '["เผ็ดน้อย","พริกเม็ดเดียว"]'::jsonb, 0, 0),
  ('MOD-MED-SPICY', 'GRP-SPICY', NULL, 'เผ็ดกลาง', '["เผ็ดกลาง","เผ็ดปกติ"]'::jsonb, 0, 0),
  ('MOD-VERY-SPICY', 'GRP-SPICY', NULL, 'เผ็ดมาก', '["เผ็ดมาก","เผ็ดจัด"]'::jsonb, 0, 0),
  ('MOD-NO-SPICY', 'GRP-SPICY', NULL, 'ไม่เผ็ด', '["ไม่เผ็ด","ไม่ใส่พริก"]'::jsonb, 0, 0),
  ('MOD-FRIED-EGG', 'GRP-TOPPING', NULL, 'ไข่ดาว', '["ไข่ดาว"]'::jsonb, 10, 4.2),
  ('MOD-OMELET', 'GRP-TOPPING', NULL, 'ไข่เจียว', '["โปะไข่เจียว","เพิ่มไข่เจียว"]'::jsonb, 15, 8.4),
  ('MOD-SPECIAL', 'GRP-TOPPING', NULL, 'พิเศษ', '["พิเศษ","จานพิเศษ","เพิ่มหมู"]'::jsonb, 15, 9.0),
  ('MOD-RUNNY', 'GRP-TOPPING', NULL, 'ไข่ดาวไม่สุก', '["ไม่สุก","ยางมะตูม","ไข่ดาวไม่สุก"]'::jsonb, 0, 0),
  ('MOD-WELLDONE', 'GRP-TOPPING', NULL, 'ไข่ดาวสุกๆ', '["สุกๆ","ไข่สุก","กรอบๆ"]'::jsonb, 0, 0),
  ('MOD-NO-VEG', 'GRP-TOPPING', NULL, 'ไม่ใส่ผัก', '["ไม่ใส่ผัก","ไม่ผัก"]'::jsonb, 0, 0),
  ('MOD-TAKEAWAY', 'GRP-TOPPING', NULL, 'ใส่กล่องกลับบ้าน', '["กลับบ้าน","ใส่ห่อ","ใส่กล่อง"]'::jsonb, 0, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_items (id, product_id, modifier_id, ingredient_id, quantity_used) VALUES
  ('REC-01', 'F-001', NULL, 'ING-PORK-MINCE', 110),
  ('REC-02', 'F-001', NULL, 'ING-RICE', 200),
  ('REC-03', 'F-001', NULL, 'ING-BASIL', 15),
  ('REC-04', 'F-001', NULL, 'ING-SEASONING', 1),
  ('REC-05', 'F-002', NULL, 'ING-CRISPY-PORK', 100),
  ('REC-06', 'F-002', NULL, 'ING-RICE', 200),
  ('REC-07', 'F-002', NULL, 'ING-BASIL', 15),
  ('REC-08', 'F-002', NULL, 'ING-SEASONING', 1),
  ('REC-09', 'F-003', NULL, 'ING-CHICKEN', 110),
  ('REC-10', 'F-003', NULL, 'ING-RICE', 200),
  ('REC-11', 'F-003', NULL, 'ING-BASIL', 15),
  ('REC-12', 'F-003', NULL, 'ING-SEASONING', 1),
  ('REC-13', 'F-004', NULL, 'ING-SHRIMP', 90),
  ('REC-14', 'F-004', NULL, 'ING-EGG', 1),
  ('REC-15', 'F-004', NULL, 'ING-RICE', 220),
  ('REC-16', 'F-004', NULL, 'ING-SEASONING', 1),
  ('REC-17', 'F-005', NULL, 'ING-EGG', 2),
  ('REC-18', 'F-005', NULL, 'ING-PORK-MINCE', 40),
  ('REC-19', 'F-005', NULL, 'ING-RICE', 200),
  ('REC-20', 'F-005', NULL, 'ING-SEASONING', 1),
  ('REC-21', 'F-006', NULL, 'ING-NOODLE-PACK', 2),
  ('REC-22', 'F-006', NULL, 'ING-CRISPY-PORK', 80),
  ('REC-23', 'F-006', NULL, 'ING-BASIL', 15),
  ('REC-24', 'F-006', NULL, 'ING-SEASONING', 1),
  ('REC-25', 'F-007', NULL, 'ING-SHRIMP', 140),
  ('REC-26', 'F-007', NULL, 'ING-SEASONING', 2),
  ('REC-27', 'F-008', NULL, 'ING-CRISPY-PORK', 150),
  ('REC-28', 'F-008', NULL, 'ING-SEASONING', 1),
  ('REC-MOD-1', NULL, 'MOD-FRIED-EGG', 'ING-EGG', 1),
  ('REC-MOD-2', NULL, 'MOD-OMELET', 'ING-EGG', 2),
  ('REC-MOD-3', NULL, 'MOD-SPECIAL', 'ING-PORK-MINCE', 50)
ON CONFLICT (id) DO NOTHING;

INSERT INTO dining_tables (id, name, zone_name, voice_aliases, status, current_order_id) VALUES
  ('T1', 'โต๊ะ 1', 'โซนในร้าน', '["โต๊ะ 1","โต๊ะหนึ่ง","โต๊ะที่ 1","เบอร์ 1"]'::jsonb, 'AVAILABLE', NULL),
  ('T2', 'โต๊ะ 2', 'โซนในร้าน', '["โต๊ะ 2","โต๊ะสอง","โต๊ะที่ 2","เบอร์ 2"]'::jsonb, 'AVAILABLE', NULL),
  ('T3', 'โต๊ะ 3', 'โซนในร้าน', '["โต๊ะ 3","โต๊ะสาม","โต๊ะที่ 3","เบอร์ 3"]'::jsonb, 'AVAILABLE', NULL),
  ('T4', 'โต๊ะ 4', 'โซนในร้าน', '["โต๊ะ 4","โต๊ะสี่","โต๊ะที่ 4","เบอร์ 4"]'::jsonb, 'AVAILABLE', NULL),
  ('T5', 'โต๊ะ 5', 'โซนหน้าร้าน', '["โต๊ะ 5","โต๊ะห้า","โต๊ะที่ 5","เบอร์ 5"]'::jsonb, 'AVAILABLE', NULL),
  ('T6', 'โต๊ะ 6', 'โซนหน้าร้าน', '["โต๊ะ 6","โต๊ะหก","โต๊ะที่ 6","เบอร์ 6"]'::jsonb, 'AVAILABLE', NULL)
ON CONFLICT (id) DO NOTHING;

