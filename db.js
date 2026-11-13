const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

let dataDir = path.join(__dirname, 'data');
try {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
} catch {
  dataDir = path.join('/tmp', 'ongco_pos_data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

const dbPath = path.join(dataDir, 'ongco_pos.sqlite');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category_type TEXT NOT NULL CHECK (category_type IN ('GROCERY', 'FOOD'))
    );

    CREATE TABLE IF NOT EXISTS modifier_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      selection_type TEXT NOT NULL DEFAULT 'MULTIPLE' CHECK (selection_type IN ('SINGLE', 'MULTIPLE')),
      is_required INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
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
      capacity INTEGER NOT NULL DEFAULT 4,
      voice_aliases TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'BILLING')),
      current_order_id TEXT
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      tier TEXT NOT NULL DEFAULT 'ขาประจำ',
      points INTEGER NOT NULL DEFAULT 0,
      total_spent REAL NOT NULL DEFAULT 0,
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_type TEXT NOT NULL CHECK (order_type IN ('RETAIL', 'DINE_IN')),
      table_id TEXT,
      bill_title TEXT DEFAULT '',
      bill_note TEXT DEFAULT '',
      customer_id TEXT,
      customer_name TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PAID', 'CANCELLED', 'VOIDED')),
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
      kitchen_status TEXT NOT NULL DEFAULT 'NONE' CHECK (kitchen_status IN ('NONE', 'PENDING', 'COOKING', 'SERVED', 'CANCELLED', 'CANCEL_REQUESTED', 'CANCELLED_ACK')),
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

  ensureColumn('dining_tables', 'capacity', 'INTEGER NOT NULL DEFAULT 4');
  ensureColumn('orders', 'bill_title', "TEXT DEFAULT ''");
  ensureColumn('orders', 'bill_note', "TEXT DEFAULT ''");
  ensureColumn('orders', 'customer_id', 'TEXT');
  ensureColumn('orders', 'customer_name', "TEXT DEFAULT ''");
  ensureColumn('products', 'modifier_group_ids', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('product_modifiers', 'group_id', 'TEXT');

  // Seed default modifier groups if empty
  try {
    const grpCount = db.prepare('SELECT COUNT(*) as cnt FROM modifier_groups').get()?.cnt || 0;
    if (grpCount === 0) {
      const insGrp = db.prepare('INSERT OR IGNORE INTO modifier_groups (id, name, selection_type, is_required, sort_order) VALUES (?, ?, ?, ?, ?)');
      insGrp.run('GRP-SPICY', 'ระดับความเผ็ด', 'SINGLE', 0, 1);
      insGrp.run('GRP-TOPPING', 'ท็อปปิ้งไข่ & เพิ่มเติม', 'MULTIPLE', 0, 2);

      db.prepare("UPDATE product_modifiers SET group_id = 'GRP-SPICY' WHERE id IN ('MOD-LESS-SPICY', 'MOD-VERY-SPICY') OR name LIKE '%เผ็ด%'").run();
      db.prepare("UPDATE product_modifiers SET group_id = 'GRP-TOPPING' WHERE group_id IS NULL OR group_id = ''").run();
      db.prepare("UPDATE products SET modifier_group_ids = '[\"GRP-SPICY\", \"GRP-TOPPING\"]' WHERE item_type = 'FOOD' AND (modifier_group_ids IS NULL OR modifier_group_ids = '[]')").run();
    }
  } catch {}

  // Migrate SQLite CHECK constraints on orders and order_items if created by older schema
  const ordSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'").get()?.sql || '';
  if (ordSql && !ordSql.includes('VOIDED')) {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec(`
      CREATE TABLE orders_new (
        id TEXT PRIMARY KEY,
        order_type TEXT NOT NULL CHECK (order_type IN ('RETAIL', 'DINE_IN')),
        table_id TEXT,
        bill_title TEXT DEFAULT '',
        bill_note TEXT DEFAULT '',
        customer_id TEXT,
        customer_name TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PAID', 'CANCELLED', 'VOIDED')),
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
      INSERT INTO orders_new SELECT id, order_type, table_id, bill_title, bill_note, customer_id, customer_name, status, subtotal, discount, total_amount, total_cost, payment_method, cash_received, change_amount, created_at, paid_at FROM orders;
      DROP TABLE orders;
      ALTER TABLE orders_new RENAME TO orders;
    `);
    db.exec('PRAGMA foreign_keys = ON;');
  }

  const oiSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='order_items'").get()?.sql || '';
  if (oiSql && !oiSql.includes('CANCEL_REQUESTED')) {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec(`
      CREATE TABLE order_items_new (
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
        kitchen_status TEXT NOT NULL DEFAULT 'NONE' CHECK (kitchen_status IN ('NONE', 'PENDING', 'COOKING', 'SERVED', 'CANCELLED', 'CANCEL_REQUESTED', 'CANCELLED_ACK')),
        input_source TEXT NOT NULL DEFAULT 'TOUCH' CHECK (input_source IN ('BARCODE', 'TOUCH', 'VOICE')),
        created_at TEXT NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
      );
      INSERT INTO order_items_new SELECT id, order_id, product_id, product_name, item_type, order_round, quantity, returned_qty, unit_price, unit_cost, modifiers_json, recipe_snapshot_json, item_status, kitchen_status, input_source, created_at FROM order_items;
      DROP TABLE order_items;
      ALTER TABLE order_items_new RENAME TO order_items;
    `);
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

function seedCustomersIfNeeded() {
  const countRow = db.prepare('SELECT COUNT(*) as c FROM customers').get();
  if (countRow && countRow.c > 0) return;
  const now = new Date().toISOString();
  const ins = db.prepare(`
    INSERT INTO customers (id, name, phone, tier, points, total_spent, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  ins.run('CUS-001', 'ป้าสมศรี (ซอย 3)', '081-234-5678', 'VIP', 120, 3450, 'ชอบสั่งกะเพราเผ็ดน้อย', now);
  ins.run('CUS-002', 'พี่เอก (ช่างแอร์)', '089-876-5432', 'ขาประจำ', 45, 1120, 'ซื้อน้ำแข็งและเครื่องดื่มประจำ', now);
  ins.run('CUS-003', 'น้องมายด์ (หอพักสุขใจ)', '062-345-6789', 'ทั่วไป', 18, 460, '', now);
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
}

initSchema();
seedCustomersIfNeeded();

module.exports = {
  db,
  recalculateAllFoodCosts
};
