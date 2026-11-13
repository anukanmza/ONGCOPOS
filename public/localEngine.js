// Built-in Client-Side POS Engine & Voice Parser Fallback (persisted in localStorage)
// Ensures ONG CO POS works 100% on Vercel even before SUPABASE_URL env vars are configured,
// and also supports direct browser-to-Supabase connection if configured in UI!

const STORAGE_KEY = 'ONG_CO_POS_DB_V2';

function createInitialSeedState() {
  const now = new Date().toISOString();
  const morning = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const tOpen1 = new Date(Date.now() - 22 * 60 * 1000).toISOString();
  const tOpen3 = new Date(Date.now() - 8 * 60 * 1000).toISOString();
  const tPaid1 = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const tPaid2 = new Date(Date.now() - 90 * 60 * 1000).toISOString();
  const todayStr = now.slice(0, 10);

  return {
    categories: [
      { id: 'CAT-DRINK', name: 'เครื่องดื่ม & น้ำแข็ง (ของชำ)', category_type: 'GROCERY' },
      { id: 'CAT-SNACK', name: 'ขนม & บะหมี่กึ่งสำเร็จรูป (ของชำ)', category_type: 'GROCERY' },
      { id: 'CAT-PANTRY', name: 'เครื่องปรุง & ของใช้ในครัวเรือน (ของชำ)', category_type: 'GROCERY' },
      { id: 'CAT-RICE', name: 'อาหารจานเดียว / ตามสั่ง (ครัว)', category_type: 'FOOD' },
      { id: 'CAT-NOODLE', name: 'ก๋วยเตี๋ยว & ยำ/ต้มยำ (ครัว)', category_type: 'FOOD' },
      { id: 'CAT-APPETIZER', name: 'ของทานเล่น & กับข้าว (ครัว)', category_type: 'FOOD' }
    ],
    ingredients: [
      { id: 'ING-PORK-MINCE', name: 'หมูสับอนามัย', stock_unit: 'กรัม', purchase_unit: 'กิโลกรัม', conversion_rate: 1000, current_qty: 3500, cost_per_unit: 0.18, low_stock_threshold: 800 },
      { id: 'ING-CRISPY-PORK', name: 'หมูกรอบทำเอง', stock_unit: 'กรัม', purchase_unit: 'กิโลกรัม', conversion_rate: 1000, current_qty: 1800, cost_per_unit: 0.35, low_stock_threshold: 500 },
      { id: 'ING-CHICKEN', name: 'เนื้ออก/สะโพกไก่หั่น', stock_unit: 'กรัม', purchase_unit: 'กิโลกรัม', conversion_rate: 1000, current_qty: 2500, cost_per_unit: 0.12, low_stock_threshold: 600 },
      { id: 'ING-SHRIMP', name: 'กุ้งขาวสดแกะเปลือก', stock_unit: 'กรัม', purchase_unit: 'กิโลกรัม', conversion_rate: 1000, current_qty: 1400, cost_per_unit: 0.32, low_stock_threshold: 400 },
      { id: 'ING-EGG', name: 'ไข่ไก่สดเบอร์ 2', stock_unit: 'ฟอง', purchase_unit: 'แผง (30 ฟอง)', conversion_rate: 30, current_qty: 75, cost_per_unit: 4.2, low_stock_threshold: 15 },
      { id: 'ING-RICE', name: 'ข้าวหอมมะลิหุงสุก', stock_unit: 'กรัม', purchase_unit: 'หม้อใหญ่ (5 กก.)', conversion_rate: 5000, current_qty: 8000, cost_per_unit: 0.03, low_stock_threshold: 1500 },
      { id: 'ING-BASIL', name: 'ใบกะเพรา & พริกกระเทียม', stock_unit: 'กรัม', purchase_unit: 'กิโลกรัม', conversion_rate: 1000, current_qty: 950, cost_per_unit: 0.10, low_stock_threshold: 200 },
      { id: 'ING-NOODLE-PACK', name: 'เส้นมาม่า/ไวไว (สำหรับครัว)', stock_unit: 'ก้อน', purchase_unit: 'แพ็ค (10 ก้อน)', conversion_rate: 10, current_qty: 35, cost_per_unit: 5.5, low_stock_threshold: 10 },
      { id: 'ING-SEASONING', name: 'ชุดเครื่องปรุงผัด/น้ำมันพืช', stock_unit: 'ช้อนโต๊ะ', purchase_unit: 'ขวดใหญ่ (60 ช้อน)', conversion_rate: 60, current_qty: 120, cost_per_unit: 2.5, low_stock_threshold: 25 }
    ],
    products: [
      { id: 'G-001', category_id: 'CAT-DRINK', barcode: '8851959132012', name: 'โค้ก ขวดเล็ก (325 มล.)', voice_aliases: ['โค้ก', 'โค้กเล็ก', 'โค้กขวดเล็ก', 'น้ำโค้ก'], price: 15, cost: 11, unit: 'ขวด', purchase_unit: 'แพ็ค (12 ขวด)', conversion_rate: 12, item_type: 'GROCERY', track_stock: true, stock_qty: 48, low_stock_threshold: 12, send_to_kitchen: false },
      { id: 'G-002', category_id: 'CAT-DRINK', barcode: '8851959142011', name: 'โค้ก ขวดใหญ่ (1.25 ลิตร)', voice_aliases: ['โค้กใหญ่', 'โค้กขวดใหญ่', 'โค้กลิตร'], price: 32, cost: 25, unit: 'ขวด', purchase_unit: 'แพ็ค (6 ขวด)', conversion_rate: 6, item_type: 'GROCERY', track_stock: true, stock_qty: 18, low_stock_threshold: 6, send_to_kitchen: false },
      { id: 'G-003', category_id: 'CAT-DRINK', barcode: '8850999320007', name: 'น้ำดื่มสิงห์ ขวดเล็ก (600 มล.)', voice_aliases: ['น้ำเปล่า', 'น้ำดื่ม', 'น้ำสิงห์', 'น้ำดื่มสิงห์', 'น้ำเล็ก'], price: 10, cost: 5.5, unit: 'ขวด', purchase_unit: 'แพ็ค (12 ขวด)', conversion_rate: 12, item_type: 'GROCERY', track_stock: true, stock_qty: 72, low_stock_threshold: 24, send_to_kitchen: false },
      { id: 'G-004', category_id: 'CAT-DRINK', barcode: '8851123212021', name: 'เครื่องดื่ม M-150', voice_aliases: ['เอ็มร้อย', 'เอ็มร้อยห้าสิบ', 'เอ็มขวด'], price: 12, cost: 9.5, unit: 'ขวด', purchase_unit: 'กล่อง (10 ขวด)', conversion_rate: 10, item_type: 'GROCERY', track_stock: true, stock_qty: 35, low_stock_threshold: 10, send_to_kitchen: false },
      { id: 'G-005', category_id: 'CAT-DRINK', barcode: '8850228000105', name: 'น้ำแข็งหลอด (ถังเสิร์ฟโต๊ะ)', voice_aliases: ['น้ำแข็ง', 'น้ำแข็งถัง', 'น้ำแข็งหลอด'], price: 20, cost: 6, unit: 'ถัง', purchase_unit: 'กระสอบ (20 ถัง)', conversion_rate: 20, item_type: 'GROCERY', track_stock: true, stock_qty: 40, low_stock_threshold: 8, send_to_kitchen: false },
      { id: 'G-006', category_id: 'CAT-DRINK', barcode: '8858891302216', name: 'อิชิตัน กรีนที รสน้ำผึ้งมะนาว', voice_aliases: ['อิชิตัน', 'ชาเขียว', 'อิชิตันน้ำผึ้งมะนาว'], price: 20, cost: 15, unit: 'ขวด', purchase_unit: 'ลัง (24 ขวด)', conversion_rate: 24, item_type: 'GROCERY', track_stock: true, stock_qty: 22, low_stock_threshold: 6, send_to_kitchen: false },
      { id: 'G-007', category_id: 'CAT-SNACK', barcode: '8850987101083', name: 'มาม่า รสหมูสับ (ซอง)', voice_aliases: ['มาม่า', 'มาม่าหมูสับ', 'มาม่าซอง'], price: 7, cost: 5.5, unit: 'ซอง', purchase_unit: 'กล่อง (30 ซอง)', conversion_rate: 30, item_type: 'GROCERY', track_stock: true, stock_qty: 60, low_stock_threshold: 15, send_to_kitchen: false },
      { id: 'G-008', category_id: 'CAT-SNACK', barcode: '8850987101014', name: 'มาม่า รสต้มยำกุ้ง (ซอง)', voice_aliases: ['มาม่าต้มยำ', 'มาม่าต้มยำกุ้ง'], price: 7, cost: 5.5, unit: 'ซอง', purchase_unit: 'กล่อง (30 ซอง)', conversion_rate: 30, item_type: 'GROCERY', track_stock: true, stock_qty: 45, low_stock_threshold: 15, send_to_kitchen: false },
      { id: 'G-009', category_id: 'CAT-SNACK', barcode: '8850718801017', name: 'เลย์ มันฝรั่งแผ่นเรียบห่อกลาง', voice_aliases: ['เลย์', 'ขนมเลย์', 'มันฝรั่งเลย์'], price: 20, cost: 15.5, unit: 'ห่อ', purchase_unit: 'แพ็ค (6 ห่อ)', conversion_rate: 6, item_type: 'GROCERY', track_stock: true, stock_qty: 16, low_stock_threshold: 6, send_to_kitchen: false },
      { id: 'G-010', category_id: 'CAT-SNACK', barcode: '8850157400107', name: 'สาหร่ายเถ้าแก่น้อย บิ๊กโรล', voice_aliases: ['เถ้าแก่น้อย', 'สาหร่าย'], price: 10, cost: 7.5, unit: 'ซอง', purchase_unit: 'กล่อง (12 ซอง)', conversion_rate: 12, item_type: 'GROCERY', track_stock: true, stock_qty: 24, low_stock_threshold: 6, send_to_kitchen: false },
      { id: 'G-011', category_id: 'CAT-PANTRY', barcode: '8850545111114', name: 'น้ำปลาแท้ ทิพรส (700 มล.)', voice_aliases: ['น้ำปลา', 'น้ำปลาทิพรส', 'ทิพรส'], price: 35, cost: 28, unit: 'ขวด', purchase_unit: 'ลัง (12 ขวด)', conversion_rate: 12, item_type: 'GROCERY', track_stock: true, stock_qty: 14, low_stock_threshold: 4, send_to_kitchen: false },
      { id: 'G-012', category_id: 'CAT-PANTRY', barcode: '8850250000357', name: 'น้ำมันพืช มรกต (1 ลิตร)', voice_aliases: ['น้ำมันพืช', 'น้ำมันมรกต', 'น้ำมันขวด'], price: 48, cost: 40, unit: 'ขวด', purchase_unit: 'ลัง (12 ขวด)', conversion_rate: 12, item_type: 'GROCERY', track_stock: true, stock_qty: 9, low_stock_threshold: 4, send_to_kitchen: false },
      { id: 'G-013', category_id: 'CAT-PANTRY', barcode: '8850007011019', name: 'ซอสหอยนางรม ตราแม่ครัว (600 มล.)', voice_aliases: ['ซอสหอย', 'น้ำมันหอย', 'ซอสตราแม่ครัว'], price: 45, cost: 36, unit: 'ขวด', purchase_unit: 'ลัง (12 ขวด)', conversion_rate: 12, item_type: 'GROCERY', track_stock: true, stock_qty: 11, low_stock_threshold: 4, send_to_kitchen: false },
      { id: 'F-001', category_id: 'CAT-RICE', barcode: null, name: 'ข้าวกะเพราหมูสับ', voice_aliases: ['กะเพราหมูสับ', 'ข้าวกะเพราหมูสับ', 'กระเพราหมูสับ', 'กะเพราหมู'], price: 55, cost: 29.8, unit: 'จาน', purchase_unit: 'จาน', conversion_rate: 1, item_type: 'FOOD', track_stock: false, stock_qty: 0, low_stock_threshold: 0, send_to_kitchen: true },
      { id: 'F-002', category_id: 'CAT-RICE', barcode: null, name: 'ข้าวกะเพราหมูกรอบ', voice_aliases: ['กะเพราหมูกรอบ', 'ข้าวกะเพราหมูกรอบ', 'กระเพราหมูกรอบ'], price: 65, cost: 45.0, unit: 'จาน', purchase_unit: 'จาน', conversion_rate: 1, item_type: 'FOOD', track_stock: false, stock_qty: 0, low_stock_threshold: 0, send_to_kitchen: true },
      { id: 'F-003', category_id: 'CAT-RICE', barcode: null, name: 'ข้าวกะเพราไก่', voice_aliases: ['กะเพราไก่', 'ข้าวกะเพราไก่', 'กระเพราไก่'], price: 50, cost: 23.2, unit: 'จาน', purchase_unit: 'จาน', conversion_rate: 1, item_type: 'FOOD', track_stock: false, stock_qty: 0, low_stock_threshold: 0, send_to_kitchen: true },
      { id: 'F-004', category_id: 'CAT-RICE', barcode: null, name: 'ข้าวผัดกุ้งสด', voice_aliases: ['ข้าวผัดกุ้ง', 'ข้าวผัดกุ้งสด'], price: 65, cost: 42.1, unit: 'จาน', purchase_unit: 'จาน', conversion_rate: 1, item_type: 'FOOD', track_stock: false, stock_qty: 0, low_stock_threshold: 0, send_to_kitchen: true },
      { id: 'F-005', category_id: 'CAT-RICE', barcode: null, name: 'ข้าวไข่เจียวหมูสับ', voice_aliases: ['ข้าวไข่เจียว', 'ข้าวไข่เจียวหมูสับ', 'ไข่เจียวหมูสับ'], price: 45, cost: 24.1, unit: 'จาน', purchase_unit: 'จาน', conversion_rate: 1, item_type: 'FOOD', track_stock: false, stock_qty: 0, low_stock_threshold: 0, send_to_kitchen: true },
      { id: 'F-006', category_id: 'CAT-NOODLE', barcode: null, name: 'มาม่าผัดขี้เมาหมูกรอบ', voice_aliases: ['มาม่าผัด', 'มาม่าขี้เมา', 'มาม่าผัดขี้เมา', 'ผัดมาม่า'], price: 60, cost: 43.0, unit: 'จาน', purchase_unit: 'จาน', conversion_rate: 1, item_type: 'FOOD', track_stock: false, stock_qty: 0, low_stock_threshold: 0, send_to_kitchen: true },
      { id: 'F-007', category_id: 'CAT-NOODLE', barcode: null, name: 'ต้มยำกุ้งน้ำข้น (ถ้วย)', voice_aliases: ['ต้มยำกุ้ง', 'ต้มยำกุ้งน้ำข้น', 'ต้มยำ'], price: 90, cost: 49.8, unit: 'ถ้วย', purchase_unit: 'ถ้วย', conversion_rate: 1, item_type: 'FOOD', track_stock: false, stock_qty: 0, low_stock_threshold: 0, send_to_kitchen: true },
      { id: 'F-008', category_id: 'CAT-APPETIZER', barcode: null, name: 'หมูกรอบคั่วพริกเกลือ (กับข้าว)', voice_aliases: ['หมูกรอบคั่วพริกเกลือ', 'คั่วพริกเกลือ'], price: 85, cost: 55.0, unit: 'จาน', purchase_unit: 'จาน', conversion_rate: 1, item_type: 'FOOD', track_stock: false, stock_qty: 0, low_stock_threshold: 0, send_to_kitchen: true }
    ],
    modifierGroups: [
      { id: 'GRP-SPICY', name: 'ระดับความเผ็ด', selection_type: 'SINGLE', is_required: false, sort_order: 1 },
      { id: 'GRP-TOPPING', name: 'ท็อปปิ้งไข่ & เพิ่มเติม', selection_type: 'MULTIPLE', is_required: false, sort_order: 2 }
    ],
    modifiers: [
      { id: 'MOD-LESS-SPICY', group_id: 'GRP-SPICY', name: 'เผ็ดน้อย', voice_keywords: ['เผ็ดน้อย', 'พริกเม็ดเดียว'], extra_price: 0, extra_cost: 0 },
      { id: 'MOD-MED-SPICY', group_id: 'GRP-SPICY', name: 'เผ็ดกลาง', voice_keywords: ['เผ็ดกลาง', 'เผ็ดปกติ'], extra_price: 0, extra_cost: 0 },
      { id: 'MOD-VERY-SPICY', group_id: 'GRP-SPICY', name: 'เผ็ดมาก', voice_keywords: ['เผ็ดมาก', 'เผ็ดจัด'], extra_price: 0, extra_cost: 0 },
      { id: 'MOD-NO-SPICY', group_id: 'GRP-SPICY', name: 'ไม่เผ็ด', voice_keywords: ['ไม่เผ็ด', 'ไม่ใส่พริก'], extra_price: 0, extra_cost: 0 },
      { id: 'MOD-FRIED-EGG', group_id: 'GRP-TOPPING', name: 'ไข่ดาว', voice_keywords: ['ไข่ดาว'], extra_price: 10, extra_cost: 4.2 },
      { id: 'MOD-OMELET', group_id: 'GRP-TOPPING', name: 'ไข่เจียว', voice_keywords: ['โปะไข่เจียว', 'เพิ่มไข่เจียว'], extra_price: 15, extra_cost: 8.4 },
      { id: 'MOD-SPECIAL', group_id: 'GRP-TOPPING', name: 'พิเศษ', voice_keywords: ['พิเศษ', 'จานพิเศษ', 'เพิ่มหมู'], extra_price: 15, extra_cost: 9.0 },
      { id: 'MOD-RUNNY', group_id: 'GRP-TOPPING', name: 'ไข่ดาวไม่สุก', voice_keywords: ['ไม่สุก', 'ยางมะตูม', 'ไข่ดาวไม่สุก'], extra_price: 0, extra_cost: 0 },
      { id: 'MOD-WELLDONE', group_id: 'GRP-TOPPING', name: 'ไข่ดาวสุกๆ', voice_keywords: ['สุกๆ', 'ไข่สุก', 'กรอบๆ'], extra_price: 0, extra_cost: 0 },
      { id: 'MOD-NO-VEG', group_id: 'GRP-TOPPING', name: 'ไม่ใส่ผัก', voice_keywords: ['ไม่ใส่ผัก', 'ไม่ผัก'], extra_price: 0, extra_cost: 0 },
      { id: 'MOD-TAKEAWAY', group_id: 'GRP-TOPPING', name: 'ใส่กล่องกลับบ้าน', voice_keywords: ['กลับบ้าน', 'ใส่ห่อ', 'ใส่กล่อง'], extra_price: 0, extra_cost: 0 }
    ],
    recipeItems: [
      { id: 'REC-01', product_id: 'F-001', ingredient_id: 'ING-PORK-MINCE', quantity_used: 110 },
      { id: 'REC-02', product_id: 'F-001', ingredient_id: 'ING-RICE', quantity_used: 200 },
      { id: 'REC-03', product_id: 'F-001', ingredient_id: 'ING-BASIL', quantity_used: 15 },
      { id: 'REC-04', product_id: 'F-001', ingredient_id: 'ING-SEASONING', quantity_used: 1 },
      { id: 'REC-05', product_id: 'F-002', ingredient_id: 'ING-CRISPY-PORK', quantity_used: 100 },
      { id: 'REC-06', product_id: 'F-002', ingredient_id: 'ING-RICE', quantity_used: 200 },
      { id: 'REC-07', product_id: 'F-002', ingredient_id: 'ING-BASIL', quantity_used: 15 },
      { id: 'REC-08', product_id: 'F-002', ingredient_id: 'ING-SEASONING', quantity_used: 1 },
      { id: 'REC-09', product_id: 'F-003', ingredient_id: 'ING-CHICKEN', quantity_used: 110 },
      { id: 'REC-10', product_id: 'F-003', ingredient_id: 'ING-RICE', quantity_used: 200 },
      { id: 'REC-11', product_id: 'F-003', ingredient_id: 'ING-BASIL', quantity_used: 15 },
      { id: 'REC-12', product_id: 'F-003', ingredient_id: 'ING-SEASONING', quantity_used: 1 },
      { id: 'REC-13', product_id: 'F-004', ingredient_id: 'ING-SHRIMP', quantity_used: 90 },
      { id: 'REC-14', product_id: 'F-004', ingredient_id: 'ING-EGG', quantity_used: 1 },
      { id: 'REC-15', product_id: 'F-004', ingredient_id: 'ING-RICE', quantity_used: 220 },
      { id: 'REC-16', product_id: 'F-004', ingredient_id: 'ING-SEASONING', quantity_used: 1 },
      { id: 'REC-17', product_id: 'F-005', ingredient_id: 'ING-EGG', quantity_used: 2 },
      { id: 'REC-18', product_id: 'F-005', ingredient_id: 'ING-PORK-MINCE', quantity_used: 40 },
      { id: 'REC-19', product_id: 'F-005', ingredient_id: 'ING-RICE', quantity_used: 200 },
      { id: 'REC-20', product_id: 'F-005', ingredient_id: 'ING-SEASONING', quantity_used: 1 },
      { id: 'REC-21', product_id: 'F-006', ingredient_id: 'ING-NOODLE-PACK', quantity_used: 2 },
      { id: 'REC-22', product_id: 'F-006', ingredient_id: 'ING-CRISPY-PORK', quantity_used: 80 },
      { id: 'REC-23', product_id: 'F-006', ingredient_id: 'ING-BASIL', quantity_used: 15 },
      { id: 'REC-24', product_id: 'F-006', ingredient_id: 'ING-SEASONING', quantity_used: 1 },
      { id: 'REC-25', product_id: 'F-007', ingredient_id: 'ING-SHRIMP', quantity_used: 140 },
      { id: 'REC-26', product_id: 'F-007', ingredient_id: 'ING-SEASONING', quantity_used: 2 },
      { id: 'REC-27', product_id: 'F-008', ingredient_id: 'ING-CRISPY-PORK', quantity_used: 150 },
      { id: 'REC-28', product_id: 'F-008', ingredient_id: 'ING-SEASONING', quantity_used: 1 }
    ],
    tables: [
      { id: 'T1', name: 'โต๊ะ 1', zone_name: 'โซนในร้าน', voice_aliases: ['โต๊ะ 1', 'โต๊ะหนึ่ง', 'โต๊ะที่ 1', 'เบอร์ 1'], status: 'OCCUPIED', current_order_id: 'ORD-SAMPLE-OPEN-1' },
      { id: 'T2', name: 'โต๊ะ 2', zone_name: 'โซนในร้าน', voice_aliases: ['โต๊ะ 2', 'โต๊ะสอง', 'โต๊ะที่ 2', 'เบอร์ 2'], status: 'AVAILABLE', current_order_id: null },
      { id: 'T3', name: 'โต๊ะ 3', zone_name: 'โซนในร้าน', voice_aliases: ['โต๊ะ 3', 'โต๊ะสาม', 'โต๊ะที่ 3', 'เบอร์ 3'], status: 'OCCUPIED', current_order_id: 'ORD-SAMPLE-OPEN-3' },
      { id: 'T4', name: 'โต๊ะ 4', zone_name: 'โซนในร้าน', voice_aliases: ['โต๊ะ 4', 'โต๊ะสี่', 'โต๊ะที่ 4', 'เบอร์ 4'], status: 'AVAILABLE', current_order_id: null },
      { id: 'T5', name: 'โต๊ะ 5', zone_name: 'โซนหน้าร้าน', voice_aliases: ['โต๊ะ 5', 'โต๊ะห้า', 'โต๊ะที่ 5', 'เบอร์ 5'], status: 'AVAILABLE', current_order_id: null },
      { id: 'T6', name: 'โต๊ะ 6', zone_name: 'โซนหน้าร้าน', voice_aliases: ['โต๊ะ 6', 'โต๊ะหก', 'โต๊ะที่ 6', 'เบอร์ 6'], status: 'AVAILABLE', current_order_id: null }
    ],
    orders: [
      { id: 'ORD-20261106-001', order_type: 'RETAIL', table_id: null, bill_title: 'ซื้อของชำหน้าร้าน', bill_note: '', customer_id: 'CUS-002', customer_name: 'ป้าสมศรี (บ้านท้ายซอย)', status: 'PAID', subtotal: 114, discount: 0, total_amount: 114, total_cost: 89.5, payment_method: 'CASH', cash_received: 120, change_amount: 6, created_at: tPaid1, paid_at: tPaid1 },
      { id: 'ORD-20261106-002', order_type: 'DINE_IN', table_id: 'T2', bill_title: 'โต๊ะ 2', bill_note: '', customer_id: null, customer_name: '', status: 'PAID', subtotal: 215, discount: 0, total_amount: 215, total_cost: 116.9, payment_method: 'QR_PROMPTPAY', cash_received: 215, change_amount: 0, created_at: tPaid2, paid_at: tPaid2 },
      { id: 'ORD-SAMPLE-OPEN-1', order_type: 'DINE_IN', table_id: 'T1', bill_title: 'โต๊ะ 1 - พี่เอก', bill_note: 'ไม่ใส่ผงชูรส', customer_id: 'CUS-001', customer_name: 'พี่เอก (ช่างแอร์)', status: 'OPEN', subtotal: 180, discount: 0, total_amount: 180, total_cost: 88.2, payment_method: 'CASH', cash_received: 0, change_amount: 0, created_at: tOpen1, paid_at: null },
      { id: 'ORD-SAMPLE-OPEN-3', order_type: 'DINE_IN', table_id: 'T3', bill_title: 'โต๊ะ 3', bill_note: 'แยกน้ำซุป', customer_id: null, customer_name: '', status: 'OPEN', subtotal: 175, discount: 0, total_amount: 175, total_cost: 99.6, payment_method: 'CASH', cash_received: 0, change_amount: 0, created_at: tOpen3, paid_at: null }
    ],
    customers: [
      { id: 'CUS-001', name: 'พี่เอก (ช่างแอร์)', phone: '081-234-5678', tier: 'VIP', points: 145, total_spent: 3620, visit_count: 18, note: 'ชอบกะเพราเผ็ดจัด ไม่ใส่ถั่วฝักยาว' },
      { id: 'CUS-002', name: 'ป้าสมศรี (บ้านท้ายซอย)', phone: '089-876-5432', tier: 'ขาประจำ', points: 88, total_spent: 2210, visit_count: 14, note: 'ซื้อของชำประจำต้นเดือน' },
      { id: 'CUS-003', name: 'น้องมายด์ (ออฟฟิศปากซอย)', phone: '062-345-6789', tier: 'สมาชิกใหม่', points: 32, total_spent: 810, visit_count: 5, note: 'สั่งกลับบ้านช่วงเที่ยง' }
    ],
    orderItems: [
      { id: 'OI-101', order_id: 'ORD-20261106-001', product_id: 'G-011', product_name: 'น้ำปลาแท้ ทิพรส (700 มล.)', item_type: 'GROCERY', order_round: 1, quantity: 1, returned_qty: 0, unit_price: 35, unit_cost: 28, modifiers: [], recipe_snapshot: [], item_status: 'ACTIVE', kitchen_status: 'NONE', input_source: 'BARCODE', created_at: tPaid1 },
      { id: 'OI-102', order_id: 'ORD-20261106-001', product_id: 'G-012', product_name: 'น้ำมันพืช มรกต (1 ลิตร)', item_type: 'GROCERY', order_round: 1, quantity: 1, returned_qty: 0, unit_price: 48, unit_cost: 40, modifiers: [], recipe_snapshot: [], item_status: 'ACTIVE', kitchen_status: 'NONE', input_source: 'BARCODE', created_at: tPaid1 },
      { id: 'OI-103', order_id: 'ORD-20261106-001', product_id: 'G-007', product_name: 'มาม่า รสหมูสับ (ซอง)', item_type: 'GROCERY', order_round: 1, quantity: 3, returned_qty: 0, unit_price: 7, unit_cost: 5.5, modifiers: [], recipe_snapshot: [], item_status: 'ACTIVE', kitchen_status: 'NONE', input_source: 'VOICE', created_at: tPaid1 },
      { id: 'OI-104', order_id: 'ORD-20261106-001', product_id: 'G-003', product_name: 'น้ำดื่มสิงห์ ขวดเล็ก (600 มล.)', item_type: 'GROCERY', order_round: 1, quantity: 1, returned_qty: 0, unit_price: 10, unit_cost: 5.5, modifiers: [], recipe_snapshot: [], item_status: 'ACTIVE', kitchen_status: 'NONE', input_source: 'BARCODE', created_at: tPaid1 },
      { id: 'OI-201', order_id: 'ORD-20261106-002', product_id: 'F-002', product_name: 'ข้าวกะเพราหมูกรอบ', item_type: 'FOOD', order_round: 1, quantity: 2, returned_qty: 0, unit_price: 75, unit_cost: 49.0, modifiers: ['ไข่ดาว'], recipe_snapshot: [{ name: 'หมูกรอบทำเอง', qty: 200, unit: 'กรัม' }, { name: 'ไข่ไก่สดเบอร์ 2', qty: 2, unit: 'ฟอง' }], item_status: 'ACTIVE', kitchen_status: 'SERVED', input_source: 'VOICE', created_at: tPaid2 },
      { id: 'OI-202', order_id: 'ORD-20261106-002', product_id: 'G-002', product_name: 'โค้ก ขวดใหญ่ (1.25 ลิตร)', item_type: 'GROCERY', order_round: 1, quantity: 1, returned_qty: 0, unit_price: 32, unit_cost: 25, modifiers: [], recipe_snapshot: [], item_status: 'ACTIVE', kitchen_status: 'NONE', input_source: 'VOICE', created_at: tPaid2 },
      { id: 'OI-203', order_id: 'ORD-20261106-002', product_id: 'G-005', product_name: 'น้ำแข็งหลอด (ถังเสิร์ฟโต๊ะ)', item_type: 'GROCERY', order_round: 1, quantity: 1, returned_qty: 0, unit_price: 20, unit_cost: 6, modifiers: [], recipe_snapshot: [], item_status: 'ACTIVE', kitchen_status: 'NONE', input_source: 'VOICE', created_at: tPaid2 },
      { id: 'OI-204', order_id: 'ORD-20261106-002', product_id: 'G-009', product_name: 'เลย์ มันฝรั่งแผ่นเรียบห่อกลาง', item_type: 'GROCERY', order_round: 1, quantity: 1, returned_qty: 0, unit_price: 20, unit_cost: 15.5, modifiers: [], recipe_snapshot: [], item_status: 'RETURNED_RESTOCK', kitchen_status: 'NONE', input_source: 'TOUCH', created_at: tPaid2 },
      { id: 'OI-205', order_id: 'ORD-20261106-002', product_id: 'G-004', product_name: 'เครื่องดื่ม M-150', item_type: 'GROCERY', order_round: 1, quantity: 1, returned_qty: 0, unit_price: 13, unit_cost: 9.5, modifiers: [], recipe_snapshot: [], item_status: 'ACTIVE', kitchen_status: 'NONE', input_source: 'TOUCH', created_at: tPaid2 },
      { id: 'OI-301', order_id: 'ORD-SAMPLE-OPEN-1', product_id: 'F-001', product_name: 'ข้าวกะเพราหมูสับ', item_type: 'FOOD', order_round: 1, quantity: 2, returned_qty: 0, unit_price: 65, unit_cost: 34.0, modifiers: ['ไข่ดาว', 'ไข่ดาวไม่สุก'], recipe_snapshot: [{ ingredient_id: 'ING-PORK-MINCE', name: 'หมูสับอนามัย', qty: 220, unit: 'กรัม' }, { ingredient_id: 'ING-RICE', name: 'ข้าวหอมมะลิหุงสุก', qty: 400, unit: 'กรัม' }, { ingredient_id: 'ING-EGG', name: 'ไข่ไก่สดเบอร์ 2', qty: 2, unit: 'ฟอง' }], item_status: 'ACTIVE', kitchen_status: 'COOKING', input_source: 'VOICE', created_at: tOpen1 },
      { id: 'OI-302', order_id: 'ORD-SAMPLE-OPEN-1', product_id: 'G-001', product_name: 'โค้ก ขวดเล็ก (325 มล.)', item_type: 'GROCERY', order_round: 1, quantity: 2, returned_qty: 0, unit_price: 15, unit_cost: 11, modifiers: [], recipe_snapshot: [], item_status: 'ACTIVE', kitchen_status: 'NONE', input_source: 'VOICE', created_at: tOpen1 },
      { id: 'OI-303', order_id: 'ORD-SAMPLE-OPEN-1', product_id: 'G-009', product_name: 'เลย์ มันฝรั่งแผ่นเรียบห่อกลาง', item_type: 'GROCERY', order_round: 1, quantity: 1, returned_qty: 0, unit_price: 20, unit_cost: 15.5, modifiers: [], recipe_snapshot: [], item_status: 'ACTIVE', kitchen_status: 'NONE', input_source: 'TOUCH', created_at: tOpen1 },
      { id: 'OI-401', order_id: 'ORD-SAMPLE-OPEN-3', product_id: 'F-004', product_name: 'ข้าวผัดกุ้งสด', item_type: 'FOOD', order_round: 1, quantity: 1, returned_qty: 0, unit_price: 65, unit_cost: 41.5, modifiers: ['เผ็ดน้อย'], recipe_snapshot: [{ ingredient_id: 'ING-SHRIMP', name: 'กุ้งขาวสดแกะเปลือก', qty: 90, unit: 'กรัม' }, { ingredient_id: 'ING-EGG', name: 'ไข่ไก่สดเบอร์ 2', qty: 1, unit: 'ฟอง' }], item_status: 'ACTIVE', kitchen_status: 'PENDING', input_source: 'VOICE', created_at: tOpen3 },
      { id: 'OI-402', order_id: 'ORD-SAMPLE-OPEN-3', product_id: 'F-007', product_name: 'ต้มยำกุ้งน้ำข้น (ถ้วย)', item_type: 'FOOD', order_round: 1, quantity: 1, returned_qty: 0, unit_price: 90, unit_cost: 49.8, modifiers: ['เผ็ดมาก'], recipe_snapshot: [{ ingredient_id: 'ING-SHRIMP', name: 'กุ้งขาวสดแกะเปลือก', qty: 140, unit: 'กรัม' }], item_status: 'ACTIVE', kitchen_status: 'PENDING', input_source: 'VOICE', created_at: tOpen3 },
      { id: 'OI-403', order_id: 'ORD-SAMPLE-OPEN-3', product_id: 'G-005', product_name: 'น้ำแข็งหลอด (ถังเสิร์ฟโต๊ะ)', item_type: 'GROCERY', order_round: 1, quantity: 1, returned_qty: 0, unit_price: 20, unit_cost: 6, modifiers: [], recipe_snapshot: [], item_status: 'ACTIVE', kitchen_status: 'NONE', input_source: 'VOICE', created_at: tOpen3 }
    ],
    stockInReceipts: [
      {
        id: 'RCV-20261106-001',
        receipt_type: 'MIXED',
        supplier_name: 'แม็คโคร & ตลาดสดเช้า',
        note: 'รับน้ำอัดลมเข้าเชลฟ์ + ซื้อหมูสดและไข่ไก่เข้าครัว',
        total_cost: 1110,
        record_as_expense: false,
        created_by: 'เฮียเจ้าของร้าน',
        created_at: morning,
        items: [
          { id: 'SRI-1', receipt_id: 'RCV-20261106-001', item_target_type: 'GROCERY', product_id: 'G-001', item_name: 'โค้ก ขวดเล็ก (325 มล.)', unit_label: 'แพ็ค (12 ขวด)', input_qty: 2, conversion_rate: 12, qty_before: 24, qty_added: 24, qty_after: 48, total_line_cost: 264 },
          { id: 'SRI-2', receipt_id: 'RCV-20261106-001', item_target_type: 'INGREDIENT', ingredient_id: 'ING-PORK-MINCE', item_name: 'หมูสับอนามัย', unit_label: 'กิโลกรัม', input_qty: 3, conversion_rate: 1000, qty_before: 500, qty_added: 3000, qty_after: 3500, total_line_cost: 540 },
          { id: 'SRI-3', receipt_id: 'RCV-20261106-001', item_target_type: 'INGREDIENT', ingredient_id: 'ING-EGG', item_name: 'ไข่ไก่สดเบอร์ 2', unit_label: 'แผง (30 ฟอง)', input_qty: 2, conversion_rate: 30, qty_before: 15, qty_added: 60, qty_after: 75, total_line_cost: 252 },
          { id: 'SRI-4', receipt_id: 'RCV-20261106-001', item_target_type: 'GROCERY', product_id: 'G-003', item_name: 'น้ำดื่มสิงห์ ขวดเล็ก (600 มล.)', unit_label: 'แพ็ค (12 ขวด)', input_qty: 1, conversion_rate: 12, qty_before: 60, qty_added: 12, qty_after: 72, total_line_cost: 54 }
        ]
      }
    ],
    inventoryLogs: [
      { id: 'LOG-1', target_type: 'GROCERY', product_id: 'G-001', item_name: 'โค้ก ขวดเล็ก (325 มล.)', change_qty: 24, balance_after: 48, unit: 'ขวด', reason: 'STOCK_IN_RECEIPT', reference_id: 'RCV-20261106-001', note: 'นำเข้า 2 แพ็ค (24 ขวด)', created_at: morning },
      { id: 'LOG-2', target_type: 'INGREDIENT', ingredient_id: 'ING-PORK-MINCE', item_name: 'หมูสับอนามัย', change_qty: 3000, balance_after: 3500, unit: 'กรัม', reason: 'STOCK_IN_RECEIPT', reference_id: 'RCV-20261106-001', note: 'นำเข้า 3 กิโลกรัม (3000 กรัม)', created_at: morning },
      { id: 'LOG-3', target_type: 'GROCERY', product_id: 'G-001', item_name: 'โค้ก ขวดเล็ก (325 มล.)', change_qty: -2, balance_after: 46, unit: 'ขวด', reason: 'SALE', reference_id: 'ORD-SAMPLE-OPEN-1', note: 'สั่งเข้า โต๊ะ 1', created_at: tOpen1 },
      { id: 'LOG-4', target_type: 'INGREDIENT', ingredient_id: 'ING-PORK-MINCE', item_name: 'หมูสับอนามัย', change_qty: -220, balance_after: 3280, unit: 'กรัม', reason: 'RECIPE_DEDUCT', reference_id: 'ORD-SAMPLE-OPEN-1', note: 'ตัดสูตร ข้าวกะเพราหมูสับ x2 (โต๊ะ 1)', created_at: tOpen1 },
      { id: 'LOG-5', target_type: 'GROCERY', product_id: 'G-009', item_name: 'เลย์ มันฝรั่งแผ่นเรียบห่อกลาง', change_qty: 1, balance_after: 16, unit: 'ห่อ', reason: 'RETURN_FROM_TABLE', reference_id: 'ORD-20261106-002', note: 'ลูกค้าโต๊ะ 2 คืนของชำ (ยังไม่แกะ)', created_at: tPaid2 }
    ],
    expenses: [
      { id: 'EXP-001', category: 'UTILITY', title: 'ค่าแก๊สหุงต้มครัว & น้ำแข็งก้อนแช่ของ', amount: 120, expense_date: todayStr, reference_id: '', created_at: morning }
    ]
  };
}

