const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'ongco_pos.sqlite');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category_type TEXT NOT NULL CHECK (category_type IN ('GROCERY', 'FOOD'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      barcode TEXT UNIQUE,
      name TEXT NOT NULL,
      voice_aliases TEXT NOT NULL DEFAULT '[]',
      price REAL NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'ชิ้น',
      purchase_unit TEXT NOT NULL DEFAULT 'แพ็ค',
      conversion_rate REAL NOT NULL DEFAULT 1,
      item_type TEXT NOT NULL CHECK (item_type IN ('GROCERY', 'FOOD')),
      track_stock INTEGER NOT NULL DEFAULT 1,
      stock_qty REAL NOT NULL DEFAULT 0,
      low_stock_threshold REAL NOT NULL DEFAULT 5,
      send_to_kitchen INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS product_modifiers (
      id TEXT PRIMARY KEY,
      product_id TEXT,
      name TEXT NOT NULL,
      voice_keywords TEXT NOT NULL DEFAULT '[]',
      extra_price REAL NOT NULL DEFAULT 0,
      extra_cost REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ingredients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      stock_unit TEXT NOT NULL DEFAULT 'กรัม',
      purchase_unit TEXT NOT NULL DEFAULT 'กิโลกรัม',
      conversion_rate REAL NOT NULL DEFAULT 1000,
      current_qty REAL NOT NULL DEFAULT 0,
      cost_per_unit REAL NOT NULL DEFAULT 0,
      low_stock_threshold REAL NOT NULL DEFAULT 500
    );

    CREATE TABLE IF NOT EXISTS recipe_items (
      id TEXT PRIMARY KEY,
      product_id TEXT,
      modifier_id TEXT,
      ingredient_id TEXT NOT NULL,
      quantity_used REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (modifier_id) REFERENCES product_modifiers(id) ON DELETE CASCADE,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS dining_tables (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      zone_name TEXT NOT NULL DEFAULT 'โซนในร้าน',
      voice_aliases TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'BILLING')),
      current_order_id TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_type TEXT NOT NULL CHECK (order_type IN ('RETAIL', 'DINE_IN')),
      table_id TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PAID', 'CANCELLED')),
      subtotal REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL DEFAULT 0,
      payment_method TEXT DEFAULT 'CASH',
      cash_received REAL DEFAULT 0,
      change_amount REAL DEFAULT 0,
      created_at TEXT NOT NULL,
      paid_at TEXT
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      item_type TEXT NOT NULL,
      order_round INTEGER NOT NULL DEFAULT 1,
      quantity INTEGER NOT NULL DEFAULT 1,
      returned_qty INTEGER NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0,
      modifiers_json TEXT NOT NULL DEFAULT '[]',
      recipe_snapshot_json TEXT NOT NULL DEFAULT '[]',
      item_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (item_status IN ('ACTIVE', 'RETURNED_RESTOCK', 'VOID_WASTE')),
      kitchen_status TEXT NOT NULL DEFAULT 'NONE' CHECK (kitchen_status IN ('NONE', 'PENDING', 'COOKING', 'SERVED', 'CANCELLED')),
      input_source TEXT NOT NULL DEFAULT 'TOUCH' CHECK (input_source IN ('BARCODE', 'TOUCH', 'VOICE')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS stock_in_receipts (
      id TEXT PRIMARY KEY,
      receipt_type TEXT NOT NULL DEFAULT 'MIXED',
      supplier_name TEXT NOT NULL DEFAULT 'ร้านค้าส่งทั่วไป',
      note TEXT DEFAULT '',
      total_cost REAL NOT NULL DEFAULT 0,
      record_as_expense INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL DEFAULT 'เจ้าของร้าน',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_in_items (
      id TEXT PRIMARY KEY,
      receipt_id TEXT NOT NULL,
      item_target_type TEXT NOT NULL CHECK (item_target_type IN ('GROCERY', 'INGREDIENT')),
      product_id TEXT,
      ingredient_id TEXT,
      item_name TEXT NOT NULL,
      unit_label TEXT NOT NULL,
      input_qty REAL NOT NULL,
      conversion_rate REAL NOT NULL DEFAULT 1,
      qty_before REAL NOT NULL,
      qty_added REAL NOT NULL,
      qty_after REAL NOT NULL,
      purchase_cost_per_base_unit REAL NOT NULL DEFAULT 0,
      total_line_cost REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (receipt_id) REFERENCES stock_in_receipts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inventory_logs (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL CHECK (target_type IN ('GROCERY', 'INGREDIENT')),
      product_id TEXT,
      ingredient_id TEXT,
      item_name TEXT NOT NULL,
      change_qty REAL NOT NULL,
      balance_after REAL NOT NULL,
      unit TEXT NOT NULL,
      reason TEXT NOT NULL,
      reference_id TEXT DEFAULT '',
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      expense_date TEXT NOT NULL,
      reference_id TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);
}

function seedIfNeeded() {
  const countRow = db.prepare('SELECT COUNT(*) as c FROM categories').get();
  if (countRow && countRow.c > 0) return;

  const now = new Date().toISOString();
  const todayStr = now.slice(0, 10);

  // 1. Categories
  const insertCat = db.prepare('INSERT INTO categories (id, name, category_type) VALUES (?, ?, ?)');
  const categories = [
    ['CAT-DRINK', 'เครื่องดื่ม & น้ำแข็ง (ของชำ)', 'GROCERY'],
    ['CAT-SNACK', 'ขนม & บะหมี่กึ่งสำเร็จรูป (ของชำ)', 'GROCERY'],
    ['CAT-PANTRY', 'เครื่องปรุง & ของใช้ในครัวเรือน (ของชำ)', 'GROCERY'],
    ['CAT-RICE', 'อาหารจานเดียว / ตามสั่ง (ครัว)', 'FOOD'],
    ['CAT-NOODLE', 'ก๋วยเตี๋ยว & ยำ/ต้มยำ (ครัว)', 'FOOD'],
    ['CAT-APPETIZER', 'ของทานเล่น & กับข้าว (ครัว)', 'FOOD']
  ];
  for (const c of categories) insertCat.run(...c);

  // 2. Ingredients (วัตถุดิบอาหาร)
  const insertIng = db.prepare(`
    INSERT INTO ingredients (id, name, stock_unit, purchase_unit, conversion_rate, current_qty, cost_per_unit, low_stock_threshold)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  // cost_per_unit is per stock_unit (e.g., หมูสับ 180 บาท/กก. = 0.18 บาท/กรัม)
  const ingredients = [
    ['ING-PORK-MINCE', 'หมูสับอนามัย', 'กรัม', 'กิโลกรัม', 1000, 3500, 0.18, 800],
    ['ING-CRISPY-PORK', 'หมูกรอบทำเอง', 'กรัม', 'กิโลกรัม', 1000, 1800, 0.35, 500],
    ['ING-CHICKEN', 'เนื้ออก/สะโพกไก่หั่น', 'กรัม', 'กิโลกรัม', 1000, 2500, 0.12, 600],
    ['ING-SHRIMP', 'กุ้งขาวสดแกะเปลือก', 'กรัม', 'กิโลกรัม', 1000, 1400, 0.32, 400],
    ['ING-EGG', 'ไข่ไก่สดเบอร์ 2', 'ฟอง', 'แผง (30 ฟอง)', 30, 75, 4.2, 15],
    ['ING-RICE', 'ข้าวหอมมะลิหุงสุก', 'กรัม', 'หม้อใหญ่ (5 กก.)', 5000, 8000, 0.03, 1500],
    ['ING-BASIL', 'ใบกะเพรา & พริกกระเทียม', 'กรัม', 'กิโลกรัม', 1000, 950, 0.10, 200],
    ['ING-NOODLE-PACK', 'เส้นมาม่า/ไวไว (สำหรับครัว)', 'ก้อน', 'แพ็ค (10 ก้อน)', 10, 35, 5.5, 10],
    ['ING-SEASONING', 'ชุดเครื่องปรุงผัด/น้ำมันพืช', 'ช้อนโต๊ะ', 'ขวดใหญ่ (60 ช้อน)', 60, 120, 2.5, 25]
  ];
  for (const ing of ingredients) insertIng.run(...ing);

  // 3. Products (Grocery + Food)
  const insertProd = db.prepare(`
    INSERT INTO products (
      id, category_id, barcode, name, voice_aliases, price, cost, unit, purchase_unit, conversion_rate,
      item_type, track_stock, stock_qty, low_stock_threshold, send_to_kitchen, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const products = [
    // GROCERY - Drinks
    ['G-001', 'CAT-DRINK', '8851959132012', 'โค้ก ขวดเล็ก (325 มล.)', JSON.stringify(['โค้ก', 'โค้กเล็ก', 'โค้กขวดเล็ก', 'น้ำโค้ก']), 15, 11, 'ขวด', 'แพ็ค (12 ขวด)', 12, 'GROCERY', 1, 48, 12, 0],
    ['G-002', 'CAT-DRINK', '8851959142011', 'โค้ก ขวดใหญ่ (1.25 ลิตร)', JSON.stringify(['โค้กใหญ่', 'โค้กขวดใหญ่', 'โค้กลิตร']), 32, 25, 'ขวด', 'แพ็ค (6 ขวด)', 6, 'GROCERY', 1, 18, 6, 0],
    ['G-003', 'CAT-DRINK', '8850999320007', 'น้ำดื่มสิงห์ ขวดเล็ก (600 มล.)', JSON.stringify(['น้ำเปล่า', 'น้ำดื่ม', 'น้ำสิงห์', 'น้ำดื่มสิงห์', 'น้ำเล็ก']), 10, 5.5, 'ขวด', 'แพ็ค (12 ขวด)', 12, 'GROCERY', 1, 72, 24, 0],
    ['G-004', 'CAT-DRINK', '8851123212021', 'เครื่องดื่ม M-150', JSON.stringify(['เอ็มร้อย', 'เอ็มร้อยห้าสิบ', 'เอ็มขวด']), 12, 9.5, 'ขวด', 'กล่อง (10 ขวด)', 10, 'GROCERY', 1, 35, 10, 0],
    ['G-005', 'CAT-DRINK', '8850228000105', 'น้ำแข็งหลอด (ถังเสิร์ฟโต๊ะ)', JSON.stringify(['น้ำแข็ง', 'น้ำแข็งถัง', 'น้ำแข็งหลอด']), 20, 6, 'ถัง', 'กระสอบ (20 ถัง)', 20, 'GROCERY', 1, 40, 8, 0],
    ['G-006', 'CAT-DRINK', '8858891302216', 'อิชิตัน กรีนที รสน้ำผึ้งมะนาว', JSON.stringify(['อิชิตัน', 'ชาเขียว', 'อิชิตันน้ำผึ้งมะนาว']), 20, 15, 'ขวด', 'ลัง (24 ขวด)', 24, 'GROCERY', 1, 22, 6, 0],

    // GROCERY - Snacks & Instant Noodles
    ['G-007', 'CAT-SNACK', '8850987101083', 'มาม่า รสหมูสับ (ซอง)', JSON.stringify(['มาม่า', 'มาม่าหมูสับ', 'มาม่าซอง']), 7, 5.5, 'ซอง', 'กล่อง (30 ซอง)', 30, 'GROCERY', 1, 60, 15, 0],
    ['G-008', 'CAT-SNACK', '8850987101014', 'มาม่า รสต้มยำกุ้ง (ซอง)', JSON.stringify(['มาม่าต้มยำ', 'มาม่าต้มยำกุ้ง']), 7, 5.5, 'ซอง', 'กล่อง (30 ซอง)', 30, 'GROCERY', 1, 45, 15, 0],
    ['G-009', 'CAT-SNACK', '8850718801017', 'เลย์ มันฝรั่งแผ่นเรียบห่อกลาง', JSON.stringify(['เลย์', 'ขนมเลย์', 'มันฝรั่งเลย์']), 20, 15.5, 'ห่อ', 'แพ็ค (6 ห่อ)', 6, 'GROCERY', 1, 16, 6, 0],
    ['G-010', 'CAT-SNACK', '8850157400107', 'สาหร่ายเถ้าแก่น้อย บิ๊กโรล', JSON.stringify(['เถ้าแก่น้อย', 'สาหร่าย']), 10, 7.5, 'ซอง', 'กล่อง (12 ซอง)', 12, 'GROCERY', 1, 24, 6, 0],

    // GROCERY - Pantry
    ['G-011', 'CAT-PANTRY', '8850545111114', 'น้ำปลาแท้ ทิพรส (700 มล.)', JSON.stringify(['น้ำปลา', 'น้ำปลาทิพรส', 'ทิพรส']), 35, 28, 'ขวด', 'ลัง (12 ขวด)', 12, 'GROCERY', 1, 14, 4, 0],
    ['G-012', 'CAT-PANTRY', '8850250000357', 'น้ำมันพืช มรกต (1 ลิตร)', JSON.stringify(['น้ำมันพืช', 'น้ำมันมรกต', 'น้ำมันขวด']), 48, 40, 'ขวด', 'ลัง (12 ขวด)', 12, 'GROCERY', 1, 9, 4, 0],
    ['G-013', 'CAT-PANTRY', '8850007011019', 'ซอสหอยนางรม ตราแม่ครัว (600 มล.)', JSON.stringify(['ซอสหอย', 'น้ำมันหอย', 'ซอสตราแม่ครัว']), 45, 36, 'ขวด', 'ลัง (12 ขวด)', 12, 'GROCERY', 1, 11, 4, 0],

    // FOOD - Cooked to order (send_to_kitchen = 1)
    ['F-001', 'CAT-RICE', null, 'ข้าวกะเพราหมูสับ', JSON.stringify(['กะเพราหมูสับ', 'ข้าวกะเพราหมูสับ', 'กระเพราหมูสับ', 'กะเพราหมู']), 55, 29.1, 'จาน', 'จาน', 1, 'FOOD', 0, 0, 0, 1],
    ['F-002', 'CAT-RICE', null, 'ข้าวกะเพราหมูกรอบ', JSON.stringify(['กะเพราหมูกรอบ', 'ข้าวกะเพราหมูกรอบ', 'กระเพราหมูกรอบ']), 65, 46.5, 'จาน', 'จาน', 1, 'FOOD', 0, 0, 0, 1],
    ['F-003', 'CAT-RICE', null, 'ข้าวกะเพราไก่', JSON.stringify(['กะเพราไก่', 'ข้าวกะเพราไก่', 'กระเพราไก่']), 50, 21.9, 'จาน', 'จาน', 1, 'FOOD', 0, 0, 0, 1],
    ['F-004', 'CAT-RICE', null, 'ข้าวผัดกุ้งสด', JSON.stringify(['ข้าวผัดกุ้ง', 'ข้าวผัดกุ้งสด']), 65, 42.6, 'จาน', 'จาน', 1, 'FOOD', 0, 0, 0, 1],
    ['F-005', 'CAT-RICE', null, 'ข้าวไข่เจียวหมูสับ', JSON.stringify(['ข้าวไข่เจียว', 'ข้าวไข่เจียวหมูสับ', 'ไข่เจียวหมูสับ']), 45, 24.9, 'จาน', 'จาน', 1, 'FOOD', 0, 0, 0, 1],
    ['F-006', 'CAT-NOODLE', null, 'มาม่าผัดขี้เมาหมูกรอบ', JSON.stringify(['มาม่าผัด', 'มาม่าขี้เมา', 'มาม่าผัดขี้เมา', 'ผัดมาม่า']), 60, 41.5, 'จาน', 'จาน', 1, 'FOOD', 0, 0, 0, 1],
    ['F-007', 'CAT-NOODLE', null, 'ต้มยำกุ้งน้ำข้น (ถ้วย)', JSON.stringify(['ต้มยำกุ้ง', 'ต้มยำกุ้งน้ำข้น', 'ต้มยำ']), 90, 52.0, 'ถ้วย', 'ถ้วย', 1, 'FOOD', 0, 0, 0, 1],
    ['F-008', 'CAT-APPETIZER', null, 'หมูกรอบคั่วพริกเกลือ (กับข้าว)', JSON.stringify(['หมูกรอบคั่วพริกเกลือ', 'คั่วพริกเกลือ']), 85, 56.0, 'จาน', 'จาน', 1, 'FOOD', 0, 0, 0, 1]
  ];
  for (const p of products) insertProd.run(...p);

  // 4. Modifiers (ตัวเลือกเสริมอาหาร)
  const insertMod = db.prepare(`
    INSERT INTO product_modifiers (id, product_id, name, voice_keywords, extra_price, extra_cost)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const modifiers = [
    ['MOD-FRIED-EGG', null, 'ไข่ดาว', JSON.stringify(['ไข่ดาว']), 10, 4.2],
    ['MOD-OMELET', null, 'ไข่เจียว', JSON.stringify(['โปะไข่เจียว', 'เพิ่มไข่เจียว']), 15, 8.4],
    ['MOD-SPECIAL', null, 'พิเศษ', JSON.stringify(['พิเศษ', 'จานพิเศษ', 'เพิ่มหมู']), 15, 9.0],
    ['MOD-RUNNY', null, 'ไข่ดาวไม่สุก', JSON.stringify(['ไม่สุก', 'ยางมะตูม', 'ไข่ดาวไม่สุก']), 0, 0],
    ['MOD-WELLDONE', null, 'ไข่ดาวสุกๆ', JSON.stringify(['สุกๆ', 'ไข่สุก', 'กรอบๆ']), 0, 0],
    ['MOD-LESS-SPICY', null, 'เผ็ดน้อย', JSON.stringify(['เผ็ดน้อย', 'พริกเม็ดเดียว']), 0, 0],
    ['MOD-VERY-SPICY', null, 'เผ็ดมาก', JSON.stringify(['เผ็ดมาก', 'เผ็ดจัด']), 0, 0],
    ['MOD-NO-VEG', null, 'ไม่ใส่ผัก', JSON.stringify(['ไม่ใส่ผัก', 'ไม่ผัก']), 0, 0],
    ['MOD-TAKEAWAY', null, 'ใส่กล่องกลับบ้าน', JSON.stringify(['กลับบ้าน', 'ใส่ห่อ', 'ใส่กล่อง']), 0, 0]
  ];
  for (const m of modifiers) insertMod.run(...m);

  // 5. Recipe BOM (ผูกสูตรวัตถุดิบอาหารเข้ากับเมนูและตัวเลือกเสริม)
  const insertRecipe = db.prepare(`
    INSERT INTO recipe_items (id, product_id, modifier_id, ingredient_id, quantity_used)
    VALUES (?, ?, ?, ?, ?)
  `);
  const recipes = [
    // F-001 ข้าวกะเพราหมูสับ: หมูสับ 110g + ข้าว 200g + กะเพรา 15g + เครื่องปรุง 1 ช้อน
    ['REC-01', 'F-001', null, 'ING-PORK-MINCE', 110],
    ['REC-02', 'F-001', null, 'ING-RICE', 200],
    ['REC-03', 'F-001', null, 'ING-BASIL', 15],
    ['REC-04', 'F-001', null, 'ING-SEASONING', 1],

    // F-002 ข้าวกะเพราหมูกรอบ: หมูกรอบ 100g + ข้าว 200g + กะเพรา 15g + เครื่องปรุง 1 ช้อน
    ['REC-05', 'F-002', null, 'ING-CRISPY-PORK', 100],
    ['REC-06', 'F-002', null, 'ING-RICE', 200],
    ['REC-07', 'F-002', null, 'ING-BASIL', 15],
    ['REC-08', 'F-002', null, 'ING-SEASONING', 1],

    // F-003 ข้าวกะเพราไก่: ไก่ 110g + ข้าว 200g + กะเพรา 15g + เครื่องปรุง 1 ช้อน
    ['REC-09', 'F-003', null, 'ING-CHICKEN', 110],
    ['REC-10', 'F-003', null, 'ING-RICE', 200],
    ['REC-11', 'F-003', null, 'ING-BASIL', 15],
    ['REC-12', 'F-003', null, 'ING-SEASONING', 1],

    // F-004 ข้าวผัดกุ้งสด: กุ้ง 90g + ไข่ไก่ 1 ฟอง + ข้าว 220g + เครื่องปรุง 1 ช้อน
    ['REC-13', 'F-004', null, 'ING-SHRIMP', 90],
    ['REC-14', 'F-004', null, 'ING-EGG', 1],
    ['REC-15', 'F-004', null, 'ING-RICE', 220],
    ['REC-16', 'F-004', null, 'ING-SEASONING', 1],

    // F-005 ข้าวไข่เจียวหมูสับ: ไข่ไก่ 2 ฟอง + หมูสับ 40g + ข้าว 200g + เครื่องปรุง 1 ช้อน
    ['REC-17', 'F-005', null, 'ING-EGG', 2],
    ['REC-18', 'F-005', null, 'ING-PORK-MINCE', 40],
    ['REC-19', 'F-005', null, 'ING-RICE', 200],
    ['REC-20', 'F-005', null, 'ING-SEASONING', 1],

    // F-006 มาม่าผัดขี้เมาหมูกรอบ: เส้นมาม่า 2 ก้อน + หมูกรอบ 80g + กะเพรา 15g + เครื่องปรุง 1 ช้อน
    ['REC-21', 'F-006', null, 'ING-NOODLE-PACK', 2],
    ['REC-22', 'F-006', null, 'ING-CRISPY-PORK', 80],
    ['REC-23', 'F-006', null, 'ING-BASIL', 15],
    ['REC-24', 'F-006', null, 'ING-SEASONING', 1],

    // F-007 ต้มยำกุ้งน้ำข้น: กุ้งสด 140g + เครื่องปรุง 2 ช้อน
    ['REC-25', 'F-007', null, 'ING-SHRIMP', 140],
    ['REC-26', 'F-007', null, 'ING-SEASONING', 2],

    // F-008 หมูกรอบคั่วพริกเกลือ: หมูกรอบ 150g + เครื่องปรุง 1 ช้อน
    ['REC-27', 'F-008', null, 'ING-CRISPY-PORK', 150],
    ['REC-28', 'F-008', null, 'ING-SEASONING', 1],

    // Modifier Recipes:
    // MOD-FRIED-EGG (ไข่ดาว) -> ไข่ไก่ 1 ฟอง
    ['REC-MOD-1', null, 'MOD-FRIED-EGG', 'ING-EGG', 1],
    // MOD-OMELET (ไข่เจียว) -> ไข่ไก่ 2 ฟอง
    ['REC-MOD-2', null, 'MOD-OMELET', 'ING-EGG', 2],
    // MOD-SPECIAL (พิเศษ) -> หมูสับเพิ่ม 50 กรัม
    ['REC-MOD-3', null, 'MOD-SPECIAL', 'ING-PORK-MINCE', 50]
  ];
  for (const r of recipes) insertRecipe.run(...r);

  // Recalculate accurate dish costs from BOM
  recalculateAllFoodCosts();

  // 6. Dining Tables (โต๊ะ 1 - โต๊ะ 6 + โซนรองรับอนาคต)
  const insertTable = db.prepare(`
    INSERT INTO dining_tables (id, name, zone_name, voice_aliases, status, current_order_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const tables = [
    ['T1', 'โต๊ะ 1', 'โซนในร้าน', JSON.stringify(['โต๊ะ 1', 'โต๊ะหนึ่ง', 'โต๊ะที่ 1', 'เบอร์ 1']), 'OCCUPIED', 'ORD-SAMPLE-OPEN-1'],
    ['T2', 'โต๊ะ 2', 'โซนในร้าน', JSON.stringify(['โต๊ะ 2', 'โต๊ะสอง', 'โต๊ะที่ 2', 'เบอร์ 2']), 'AVAILABLE', null],
    ['T3', 'โต๊ะ 3', 'โซนในร้าน', JSON.stringify(['โต๊ะ 3', 'โต๊ะสาม', 'โต๊ะที่ 3', 'เบอร์ 3']), 'OCCUPIED', 'ORD-SAMPLE-OPEN-3'],
    ['T4', 'โต๊ะ 4', 'โซน在ร้าน', JSON.stringify(['โต๊ะ 4', 'โต๊ะสี่', 'โต๊ะที่ 4', 'เบอร์ 4']), 'AVAILABLE', null],
    ['T5', 'โต๊ะ 5', 'โซนหน้าร้าน', JSON.stringify(['โต๊ะ 5', 'โต๊ะห้า', 'โต๊ะที่ 5', 'เบอร์ 5']), 'AVAILABLE', null],
    ['T6', 'โต๊ะ 6', 'โซนหน้าร้าน', JSON.stringify(['โต๊ะ 6', 'โต๊ะหก', 'โต๊ะที่ 6', 'เบอร์ 6']), 'AVAILABLE', null]
  ];
  // Fix typo in T4 zone_name
  tables[3][2] = 'โซนในร้าน';
  for (const tb of tables) insertTable.run(...tb);

  // 7. Sample Stock-In Receipt (ประวัติการนำเข้าสินค้าและวัตถุดิบ)
  const insertReceipt = db.prepare(`
    INSERT INTO stock_in_receipts (id, receipt_type, supplier_name, note, total_cost, record_as_expense, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertReceiptItem = db.prepare(`
    INSERT INTO stock_in_items (
      id, receipt_id, item_target_type, product_id, ingredient_id, item_name, unit_label,
      input_qty, conversion_rate, qty_before, qty_added, qty_after, purchase_cost_per_base_unit, total_line_cost
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const morningTime = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  insertReceipt.run('RCV-20261106-001', 'MIXED', 'แม็คโคร & ตลาดสดเช้า', 'รับน้ำอัดลมเข้าเชลฟ์ + ซื้อหมูสดและไข่ไก่เข้าครัว', 1110, 0, 'เฮียเจ้าของร้าน', morningTime);
  insertReceiptItem.run('SRI-1', 'RCV-20261106-001', 'GROCERY', 'G-001', null, 'โค้ก ขวดเล็ก (325 มล.)', 'แพ็ค (12 ขวด)', 2, 12, 24, 24, 48, 11, 264);
  insertReceiptItem.run('SRI-2', 'RCV-20261106-001', 'INGREDIENT', null, 'ING-PORK-MINCE', 'หมูสับอนามัย', 'กิโลกรัม (1000 กรัม)', 3, 1000, 500, 3000, 3500, 0.18, 540);
  insertReceiptItem.run('SRI-3', 'RCV-20261106-001', 'INGREDIENT', null, 'ING-EGG', 'ไข่ไก่สดเบอร์ 2', 'แผง (30 ฟอง)', 2, 30, 15, 60, 75, 4.2, 252);
  insertReceiptItem.run('SRI-4', 'RCV-20261106-001', 'GROCERY', 'G-003', null, 'น้ำดื่มสิงห์ ขวดเล็ก (600 มล.)', 'แพ็ค (12 ขวด)', 1, 12, 60, 12, 72, 4.5, 54);

  // 8. Sample Paid Orders + Open Table Orders
  const insertOrder = db.prepare(`
    INSERT INTO orders (id, order_type, table_id, status, subtotal, discount, total_amount, total_cost, payment_method, cash_received, change_amount, created_at, paid_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertOrderItem = db.prepare(`
    INSERT INTO order_items (
      id, order_id, product_id, product_name, item_type, order_round, quantity, returned_qty,
      unit_price, unit_cost, modifiers_json, recipe_snapshot_json, item_status, kitchen_status, input_source, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Paid Retail Walk-in Order #1
  const tPaid1 = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  insertOrder.run('ORD-20261106-001', 'RETAIL', null, 'PAID', 114, 0, 114, 89.5, 'CASH', 120, 6, tPaid1, tPaid1);
  insertOrderItem.run('OI-101', 'ORD-20261106-001', 'G-011', 'น้ำปลาแท้ ทิพรส (700 มล.)', 'GROCERY', 1, 1, 0, 35, 28, '[]', '[]', 'ACTIVE', 'NONE', 'BARCODE', tPaid1);
  insertOrderItem.run('OI-102', 'ORD-20261106-001', 'G-012', 'น้ำมันพืช มรกต (1 ลิตร)', 'GROCERY', 1, 1, 0, 48, 40, '[]', '[]', 'ACTIVE', 'NONE', 'BARCODE', tPaid1);
  insertOrderItem.run('OI-103', 'ORD-20261106-001', 'G-007', 'มาม่า รสหมูสับ (ซอง)', 'GROCERY', 1, 3, 0, 7, 5.5, '[]', '[]', 'ACTIVE', 'NONE', 'VOICE', tPaid1);
  insertOrderItem.run('OI-104', 'ORD-20261106-001', 'G-003', 'น้ำดื่มสิงห์ ขวดเล็ก (600 มล.)', 'GROCERY', 1, 1, 0, 10, 5.5, '[]', '[]', 'ACTIVE', 'NONE', 'BARCODE', tPaid1);

  // Paid Dine-in Order #2
  const tPaid2 = new Date(Date.now() - 90 * 60 * 1000).toISOString();
  insertOrder.run('ORD-20261106-002', 'DINE_IN', 'T2', 'PAID', 215, 0, 215, 116.9, 'QR_PROMPTPAY', 215, 0, tPaid2, tPaid2);
  insertOrderItem.run('OI-201', 'ORD-20261106-002', 'F-002', 'ข้าวกะเพราหมูกรอบ', 'FOOD', 1, 2, 0, 75, 49.0, JSON.stringify(['ไข่ดาว']), JSON.stringify([{ name: 'หมูกรอบทำเอง', qty: 100, unit: 'กรัม' }, { name: 'ไข่ไก่สดเบอร์ 2', qty: 1, unit: 'ฟอง' }]), 'ACTIVE', 'SERVED', 'VOICE', tPaid2);
  insertOrderItem.run('OI-202', 'ORD-20261106-002', 'G-002', 'โค้ก ขวดใหญ่ (1.25 ลิตร)', 'GROCERY', 1, 1, 0, 32, 25, '[]', '[]', 'ACTIVE', 'NONE', 'VOICE', tPaid2);
  insertOrderItem.run('OI-203', 'ORD-20261106-002', 'G-005', 'น้ำแข็งหลอด (ถังเสิร์ฟโต๊ะ)', 'GROCERY', 1, 1, 0, 20, 6, '[]', '[]', 'ACTIVE', 'NONE', 'VOICE', tPaid2);
  insertOrderItem.run('OI-204', 'ORD-20261106-002', 'G-009', 'เลย์ มันฝรั่งแผ่นเรียบห่อกลาง', 'GROCERY', 1, 1, 0, 20, 15.5, '[]', '[]', 'RETURNED_RESTOCK', 'NONE', 'TOUCH', tPaid2);
  insertOrderItem.run('OI-205', 'ORD-20261106-002', 'G-004', 'เครื่องดื่ม M-150', 'GROCERY', 1, 1, 0, 13, 9.5, '[]', '[]', 'ACTIVE', 'NONE', 'TOUCH', tPaid2);

  // Open Dine-In Order on Table 1 (ORD-SAMPLE-OPEN-1)
  const tOpen1 = new Date(Date.now() - 22 * 60 * 1000).toISOString();
  insertOrder.run('ORD-SAMPLE-OPEN-1', 'DINE_IN', 'T1', 'OPEN', 180, 0, 180, 88.2, 'CASH', 0, 0, tOpen1, null);
  insertOrderItem.run(
    'OI-301', 'ORD-SAMPLE-OPEN-1', 'F-001', 'ข้าวกะเพราหมูสับ', 'FOOD', 1, 2, 0, 65, 34.0,
    JSON.stringify(['ไข่ดาว', 'ไข่ดาวไม่สุก']),
    JSON.stringify([
      { ingredient_id: 'ING-PORK-MINCE', name: 'หมูสับอนามัย', qty: 110, unit: 'กรัม' },
      { ingredient_id: 'ING-RICE', name: 'ข้าวหอมมะลิหุงสุก', qty: 200, unit: 'กรัม' },
      { ingredient_id: 'ING-EGG', name: 'ไข่ไก่สดเบอร์ 2', qty: 1, unit: 'ฟอง' }
    ]),
    'ACTIVE', 'COOKING', 'VOICE', tOpen1
  );
  insertOrderItem.run('OI-302', 'ORD-SAMPLE-OPEN-1', 'G-001', 'โค้ก ขวดเล็ก (325 มล.)', 'GROCERY', 1, 2, 0, 15, 11, '[]', '[]', 'ACTIVE', 'NONE', 'VOICE', tOpen1);
  insertOrderItem.run('OI-303', 'ORD-SAMPLE-OPEN-1', 'G-009', 'เลย์ มันฝรั่งแผ่นเรียบห่อกลาง', 'GROCERY', 1, 1, 0, 20, 15.5, '[]', '[]', 'ACTIVE', 'NONE', 'TOUCH', tOpen1);

  // Open Dine-In Order on Table 3 (ORD-SAMPLE-OPEN-3)
  const tOpen3 = new Date(Date.now() - 8 * 60 * 1000).toISOString();
  insertOrder.run('ORD-SAMPLE-OPEN-3', 'DINE_IN', 'T3', 'OPEN', 175, 0, 175, 99.6, 'CASH', 0, 0, tOpen3, null);
  insertOrderItem.run(
    'OI-401', 'ORD-SAMPLE-OPEN-3', 'F-004', 'ข้าวผัดกุ้งสด', 'FOOD', 1, 1, 0, 65, 41.5,
    JSON.stringify(['เผ็ดน้อย']),
    JSON.stringify([
      { ingredient_id: 'ING-SHRIMP', name: 'กุ้งขาวสดแกะเปลือก', qty: 90, unit: 'กรัม' },
      { ingredient_id: 'ING-EGG', name: 'ไข่ไก่สดเบอร์ 2', qty: 1, unit: 'ฟอง' },
      { ingredient_id: 'ING-RICE', name: 'ข้าวหอมมะลิหุงสุก', qty: 220, unit: 'กรัม' }
    ]),
    'ACTIVE', 'PENDING', 'VOICE', tOpen3
  );
  insertOrderItem.run(
    'OI-402', 'ORD-SAMPLE-OPEN-3', 'F-007', 'ต้มยำกุ้งน้ำข้น (ถ้วย)', 'FOOD', 1, 1, 0, 90, 49.8,
    JSON.stringify(['เผ็ดมาก']),
    JSON.stringify([
      { ingredient_id: 'ING-SHRIMP', name: 'กุ้งขาวสดแกะเปลือก', qty: 140, unit: 'กรัม' }
    ]),
    'ACTIVE', 'PENDING', 'VOICE', tOpen3
  );
  insertOrderItem.run('OI-403', 'ORD-SAMPLE-OPEN-3', 'G-005', 'น้ำแข็งหลอด (ถังเสิร์ฟโต๊ะ)', 'GROCERY', 1, 1, 0, 20, 6, '[]', '[]', 'ACTIVE', 'NONE', 'VOICE', tOpen3);

  // 9. Sample Inventory Logs
  const insertLog = db.prepare(`
    INSERT INTO inventory_logs (id, target_type, product_id, ingredient_id, item_name, change_qty, balance_after, unit, reason, reference_id, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertLog.run('LOG-1', 'GROCERY', 'G-001', null, 'โค้ก ขวดเล็ก (325 มล.)', 24, 48, 'ขวด', 'STOCK_IN_RECEIPT', 'RCV-20261106-001', 'นำเข้า 2 แพ็ค (24 ขวด)', morningTime);
  insertLog.run('LOG-2', 'INGREDIENT', null, 'ING-PORK-MINCE', 'หมูสับอนามัย', 3000, 3500, 'กรัม', 'STOCK_IN_RECEIPT', 'RCV-20261106-001', 'นำเข้า 3 กิโลกรัม (3000 กรัม)', morningTime);
  insertLog.run('LOG-3', 'GROCERY', 'G-001', null, 'โค้ก ขวดเล็ก (325 มล.)', -2, 46, 'ขวด', 'SALE', 'ORD-SAMPLE-OPEN-1', 'สั่งเข้า โต๊ะ 1', tOpen1);
  insertLog.run('LOG-4', 'INGREDIENT', null, 'ING-PORK-MINCE', 'หมูสับอนามัย', -220, 3280, 'กรัม', 'RECIPE_DEDUCT', 'ORD-SAMPLE-OPEN-1', 'ตัดสูตร ข้าวกะเพราหมูสับ x2 (โต๊ะ 1)', tOpen1);
  insertLog.run('LOG-5', 'GROCERY', 'G-009', null, 'เลย์ มันฝรั่งแผ่นเรียบห่อกลาง', 1, 16, 'ห่อ', 'RETURN_FROM_TABLE', 'ORD-20261106-002', 'ลูกค้าโต๊ะ 2 คืนของชำ (ยังไม่แกะ)', tPaid2);

  // 10. Sample Daily Expenses
  const insertExp = db.prepare(`
    INSERT INTO expenses (id, category, title, amount, expense_date, reference_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertExp.run('EXP-001', 'UTILITY', 'ค่าแก๊สหุงต้มครัว & น้ำแข็งก้อนแช่ของ', 120, todayStr, '', morningTime);
}

function recalculateAllFoodCosts() {
  const foods = db.prepare("SELECT id FROM products WHERE item_type = 'FOOD'").all();
  const getRecipeCost = db.prepare(`
    SELECT SUM(r.quantity_used * i.cost_per_unit) as recipe_cost
    FROM recipe_items r
    JOIN ingredients i ON r.ingredient_id = i.id
    WHERE r.product_id = ?
  `);
  const updateProdCost = db.prepare('UPDATE products SET cost = ? WHERE id = ?');

  for (const f of foods) {
    const row = getRecipeCost.get(f.id);
    if (row && row.recipe_cost !== null && row.recipe_cost > 0) {
      updateProdCost.run(Math.round(row.recipe_cost * 100) / 100, f.id);
    }
  }

  const mods = db.prepare('SELECT id FROM product_modifiers').all();
  const getModCost = db.prepare(`
    SELECT SUM(r.quantity_used * i.cost_per_unit) as mod_cost
    FROM recipe_items r
    JOIN ingredients i ON r.ingredient_id = i.id
    WHERE r.modifier_id = ?
  `);
  const updateModCost = db.prepare('UPDATE product_modifiers SET extra_cost = ? WHERE id = ?');
  for (const m of mods) {
    const row = getModCost.get(m.id);
    if (row && row.mod_cost !== null && row.mod_cost > 0) {
      updateModCost.run(Math.round(row.mod_cost * 100) / 100, m.id);
    }
  }
}

initSchema();
seedIfNeeded();

module.exports = {
  db,
  recalculateAllFoodCosts
};

