const { db } = require('./db');

const THAI_NUM_MAP = {
  'ครึ่ง': 1,
  'หนึ่ง': 1,
  'นึง': 1,
  'สอง': 2,
  'คู่': 2,
  'สาม': 3,
  'สี่': 4,
  'ห้า': 5,
  'หก': 6,
  'เจ็ด': 7,
  'แปด': 8,
  'เก้า': 9,
  'สิบ': 10,
  'สิบเอ็ด': 11,
  'สิบสอง': 12,
  'โหล': 12
};

function normalizeThaiNumbers(text) {
  let out = text;
  const keys = Object.keys(THAI_NUM_MAP).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    // Replace Thai number words when preceded by space/product/table context
    const re = new RegExp(`(โต๊ะ\\s*|เบอร์\\s*|ซุ้ม\\s*|เอา\\s*|จำนวน\\s*|\\s+)${k}(?=\\s|$|จาน|ถ้วย|ขวด|ซอง|ห่อ|ถัง|ชิ้น|กล่อง|แพ็ค|ฟอง)`, 'g');
    out = out.replace(re, `$1${THAI_NUM_MAP[k]}`);
  }
  // Also standalone at end of string
  for (const k of keys) {
    const reEnd = new RegExp(`${k}$`);
    if (reEnd.test(out)) {
      out = out.replace(reEnd, ` ${THAI_NUM_MAP[k]}`);
    }
  }
  return out;
}

function getRecipePreviewForProduct(productId, modifierIds, quantity) {
  const prodRecipes = db.prepare(`
    SELECT r.ingredient_id, i.name, i.stock_unit, i.current_qty, i.cost_per_unit, r.quantity_used
    FROM recipe_items r
    JOIN ingredients i ON r.ingredient_id = i.id
    WHERE r.product_id = ?
  `).all(productId);

  const modRecipes = modifierIds.length > 0
    ? db.prepare(`
        SELECT r.ingredient_id, i.name, i.stock_unit, i.current_qty, i.cost_per_unit, r.quantity_used
        FROM recipe_items r
        JOIN ingredients i ON r.ingredient_id = i.id
        WHERE r.modifier_id IN (${modifierIds.map(() => '?').join(',')})
      `).all(...modifierIds)
    : [];

  const combined = new Map();
  for (const row of [...prodRecipes, ...modRecipes]) {
    const existing = combined.get(row.ingredient_id);
    const totalUsed = row.quantity_used * quantity;
    if (existing) {
      existing.qty += totalUsed;
    } else {
      combined.set(row.ingredient_id, {
        ingredient_id: row.ingredient_id,
        name: row.name,
        qty: totalUsed,
        unit: row.stock_unit,
        current_qty: row.current_qty,
        cost_per_unit: row.cost_per_unit
      });
    }
  }
  return Array.from(combined.values());
}