function loadLocalDb() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.products) && Array.isArray(parsed.tables)) {
        let changed = false;
        if (!Array.isArray(parsed.modifierGroups)) {
          parsed.modifierGroups = [
            { id: 'GRP-SPICY', name: 'ระดับความเผ็ด', selection_type: 'SINGLE', is_required: false, sort_order: 1 },
            { id: 'GRP-TOPPING', name: 'ท็อปปิ้งไข่ & เพิ่มเติม', selection_type: 'MULTIPLE', is_required: false, sort_order: 2 }
          ];
          for (const m of (parsed.modifiers || [])) {
            if (!m.group_id) {
              m.group_id = m.name.includes('เผ็ด') ? 'GRP-SPICY' : 'GRP-TOPPING';
            }
          }
          changed = true;
        }
        for (const p of (parsed.products || [])) {
          if (p.item_type === 'FOOD' && !Array.isArray(p.modifier_group_ids)) {
            p.modifier_group_ids = ['GRP-SPICY', 'GRP-TOPPING'];
            changed = true;
          }
        }
        if (changed) saveLocalDb(parsed);
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  const initial = createInitialSeedState();
  saveLocalDb(initial);
  return initial;
}

function saveLocalDb(dbObj) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dbObj));
  } catch {
    // ignore
  }
}