function parseVoiceCommand(rawText, fallbackTableId = null) {
  const originalText = (rawText || '').trim();
  if (!originalText) {
    return {
      success: false,
      raw_text: '',
      intent: 'ORDER',
      order_type: 'RETAIL',
      table: null,
      items: [],
      message: 'กรุณาพูดหรือพิมพ์คำสั่งออเดอร์'
    };
  }

  const normalized = normalizeThaiNumbers(originalText);
  let workingText = normalized;

  // 1. Check intent: RETURN / VOID vs ORDER
  let intent = 'ORDER';
  let returnMode = 'RETURNED_RESTOCK'; // or VOID_WASTE
  if (/(คืนของ|คืนสินค้า|ขอคืน|คืน|ยกเลิก|เอาออก)/.test(workingText)) {
    intent = 'RETURN';
    if (/(เสีย|แตก|หก|ชำรุด|ของเสีย)/.test(workingText)) {
      returnMode = 'VOID_WASTE';
    }
  }

  // 2. Match Dining Table if mentioned
  const allTables = db.prepare('SELECT * FROM dining_tables ORDER BY id').all();
  let matchedTable = null;

  for (const t of allTables) {
    let aliases = [];
    try { aliases = JSON.parse(t.voice_aliases || '[]'); } catch { aliases = []; }
    const candidates = [t.name, ...aliases].sort((a, b) => b.length - a.length);
    for (const cand of candidates) {
      const noSpaceCand = cand.replace(/\s+/g, '\\s*');
      const re = new RegExp(noSpaceCand, 'i');
      if (re.test(workingText)) {
        matchedTable = t;
        workingText = workingText.replace(re, ' ');
        break;
      }
    }
    if (matchedTable) break;
  }

  // Also check generic "โต๊ะ X"
  if (!matchedTable) {
    const m = workingText.match(/โต๊ะ\s*(\d+)/);
    if (m) {
      const num = m[1];
      matchedTable = allTables.find(t => t.name.includes(num) || t.id === `T${num}`) || null;
      workingText = workingText.replace(m[0], ' ');
    }
  }

  if (!matchedTable && fallbackTableId) {
    matchedTable = allTables.find(t => t.id === fallbackTableId) || null;
  }

  // 3. Load all active products and modifiers
  const allProducts = db.prepare('SELECT * FROM products WHERE is_active = 1').all();
  const allModifiers = db.prepare('SELECT * FROM product_modifiers').all();

  // Build search phrases for products
  const phraseEntries = [];
  for (const p of allProducts) {
    let aliases = [];
    try { aliases = JSON.parse(p.voice_aliases || '[]'); } catch { aliases = []; }
    const names = new Set([p.name, ...aliases]);
    for (const phrase of names) {
      const cleanPhrase = phrase.trim();
      if (cleanPhrase) {
        phraseEntries.push({
          phrase: cleanPhrase,
          compactPhrase: cleanPhrase.replace(/\s+/g, ''),
          product: p
        });
      }
    }
  }
  // Sort longest phrase first so "ข้าวกะเพราหมูกรอบ" matches before "ข้าวกะเพราหมู" or "โค้ก ขวดเล็ก" before "โค้ก"
  phraseEntries.sort((a, b) => b.compactPhrase.length - a.compactPhrase.length);

  // Find all product occurrences by scanning character indices
  const matches = [];
  const occupiedRanges = [];

  const isRangeOccupied = (start, end) => {
    return occupiedRanges.some(([s, e]) => !(end <= s || start >= e));
  };

  for (const entry of phraseEntries) {
    // Create regex that allows optional spaces between words
    const escaped = entry.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
    const regex = new RegExp(escaped, 'gi');
    let m;
    while ((m = regex.exec(workingText)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (!isRangeOccupied(start, end)) {
        occupiedRanges.push([start, end]);
        matches.push({
          start,
          end,
          matchedText: m[0],
          product: entry.product
        });
      }
    }
  }

  // Sort matches in the order they were spoken
  matches.sort((a, b) => a.start - b.start);

  const parsedItems = [];

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const nextStart = i + 1 < matches.length ? matches[i + 1].start : workingText.length;
    // Context segment for this item is from current.end up to next product's start
    const tailText = workingText.slice(current.end, nextStart);

    // Extract quantity from tailText (default 1)
    let quantity = 1;
    const qtyMatch = tailText.match(/(\d+)\s*(?:จาน|ถ้วย|ขวด|ซอง|ห่อ|ถัง|ชิ้น|กล่อง|แพ็ค|ฟอง|แก้ว|ชุด)?/);
    if (qtyMatch) {
      const parsedQty = parseInt(qtyMatch[1], 10);
      if (parsedQty > 0 && parsedQty <= 100) {
        quantity = parsedQty;
      }
    } else {
      // Check Thai number word in tailText just in case
      for (const [word, val] of Object.entries(THAI_NUM_MAP)) {
        if (tailText.includes(word)) {
          quantity = val;
          break;
        }
      }
    }

    // Extract modifiers if FOOD
    const matchedModifiers = [];
    const matchedModIds = [];
    let extraPrice = 0;
    let extraCost = 0;

    if (current.product.item_type === 'FOOD') {
      // Sort modifiers by longest keyword first so "ไข่ดาวไม่สุก" can trigger both "ไข่ดาว" and "ไข่ดาวไม่สุก"
      for (const mod of allModifiers) {
        let keywords = [];
        try { keywords = JSON.parse(mod.voice_keywords || '[]'); } catch { keywords = []; }
        const allKw = [mod.name, ...keywords];
        const found = allKw.some(kw => tailText.includes(kw));
        if (found) {
          matchedModifiers.push(mod.name);
          matchedModIds.push(mod.id);
          extraPrice += mod.extra_price;
          extraCost += mod.extra_cost;
        }
      }
      // If user said "ไข่ดาวไม่สุก" or "ไข่ดาวสุกๆ", make sure "ไข่ดาว" (+10฿) is also included if not already
      if ((matchedModifiers.includes('ไข่ดาวไม่สุก') || matchedModifiers.includes('ไข่ดาวสุกๆ')) && !matchedModifiers.includes('ไข่ดาว')) {
        const eggMod = allModifiers.find(m => m.id === 'MOD-FRIED-EGG');
        if (eggMod) {
          matchedModifiers.unshift(eggMod.name);
          matchedModIds.unshift(eggMod.id);
          extraPrice += eggMod.extra_price;
          extraCost += eggMod.extra_cost;
        }
      }
    }

    const unitPrice = current.product.price + extraPrice;
    const unitCost = Math.round((current.product.cost + extraCost) * 100) / 100;

    const recipeDeductions = current.product.item_type === 'FOOD'
      ? getRecipePreviewForProduct(current.product.id, matchedModIds, quantity)
      : [];

    parsedItems.push({
      product_id: current.product.id,
      name: current.product.name,
      item_type: current.product.item_type,
      unit: current.product.unit,
      quantity,
      unit_price: unitPrice,
      unit_cost: unitCost,
      line_total: unitPrice * quantity,
      modifiers: matchedModifiers,
      send_to_kitchen: Boolean(current.product.send_to_kitchen),
      stock_qty: current.product.stock_qty,
      recipe_deductions: recipeDeductions,
      routing_label: current.product.send_to_kitchen
        ? 'ส่งเข้าจอครัว (KDS) + ตัดวัตถุดิบตามสูตร'
        : 'ตัดสต็อกของชำหน้าร้านทันที'
    });
  }

  const orderType = matchedTable ? 'DINE_IN' : 'RETAIL';

  return {
    success: parsedItems.length > 0,
    raw_text: originalText,
    normalized_text: normalized,
    intent,
    return_mode: returnMode,
    order_type: orderType,
    table: matchedTable
      ? { id: matchedTable.id, name: matchedTable.name, zone_name: matchedTable.zone_name, status: matchedTable.status }
      : null,
    items: parsedItems,
    total_preview: parsedItems.reduce((sum, item) => sum + item.line_total, 0),
    message: parsedItems.length > 0
      ? intent === 'RETURN'
        ? `ตรวจพบคำสั่งคืน/ยกเลิกสินค้า ${parsedItems.length} รายการ`
        : `แยกคำสั่งเสียงสำเร็จ ${parsedItems.length} รายการ`
      : 'ไม่พบชื่อสินค้าหรือเมนูที่ตรงกัน ลองพูดชื่อเมนู เช่น "โต๊ะ 2 กะเพราหมูสับไข่ดาว 2 โค้กเล็ก 1"'
  };
}

module.exports = {
  parseVoiceCommand,
  getRecipePreviewForProduct
};