function buildLocalBootstrap() {
  const db = loadLocalDb();
  const ingMap = new Map(db.ingredients.map(i => [i.id, i]));

  const enrichedRecipes = db.recipeItems.map(r => {
    const ing = ingMap.get(r.ingredient_id);
    return {
      ...r,
      ingredient_name: ing ? ing.name : r.ingredient_id,
      stock_unit: ing ? ing.stock_unit : 'กรัม',
      cost_per_unit: ing ? ing.cost_per_unit : 0
    };
  });

  const products = db.products.map(p => {
    const recs = enrichedRecipes.filter(r => r.product_id === p.id);
    const calcCost = p.item_type === 'FOOD' && recs.length > 0
      ? Math.round(recs.reduce((s, r) => s + r.quantity_used * r.cost_per_unit, 0) * 100) / 100
      : p.cost;
    return { ...p, cost: calcCost, recipe_items: recs };
  });

  const openOrders = db.orders.filter(o => o.status === 'OPEN');
  const tables = db.tables.map(t => {
    const activeOrder = openOrders.find(o => o.id === t.current_order_id || (o.table_id === t.id && o.status === 'OPEN')) || null;
    const items = activeOrder ? db.orderItems.filter(i => i.order_id === activeOrder.id) : [];
    return { ...t, active_order: activeOrder ? { ...activeOrder, items } : null };
  });

  const tableMap = new Map(db.tables.map(t => [t.id, t]));
  const orderMap = new Map(db.orders.map(o => [o.id, o]));

  const kitchenQueue = db.orderItems
    .filter(it => {
      const ord = orderMap.get(it.order_id);
      if (!ord || it.item_type !== 'FOOD') return false;
      if (it.kitchen_status === 'CANCEL_REQUESTED') return true;
      return it.item_status === 'ACTIVE' && ['PENDING', 'COOKING', 'SERVED'].includes(it.kitchen_status) && ['OPEN', 'PAID'].includes(ord.status);
    })
    .sort((a, b) => {
      const rank = { CANCEL_REQUESTED: 0, PENDING: 1, COOKING: 2, SERVED: 3 };
      return (rank[a.kitchen_status] ?? 9) - (rank[b.kitchen_status] ?? 9);
    })
    .map(it => {
      const ord = orderMap.get(it.order_id);
      const tbl = ord && ord.table_id ? tableMap.get(ord.table_id) : null;
      return {
        ...it,
        order_type: ord ? ord.order_type : 'RETAIL',
        table_id: ord ? ord.table_id : null,
        bill_title: ord ? ord.bill_title : null,
        table_name: tbl ? tbl.name : null,
        zone_name: tbl ? tbl.zone_name : null
      };
    });

  let paidRevenue = 0;
  let openTableRevenue = 0;
  let groceryRevenue = 0;
  let groceryCost = 0;
  let foodRevenue = 0;
  let foodCost = 0;
  let wasteCost = 0;
  let returnedRestockValue = 0;
  let cashRevenue = 0;
  let qrRevenue = 0;
  const salesMap = new Map();

  for (const o of db.orders) {
    if (o.status === 'PAID') {
      paidRevenue += o.total_amount;
      if (o.payment_method === 'QR_PROMPTPAY') qrRevenue += o.total_amount;
      else cashRevenue += o.total_amount;
    } else if (o.status === 'OPEN') {
      openTableRevenue += o.total_amount;
    }
  }

  for (const it of db.orderItems) {
    const parentOrd = orderMap.get(it.order_id);
    if (!parentOrd) continue;
    if (it.item_status === 'VOID_WASTE') {
      wasteCost += it.quantity * it.unit_cost;
      continue;
    }
    if (it.item_status === 'RETURNED_RESTOCK') {
      returnedRestockValue += it.quantity * it.unit_price;
      continue;
    }
    // Calculate revenue, COGS, and top sellers strictly from PAID orders!
    if (parentOrd.status !== 'PAID' || it.item_status !== 'ACTIVE') {
      continue;
    }
    const activeQty = Math.max(0, it.quantity - (it.returned_qty || 0));
    const rev = activeQty * it.unit_price;
    const cost = activeQty * it.unit_cost;
    if (it.item_type === 'GROCERY') {
      groceryRevenue += rev;
      groceryCost += cost;
    } else {
      foodRevenue += rev;
      foodCost += cost;
    }
    const prev = salesMap.get(it.product_id) || { product_id: it.product_id, name: it.product_name, item_type: it.item_type, qty_sold: 0, revenue: 0, cost: 0, profit: 0 };
    prev.qty_sold += activeQty;
    prev.revenue += rev;
    prev.cost += cost;
    prev.profit += (rev - cost);
    salesMap.set(it.product_id, prev);
  }

  const totalRevenue = paidRevenue;
  const totalCogs = groceryCost + foodCost;
  const grossProfit = totalRevenue - totalCogs;
  const operatingExpenses = db.expenses.reduce((s, e) => s + e.amount, 0);
  const stockInPurchases = db.stockInReceipts.reduce((s, r) => s + r.total_cost, 0);
  const netProfit = grossProfit - wasteCost - operatingExpenses;

  const allBills = db.orders.map(o => {
    const tbl = o.table_id ? tableMap.get(o.table_id) : null;
    const items = db.orderItems.filter(i => i.order_id === o.id);
    return {
      ...o,
      table_name: tbl ? tbl.name : null,
      zone_name: tbl ? tbl.zone_name : null,
      items
    };
  });

  const defaultLoyaltySettings = {
    spend_per_point: 25,
    points_earned: 1,
    redeem_points_unit: 10,
    redeem_discount_baht: 10,
    min_redeem_points: 10,
    auto_upgrade_tier: true,
    tiers: [
      { name: 'สมาชิกใหม่', min_spent: 0, points_multiplier: 1, discount_pct: 0 },
      { name: 'ขาประจำ', min_spent: 1000, points_multiplier: 1.2, discount_pct: 0 },
      { name: 'VIP', min_spent: 5000, points_multiplier: 1.5, discount_pct: 5 }
    ]
  };
  const loyaltySettings = { ...defaultLoyaltySettings, ...(db.loyaltySettings || {}) };

  return {
    categories: db.categories,
    products,
    modifierGroups: db.modifierGroups || [],
    modifiers: db.modifiers,
    ingredients: db.ingredients,
    recipeItems: enrichedRecipes,
    tables,
    customers: (db.customers || []).filter(c => c.id !== 'SYS-LOYALTY-CONFIG'),
    loyaltySettings,
    allBills,
    kitchenQueue,
    stockInReceipts: db.stockInReceipts,
    inventoryLogs: db.inventoryLogs,
    expenses: db.expenses,
    recentOrders: db.orders.slice(0, 20),
    analytics: {
      total_revenue: Math.round(totalRevenue * 100) / 100,
      paid_revenue: Math.round(paidRevenue * 100) / 100,
      open_table_revenue: Math.round(openTableRevenue * 100) / 100,
      grocery_revenue: Math.round(groceryRevenue * 100) / 100,
      grocery_cost: Math.round(groceryCost * 100) / 100,
      grocery_profit: Math.round((groceryRevenue - groceryCost) * 100) / 100,
      food_revenue: Math.round(foodRevenue * 100) / 100,
      food_cost: Math.round(foodCost * 100) / 100,
      food_profit: Math.round((foodRevenue - foodCost) * 100) / 100,
      total_cogs: Math.round(totalCogs * 100) / 100,
      gross_profit: Math.round(grossProfit * 100) / 100,
      gross_margin_pct: totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 1000) / 10 : 0,
      waste_cost: Math.round(wasteCost * 100) / 100,
      returned_restock_value: Math.round(returnedRestockValue * 100) / 100,
      operating_expenses: Math.round(operatingExpenses * 100) / 100,
      stock_in_purchases: Math.round(stockInPurchases * 100) / 100,
      net_profit: Math.round(netProfit * 100) / 100,
      net_margin_pct: totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 1000) / 10 : 0,
      cash_revenue: Math.round(cashRevenue * 100) / 100,
      qr_revenue: Math.round(qrRevenue * 100) / 100,
      top_sellers: Array.from(salesMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 8),
      low_stock_grocery: products.filter(p => p.item_type === 'GROCERY' && p.track_stock && p.stock_qty <= p.low_stock_threshold),
      low_stock_ingredients: db.ingredients.filter(i => i.current_qty <= i.low_stock_threshold)
    }
  };
}

function recalcLocalOrder(db, orderId) {
  const items = db.orderItems.filter(i => i.order_id === orderId && i.item_status === 'ACTIVE');
  let subtotal = 0;
  let totalCost = 0;
  for (const it of items) {
    subtotal += it.quantity * it.unit_price;
    totalCost += it.quantity * it.unit_cost;
  }
  const ord = db.orders.find(o => o.id === orderId);
  if (ord) {
    ord.subtotal = Math.round(subtotal * 100) / 100;
    ord.total_amount = Math.max(0, Math.round((subtotal - (ord.discount || 0)) * 100) / 100);
    ord.total_cost = Math.round(totalCost * 100) / 100;
  }
}

window.LocalPosEngine = {
  getBootstrap() {
    return buildLocalBootstrap();
  },

  parseVoice(rawText, fallbackTableId) {
    const data = buildLocalBootstrap();
    const originalText = (rawText || '').trim();
    if (!originalText) {
      return { success: false, raw_text: '', intent: 'ORDER', order_type: 'RETAIL', table: null, items: [], message: 'กรุณาพูดหรือพิมพ์คำสั่งออเดอร์' };
    }
    const thaiDigitMap = {
      '๐': '0', '๑': '1', '๒': '2', '๓': '3', '๔': '4',
      '๕': '5', '๖': '6', '๗': '7', '๘': '8', '๙': '9'
    };
    const numMap = {
      'หนึ่ง': 1, 'นึง': 1, 'สอง': 2, 'คู่': 2, 'สาม': 3, 'สี่': 4,
      'ห้า': 5, 'หก': 6, 'เจ็ด': 7, 'แปด': 8, 'เก้า': 9, 'สิบ': 10,
      'สิบเอ็ด': 11, 'สิบสอง': 12, 'สิบสาม': 13, 'สิบสี่': 14, 'สิบห้า': 15,
      'สิบหก': 16, 'สิบเจ็ด': 17, 'สิบแปด': 18, 'สิบเก้า': 19,
      'ยี่สิบ': 20, 'ยี่สิบเอ็ด': 21, 'ยี่สิบสอง': 22, 'ยี่สิบสาม': 23, 'ยี่สิบสี่': 24, 'ยี่สิบห้า': 25,
      'สามสิบ': 30, 'สี่สิบ': 40, 'ห้าสิบ': 50, 'ครึ่ง': 1, 'โหล': 12
    };
    const thaiUnits = 'จาน|ถ้วย|ชาม|ขวด|แก้ว|กระป๋อง|ซอง|ห่อ|ถัง|ชิ้น|กล่อง|แพ็ค|ฟอง|ที่|ชุด|อัน|ถุง|ลัง|ลูก|หม้อ|กิโล|โล';

    let workingText = originalText;
    // 1. Thai digits
    workingText = workingText.replace(/[๐-๙]/g, d => thaiDigitMap[d] || d);
    // 2. Space around digits
    workingText = workingText.replace(/([ก-๙])(\d+)/g, '$1 $2 ').replace(/(\d+)([ก-๙])/g, ' $1 $2');
    // 3. Unit + นึง
    workingText = workingText.replace(new RegExp(`(${thaiUnits})\\s*นึง`, 'g'), '$1 1');
    // 4. Thai number words
    const wordKeys = Object.keys(numMap).sort((a, b) => b.length - a.length);
    for (const k of wordKeys) {
      const val = numMap[k];
      workingText = workingText.replace(new RegExp(`(${k})\\s*(${thaiUnits}|$)`, 'g'), (m, w, u) => ` ${val} ${u}`);
      workingText = workingText.replace(new RegExp(`(โต๊ะ\\s*|เบอร์\\s*|เอา\\s*|ขอ\\s*|สั่ง\\s*|เพิ่ม\\s*|\\s+)(${k})`, 'g'), (m, pfx, w) => `${pfx} ${val} `);
      workingText = workingText.replace(new RegExp(`(^|\\s+)(${k})(\\s+|$)`, 'g'), (m, p1, w, p2) => `${p1}${val}${p2}`);
    }
    workingText = workingText.replace(/\s+/g, ' ').trim();

    let intent = 'ORDER';
    let returnMode = 'RETURNED_RESTOCK';
    if (/(คืนของ|คืนสินค้า|ขอคืน|คืน|ยกเลิก|เอาออก)/.test(workingText)) {
      intent = 'RETURN';
      if (/(เสีย|แตก|หก|ชำรุด|ของเสีย)/.test(workingText)) returnMode = 'VOID_WASTE';
    }

    let matchedTable = null;
    for (const t of data.tables) {
      const cands = [t.name, ...(t.voice_aliases || [])].sort((a, b) => b.length - a.length);
      for (const c of cands) {
        const re = new RegExp(c.replace(/\s+/g, '\\s*'), 'i');
        if (re.test(workingText)) {
          matchedTable = t;
          workingText = workingText.replace(re, ' ');
          break;
        }
      }
      if (matchedTable) break;
    }
    if (!matchedTable) {
      const m = workingText.match(/โต๊ะ\s*(\d+)/);
      if (m) {
        matchedTable = data.tables.find(t => t.name.includes(m[1]) || t.id === `T${m[1]}`) || null;
        workingText = workingText.replace(m[0], ' ');
      }
    }
    if (!matchedTable && fallbackTableId) {
      matchedTable = data.tables.find(t => t.id === fallbackTableId) || null;
    }

    const phraseEntries = [];
    for (const p of data.products) {
      for (const phrase of new Set([p.name, ...(p.voice_aliases || [])])) {
        if (phrase && phrase.trim()) {
          phraseEntries.push({ phrase: phrase.trim(), compactPhrase: phrase.replace(/\s+/g, ''), product: p });
        }
      }
    }
    phraseEntries.sort((a, b) => b.compactPhrase.length - a.compactPhrase.length);

    const matches = [];
    const occupied = [];
    const isOcc = (s, e) => occupied.some(([os, oe]) => !(e <= os || s >= oe));

    for (const entry of phraseEntries) {
      const escaped = entry.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
      const regex = new RegExp(escaped, 'gi');
      let m;
      while ((m = regex.exec(workingText)) !== null) {
        const s = m.index;
        const e = s + m[0].length;
        if (!isOcc(s, e)) {
          occupied.push([s, e]);
          matches.push({ start: s, end: e, product: entry.product });
        }
      }
    }
    matches.sort((a, b) => a.start - b.start);

    const parsedItems = [];
    for (let i = 0; i < matches.length; i++) {
      const cur = matches[i];
      const prevEnd = i > 0 ? matches[i - 1].end : 0;
      const nextStart = i + 1 < matches.length ? matches[i + 1].start : workingText.length;
      const tail = workingText.slice(cur.end, nextStart);
      const head = workingText.slice(prevEnd, cur.start);

      let quantity = 1;
      const qmUnit = tail.match(new RegExp(`(\\d+)\\s*(?:${thaiUnits})`));
      const qmTail = tail.match(/(\d+)/);
      const qmHead = head.match(new RegExp(`(\\d+)\\s*(?:${thaiUnits})?\\s*$`));

      if (qmUnit) {
        quantity = parseInt(qmUnit[1], 10);
      } else if (qmTail) {
        quantity = parseInt(qmTail[1], 10);
      } else if (qmHead) {
        quantity = parseInt(qmHead[1], 10);
      }
      quantity = Math.min(100, Math.max(1, quantity));

      const matchedModifiers = [];
      let extraPrice = 0;
      let extraCost = 0;
      if (cur.product.item_type === 'FOOD') {
        for (const mod of data.modifiers) {
          if ([mod.name, ...(mod.voice_keywords || [])].some(kw => tail.includes(kw))) {
            matchedModifiers.push(mod.name);
            extraPrice += mod.extra_price;
            extraCost += mod.extra_cost;
          }
        }
        if ((matchedModifiers.includes('ไข่ดาวไม่สุก') || matchedModifiers.includes('ไข่ดาวสุกๆ')) && !matchedModifiers.includes('ไข่ดาว')) {
          matchedModifiers.unshift('ไข่ดาว');
          extraPrice += 10;
          extraCost += 4.2;
        }
      }
      const unitPrice = cur.product.price + extraPrice;
      const unitCost = Math.round((cur.product.cost + extraCost) * 100) / 100;
      const recipeDeductions = (cur.product.recipe_items || []).map(r => ({
        ingredient_id: r.ingredient_id,
        name: r.ingredient_name,
        qty: r.quantity_used * quantity,
        unit: r.stock_unit
      }));

      parsedItems.push({
        product_id: cur.product.id,
        name: cur.product.name,
        item_type: cur.product.item_type,
        unit: cur.product.unit,
        quantity,
        unit_price: unitPrice,
        unit_cost: unitCost,
        line_total: unitPrice * quantity,
        modifiers: matchedModifiers,
        send_to_kitchen: Boolean(cur.product.send_to_kitchen),
        stock_qty: cur.product.stock_qty,
        recipe_deductions: recipeDeductions
      });
    }

    return {
      success: parsedItems.length > 0,
      raw_text: originalText,
      intent,
      return_mode: returnMode,
      order_type: matchedTable ? 'DINE_IN' : 'RETAIL',
      table: matchedTable ? { id: matchedTable.id, name: matchedTable.name, zone_name: matchedTable.zone_name, status: matchedTable.status } : null,
      items: parsedItems,
      total_preview: parsedItems.reduce((s, it) => s + it.line_total, 0),
      message: parsedItems.length > 0 ? `แยกคำสั่งเสียงสำเร็จ ${parsedItems.length} รายการ` : 'ไม่พบชื่อสินค้าหรือเมนูที่ตรงกัน'
    };
  },

  submitOrder(body) {
    const db = loadLocalDb();
    const now = new Date().toISOString();
    const {
      order_id: existingOrderId = null,
      order_type = 'RETAIL',
      table_id = null,
      bill_title = '',
      bill_note = '',
      customer_id = null,
      customer_name = '',
      items = [],
      payment_method = 'CASH',
      cash_received = 0,
      discount = 0,
      settle_immediately = false,
      input_source = 'TOUCH'
    } = body;

    let orderId = existingOrderId || `ORD-${Date.now().toString().slice(-6)}`;
    let orderRound = 1;
    let contextLabel = bill_title ? `บิล: ${bill_title}` : 'ขายหน้าร้าน (Walk-in)';

    if (existingOrderId) {
      const existing = db.orders.find(o => o.id === existingOrderId);
      if (existing) {
        orderId = existing.id;
        orderRound += 1;
        existing.bill_title = bill_title || existing.bill_title || '';
        existing.bill_note = bill_note !== undefined ? bill_note : (existing.bill_note || '');
        existing.customer_id = customer_id || existing.customer_id || null;
        existing.customer_name = customer_name || existing.customer_name || '';
        if (settle_immediately) {
          existing.status = 'PAID';
          existing.paid_at = now;
        }
      }
    } else if (order_type === 'DINE_IN' && table_id) {
      const tbl = db.tables.find(t => t.id === table_id);
      if (tbl) contextLabel = tbl.name;
      const existing = tbl && tbl.current_order_id ? db.orders.find(o => o.id === tbl.current_order_id && o.status === 'OPEN') : null;
      if (existing) {
        orderId = existing.id;
        orderRound += 1;
        if (bill_title) existing.bill_title = bill_title;
        if (bill_note !== undefined) existing.bill_note = bill_note;
        if (customer_id) {
          existing.customer_id = customer_id;
          existing.customer_name = customer_name;
        }
      } else {
        db.orders.unshift({ id: orderId, order_type: 'DINE_IN', table_id, bill_title: bill_title || (tbl ? tbl.name : ''), bill_note, customer_id, customer_name, status: 'OPEN', subtotal: 0, discount: 0, total_amount: 0, total_cost: 0, payment_method, cash_received: 0, change_amount: 0, created_at: now, paid_at: null });
        if (tbl) {
          tbl.status = 'OCCUPIED';
          tbl.current_order_id = orderId;
        }
      }
    } else {
      db.orders.unshift({ id: orderId, order_type: 'RETAIL', table_id: null, bill_title: bill_title || (settle_immediately ? 'ขายหน้าร้าน' : 'พักบิลหน้าร้าน'), bill_note, customer_id, customer_name, status: settle_immediately ? 'PAID' : 'OPEN', subtotal: 0, discount: Number(discount) || 0, total_amount: 0, total_cost: 0, payment_method, cash_received: Number(cash_received) || 0, change_amount: 0, created_at: now, paid_at: settle_immediately ? now : null });
    }

    for (const it of items) {
      const prod = db.products.find(p => p.id === it.product_id);
      if (!prod) continue;
      const qty = Math.max(1, Number(it.quantity) || 1);
      const modNames = Array.isArray(it.modifiers) ? it.modifiers : [];
      const unitPrice = it.unit_price !== undefined ? Number(it.unit_price) : prod.price;
      const unitCost = prod.cost;
      const recipeSnapshot = [];

      if (prod.item_type === 'GROCERY' && prod.track_stock) {
        prod.stock_qty = Math.round((prod.stock_qty - qty) * 100) / 100;
        db.inventoryLogs.unshift({ id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, target_type: 'GROCERY', product_id: prod.id, item_name: prod.name, change_qty: -qty, balance_after: prod.stock_qty, unit: prod.unit, reason: 'SALE', reference_id: orderId, note: contextLabel, created_at: now });
      } else if (prod.item_type === 'FOOD') {
        const recs = db.recipeItems.filter(r => r.product_id === prod.id);
        for (const r of recs) {
          const ing = db.ingredients.find(i => i.id === r.ingredient_id);
          if (ing) {
            const dQty = r.quantity_used * qty;
            ing.current_qty = Math.round((ing.current_qty - dQty) * 100) / 100;
            recipeSnapshot.push({ ingredient_id: ing.id, name: ing.name, qty: dQty, unit: ing.stock_unit });
            db.inventoryLogs.unshift({ id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, target_type: 'INGREDIENT', ingredient_id: ing.id, item_name: ing.name, change_qty: -dQty, balance_after: ing.current_qty, unit: ing.stock_unit, reason: 'RECIPE_DEDUCT', reference_id: orderId, note: `ตัดสูตร ${prod.name} x${qty}`, created_at: now });
          }
        }
      }

      db.orderItems.push({
        id: `OI-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        order_id: orderId,
        product_id: prod.id,
        product_name: prod.name,
        item_type: prod.item_type,
        order_round: orderRound,
        quantity: qty,
        returned_qty: 0,
        unit_price: unitPrice,
        unit_cost: unitCost,
        modifiers: modNames,
        recipe_snapshot: recipeSnapshot,
        item_status: 'ACTIVE',
        kitchen_status: prod.send_to_kitchen ? 'PENDING' : 'NONE',
        input_source: it.input_source || input_source || 'TOUCH',
        created_at: now
      });
    }

    recalcLocalOrder(db, orderId);
    if (settle_immediately) {
      const ord = db.orders.find(o => o.id === orderId);
      if (ord && ord.customer_id && Array.isArray(db.customers)) {
        const cus = db.customers.find(c => c.id === ord.customer_id);
        if (cus) {
          cus.points = (cus.points || 0) + Math.floor((ord.total_amount || 0) / 25);
          cus.total_spent = Math.round(((cus.total_spent || 0) + (ord.total_amount || 0)) * 100) / 100;
          cus.visit_count = (cus.visit_count || 0) + 1;
        }
      }
    }
    saveLocalDb(db);
    return { success: true, orderId, data: buildLocalBootstrap() };
  },

  returnItem(body) {
    const db = loadLocalDb();
    const now = new Date().toISOString();
    const { order_item_id, table_id, product_id, mode = 'RETURNED_RESTOCK', reason_note = '' } = body;
    let target = null;
    if (order_item_id) {
      target = db.orderItems.find(i => i.id === order_item_id);
    } else if (table_id && product_id) {
      const tbl = db.tables.find(t => t.id === table_id);
      if (tbl && tbl.current_order_id) {
        target = db.orderItems.find(i => i.order_id === tbl.current_order_id && i.product_id === product_id && i.item_status === 'ACTIVE');
      }
    }
    if (target) {
      const validMode = mode === 'VOID_WASTE' ? 'VOID_WASTE' : 'RETURNED_RESTOCK';
      target.item_status = validMode;
      target.kitchen_status = target.item_type === 'FOOD' ? 'CANCEL_REQUESTED' : 'NONE';
      const prod = db.products.find(p => p.id === target.product_id);
      if (validMode === 'RETURNED_RESTOCK' && prod && prod.item_type === 'GROCERY') {
        prod.stock_qty = Math.round((prod.stock_qty + target.quantity) * 100) / 100;
        db.inventoryLogs.unshift({ id: `LOG-${Date.now()}`, target_type: 'GROCERY', product_id: prod.id, item_name: prod.name, change_qty: target.quantity, balance_after: prod.stock_qty, unit: prod.unit, reason: 'RETURN_FROM_TABLE', reference_id: target.order_id, note: reason_note || 'คืนของชำเข้าสต็อก', created_at: now });
      }
      recalcLocalOrder(db, target.order_id);
      saveLocalDb(db);
    }
    return { success: true, data: buildLocalBootstrap() };
  },

  cancelOrder(body) {
    const db = loadLocalDb();
    const now = new Date().toISOString();
    const { order_id, mode = 'RETURNED_RESTOCK', reason_note = '' } = body;
    const ord = db.orders.find(o => o.id === order_id);
    if (!ord) return { error: 'ไม่พบบิลที่ต้องการยกเลิก' };
    const wasPaid = ord.status === 'PAID';
    const nextStatus = wasPaid ? 'VOIDED' : 'CANCELLED';
    const validMode = mode === 'VOID_WASTE' ? 'VOID_WASTE' : 'RETURNED_RESTOCK';

    const items = db.orderItems.filter(i => i.order_id === order_id && i.item_status === 'ACTIVE');
    for (const it of items) {
      it.item_status = validMode;
      it.kitchen_status = it.item_type === 'FOOD' ? (wasPaid ? 'CANCELLED_ACK' : 'CANCEL_REQUESTED') : 'NONE';
      if (validMode === 'RETURNED_RESTOCK' && it.item_type === 'GROCERY') {
        const prod = db.products.find(p => p.id === it.product_id);
        if (prod) {
          prod.stock_qty = Math.round((prod.stock_qty + it.quantity) * 100) / 100;
          db.inventoryLogs.unshift({ id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, target_type: 'GROCERY', product_id: prod.id, item_name: prod.name, change_qty: it.quantity, balance_after: prod.stock_qty, unit: prod.unit, reason: wasPaid ? 'VOID_INVOICE_RESTOCK' : 'CANCEL_BILL_RESTOCK', reference_id: order_id, note: reason_note || 'ยกเลิกบิลคืนสต็อก', created_at: now });
        }
      }
    }

    ord.status = nextStatus;
    const suffix = reason_note ? ` [ยกเลิก: ${reason_note}]` : (wasPaid ? ' [ยกเลิก Invoice]' : ' [ยกเลิกบิล]');
    ord.bill_note = ((ord.bill_note || '') + suffix).trim();

    if (ord.table_id) {
      const tbl = db.tables.find(t => t.id === ord.table_id);
      if (tbl && tbl.current_order_id === ord.id) {
        tbl.status = 'AVAILABLE';
        tbl.current_order_id = null;
      }
    }

    if (wasPaid && ord.customer_id && Array.isArray(db.customers)) {
      const cus = db.customers.find(c => c.id === ord.customer_id);
      if (cus) {
        const pts = Math.floor((ord.total_amount || 0) / 25);
        cus.points = Math.max(0, (cus.points || 0) - pts);
        cus.total_spent = Math.max(0, Math.round(((cus.total_spent || 0) - (ord.total_amount || 0)) * 100) / 100);
      }
    }

    saveLocalDb(db);
    return { success: true, status: nextStatus, data: buildLocalBootstrap() };
  },

  transferOrder(body) {
    const db = loadLocalDb();
    const { source_order_id, action, target_table_id = null, target_order_id = null } = body;
    const srcOrd = db.orders.find(o => o.id === source_order_id && o.status === 'OPEN');
    if (!srcOrd) return { error: 'ไม่พบบิลต้นทางที่เปิดอยู่' };

    if (action === 'MOVE_TO_TABLE') {
      const targetTbl = db.tables.find(t => t.id === target_table_id);
      if (!targetTbl) return { error: 'ไม่พบโต๊ะปลายทาง' };
      if (srcOrd.table_id && srcOrd.table_id !== targetTbl.id) {
        const oldTbl = db.tables.find(t => t.id === srcOrd.table_id);
        if (oldTbl) {
          oldTbl.status = 'AVAILABLE';
          oldTbl.current_order_id = null;
        }
      }
      srcOrd.order_type = 'DINE_IN';
      srcOrd.table_id = targetTbl.id;
      if (!srcOrd.bill_title || srcOrd.bill_title.startsWith('โต๊ะ ') || srcOrd.bill_title.startsWith('พักบิล')) {
        srcOrd.bill_title = targetTbl.name;
      }
      targetTbl.status = 'OCCUPIED';
      targetTbl.current_order_id = srcOrd.id;
      saveLocalDb(db);
      return { success: true, orderId: srcOrd.id, data: buildLocalBootstrap() };
    }

    if (action === 'MOVE_TO_HELD') {
      if (srcOrd.table_id) {
        const oldTbl = db.tables.find(t => t.id === srcOrd.table_id);
        if (oldTbl) {
          oldTbl.status = 'AVAILABLE';
          oldTbl.current_order_id = null;
        }
      }
      srcOrd.order_type = 'RETAIL';
      srcOrd.table_id = null;
      srcOrd.bill_title = srcOrd.bill_title || `พักบิล (${srcOrd.id})`;
      saveLocalDb(db);
      return { success: true, orderId: srcOrd.id, data: buildLocalBootstrap() };
    }

    if (action === 'MERGE_BILL') {
      let destOrd = target_order_id ? db.orders.find(o => o.id === target_order_id && o.status === 'OPEN') : null;
      if (!destOrd && target_table_id) {
        const tTbl = db.tables.find(t => t.id === target_table_id);
        if (tTbl && tTbl.current_order_id) {
          destOrd = db.orders.find(o => o.id === tTbl.current_order_id && o.status === 'OPEN');
        }
      }
      if (!destOrd || destOrd.id === srcOrd.id) return { error: 'ไม่พบบิลปลายทางที่จะรวม' };

      for (const it of db.orderItems) {
        if (it.order_id === srcOrd.id) it.order_id = destOrd.id;
      }
      if (srcOrd.table_id) {
        const oldTbl = db.tables.find(t => t.id === srcOrd.table_id);
        if (oldTbl) {
          oldTbl.status = 'AVAILABLE';
          oldTbl.current_order_id = null;
        }
      }
      db.orders = db.orders.filter(o => o.id !== srcOrd.id);
      recalcLocalOrder(db, destOrd.id);
      saveLocalDb(db);
      return { success: true, orderId: destOrd.id, data: buildLocalBootstrap() };
    }
    return { error: 'คำสั่งไม่ถูกต้อง' };
  },

  splitOrder(body) {
    const db = loadLocalDb();
    const now = new Date().toISOString();
    const { source_order_id, split_items = [], new_bill_title = '' } = body;
    const srcOrd = db.orders.find(o => o.id === source_order_id && o.status === 'OPEN');
    if (!srcOrd) return { error: 'ไม่พบบิลต้นทาง' };

    const newOrderId = `ORD-${Date.now().toString().slice(-6)}`;
    db.orders.unshift({
      id: newOrderId,
      order_type: 'RETAIL',
      table_id: null,
      bill_title: new_bill_title.trim() || `แยกจ่ายจาก ${srcOrd.bill_title || srcOrd.id}`,
      bill_note: `แยกบิลจาก ${srcOrd.id}`,
      customer_id: srcOrd.customer_id || null,
      customer_name: srcOrd.customer_name || '',
      status: 'OPEN',
      subtotal: 0,
      discount: 0,
      total_amount: 0,
      total_cost: 0,
      payment_method: 'CASH',
      cash_received: 0,
      change_amount: 0,
      created_at: now,
      paid_at: null
    });

    for (const sp of split_items) {
      const it = db.orderItems.find(x => x.id === sp.order_item_id && x.order_id === srcOrd.id && x.item_status === 'ACTIVE');
      const reqQty = Number(sp.split_qty !== undefined ? sp.split_qty : sp.quantity) || 0;
      const moveQty = Math.min(Number(it?.quantity || 0), Math.max(0, reqQty));
      if (!it || moveQty <= 0) continue;

      if (moveQty >= it.quantity) {
        it.order_id = newOrderId;
      } else {
        it.quantity -= moveQty;
        db.orderItems.push({
          ...it,
          id: `OI-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          order_id: newOrderId,
          quantity: moveQty,
          created_at: now
        });
      }
    }

    recalcLocalOrder(db, srcOrd.id);
    recalcLocalOrder(db, newOrderId);

    const remainingActive = db.orderItems.filter(x => x.order_id === srcOrd.id && x.item_status === 'ACTIVE');
    if (remainingActive.length === 0) {
      if (srcOrd.table_id) {
        const tbl = db.tables.find(t => t.id === srcOrd.table_id);
        if (tbl && tbl.current_order_id === srcOrd.id) {
          tbl.status = 'AVAILABLE';
          tbl.current_order_id = null;
        }
      }
      db.orders = db.orders.filter(o => o.id !== srcOrd.id);
    }

    saveLocalDb(db);
    return { success: true, newOrderId, data: buildLocalBootstrap() };
  },

  checkoutOrder(body) {
    const db = loadLocalDb();
    const now = new Date().toISOString();
    const { order_id, table_id, payment_method = 'CASH', discount = 0, cash_received = 0, customer_id, customer_name, redeem_points = 0 } = body;
    const ord = db.orders.find(o => o.id === order_id || (table_id && o.table_id === table_id && o.status === 'OPEN'));
    let change = 0;
    if (ord) {
      ord.discount = Number(discount) || 0;
      if (customer_id !== undefined) ord.customer_id = customer_id;
      if (customer_name !== undefined) ord.customer_name = customer_name;
      recalcLocalOrder(db, ord.id);
      const rec = Number(cash_received) >= ord.total_amount ? Number(cash_received) : ord.total_amount;
      change = Math.round(Math.max(0, rec - ord.total_amount) * 100) / 100;
      ord.status = 'PAID';
      ord.payment_method = payment_method;
      ord.cash_received = rec;
      ord.change_amount = change;
      ord.paid_at = now;
      if (ord.table_id) {
        const tbl = db.tables.find(t => t.id === ord.table_id);
        if (tbl) {
          tbl.status = 'AVAILABLE';
          tbl.current_order_id = null;
        }
      }
      if (ord.customer_id && Array.isArray(db.customers)) {
        const cus = db.customers.find(c => c.id === ord.customer_id);
        if (cus) {
          const cfg = db.loyaltySettings || { spend_per_point: 25, points_earned: 1 };
          const usedPts = Math.min(cus.points || 0, Math.max(0, Math.floor(Number(redeem_points) || 0)));
          const earned = Math.floor(((ord.total_amount || 0) / (cfg.spend_per_point || 25)) * (cfg.points_earned || 1));
          cus.points = Math.max(0, (cus.points || 0) - usedPts + earned);
          cus.total_spent = Math.round(((cus.total_spent || 0) + (ord.total_amount || 0)) * 100) / 100;
          cus.visit_count = (cus.visit_count || 0) + 1;
        }
      }
      saveLocalDb(db);
    }
    return { success: true, change, data: buildLocalBootstrap() };
  },

  updateOrderMeta(body) {
    const db = loadLocalDb();
    const { order_id, bill_title = '', bill_note = '', customer_id = null, customer_name = '' } = body;
    const ord = db.orders.find(o => o.id === order_id);
    if (ord) {
      ord.bill_title = bill_title;
      ord.bill_note = bill_note;
      ord.customer_id = customer_id;
      ord.customer_name = customer_name;
      saveLocalDb(db);
    }
    return { success: true, data: buildLocalBootstrap() };
  },

  saveCustomer(body) {
    const db = loadLocalDb();
    if (!Array.isArray(db.customers)) db.customers = [];
    const cusId = body.id || `CUS-${Date.now().toString().slice(-4)}`;
    const existing = db.customers.find(c => c.id === cusId);
    if (existing) {
      Object.assign(existing, {
        name: body.name,
        phone: body.phone || '',
        tier: body.tier || 'ขาประจำ',
        points: Number(body.points) || existing.points || 0,
        note: body.note || ''
      });
    } else {
      db.customers.unshift({
        id: cusId,
        name: body.name,
        phone: body.phone || '',
        tier: body.tier || 'สมาชิกใหม่',
        points: Number(body.points) || 10,
        total_spent: 0,
        visit_count: 0,
        note: body.note || ''
      });
    }
    saveLocalDb(db);
    return { success: true, cusId, data: buildLocalBootstrap() };
  },

  saveLoyaltySettings(body) {
    const db = loadLocalDb();
    db.loyaltySettings = { ...(db.loyaltySettings || {}), ...body };
    saveLocalDb(db);
    return { success: true, loyaltySettings: db.loyaltySettings, data: buildLocalBootstrap() };
  },

  updateKds(body) {
    const db = loadLocalDb();
    const item = db.orderItems.find(i => i.id === body.order_item_id);
    if (item) {
      item.kitchen_status = body.kitchen_status;
      saveLocalDb(db);
    }
    return { success: true, data: buildLocalBootstrap() };
  },

  stockIn(body) {
    const db = loadLocalDb();
    const now = new Date().toISOString();
    const todayStr = now.slice(0, 10);
    const receiptId = `RCV-${todayStr.replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;
    let totalCost = 0;
    const lines = [];

    for (const line of body.items || []) {
      const inputQty = Number(line.input_qty);
      if (!inputQty || inputQty <= 0) continue;
      const lineCost = Math.max(0, Number(line.total_line_cost) || 0);
      totalCost += lineCost;

      if (line.item_target_type === 'GROCERY') {
        const prod = db.products.find(p => p.id === line.target_id);
        if (!prod) continue;
        const conv = line.use_purchase_unit ? (prod.conversion_rate || 1) : 1;
        const before = prod.stock_qty;
        const added = Math.round(inputQty * conv * 100) / 100;
        const after = Math.round((before + added) * 100) / 100;
        const costBefore = Number(prod.cost) || 0;
        let baseCost = costBefore;
        if (added > 0 && lineCost > 0) {
          baseCost = Math.round(((before * costBefore + lineCost) / (before + added)) * 100) / 100;
        }
        prod.cost = baseCost;
        prod.stock_qty = after;
        lines.push({ id: `SRI-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, receipt_id: receiptId, item_target_type: 'GROCERY', product_id: prod.id, item_name: prod.name, unit_label: line.use_purchase_unit ? prod.purchase_unit : prod.unit, input_qty: inputQty, conversion_rate: conv, qty_before: before, qty_added: added, qty_after: after, cost_before: costBefore, purchase_cost_per_base_unit: baseCost, total_line_cost: lineCost });
        db.inventoryLogs.unshift({ id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, target_type: 'GROCERY', product_id: prod.id, item_name: prod.name, change_qty: added, balance_after: after, unit: prod.unit, reason: 'STOCK_IN_RECEIPT', reference_id: receiptId, note: `นำเข้า ${inputQty} ${line.use_purchase_unit ? prod.purchase_unit : prod.unit} [COST_BEFORE=${costBefore}]`, created_at: now });
      } else {
        const ing = db.ingredients.find(i => i.id === line.target_id);
        if (!ing) continue;
        const conv = line.use_purchase_unit ? (ing.conversion_rate || 1) : 1;
        const before = ing.current_qty;
        const added = Math.round(inputQty * conv * 100) / 100;
        const after = Math.round((before + added) * 100) / 100;
        const costBefore = Number(ing.cost_per_unit) || 0;
        let baseCost = costBefore;
        if (added > 0 && lineCost > 0) {
          baseCost = Math.round(((before * costBefore + lineCost) / (before + added)) * 10000) / 10000;
        }
        ing.cost_per_unit = baseCost;
        ing.current_qty = after;
        lines.push({ id: `SRI-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, receipt_id: receiptId, item_target_type: 'INGREDIENT', ingredient_id: ing.id, item_name: ing.name, unit_label: line.use_purchase_unit ? ing.purchase_unit : ing.stock_unit, input_qty: inputQty, conversion_rate: conv, qty_before: before, qty_added: added, qty_after: after, cost_before: costBefore, purchase_cost_per_base_unit: baseCost, total_line_cost: lineCost });
        db.inventoryLogs.unshift({ id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, target_type: 'INGREDIENT', ingredient_id: ing.id, item_name: ing.name, change_qty: added, balance_after: after, unit: ing.stock_unit, reason: 'STOCK_IN_RECEIPT', reference_id: receiptId, note: `นำเข้า ${inputQty} ${line.use_purchase_unit ? ing.purchase_unit : ing.stock_unit} [COST_BEFORE=${costBefore}]`, created_at: now });
      }
    }

    db.stockInReceipts.unshift({ id: receiptId, receipt_type: 'MIXED', supplier_name: body.supplier_name || 'ร้านค้าส่ง', note: body.note || '', total_cost: totalCost, record_as_expense: Boolean(body.record_as_expense), created_by: 'เจ้าของร้าน', created_at: now, items: lines });
    if (body.record_as_expense && totalCost > 0) {
      db.expenses.unshift({ id: `EXP-${Date.now().toString().slice(-5)}`, category: 'STOCK_IN', title: `รับของเข้าสต็อก (${receiptId})`, amount: totalCost, expense_date: todayStr, reference_id: receiptId, created_at: now });
    }
    saveLocalDb(db);
    return { success: true, receiptId, data: buildLocalBootstrap() };
  },

  updateStockInReceipt(body) {
    const db = loadLocalDb();
    const { receipt_id, supplier_name = 'ร้านค้าส่ง', note = '', items = [] } = body;
    const rec = (db.stockInReceipts || []).find(r => r.id === receipt_id);
    if (!rec) return { error: 'ไม่พบใบรับของ' };
    for (const oldIt of rec.items || []) {
      if (oldIt.item_target_type === 'GROCERY' && oldIt.product_id) {
        const prod = db.products.find(p => p.id === oldIt.product_id);
        if (prod) prod.stock_qty = Math.max(0, Math.round((prod.stock_qty - (oldIt.qty_added || 0)) * 100) / 100);
      } else if (oldIt.item_target_type === 'INGREDIENT' && oldIt.ingredient_id) {
        const ing = db.ingredients.find(i => i.id === oldIt.ingredient_id);
        if (ing) ing.current_qty = Math.max(0, Math.round((ing.current_qty - (oldIt.qty_added || 0)) * 100) / 100);
      }
    }
    let totalCost = 0;
    const newLines = [];
    for (const line of items) {
      const inputQty = Math.max(0, Number(line.input_qty) || 0);
      if (inputQty <= 0) continue;
      const conv = Math.max(1, Number(line.conversion_rate) || 1);
      const lineCost = Math.max(0, Number(line.total_line_cost) || 0);
      totalCost += lineCost;
      if (line.item_target_type === 'GROCERY' && line.product_id) {
        const prod = db.products.find(p => p.id === line.product_id);
        if (!prod) continue;
        const before = prod.stock_qty;
        const added = Math.round(inputQty * conv * 100) / 100;
        const after = Math.round((before + added) * 100) / 100;
        prod.stock_qty = after;
        newLines.push({ ...line, input_qty: inputQty, conversion_rate: conv, qty_before: before, qty_added: added, qty_after: after, total_line_cost: lineCost });
      } else if (line.item_target_type === 'INGREDIENT' && line.ingredient_id) {
        const ing = db.ingredients.find(i => i.id === line.ingredient_id);
        if (!ing) continue;
        const before = ing.current_qty;
        const added = Math.round(inputQty * conv * 100) / 100;
        const after = Math.round((before + added) * 100) / 100;
        ing.current_qty = after;
        newLines.push({ ...line, input_qty: inputQty, conversion_rate: conv, qty_before: before, qty_added: added, qty_after: after, total_line_cost: lineCost });
      }
    }
    rec.supplier_name = supplier_name;
    rec.note = note;
    rec.total_cost = totalCost;
    rec.items = newLines;
    saveLocalDb(db);
    return { success: true, receiptId: receipt_id, data: buildLocalBootstrap() };
  },

  deleteStockInReceipt(body) {
    const db = loadLocalDb();
    const { receipt_id } = body;
    const now = new Date().toISOString();
    const rec = (db.stockInReceipts || []).find(r => r.id === receipt_id);
    if (rec) {
      if (!Array.isArray(db.inventoryLogs)) db.inventoryLogs = [];
      for (const oldIt of rec.items || []) {
        let currentStock = 0;
        let unit = 'ชิ้น';
        let name = oldIt.product_name || oldIt.ingredient_name || 'สินค้า';
        if (oldIt.item_target_type === 'GROCERY' && oldIt.product_id) {
          const prod = db.products.find(p => p.id === oldIt.product_id);
          if (prod) {
            const curStock = Number(prod.stock_qty) || 0;
            const reverted = Math.max(0, Math.round((curStock - (oldIt.qty_added || 0)) * 100) / 100);
            prod.stock_qty = reverted;
            if (oldIt.cost_before !== undefined && oldIt.cost_before !== null && Number(oldIt.cost_before) >= 0) {
              prod.cost = Number(oldIt.cost_before);
            } else {
              const lineCost = Number(oldIt.total_line_cost) || 0;
              if (reverted > 0 && lineCost > 0) {
                const derived = Math.round(((curStock * Number(prod.cost) - lineCost) / reverted) * 100) / 100;
                if (derived > 0) prod.cost = derived;
              }
            }
            currentStock = prod.stock_qty;
            unit = prod.unit || 'ชิ้น';
            name = prod.name || name;
          }
        } else if (oldIt.item_target_type === 'INGREDIENT' && oldIt.ingredient_id) {
          const ing = db.ingredients.find(i => i.id === oldIt.ingredient_id);
          if (ing) {
            const curStock = Number(ing.current_qty) || 0;
            const reverted = Math.max(0, Math.round((curStock - (oldIt.qty_added || 0)) * 100) / 100);
            ing.current_qty = reverted;
            if (oldIt.cost_before !== undefined && oldIt.cost_before !== null && Number(oldIt.cost_before) >= 0) {
              ing.cost_per_unit = Number(oldIt.cost_before);
            } else {
              const lineCost = Number(oldIt.total_line_cost) || 0;
              if (reverted > 0 && lineCost > 0) {
                const derived = Math.round(((curStock * Number(ing.cost_per_unit) - lineCost) / reverted) * 10000) / 10000;
                if (derived > 0) ing.cost_per_unit = derived;
              }
            }
            currentStock = ing.current_qty;
            unit = ing.stock_unit || 'กรัม';
            name = ing.name || name;
          }
        }
        db.inventoryLogs.unshift({
          id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          target_type: oldIt.item_target_type,
          product_id: oldIt.product_id || null,
          ingredient_id: oldIt.ingredient_id || null,
          item_name: name,
          change_qty: -Number(oldIt.qty_added),
          balance_after: currentStock,
          unit,
          reason: 'CANCEL_STOCK_IN',
          reference_id: receipt_id,
          note: `ลบใบรับของ #${receipt_id} (หักคืนสต็อก -${oldIt.qty_added} ${unit})`,
          created_at: now
        });
      }
      db.stockInReceipts = (db.stockInReceipts || []).filter(r => r.id !== receipt_id);
      db.expenses = (db.expenses || []).filter(e => e.reference_id !== receipt_id);
      saveLocalDb(db);
    }
    return { success: true, data: buildLocalBootstrap() };
  },

  updateProductThreshold(body) {
    const db = loadLocalDb();
    const { product_id, threshold, items: batchItems } = body;
    if (Array.isArray(batchItems)) {
      for (const item of batchItems) {
        const prod = (db.products || []).find(p => p.id === item.id);
        if (prod) prod.low_stock_threshold = Math.max(0, Number(item.threshold) || 0);
      }
    } else if (product_id) {
      const prod = (db.products || []).find(p => p.id === product_id);
      if (prod) prod.low_stock_threshold = Math.max(0, Number(threshold) || 0);
    }
    saveLocalDb(db);
    return { success: true, data: buildLocalBootstrap() };
  },

  saveProduct(body) {
    const db = loadLocalDb();
    const prodId = body.id || `${body.item_type === 'FOOD' ? 'F' : 'G'}-${Date.now().toString().slice(-4)}`;
    const aliases = Array.isArray(body.voice_aliases) ? body.voice_aliases : String(body.voice_aliases || '').split(',').map(s => s.trim()).filter(Boolean);
    const modGrpIds = Array.isArray(body.modifier_group_ids) ? body.modifier_group_ids : [];
    const catId = body.category_id || (body.item_type === 'FOOD' ? 'CAT-RICE' : 'CAT-DRINK');
    const existing = db.products.find(p => p.id === prodId);
    if (existing) {
      Object.assign(existing, {
        name: body.name,
        category_id: catId,
        barcode: body.barcode !== undefined ? (body.barcode || null) : existing.barcode,
        price: Number(body.price),
        cost: Number(body.cost),
        unit: body.unit || existing.unit || 'ชิ้น',
        purchase_unit: body.purchase_unit || existing.purchase_unit || 'แพ็ค',
        conversion_rate: Number(body.conversion_rate) || existing.conversion_rate || 1,
        stock_qty: body.stock_qty !== undefined ? Number(body.stock_qty) : existing.stock_qty,
        low_stock_threshold: body.low_stock_threshold !== undefined ? Number(body.low_stock_threshold) : (existing.low_stock_threshold ?? 5),
        modifier_group_ids: modGrpIds,
        voice_aliases: aliases
      });
    } else {
      db.products.push({
        id: prodId,
        category_id: catId,
        barcode: body.barcode || null,
        name: body.name,
        voice_aliases: aliases,
        price: Number(body.price) || 0,
        cost: Number(body.cost) || 0,
        unit: body.unit || 'ชิ้น',
        purchase_unit: body.purchase_unit || 'แพ็ค',
        conversion_rate: Number(body.conversion_rate) || 1,
        item_type: body.item_type || 'GROCERY',
        track_stock: body.item_type === 'GROCERY',
        stock_qty: Number(body.stock_qty) || 0,
        low_stock_threshold: Number(body.low_stock_threshold) || 5,
        modifier_group_ids: modGrpIds,
        send_to_kitchen: body.item_type === 'FOOD'
      });
    }
    if (body.item_type === 'FOOD' && Array.isArray(body.recipe_items)) {
      db.recipeItems = db.recipeItems.filter(r => r.product_id !== prodId);
      for (const r of body.recipe_items) {
        if (r.ingredient_id && Number(r.quantity_used) > 0) {
          db.recipeItems.push({ id: `REC-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, product_id: prodId, ingredient_id: r.ingredient_id, quantity_used: Number(r.quantity_used) });
        }
      }
    }
    saveLocalDb(db);
    return { success: true, prodId, data: buildLocalBootstrap() };
  },

  saveIngredient(body) {
    const db = loadLocalDb();
    const ingId = body.id || `ING-${Date.now().toString().slice(-4)}`;
    const existing = db.ingredients.find(i => i.id === ingId);
    if (existing) {
      Object.assign(existing, {
        name: body.name,
        stock_unit: body.stock_unit || existing.stock_unit || 'กรัม',
        purchase_unit: body.purchase_unit || existing.purchase_unit || 'กิโลกรัม',
        conversion_rate: Number(body.conversion_rate) || existing.conversion_rate || 1000,
        current_qty: body.current_qty !== undefined ? Number(body.current_qty) : existing.current_qty,
        cost_per_unit: body.cost_per_unit !== undefined ? Number(body.cost_per_unit) : existing.cost_per_unit
      });
    } else {
      db.ingredients.push({
        id: ingId,
        name: body.name,
        stock_unit: body.stock_unit || 'กรัม',
        purchase_unit: body.purchase_unit || 'กิโลกรัม',
        conversion_rate: Number(body.conversion_rate) || 1000,
        current_qty: Number(body.current_qty) || 0,
        cost_per_unit: Number(body.cost_per_unit) || 0.15,
        low_stock_threshold: 500
      });
    }
    saveLocalDb(db);
    return { success: true, ingId, data: buildLocalBootstrap() };
  },

  saveTable(body) {
    const db = loadLocalDb();
    if (body.id) {
      const existing = db.tables.find(t => t.id === body.id);
      if (existing) {
        existing.name = body.name;
        existing.zone_name = body.zone_name || existing.zone_name || 'โซนในร้าน';
        existing.voice_aliases = [body.name, body.name.replace(/\s+/g, '')];
        saveLocalDb(db);
        return { success: true, tblId: existing.id, data: buildLocalBootstrap() };
      }
    }
    const tblId = `T${Date.now().toString().slice(-4)}`;
    db.tables.push({
      id: tblId,
      name: body.name,
      zone_name: body.zone_name || 'โซนในร้าน',
      voice_aliases: [body.name, body.name.replace(/\s+/g, '')],
      status: 'AVAILABLE',
      current_order_id: null
    });
    saveLocalDb(db);
    return { success: true, tblId, data: buildLocalBootstrap() };
  },

  deleteTable(body) {
    const db = loadLocalDb();
    const tbl = db.tables.find(t => t.id === body.id);
    if (tbl && tbl.status === 'OCCUPIED') {
      return { error: 'ไม่สามารถลบโต๊ะที่มีบิลเปิดอยู่ได้' };
    }
    db.tables = db.tables.filter(t => t.id !== body.id);
    saveLocalDb(db);
    return { success: true, data: buildLocalBootstrap() };
  },

  deleteCustomer(body) {
    const db = loadLocalDb();
    db.customers = (db.customers || []).filter(c => c.id !== body.id);
    saveLocalDb(db);
    return { success: true, data: buildLocalBootstrap() };
  },

  deleteIngredient(body) {
    const db = loadLocalDb();
    db.recipeItems = db.recipeItems.filter(r => r.ingredient_id !== body.id);
    db.ingredients = db.ingredients.filter(i => i.id !== body.id);
    saveLocalDb(db);
    return { success: true, data: buildLocalBootstrap() };
  },

  deleteProduct(body) {
    const db = loadLocalDb();
    db.recipeItems = db.recipeItems.filter(r => r.product_id !== body.id);
    db.products = db.products.filter(p => p.id !== body.id);
    saveLocalDb(db);
    return { success: true, data: buildLocalBootstrap() };
  },

  saveExpense(body) {
    const db = loadLocalDb();
    const now = new Date().toISOString();
    db.expenses.unshift({
      id: `EXP-${Date.now().toString().slice(-5)}`,
      category: body.category || 'OTHER',
      title: body.title,
      amount: Number(body.amount) || 0,
      expense_date: now.slice(0, 10),
      reference_id: '',
      created_at: now
    });
    saveLocalDb(db);
    return { success: true, data: buildLocalBootstrap() };
  },

  saveCategory(body) {
    const db = loadLocalDb();
    const catId = body.id || `CAT-${Date.now().toString().slice(-4)}`;
    const existing = (db.categories || []).find(c => c.id === catId);
    if (existing) {
      existing.name = body.name.trim();
      existing.category_type = body.category_type || 'GROCERY';
    } else {
      if (!Array.isArray(db.categories)) db.categories = [];
      db.categories.push({ id: catId, name: body.name.trim(), category_type: body.category_type || 'GROCERY' });
    }
    saveLocalDb(db);
    return { success: true, catId, data: buildLocalBootstrap() };
  },

  deleteCategory(body) {
    const db = loadLocalDb();
    const cat = (db.categories || []).find(c => c.id === body.id);
    const fallbackCat = cat && cat.category_type === 'FOOD' ? 'CAT-RICE' : 'CAT-DRINK';
    for (const p of db.products || []) {
      if (p.category_id === body.id) p.category_id = fallbackCat;
    }
    db.categories = (db.categories || []).filter(c => c.id !== body.id);
    saveLocalDb(db);
    return { success: true, data: buildLocalBootstrap() };
  },

  saveModifierGroup(body) {
    const db = loadLocalDb();
    const grpId = body.id || `GRP-${Date.now().toString().slice(-4)}`;
    if (!Array.isArray(db.modifierGroups)) db.modifierGroups = [];
    const existing = db.modifierGroups.find(g => g.id === grpId);
    if (existing) {
      existing.name = body.name.trim();
      existing.selection_type = body.selection_type || 'MULTIPLE';
      existing.is_required = Boolean(body.is_required);
      existing.sort_order = Number(body.sort_order) || 0;
    } else {
      db.modifierGroups.push({
        id: grpId,
        name: body.name.trim(),
        selection_type: body.selection_type || 'MULTIPLE',
        is_required: Boolean(body.is_required),
        sort_order: Number(body.sort_order) || 0
      });
    }
    saveLocalDb(db);
    return { success: true, grpId, data: buildLocalBootstrap() };
  },

  deleteModifierGroup(body) {
    const db = loadLocalDb();
    db.modifierGroups = (db.modifierGroups || []).filter(g => g.id !== body.id);
    db.modifiers = (db.modifiers || []).filter(m => m.group_id !== body.id);
    for (const p of db.products || []) {
      if (Array.isArray(p.modifier_group_ids)) {
        p.modifier_group_ids = p.modifier_group_ids.filter(gid => gid !== body.id);
      }
    }
    saveLocalDb(db);
    return { success: true, data: buildLocalBootstrap() };
  },

  saveModifier(body) {
    const db = loadLocalDb();
    const modId = body.id || `MOD-${Date.now().toString().slice(-4)}`;
    if (!Array.isArray(db.modifiers)) db.modifiers = [];
    const vKw = Array.isArray(body.voice_keywords) ? body.voice_keywords : String(body.voice_keywords || '').split(',').map(s => s.trim()).filter(Boolean);
    const existing = db.modifiers.find(m => m.id === modId);
    if (existing) {
      existing.name = body.name.trim();
      existing.group_id = body.group_id || null;
      existing.extra_price = Number(body.extra_price) || 0;
      existing.extra_cost = Number(body.extra_cost) || 0;
      existing.voice_keywords = vKw;
    } else {
      db.modifiers.push({
        id: modId,
        group_id: body.group_id || null,
        name: body.name.trim(),
        extra_price: Number(body.extra_price) || 0,
        extra_cost: Number(body.extra_cost) || 0,
        voice_keywords: vKw
      });
    }
    saveLocalDb(db);
    return { success: true, modId, data: buildLocalBootstrap() };
  },

  deleteModifier(body) {
    const db = loadLocalDb();
    db.modifiers = (db.modifiers || []).filter(m => m.id !== body.id);
    saveLocalDb(db);
    return { success: true, data: buildLocalBootstrap() };
  }
};

