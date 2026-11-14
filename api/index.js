const { DEFAULT_LOYALTY_SETTINGS, computeCustomerLoyaltyUpdate, setRuntimeSupabaseConfig, getSupabaseConfig, sbRest, getSupabaseSyncCheck, getSupabaseBootstrapData } = require('../supabaseAdapter');

// ต้นทุนเฉลี่ยถ่วงน้ำหนักตามจำนวน: (ของเดิม × ทุนเดิม + ยอดซื้อล็อตใหม่) ÷ (จำนวนเดิม + จำนวนใหม่)
// หมายเหตุ: ค่าที่ได้จะถูกเก็บใน stock_in_items.purchase_cost_per_base_unit (= ต้นทุนเฉลี่ยหลังรับของใบนี้)
function weightedAverageCost(qtyBefore, oldCost, qtyAdded, lineCost, decimals = 2) {
  const oldQty = Math.max(0, Number(qtyBefore) || 0);
  const addQty = Math.max(0, Number(qtyAdded) || 0);
  const prevCost = Math.max(0, Number(oldCost) || 0);
  const buyTotal = Math.max(0, Number(lineCost) || 0);
  if (addQty <= 0 || buyTotal <= 0) return prevCost;
  const f = 10 ** decimals;
  return Math.round(((oldQty * prevCost + buyTotal) / (oldQty + addQty)) * f) / f;
}

// หาต้นทุนเดิมก่อนรับของใบนี้ เพื่อคืนค่าต้นทุนเมื่อลบ/แก้ไขใบรับของ
async function sbResolveCostBeforeReceipt(receiptId, oldIt) {
  const isGrocery = oldIt.item_target_type === 'GROCERY';
  const col = isGrocery ? 'product_id' : 'ingredient_id';
  const targetId = isGrocery ? oldIt.product_id : oldIt.ingredient_id;
  if (!targetId) return null;
  // 1) อ่านจากบันทึก [COST_BEFORE=x] ใน inventory_logs ของใบรับของนี้
  try {
    const logs = await sbRest(`inventory_logs?select=note&reference_id=eq.${encodeURIComponent(receiptId)}&${col}=eq.${encodeURIComponent(targetId)}`);
    for (const l of logs || []) {
      const m = String(l.note || '').match(/\[COST_BEFORE=([\d.]+)\]/);
      if (m) return Number(m[1]);
    }
  } catch {}
  // 2) สำรอง: ใช้ราคาทุนจากใบรับของใบก่อนหน้าของสินค้าตัวเดียวกัน
  try {
    const prev = await sbRest(`stock_in_items?select=purchase_cost_per_base_unit&${col}=eq.${encodeURIComponent(targetId)}&receipt_id=neq.${encodeURIComponent(receiptId)}&id=lt.${encodeURIComponent(oldIt.id)}&order=id.desc&limit=1`);
    if (prev && prev[0] && Number(prev[0].purchase_cost_per_base_unit) > 0) return Number(prev[0].purchase_cost_per_base_unit);
  } catch {}
  return null;
}

// คืนสต็อก + คืนต้นทุนเดิม ของรายการในใบรับของ (ใช้ทั้งตอนลบและแก้ไข)
async function sbRevertStockInItem(receiptId, oldIt) {
  const purchaseCost = Number(oldIt.purchase_cost_per_base_unit) || 0;
  const costBefore = await sbResolveCostBeforeReceipt(receiptId, oldIt);
  if (oldIt.item_target_type === 'GROCERY' && oldIt.product_id) {
    const prods = await sbRest(`products?select=*&id=eq.${encodeURIComponent(oldIt.product_id)}`);
    if (prods[0]) {
      const currentStock = Number(prods[0].stock_qty) || 0;
      const reverted = Math.max(0, Math.round((currentStock - Number(oldIt.qty_added)) * 100) / 100);
      const patch = { stock_qty: reverted };
      // คืนต้นทุนเดิมก่อนรับของใบนี้ ถ้ามีค่า costBefore หรือคำนวณย้อนกลับจากถ่วงน้ำหนักเดิม
      if (costBefore !== null && costBefore >= 0) {
        patch.cost = costBefore;
      } else {
        const lineCost = Number(oldIt.total_line_cost) || (Number(oldIt.qty_added) * purchaseCost) || 0;
        if (reverted > 0 && lineCost > 0) {
          const derivedOldCost = Math.round(((currentStock * Number(prods[0].cost) - lineCost) / reverted) * 100) / 100;
          if (derivedOldCost > 0) patch.cost = derivedOldCost;
        }
      }
      await sbRest(`products?id=eq.${encodeURIComponent(oldIt.product_id)}`, { method: 'PATCH', body: patch });
    }
  } else if (oldIt.item_target_type === 'INGREDIENT' && oldIt.ingredient_id) {
    const ings = await sbRest(`ingredients?select=*&id=eq.${encodeURIComponent(oldIt.ingredient_id)}`);
    if (ings[0]) {
      const currentStock = Number(ings[0].current_qty) || 0;
      const reverted = Math.max(0, Math.round((currentStock - Number(oldIt.qty_added)) * 100) / 100);
      const patch = { current_qty: reverted };
      if (costBefore !== null && costBefore >= 0) {
        patch.cost_per_unit = costBefore;
      } else {
        const lineCost = Number(oldIt.total_line_cost) || (Number(oldIt.qty_added) * purchaseCost) || 0;
        if (reverted > 0 && lineCost > 0) {
          const derivedOldCost = Math.round(((currentStock * Number(ings[0].cost_per_unit) - lineCost) / reverted) * 10000) / 10000;
          if (derivedOldCost > 0) patch.cost_per_unit = derivedOldCost;
        }
      }
      await sbRest(`ingredients?id=eq.${encodeURIComponent(oldIt.ingredient_id)}`, { method: 'PATCH', body: patch });
    }
  }
}

async function recalculateSupabaseOrderTotals(orderId) {
  const items = await sbRest(`order_items?select=*&order_id=eq.${encodeURIComponent(orderId)}`);
  let subtotal = 0;
  let totalCost = 0;

  for (const item of items) {
    if (item.item_status === 'ACTIVE') {
      const activeQty = Math.max(0, Number(item.quantity) - Number(item.returned_qty || 0));
      subtotal += activeQty * Number(item.unit_price);
      totalCost += activeQty * Number(item.unit_cost);
    }
  }

  const orders = await sbRest(`orders?select=discount&id=eq.${encodeURIComponent(orderId)}`);
  const discount = orders[0] ? Number(orders[0].discount || 0) : 0;
  const totalAmount = Math.max(0, subtotal - discount);

  await sbRest(`orders?id=eq.${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    body: {
      subtotal: Math.round(subtotal * 100) / 100,
      total_amount: Math.round(totalAmount * 100) / 100,
      total_cost: Math.round(totalCost * 100) / 100
    }
  });
}

// Voice Command Parser against Supabase data
const THAI_DIGIT_MAP = {
  '๐': '0', '๑': '1', '๒': '2', '๓': '3', '๔': '4',
  '๕': '5', '๖': '6', '๗': '7', '๘': '8', '๙': '9'
};

const THAI_NUM_MAP = {
  'หนึ่ง': 1, 'นึง': 1, 'สอง': 2, 'คู่': 2, 'สาม': 3, 'สี่': 4,
  'ห้า': 5, 'หก': 6, 'เจ็ด': 7, 'แปด': 8, 'เก้า': 9, 'สิบ': 10,
  'สิบเอ็ด': 11, 'สิบสอง': 12, 'สิบสาม': 13, 'สิบสี่': 14, 'สิบห้า': 15,
  'สิบหก': 16, 'สิบเจ็ด': 17, 'สิบแปด': 18, 'สิบเก้า': 19,
  'ยี่สิบ': 20, 'ยี่สิบเอ็ด': 21, 'ยี่สิบสอง': 22, 'ยี่สิบสาม': 23, 'ยี่สิบสี่': 24, 'ยี่สิบห้า': 25,
  'สามสิบ': 30, 'สี่สิบ': 40, 'ห้าสิบ': 50, 'ครึ่ง': 1, 'โหล': 12
};

const THAI_UNITS_REGEX = 'จาน|ถ้วย|ชาม|ขวด|แก้ว|กระป๋อง|ซอง|ห่อ|ถัง|ชิ้น|กล่อง|แพ็ค|ฟอง|ที่|ชุด|อัน|ถุง|ลัง|ลูก|หม้อ|กิโล|โล';

function normalizeThaiNumbers(text) {
  let out = (text || '').trim();
  if (!out) return '';

  // 1. Convert Thai digits ๑-๙ to 1-9 (Essential for iOS Safari / Apple Dictation)
  out = out.replace(/[๐-๙]/g, d => THAI_DIGIT_MAP[d] || d);

  // 2. Ensure spacing around digits if attached directly to Thai characters (e.g. กะเพรา2จาน -> กะเพรา 2 จาน)
  out = out.replace(/([ก-๙])(\d+)/g, '$1 $2 ').replace(/(\d+)([ก-๙])/g, ' $1 $2');

  // 3. Handle "[Unit]นึง" (e.g. จานนึง, แก้วนึง, ขวดนึง -> จาน 1)
  const reUnitNeung = new RegExp(`(${THAI_UNITS_REGEX})\\s*นึง`, 'g');
  out = out.replace(reUnitNeung, '$1 1');

  // 4. Convert Thai number words (sorted longest first to match สิบห้า before ห้า)
  const wordKeys = Object.keys(THAI_NUM_MAP).sort((a, b) => b.length - a.length);
  for (const k of wordKeys) {
    const val = THAI_NUM_MAP[k];
    // Word followed by unit or end of phrase
    const reWithUnit = new RegExp(`(${k})\\s*(${THAI_UNITS_REGEX}|$)`, 'g');
    out = out.replace(reWithUnit, (match, word, unit) => ` ${val} ${unit}`);

    // Word preceded by common prefixes or spaces
    const reGeneral = new RegExp(`(โต๊ะ\\s*|เบอร์\\s*|เอา\\s*|ขอ\\s*|สั่ง\\s*|เพิ่ม\\s*|\\s+)(${k})`, 'g');
    out = out.replace(reGeneral, (match, pfx, word) => `${pfx} ${val} `);

    // Standalone word
    const reStandalone = new RegExp(`(^|\\s+)(${k})(\\s+|$)`, 'g');
    out = out.replace(reStandalone, (match, p1, word, p2) => `${p1}${val}${p2}`);
  }

  return out.replace(/\s+/g, ' ').trim();
}

async function parseVoiceWithData(rawText, fallbackTableId, data) {
  const originalText = (rawText || '').trim();
  if (!originalText) {
    return { success: false, raw_text: '', intent: 'ORDER', order_type: 'RETAIL', table: null, items: [], message: 'กรุณาพูดหรือพิมพ์คำสั่งออเดอร์' };
  }
  const normalized = normalizeThaiNumbers(originalText);
  let workingText = normalized;

  let intent = 'ORDER';
  let returnMode = 'RETURNED_RESTOCK';
  if (/(คืนของ|คืนสินค้า|ขอคืน|คืน|ยกเลิก|เอาออก)/.test(workingText)) {
    intent = 'RETURN';
    if (/(เสีย|แตก|หก|ชำรุด|ของเสีย)/.test(workingText)) returnMode = 'VOID_WASTE';
  }

  let matchedTable = null;
  for (const t of data.tables) {
    const candidates = [t.name, ...(t.voice_aliases || [])].sort((a, b) => b.length - a.length);
    for (const cand of candidates) {
      const re = new RegExp(cand.replace(/\s+/g, '\\s*'), 'i');
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
    const names = new Set([p.name, ...(p.voice_aliases || [])]);
    for (const phrase of names) {
      if (phrase && phrase.trim()) {
        phraseEntries.push({ phrase: phrase.trim(), compactPhrase: phrase.replace(/\s+/g, ''), product: p });
      }
    }
  }
  phraseEntries.sort((a, b) => b.compactPhrase.length - a.compactPhrase.length);

  const matches = [];
  const occupied = [];
  const isOccupied = (s, e) => occupied.some(([os, oe]) => !(e <= os || s >= oe));

  for (const entry of phraseEntries) {
    const escaped = entry.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
    const regex = new RegExp(escaped, 'gi');
    let m;
    while ((m = regex.exec(workingText)) !== null) {
      const s = m.index;
      const e = s + m[0].length;
      if (!isOccupied(s, e)) {
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
    const qmUnit = tail.match(new RegExp(`(\\d+)\\s*(?:${THAI_UNITS_REGEX})`));
    const qmTail = tail.match(/(\d+)/);
    const qmHead = head.match(new RegExp(`(\\d+)\\s*(?:${THAI_UNITS_REGEX})?\\s*$`));

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
        const kws = [mod.name, ...(mod.voice_keywords || [])];
        if (kws.some(kw => tail.includes(kw))) {
          matchedModifiers.push(mod.name);
          extraPrice += mod.extra_price;
          extraCost += mod.extra_cost;
        }
      }
      if ((matchedModifiers.includes('ไข่ดาวไม่สุก') || matchedModifiers.includes('ไข่ดาวสุกๆ')) && !matchedModifiers.includes('ไข่ดาว')) {
        const egg = data.modifiers.find(m => m.id === 'MOD-FRIED-EGG');
        if (egg) {
          matchedModifiers.unshift(egg.name);
          extraPrice += egg.extra_price;
          extraCost += egg.extra_cost;
        }
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
}

module.exports = async (req, res) => {
  const hdrUrl = req.headers && req.headers['x-supabase-url'];
  const hdrKey = req.headers && req.headers['x-supabase-key'];
  if (hdrUrl && hdrKey) {
    setRuntimeSupabaseConfig(hdrUrl, hdrKey);
  }
  const cfg = getSupabaseConfig();
  if (!cfg.enabled) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({
      error: 'กรุณาตั้งค่า SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY (หรือ SUPABASE_ANON_KEY) ใน Vercel Environment Variables'
    }));
  }

  const urlObj = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const routeParam = urlObj.searchParams.get('route');
  const pathname = routeParam
    ? `/api/${routeParam.replace(/^\/+/, '')}`
    : urlObj.pathname;

  let body = {};
  if (typeof req.body === 'object' && req.body !== null) {
    body = req.body;
  } else if (typeof req.body === 'string' && req.body) {
    try { body = JSON.parse(req.body); } catch { body = {}; }
  } else if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    body = await new Promise((resolve) => {
      let raw = '';
      req.on('data', chunk => { raw += chunk.toString('utf8'); });
      req.on('end', () => {
        if (!raw) return resolve({});
        try { resolve(JSON.parse(raw)); } catch { resolve({}); }
      });
      req.on('error', () => resolve({}));
    });
  }

  const send = (code, payload) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.end(JSON.stringify(payload));
  };

  async function sbInsertOrderSafe(orderBody) {
    try {
      return await sbRest('orders', { method: 'POST', body: orderBody });
    } catch {
      const { bill_title, bill_note, customer_id, customer_name, ...baseBody } = orderBody;
      return await sbRest('orders', { method: 'POST', body: baseBody });
    }
  }

  async function sbPatchOrderSafe(orderId, patchBody) {
    try {
      return await sbRest(`orders?id=eq.${encodeURIComponent(orderId)}`, { method: 'PATCH', body: patchBody });
    } catch {
      const { bill_title, bill_note, customer_id, customer_name, ...basePatch } = patchBody;
      if (basePatch.status === 'VOIDED') basePatch.status = 'CANCELLED';
      if (Object.keys(basePatch).length === 0) return [];
      return await sbRest(`orders?id=eq.${encodeURIComponent(orderId)}`, { method: 'PATCH', body: basePatch });
    }
  }

  async function sbPatchOrderItemSafe(itemId, patchBody) {
    try {
      return await sbRest(`order_items?id=eq.${encodeURIComponent(itemId)}`, { method: 'PATCH', body: patchBody });
    } catch {
      const fallback = { ...patchBody };
      if (fallback.kitchen_status === 'CANCEL_REQUESTED' || fallback.kitchen_status === 'CANCELLED_ACK') {
        fallback.kitchen_status = 'CANCELLED';
      }
      return await sbRest(`order_items?id=eq.${encodeURIComponent(itemId)}`, { method: 'PATCH', body: fallback });
    }
  }

  try {
    if (pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      return res.end(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
    }

    if (req.method === 'GET' && pathname === '/api/sync-check') {
      const scope = urlObj.searchParams.get('scope') || 'kds';
      const sig = urlObj.searchParams.get('sig') || '';
      const result = await getSupabaseSyncCheck(scope, sig);
      return send(200, result);
    }

    if (req.method === 'GET' && pathname === '/api/bootstrap') {
      const data = await getSupabaseBootstrapData();
      return send(200, data);
    }

    if (req.method === 'POST' && pathname === '/api/voice/parse') {
      const data = await getSupabaseBootstrapData();
      const parsed = await parseVoiceWithData(body.text || '', body.fallbackTableId || null, data);
      return send(200, parsed);
    }

    if (req.method === 'POST' && pathname === '/api/orders/submit') {
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

      const data = await getSupabaseBootstrapData();
      const now = new Date().toISOString();
      let orderId = existingOrderId || `ORD-${Date.now().toString().slice(-6)}`;
      let orderRound = 1;
      let contextLabel = bill_title ? `บิล: ${bill_title}` : 'ขายหน้าร้าน (Walk-in)';

      if (settle_immediately) {
        const oos = [];
        for (const it of items) {
          const p = data.products.find(x => x.id === it.product_id);
          if (p && p.item_type === 'GROCERY' && p.track_stock && Number(p.stock_qty) <= 0) {
            oos.push(p.name);
          }
        }
        if (oos.length > 0) {
          return send(400, { error: `ไม่สามารถเช็คบิลได้ เนื่องจากมีสินค้าสต็อกหมดในบิล: ${oos.join(', ')} กรุณานำออกจากบิลก่อนครับ` });
        }
      }

      if (existingOrderId) {
        try {
          await sbPatchOrderSafe(existingOrderId, {
            bill_title,
            bill_note,
            customer_id,
            customer_name,
            status: settle_immediately ? 'PAID' : 'OPEN',
            paid_at: settle_immediately ? now : null
          });
        } catch {}
      } else if (order_type === 'DINE_IN' && table_id) {
        const tbl = data.tables.find(t => t.id === table_id);
        if (tbl) contextLabel = tbl.name;
        if (tbl && tbl.active_order) {
          orderId = tbl.active_order.id;
          orderRound = Math.max(1, ...tbl.active_order.items.map(i => Number(i.order_round || 1))) + 1;
          try {
            await sbPatchOrderSafe(orderId, { bill_title, bill_note, customer_id, customer_name });
          } catch {}
        } else {
          await sbInsertOrderSafe({
            id: orderId,
            order_type: 'DINE_IN',
            table_id,
            bill_title: bill_title || (tbl ? tbl.name : ''),
            bill_note,
            customer_id,
            customer_name,
            status: 'OPEN',
            subtotal: 0,
            discount: 0,
            total_amount: 0,
            total_cost: 0,
            payment_method,
            created_at: now
          });
          await sbRest(`dining_tables?id=eq.${encodeURIComponent(table_id)}`, {
            method: 'PATCH',
            body: { status: 'OCCUPIED', current_order_id: orderId }
          });
        }
      } else {
        await sbInsertOrderSafe({
          id: orderId,
          order_type: 'RETAIL',
          table_id: null,
          bill_title: bill_title || (settle_immediately ? 'ขายหน้าร้าน' : 'พักบิลหน้าร้าน'),
          bill_note,
          customer_id,
          customer_name,
          status: settle_immediately ? 'PAID' : 'OPEN',
          subtotal: 0,
          discount: Number(discount) || 0,
          total_amount: 0,
          total_cost: 0,
          payment_method,
          cash_received: Number(cash_received) || 0,
          change_amount: 0,
          created_at: now,
          paid_at: settle_immediately ? now : null
        });
      }

      for (const it of items) {
        const prod = data.products.find(p => p.id === it.product_id);
        if (!prod) continue;
        const qty = Math.max(1, Number(it.quantity) || 1);
        const modNames = Array.isArray(it.modifiers) ? it.modifiers : [];
        let extraPrice = 0;
        let extraCost = 0;
        for (const mn of modNames) {
          const mObj = data.modifiers.find(m => m.name === mn);
          if (mObj) {
            extraPrice += mObj.extra_price;
            extraCost += mObj.extra_cost;
          }
        }
        const unitPrice = it.unit_price !== undefined ? Number(it.unit_price) : (prod.price + extraPrice);
        const unitCost = Math.round((prod.cost + extraCost) * 100) / 100;
        const recipeSnapshot = [];

        if (prod.item_type === 'GROCERY' && prod.track_stock) {
          const nextStock = Math.round((prod.stock_qty - qty) * 100) / 100;
          await sbRest(`products?id=eq.${encodeURIComponent(prod.id)}`, { method: 'PATCH', body: { stock_qty: nextStock } });
          await sbRest('inventory_logs', {
            method: 'POST',
            body: {
              id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              target_type: 'GROCERY',
              product_id: prod.id,
              item_name: prod.name,
              change_qty: -qty,
              balance_after: nextStock,
              unit: prod.unit,
              reason: 'SALE',
              reference_id: orderId,
              note: contextLabel,
              created_at: now
            }
          });
        } else if (prod.item_type === 'FOOD') {
          for (const rec of prod.recipe_items || []) {
            const ing = data.ingredients.find(i => i.id === rec.ingredient_id);
            if (!ing) continue;
            const deductQty = rec.quantity_used * qty;
            const nextIng = Math.round((ing.current_qty - deductQty) * 100) / 100;
            ing.current_qty = nextIng;
            recipeSnapshot.push({ ingredient_id: ing.id, name: ing.name, qty: deductQty, unit: ing.stock_unit });
            await sbRest(`ingredients?id=eq.${encodeURIComponent(ing.id)}`, { method: 'PATCH', body: { current_qty: nextIng } });
            await sbRest('inventory_logs', {
              method: 'POST',
              body: {
                id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                target_type: 'INGREDIENT',
                ingredient_id: ing.id,
                item_name: ing.name,
                change_qty: -deductQty,
                balance_after: nextIng,
                unit: ing.stock_unit,
                reason: 'RECIPE_DEDUCT',
                reference_id: orderId,
                note: `ตัดสูตร ${prod.name} x${qty} (${contextLabel})`,
                created_at: now
              }
            });
          }
        }

        await sbRest('order_items', {
          method: 'POST',
          body: {
            id: `OI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            order_id: orderId,
            product_id: prod.id,
            product_name: prod.name,
            item_type: prod.item_type,
            order_round: orderRound,
            quantity: qty,
            returned_qty: 0,
            unit_price: unitPrice,
            unit_cost: unitCost,
            modifiers_json: modNames,
            recipe_snapshot_json: recipeSnapshot,
            item_status: 'ACTIVE',
            kitchen_status: prod.send_to_kitchen ? 'PENDING' : 'NONE',
            input_source: it.input_source || input_source || 'TOUCH',
            created_at: now
          }
        });
      }

      await recalculateSupabaseOrderTotals(orderId);
      if (settle_immediately && customer_id) {
        try {
          const ords = await sbRest(`orders?select=*&id=eq.${encodeURIComponent(orderId)}`);
          const updatedOrd = ords[0];
          const cusRows = await sbRest(`customers?select=*&id=eq.${encodeURIComponent(customer_id)}`);
          if (updatedOrd && cusRows[0]) {
            const redeemPts = Math.max(0, Math.floor(Number(body.redeem_points) || 0));
            const lUpd = computeCustomerLoyaltyUpdate(cusRows[0], Number(updatedOrd.total_amount || 0), redeemPts, data.loyaltySettings);
            await sbRest(`customers?id=eq.${encodeURIComponent(customer_id)}`, {
              method: 'PATCH',
              body: { points: lUpd.nextPts, total_spent: lUpd.nextSpent, tier: lUpd.nextTier }
            });
          }
        } catch {}
      }
      return send(200, { success: true, orderId, data: await getSupabaseBootstrapData() });
    }

    if (req.method === 'POST' && pathname === '/api/orders/item-return') {
      const { order_item_id, table_id, product_id, mode = 'RETURNED_RESTOCK', reason_note = '' } = body;
      const now = new Date().toISOString();
      let items = [];

      if (order_item_id) {
        items = await sbRest(`order_items?select=*&id=eq.${encodeURIComponent(order_item_id)}`);
      } else if (table_id && product_id) {
        const tbls = await sbRest(`dining_tables?select=*&id=eq.${encodeURIComponent(table_id)}`);
        if (tbls[0] && tbls[0].current_order_id) {
          items = await sbRest(`order_items?select=*&order_id=eq.${encodeURIComponent(tbls[0].current_order_id)}&product_id=eq.${encodeURIComponent(product_id)}&item_status=eq.ACTIVE&limit=1`);
        }
      }
      const targetItem = items[0];
      if (!targetItem) return send(404, { error: 'ไม่พบรายการสินค้าที่ต้องการคืน' });

      const validMode = mode === 'VOID_WASTE' ? 'VOID_WASTE' : 'RETURNED_RESTOCK';
      await sbPatchOrderItemSafe(targetItem.id, {
        item_status: validMode,
        kitchen_status: targetItem.item_type === 'FOOD' ? 'CANCEL_REQUESTED' : 'NONE'
      });

      if (validMode === 'RETURNED_RESTOCK' && targetItem.item_type === 'GROCERY') {
        const prods = await sbRest(`products?select=*&id=eq.${encodeURIComponent(targetItem.product_id)}`);
        if (prods[0]) {
          const nextStock = Math.round((Number(prods[0].stock_qty) + Number(targetItem.quantity)) * 100) / 100;
          await sbRest(`products?id=eq.${encodeURIComponent(prods[0].id)}`, { method: 'PATCH', body: { stock_qty: nextStock } });
          await sbRest('inventory_logs', {
            method: 'POST',
            body: {
              id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              target_type: 'GROCERY',
              product_id: prods[0].id,
              item_name: prods[0].name,
              change_qty: Number(targetItem.quantity),
              balance_after: nextStock,
              unit: prods[0].unit,
              reason: 'RETURN_FROM_TABLE',
              reference_id: targetItem.order_id,
              note: reason_note || 'ลูกค้าคืนสินค้าของชำเข้าสต็อก',
              created_at: now
            }
          });
        }
      }

      await recalculateSupabaseOrderTotals(targetItem.order_id);
      return send(200, { success: true, data: await getSupabaseBootstrapData() });
    }

    if (req.method === 'POST' && pathname === '/api/orders/checkout') {
      const {
        order_id,
        table_id,
        payment_method = 'CASH',
        discount = 0,
        cash_received = 0,
        customer_id = undefined,
        customer_name = undefined,
        redeem_points = 0,
        points_discount = 0
      } = body;
      const now = new Date().toISOString();
      let targetOrderId = order_id;

      if (!targetOrderId && table_id) {
        const tbls = await sbRest(`dining_tables?select=*&id=eq.${encodeURIComponent(table_id)}`);
        if (tbls[0]) targetOrderId = tbls[0].current_order_id;
      }
      if (!targetOrderId) return send(404, { error: 'ไม่พบบิลที่ต้องการชำระเงิน' });

      // Check for out-of-stock items in this bill
      const activeItems = await sbRest(`order_items?select=*&order_id=eq.${encodeURIComponent(targetOrderId)}&item_status=eq.ACTIVE`);
      const bootData = await getSupabaseBootstrapData();
      const oos = [];
      for (const it of activeItems) {
        const p = bootData.products.find(x => x.id === it.product_id);
        if (p && p.item_type === 'GROCERY' && p.track_stock && Number(p.stock_qty) <= 0) {
          oos.push(p.name);
        }
      }
      if (oos.length > 0) {
        return send(400, { error: `ไม่สามารถเช็คบิลได้ เนื่องจากมีสินค้าสต็อกหมดในบิล: ${oos.join(', ')} กรุณานำออกจากบิลก่อนครับ` });
      }

      const patchDiscBody = { discount: Number(discount) || 0 };
      if (customer_id !== undefined) patchDiscBody.customer_id = customer_id;
      if (customer_name !== undefined) patchDiscBody.customer_name = customer_name;

      await sbPatchOrderSafe(targetOrderId, patchDiscBody);
      await recalculateSupabaseOrderTotals(targetOrderId);

      const ords = await sbRest(`orders?select=*&id=eq.${encodeURIComponent(targetOrderId)}`);
      const refreshed = ords[0];
      const totalAmt = Number(refreshed.total_amount);
      const received = Number(cash_received) >= totalAmt ? Number(cash_received) : totalAmt;
      const change = Math.round(Math.max(0, received - totalAmt) * 100) / 100;
      const redeemPts = Math.max(0, Math.floor(Number(redeem_points) || 0));
      const ptsDisc = Math.max(0, Number(points_discount) || 0);
      const nextNote = redeemPts > 0
        ? `${refreshed.bill_note || ''} [ใช้แต้มสะสม ${redeemPts} แต้ม ลด ฿${ptsDisc}]`.trim()
        : (refreshed.bill_note || '');

      await sbPatchOrderSafe(targetOrderId, {
        status: 'PAID',
        payment_method,
        cash_received: received,
        change_amount: change,
        bill_note: nextNote,
        paid_at: now
      });

      if (refreshed.table_id) {
        await sbRest(`dining_tables?id=eq.${encodeURIComponent(refreshed.table_id)}`, {
          method: 'PATCH',
          body: { status: 'AVAILABLE', current_order_id: null }
        });
      }

      const finalCusId = customer_id !== undefined ? customer_id : refreshed.customer_id;
      if (finalCusId) {
        try {
          const boot = await getSupabaseBootstrapData();
          const cusRows = await sbRest(`customers?select=*&id=eq.${encodeURIComponent(finalCusId)}`);
          if (cusRows[0]) {
            const lUpd = computeCustomerLoyaltyUpdate(cusRows[0], totalAmt, redeemPts, boot.loyaltySettings);
            await sbRest(`customers?id=eq.${encodeURIComponent(finalCusId)}`, {
              method: 'PATCH',
              body: { points: lUpd.nextPts, total_spent: lUpd.nextSpent, tier: lUpd.nextTier }
            });
          }
        } catch {}
      }

      return send(200, { success: true, orderId: targetOrderId, change, data: await getSupabaseBootstrapData() });
    }

    if (req.method === 'POST' && pathname === '/api/kds/status') {
      const { order_item_id, kitchen_status } = body;
      await sbPatchOrderItemSafe(order_item_id, { kitchen_status });
      return send(200, { success: true, data: await getSupabaseBootstrapData() });
    }

    if (req.method === 'POST' && pathname === '/api/stock-in') {
      const { supplier_name = 'ร้านค้าส่ง / ตลาดสด', note = '', created_by = 'เจ้าของร้าน', record_as_expense = false, items = [] } = body;
      const now = new Date().toISOString();
      const todayStr = now.slice(0, 10);
      const receiptId = `RCV-${todayStr.replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;
      const data = await getSupabaseBootstrapData();

      let totalReceiptCost = 0;
      const processed = [];

      for (const line of items) {
        const inputQty = Number(line.input_qty);
        if (!inputQty || inputQty <= 0) continue;
        const usePurchaseUnit = Boolean(line.use_purchase_unit);
        const lineCost = Math.max(0, Number(line.total_line_cost ?? line.line_cost) || 0);
        const lineType = line.item_target_type || line.target_type || 'GROCERY';
        const lineTargetId = line.target_id || line.product_id || line.ingredient_id;
        totalReceiptCost += lineCost;

        if (lineType === 'GROCERY') {
          const prod = data.products.find(p => p.id === lineTargetId);
          if (!prod) continue;
          const conv = usePurchaseUnit ? (prod.conversion_rate || 1) : 1;
          const qtyBefore = prod.stock_qty;
          const qtyAdded = Math.round(inputQty * conv * 100) / 100;
          const qtyAfter = Math.round((qtyBefore + qtyAdded) * 100) / 100;
          const baseCost = weightedAverageCost(qtyBefore, prod.cost, qtyAdded, lineCost, 2);

          await sbRest(`products?id=eq.${encodeURIComponent(prod.id)}`, {
            method: 'PATCH',
            body: { stock_qty: qtyAfter, cost: baseCost }
          });

          processed.push({
            item_target_type: 'GROCERY',
            product_id: prod.id,
            ingredient_id: null,
            item_name: prod.name,
            cost_before: Number(prod.cost) || 0,
            base_unit: prod.unit,
            unit_label: usePurchaseUnit ? prod.purchase_unit : prod.unit,
            input_qty: inputQty,
            conversion_rate: conv,
            qty_before: qtyBefore,
            qty_added: qtyAdded,
            qty_after: qtyAfter,
            purchase_cost_per_base_unit: baseCost,
            total_line_cost: lineCost
          });
        } else {
          const ing = data.ingredients.find(i => i.id === lineTargetId);
          if (!ing) continue;
          const conv = usePurchaseUnit ? (ing.conversion_rate || 1) : 1;
          const qtyBefore = ing.current_qty;
          const qtyAdded = Math.round(inputQty * conv * 100) / 100;
          const qtyAfter = Math.round((qtyBefore + qtyAdded) * 100) / 100;
          const baseCost = weightedAverageCost(qtyBefore, ing.cost_per_unit, qtyAdded, lineCost, 4);

          await sbRest(`ingredients?id=eq.${encodeURIComponent(ing.id)}`, {
            method: 'PATCH',
            body: { current_qty: qtyAfter, cost_per_unit: baseCost }
          });

          processed.push({
            item_target_type: 'INGREDIENT',
            product_id: null,
            ingredient_id: ing.id,
            item_name: ing.name,
            cost_before: Number(ing.cost_per_unit) || 0,
            base_unit: ing.stock_unit,
            unit_label: usePurchaseUnit ? ing.purchase_unit : ing.stock_unit,
            input_qty: inputQty,
            conversion_rate: conv,
            qty_before: qtyBefore,
            qty_added: qtyAdded,
            qty_after: qtyAfter,
            purchase_cost_per_base_unit: baseCost,
            total_line_cost: lineCost
          });
        }
      }

      await sbRest('stock_in_receipts', {
        method: 'POST',
        body: {
          id: receiptId,
          receipt_type: 'MIXED',
          supplier_name,
          note,
          total_cost: totalReceiptCost,
          record_as_expense: Boolean(record_as_expense),
          created_by,
          created_at: now
        }
      });

      for (const pl of processed) {
        await sbRest('stock_in_items', {
          method: 'POST',
          body: {
            id: `SRI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            receipt_id: receiptId,
            item_target_type: pl.item_target_type,
            product_id: pl.product_id,
            ingredient_id: pl.ingredient_id,
            item_name: pl.item_name,
            unit_label: pl.unit_label,
            input_qty: pl.input_qty,
            conversion_rate: pl.conversion_rate,
            qty_before: pl.qty_before,
            qty_added: pl.qty_added,
            qty_after: pl.qty_after,
            purchase_cost_per_base_unit: pl.purchase_cost_per_base_unit,
            total_line_cost: pl.total_line_cost
          }
        });

        await sbRest('inventory_logs', {
          method: 'POST',
          body: {
            id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            target_type: pl.item_target_type,
            product_id: pl.product_id,
            ingredient_id: pl.ingredient_id,
            item_name: pl.item_name,
            change_qty: pl.qty_added,
            balance_after: pl.qty_after,
            unit: pl.base_unit,
            reason: 'STOCK_IN_RECEIPT',
            reference_id: receiptId,
            note: `นำเข้า ${pl.input_qty} ${pl.unit_label} (เดิม ${pl.qty_before} -> ใหม่ ${pl.qty_after}) [COST_BEFORE=${Number(pl.cost_before) || 0}]`,
            created_at: now
          }
        });
      }

      if (record_as_expense && totalReceiptCost > 0) {
        await sbRest('expenses', {
          method: 'POST',
          body: {
            id: `EXP-${Date.now().toString().slice(-6)}`,
            category: 'STOCK_IN',
            title: `รับของเข้าสต็อก (${receiptId}) - ${supplier_name}`,
            amount: totalReceiptCost,
            expense_date: todayStr,
            reference_id: receiptId,
            created_at: now
          }
        });
      }

      return send(200, { success: true, receiptId, data: await getSupabaseBootstrapData() });
    }

    if (req.method === 'POST' && pathname === '/api/products/save') {
      const {
        id, category_id, barcode = null, name, voice_aliases = [], price = 0, cost = 0,
        unit = 'ชิ้น', purchase_unit = 'แพ็ค', conversion_rate = 1, item_type = 'GROCERY',
        stock_qty = 0, low_stock_threshold = 5, recipe_items = []
      } = body;
      const prodId = id || `${item_type === 'FOOD' ? 'F' : 'G'}-${Date.now().toString().slice(-4)}`;
      const aliases = Array.isArray(voice_aliases) ? voice_aliases : String(voice_aliases || '').split(',').map(s => s.trim()).filter(Boolean);

      try {
        await sbRest('products', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: {
            id: prodId,
            category_id: category_id || (item_type === 'FOOD' ? 'CAT-RICE' : 'CAT-DRINK'),
            barcode: barcode && String(barcode).trim() ? String(barcode).trim() : null,
            name,
            voice_aliases: aliases,
            price: Number(price),
            cost: Number(cost),
            unit,
            purchase_unit,
            conversion_rate: Number(conversion_rate) || 1,
            item_type,
            track_stock: item_type === 'GROCERY',
            stock_qty: Number(stock_qty) || 0,
            low_stock_threshold: Number(low_stock_threshold) || 5,
            modifier_group_ids: Array.isArray(body.modifier_group_ids) ? body.modifier_group_ids : [],
            send_to_kitchen: item_type === 'FOOD',
            is_active: true
          }
        });
      } catch (err) {
        // Fallback without modifier_group_ids if column is not yet migrated in Supabase
        console.warn('Saving product without modifier_group_ids column fallback:', err.message);
        await sbRest('products', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: {
            id: prodId,
            category_id: category_id || (item_type === 'FOOD' ? 'CAT-RICE' : 'CAT-DRINK'),
            barcode: barcode && String(barcode).trim() ? String(barcode).trim() : null,
            name,
            voice_aliases: aliases,
            price: Number(price),
            cost: Number(cost),
            unit,
            purchase_unit,
            conversion_rate: Number(conversion_rate) || 1,
            item_type,
            track_stock: item_type === 'GROCERY',
            stock_qty: Number(stock_qty) || 0,
            low_stock_threshold: Number(low_stock_threshold) || 5,
            send_to_kitchen: item_type === 'FOOD',
            is_active: true
          }
        });
      }

      if (item_type === 'FOOD' && Array.isArray(recipe_items)) {
        await sbRest(`recipe_items?product_id=eq.${encodeURIComponent(prodId)}`, { method: 'DELETE' });
        for (const r of recipe_items) {
          if (r.ingredient_id && Number(r.quantity_used) > 0) {
            await sbRest('recipe_items', {
              method: 'POST',
              body: {
                id: `REC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                product_id: prodId,
                ingredient_id: r.ingredient_id,
                quantity_used: Number(r.quantity_used)
              }
            });
          }
        }
      }

      return send(200, { success: true, prodId, data: await getSupabaseBootstrapData() });
    }

    if (req.method === 'POST' && pathname === '/api/products/threshold') {
      const { product_id, threshold, items: batchItems } = body;
      if (Array.isArray(batchItems)) {
        for (const item of batchItems) {
          if (item.id) {
            await sbRest(`products?id=eq.${encodeURIComponent(item.id)}`, {
              method: 'PATCH',
              body: { low_stock_threshold: Math.max(0, Number(item.threshold) || 0) }
            });
          }
        }
      } else if (product_id) {
        await sbRest(`products?id=eq.${encodeURIComponent(product_id)}`, {
          method: 'PATCH',
          body: { low_stock_threshold: Math.max(0, Number(threshold) || 0) }
        });
      }
      return send(200, { success: true, data: await getSupabaseBootstrapData() });
    }

    if (req.method === 'POST' && pathname === '/api/ingredients/save') {
      const { id, name, stock_unit = 'กรัม', purchase_unit = 'กิโลกรัม', conversion_rate = 1000, current_qty = 0, cost_per_unit = 0, low_stock_threshold = 500 } = body;
      const ingId = id || `ING-${Date.now().toString().slice(-4)}`;
      await sbRest('ingredients', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: {
          id: ingId,
          name,
          stock_unit,
          purchase_unit,
          conversion_rate: Number(conversion_rate) || 1,
          current_qty: Number(current_qty) || 0,
          cost_per_unit: Number(cost_per_unit) || 0,
          low_stock_threshold: Number(low_stock_threshold) || 0
        }
      });
      return send(200, { success: true, ingId, data: await getSupabaseBootstrapData() });
    }

    if (req.method === 'POST' && pathname === '/api/tables/save') {
      const { id, name, zone_name = 'โซนในร้าน' } = body;
      const tblId = id || `T${Date.now().toString().slice(-3)}`;
      if (id) {
        await sbRest(`dining_tables?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: { name, zone_name, voice_aliases: [name, name.replace(/\s+/g, '')] }
        });
      } else {
        await sbRest('dining_tables', {
          method: 'POST',
          body: {
            id: tblId,
            name,
            zone_name,
            voice_aliases: [name, name.replace(/\s+/g, '')],
            status: 'AVAILABLE',
            current_order_id: null
          }
        });
      }
      return send(200, { success: true, tblId, data: await getSupabaseBootstrapData() });
    }

    if (req.method === 'POST' && pathname === '/api/tables/delete') {
      const { id } = body;
      await sbRest(`dining_tables?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      return send(200, { success: true, data: await getSupabaseBootstrapData() });
    }

    if (req.method === 'POST' && pathname === '/api/customers/delete') {
      const { id } = body;
      try {
        await sbRest(`customers?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch {}
      return send(200, { success: true, data: await getSupabaseBootstrapData() });
    }

    if (req.method === 'POST' && pathname === '/api/ingredients/delete') {
      const { id } = body;
      await sbRest(`recipe_items?ingredient_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      await sbRest(`ingredients?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      return send(200, { success: true, data: await getSupabaseBootstrapData() });
    }

    if (req.method === 'POST' && pathname === '/api/products/delete') {
      const { id } = body;
      await sbRest(`products?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: { is_active: false } });
      await sbRest(`recipe_items?product_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      return send(200, { success: true, data: await getSupabaseBootstrapData() });
    }

    // Categories Management
    if (req.method === 'POST' && pathname === '/api/categories/save') {
      const { id, name, category_type = 'GROCERY' } = body;
      if (!name || !name.trim()) return send(400, { error: 'กรุณาระบุชื่อหมวดหมู่' });
      const catId = id || `CAT-${Date.now().toString().slice(-4)}`;
      await sbRest('categories', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: { id: catId, name: name.trim(), category_type }
      });
      return send(200, { success: true, catId, data: await getSupabaseBootstrapData() });
    }

    if (req.method === 'POST' && pathname === '/api/categories/delete') {
      const { id } = body;
      const cats = await sbRest(`categories?id=eq.${encodeURIComponent(id)}`);
      const fallbackCat = cats[0]?.category_type === 'FOOD' ? 'CAT-RICE' : 'CAT-DRINK';
      try {
        await sbRest(`products?category_id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: { category_id: fallbackCat }
        });
      } catch {}
      await sbRest(`categories?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      return send(200, { success: true, data: await getSupabaseBootstrapData() });
    }

    // Modifier Groups Management
    if (req.method === 'POST' && pathname === '/api/modifier-groups/save') {
      const { id, name, selection_type = 'MULTIPLE', is_required = false, sort_order = 0 } = body;
      if (!name || !name.trim()) return send(400, { error: 'กรุณาระบุชื่อกลุ่มตัวเลือกพิเศษ' });
      const grpId = id || `GRP-${Date.now().toString().slice(-4)}`;
      const grpObj = {
        id: grpId,
        name: name.trim(),
        selection_type,
        is_required: Boolean(is_required),
        sort_order: Number(sort_order) || 0
      };

      try {
        await sbRest('modifier_groups', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: grpObj
        });
      } catch (err) {
        console.warn('Fallback modifier_groups to SYS-MODIFIER-GROUPS:', err.message);
        let groups = [];
        try {
          const rows = await sbRest('customers?select=*&id=eq.SYS-MODIFIER-GROUPS');
          if (rows && rows[0] && rows[0].note) {
            groups = JSON.parse(rows[0].note);
          }
        } catch {}
        if (!Array.isArray(groups) || groups.length === 0) {
          groups = [
            { id: 'GRP-SPICY', name: 'ระดับความเผ็ด', selection_type: 'SINGLE', is_required: false, sort_order: 1 },
            { id: 'GRP-TOPPING', name: 'ท็อปปิ้งไข่ & เพิ่มเติม', selection_type: 'MULTIPLE', is_required: false, sort_order: 2 }
          ];
        }
        const idx = groups.findIndex(g => g.id === grpId);
        if (idx >= 0) {
          groups[idx] = grpObj;
        } else {
          groups.push(grpObj);
        }
        const now = new Date().toISOString();
        await sbRest('customers', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: {
            id: 'SYS-MODIFIER-GROUPS',
            name: '__MODIFIER_GROUPS__',
            phone: '',
            tier: 'SYSTEM',
            points: 0,
            total_spent: 0,
            note: JSON.stringify(groups),
            created_at: now
          }
        });
      }
      return send(200, { success: true, grpId, data: await getSupabaseBootstrapData() });
    }

    if (req.method === 'POST' && pathname === '/api/modifier-groups/delete') {
      const { id } = body;
      try {
        await sbRest(`product_modifiers?group_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch {}
      try {
        await sbRest(`product_modifiers?product_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch {}
      try {
        await sbRest(`modifier_groups?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch {}

      // Also clean from fallback SYS-MODIFIER-GROUPS
      try {
        const rows = await sbRest('customers?select=*&id=eq.SYS-MODIFIER-GROUPS');
        if (rows && rows[0] && rows[0].note) {
          const groups = JSON.parse(rows[0].note);
          if (Array.isArray(groups)) {
            const filtered = groups.filter(g => g.id !== id);
            await sbRest('customers', {
              method: 'POST',
              prefer: 'resolution=merge-duplicates,return=representation',
              body: {
                id: 'SYS-MODIFIER-GROUPS',
                name: '__MODIFIER_GROUPS__',
                phone: '',
                tier: 'SYSTEM',
                points: 0,
                total_spent: 0,
                note: JSON.stringify(filtered),
                created_at: new Date().toISOString()
              }
            });
          }
        }
      } catch {}

      return send(200, { success: true, data: await getSupabaseBootstrapData() });
    }

    // Individual Modifiers Management
    if (req.method === 'POST' && pathname === '/api/modifiers/save') {
      const { id, group_id, name, extra_price = 0, extra_cost = 0, voice_keywords = [] } = body;
      if (!name || !name.trim()) return send(400, { error: 'กรุณาระบุชื่อตัวเลือกพิเศษ' });
      const modId = id || `MOD-${Date.now().toString().slice(-4)}`;
      const vKw = Array.isArray(voice_keywords) ? voice_keywords : String(voice_keywords || '').split(',').map(s => s.trim()).filter(Boolean);

      try {
        await sbRest('product_modifiers', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: {
            id: modId,
            group_id: group_id || null,
            product_id: group_id || null,
            name: name.trim(),
            voice_keywords: vKw,
            extra_price: Number(extra_price) || 0,
            extra_cost: Number(extra_cost) || 0
          }
        });
      } catch (err) {
        // Fallback without group_id column if column does not exist
        console.warn('Saving modifier with product_id fallback:', err.message);
        await sbRest('product_modifiers', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: {
            id: modId,
            product_id: group_id || null,
            name: name.trim(),
            voice_keywords: vKw,
            extra_price: Number(extra_price) || 0,
            extra_cost: Number(extra_cost) || 0
          }
        });
      }
      return send(200, { success: true, modId, data: await getSupabaseBootstrapData() });
    }

    if (req.method === 'POST' && pathname === '/api/modifiers/delete') {
      const { id } = body;
      await sbRest(`product_modifiers?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      return send(200, { success: true, data: await getSupabaseBootstrapData() });
    }

    // Delivery Points Management (จุดรับส่งของเส้นตลาดอินโดจีน มุกดาหาร)
    if (req.method === 'POST' && pathname === '/api/delivery-points/save') {
      const { id, name, landmark_desc = '', map_x = 50, map_y = 50, sort_order = 1, is_active = 1 } = body;
      if (!name || !name.trim()) return send(400, { error: 'กรุณาระบุชื่อจุดรับส่งของ' });
      const ptId = id || `DP-${Date.now().toString().slice(-4)}`;
      const ptObj = {
        id: ptId,
        name: name.trim(),
        landmark_desc: landmark_desc.trim(),
        map_x: Number(map_x) || 50,
        map_y: Number(map_y) || 50,
        sort_order: Number(sort_order) || 1,
        is_active: is_active ? 1 : 0
      };

      let savedDirectly = false;
      try {
        await sbRest('delivery_points', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: { ...ptObj, created_at: new Date().toISOString() }
        });
        savedDirectly = true;
      } catch (err) {
        console.warn('Could not save to delivery_points table directly, using SYS-DELIVERY-POINTS fallback:', err.message);
      }

      // Sync to fallback SYS-DELIVERY-POINTS in customers table
      try {
        let list = [];
        const rows = await sbRest('customers?select=*&id=eq.SYS-DELIVERY-POINTS');
        if (rows && rows[0] && rows[0].note) {
          try { list = JSON.parse(rows[0].note); } catch {}
        }
        if (!Array.isArray(list) || list.length === 0) {
          list = [
            { id: 'DP-01', name: 'หอเจ้าแม่สองนางพี่น้อง / วัดศรีมงคลใต้', landmark_desc: 'ซอยสองนางสถิตย์ ริมแม่น้ำโขง (ทิศเหนือ)', map_x: 52, map_y: 10, sort_order: 1, is_active: 1 },
            { id: 'DP-02', name: 'ช่วงซอยบริหารชนบท - ซอยวิเศษมุกดารักษ์', landmark_desc: 'ทางเดินเลียบโขงหน้าซอยบริหารชนบท', map_x: 54, map_y: 26, sort_order: 2, is_active: 1 },
            { id: 'DP-03', name: 'ศาลาขาว ตลาดอินโดจีน (Rau Rak Pavillion)', landmark_desc: 'จุดตัด ถ.พิทักษ์พนมเขต ศาลาขาวริมโขง', map_x: 56, map_y: 44, sort_order: 3, is_active: 1 },
            { id: 'DP-04', name: 'ลานตลาดอินโดจีน / หน้าวัดยอดแก้วศรีวิชัย', landmark_desc: 'ศูนย์กลางตลาดอินโดจีน ลานกิจกรรมริมโขง', map_x: 58, map_y: 60, sort_order: 4, is_active: 1 },
            { id: 'DP-05', name: 'ช่วงซอยศศิวงศ์ - ซอยจันทร์เทพ', landmark_desc: 'ทางเดินเลียบโขงช่วงอาคารตลาดอินโดจีนตอนใต้', map_x: 60, map_y: 74, sort_order: 5, is_active: 1 },
            { id: 'DP-06', name: 'หน้าโรงแรม Riverfront Hotel / คุ้นคุ้น คิทเช่น', landmark_desc: 'ช่วงซอยจ่างวาง ปลายตลาดอินโดจีนฝั่งทิศใต้', map_x: 62, map_y: 90, sort_order: 6, is_active: 1 }
          ];
        }
        const idx = list.findIndex(p => p.id === ptId);
        if (idx >= 0) {
          list[idx] = ptObj;
        } else {
          list.push(ptObj);
        }
        await sbRest('customers', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: {
            id: 'SYS-DELIVERY-POINTS',
            name: '__DELIVERY_POINTS__',
            phone: '',
            tier: 'SYSTEM',
            points: 0,
            total_spent: 0,
            note: JSON.stringify(list),
            created_at: new Date().toISOString()
          }
        });
      } catch {}

      return send(200, { success: true, ptId, data: await getSupabaseBootstrapData() });
    }

    if (req.method === 'POST' && pathname === '/api/delivery-points/delete') {
      const { id } = body;
      try {
        await sbRest(`delivery_points?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch {}
      try {
        const rows = await sbRest('customers?select=*&id=eq.SYS-DELIVERY-POINTS');
        if (rows && rows[0] && rows[0].note) {
          const list = JSON.parse(rows[0].note);
          if (Array.isArray(list)) {
            const filtered = list.filter(p => p.id !== id);
            await sbRest('customers', {
              method: 'POST',
              prefer: 'resolution=merge-duplicates,return=representation',
              body: {
                id: 'SYS-DELIVERY-POINTS',
                name: '__DELIVERY_POINTS__',
                phone: '',
                tier: 'SYSTEM',
                points: 0,
                total_spent: 0,
                note: JSON.stringify(filtered),
                created_at: new Date().toISOString()
              }
            });
          }
        }
      } catch {}
      return send(200, { success: true, data: await getSupabaseBootstrapData() });
    }

    if (req.method === 'POST' && pathname === '/api/orders/cancel') {
      const { order_id, mode = 'RETURNED_RESTOCK' } = body;
      const ords = await sbRest(`orders?select=*&id=eq.${encodeURIComponent(order_id)}`);
      const ord = ords[0];
      if (!ord) return send(404, { error: 'ไม่พบบิลที่ต้องการยกเลิก' });
      const wasPaid = ord.status === 'PAID';
      const nextStatus = wasPaid ? 'VOIDED' : 'CANCELLED';
      const validMode = mode === 'VOID_WASTE' ? 'VOID_WASTE' : 'RETURNED_RESTOCK';

      const items = await sbRest(`order_items?select=*&order_id=eq.${encodeURIComponent(order_id)}&item_status=eq.ACTIVE`);
      for (const it of items) {
        const nextKds = it.item_type === 'FOOD' ? (wasPaid ? 'CANCELLED_ACK' : 'CANCEL_REQUESTED') : 'NONE';
        await sbPatchOrderItemSafe(it.id, { item_status: validMode, kitchen_status: nextKds });
        if (validMode === 'RETURNED_RESTOCK' && it.item_type === 'GROCERY') {
          const prods = await sbRest(`products?select=*&id=eq.${encodeURIComponent(it.product_id)}`);
          if (prods[0]) {
            const nextStock = Math.round((Number(prods[0].stock_qty) + Number(it.quantity)) * 100) / 100;
            await sbRest(`products?id=eq.${encodeURIComponent(prods[0].id)}`, { method: 'PATCH', body: { stock_qty: nextStock } });
            await sbRest('inventory_logs', {
              method: 'POST',
              body: {
                id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                target_type: 'GROCERY',
                product_id: prods[0].id,
                item_name: prods[0].name,
                change_qty: Number(it.quantity),
                balance_after: nextStock,
                unit: prods[0].unit,
                reason: 'ORDER_CANCEL_RESTOCK',
                reference_id: order_id,
                note: `ยกเลิกบิล #${order_id} คืนสินค้าเข้าสต็อก`,
                created_at: new Date().toISOString()
              }
            });
          }
        }
      }

      await sbPatchOrderSafe(order_id, { status: nextStatus });

      if (ord.table_id) {
        await sbRest(`dining_tables?id=eq.${encodeURIComponent(ord.table_id)}`, {
          method: 'PATCH',
          body: { status: 'AVAILABLE', current_order_id: null }
        });
      }

      return send(200, { success: true, status: nextStatus, data: await getSupabaseBootstrapData() });
    }

    if (req.method === 'POST' && pathname === '/api/orders/transfer') {
      const { source_order_id, action, target_table_id = null, target_order_id = null } = body;
      const ords = await sbRest(`orders?select=*&id=eq.${encodeURIComponent(source_order_id)}`);
      const srcOrd = ords[0];
      if (!srcOrd) return send(404, { error: 'ไม่พบบิลต้นทาง' });

      if (action === 'MOVE_TO_TABLE' && target_table_id) {
        if (srcOrd.table_id && srcOrd.table_id !== target_table_id) {
          await sbRest(`dining_tables?id=eq.${encodeURIComponent(srcOrd.table_id)}`, {
            method: 'PATCH',
            body: { status: 'AVAILABLE', current_order_id: null }
          });
        }
        await sbRest(`orders?id=eq.${encodeURIComponent(srcOrd.id)}`, {
          method: 'PATCH',
          body: { order_type: 'DINE_IN', table_id: target_table_id }
        });
        await sbRest(`dining_tables?id=eq.${encodeURIComponent(target_table_id)}`, {
          method: 'PATCH',
          body: { status: 'OCCUPIED', current_order_id: srcOrd.id }
        });
        return send(200, { success: true, orderId: srcOrd.id, data: await getSupabaseBootstrapData() });
      }

      if (action === 'MOVE_TO_HELD') {
        if (srcOrd.table_id) {
          await sbRest(`dining_tables?id=eq.${encodeURIComponent(srcOrd.table_id)}`, {
            method: 'PATCH',
            body: { status: 'AVAILABLE', current_order_id: null }
          });
        }
        await sbRest(`orders?id=eq.${encodeURIComponent(srcOrd.id)}`, {
          method: 'PATCH',
          body: { order_type: 'RETAIL', table_id: null }
        });
        return send(200, { success: true, orderId: srcOrd.id, data: await getSupabaseBootstrapData() });
      }

      if (action === 'MERGE_BILL') {
        let destId = target_order_id;
        if (!destId && target_table_id) {
          const tbls = await sbRest(`dining_tables?select=*&id=eq.${encodeURIComponent(target_table_id)}`);
          if (tbls[0]) destId = tbls[0].current_order_id;
        }
        if (!destId || destId === srcOrd.id) return send(400, { error: 'ไม่พบบิลปลายทางที่จะรวม' });

        await sbRest(`order_items?order_id=eq.${encodeURIComponent(srcOrd.id)}`, {
          method: 'PATCH',
          body: { order_id: destId }
        });
        if (srcOrd.table_id) {
          await sbRest(`dining_tables?id=eq.${encodeURIComponent(srcOrd.table_id)}`, {
            method: 'PATCH',
            body: { status: 'AVAILABLE', current_order_id: null }
          });
        }
        await sbRest(`orders?id=eq.${encodeURIComponent(srcOrd.id)}`, { method: 'DELETE' });
        await recalculateSupabaseOrderTotals(destId);
        return send(200, { success: true, orderId: destId, data: await getSupabaseBootstrapData() });
      }
    }

    if (req.method === 'POST' && pathname === '/api/orders/split') {
      const { source_order_id, split_items = [], new_bill_title = '' } = body;
      const ords = await sbRest(`orders?select=*&id=eq.${encodeURIComponent(source_order_id)}`);
      const srcOrd = ords[0];
      if (!srcOrd) return send(404, { error: 'ไม่พบบิลต้นทาง' });

      const now = new Date().toISOString();
      const newOrderId = `ORD-${Date.now().toString().slice(-6)}`;
      try {
        await sbRest('orders', {
          method: 'POST',
          body: {
            id: newOrderId,
            order_type: 'RETAIL',
            table_id: null,
            bill_title: new_bill_title || `แยกจ่ายจาก ${srcOrd.bill_title || srcOrd.id}`,
            bill_note: `แยกบิลจาก ${srcOrd.id}`,
            customer_id: srcOrd.customer_id || null,
            customer_name: srcOrd.customer_name || '',
            status: 'OPEN',
            subtotal: 0,
            discount: 0,
            total_amount: 0,
            total_cost: 0,
            payment_method: 'CASH',
            created_at: now
          }
        });
      } catch {
        // Fallback if bill_title / customer columns were not yet migrated on remote Supabase
        await sbRest('orders', {
          method: 'POST',
          body: {
            id: newOrderId,
            order_type: 'RETAIL',
            table_id: null,
            status: 'OPEN',
            subtotal: 0,
            discount: 0,
            total_amount: 0,
            total_cost: 0,
            payment_method: 'CASH',
            created_at: now
          }
        });
      }

      const items = await sbRest(`order_items?select=*&order_id=eq.${encodeURIComponent(source_order_id)}&item_status=eq.ACTIVE`);
      for (const sp of split_items) {
        const it = items.find(x => x.id === sp.order_item_id);
        const requestedQty = Number(sp.split_qty !== undefined ? sp.split_qty : sp.quantity) || 0;
        const moveQty = Math.min(Number(it?.quantity || 0), Math.max(0, requestedQty));
        if (!it || moveQty <= 0) continue;

        if (moveQty >= Number(it.quantity)) {
          await sbRest(`order_items?id=eq.${encodeURIComponent(it.id)}`, {
            method: 'PATCH',
            body: { order_id: newOrderId }
          });
        } else {
          await sbRest(`order_items?id=eq.${encodeURIComponent(it.id)}`, {
            method: 'PATCH',
            body: { quantity: Number(it.quantity) - moveQty }
          });
          await sbRest('order_items', {
            method: 'POST',
            body: {
              id: `OI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              order_id: newOrderId,
              product_id: it.product_id,
              product_name: it.product_name,
              item_type: it.item_type,
              order_round: it.order_round,
              quantity: moveQty,
              returned_qty: 0,
              unit_price: it.unit_price,
              unit_cost: it.unit_cost,
              modifiers_json: it.modifiers_json,
              recipe_snapshot_json: it.recipe_snapshot_json,
              item_status: 'ACTIVE',
              kitchen_status: it.kitchen_status,
              input_source: it.input_source,
              created_at: now
            }
          });
        }
      }

      await recalculateSupabaseOrderTotals(srcOrd.id);
      await recalculateSupabaseOrderTotals(newOrderId);

      const remItems = await sbRest(`order_items?select=id&order_id=eq.${encodeURIComponent(srcOrd.id)}&item_status=eq.ACTIVE`);
      if (!remItems || remItems.length === 0) {
        if (srcOrd.table_id) {
          await sbRest(`dining_tables?id=eq.${encodeURIComponent(srcOrd.table_id)}`, {
            method: 'PATCH',
            body: { status: 'AVAILABLE', current_order_id: null }
          });
        }
        await sbRest(`orders?id=eq.${encodeURIComponent(srcOrd.id)}`, { method: 'DELETE' });
      }

      return send(200, { success: true, newOrderId, data: await getSupabaseBootstrapData() });
    }

    if (req.method === 'POST' && pathname === '/api/expenses/save') {
      const { category = 'OTHER', title, amount } = body;
      const now = new Date().toISOString();
      await sbRest('expenses', {
        method: 'POST',
        body: {
          id: `EXP-${Date.now().toString().slice(-5)}`,
          category,
          title,
          amount: Number(amount),
          expense_date: now.slice(0, 10),
          reference_id: '',
          created_at: now
        }
      });
      return send(200, { success: true, data: await getSupabaseBootstrapData() });
    }

    if (req.method === 'POST' && pathname === '/api/orders/update-meta') {
      const { order_id, bill_title = '', bill_note = '', customer_id = null, customer_name = '' } = body;
      try {
        await sbRest(`orders?id=eq.${encodeURIComponent(order_id)}`, {
          method: 'PATCH',
          body: { bill_title, bill_note, customer_id, customer_name }
        });
      } catch {
        // Fallback if columns not added yet in remote Supabase
      }
      return send(200, { success: true, data: await getSupabaseBootstrapData() });
    }

    if (req.method === 'POST' && pathname === '/api/customers/save') {
      const { id, name, phone = '', tier = 'ขาประจำ', points = 0, note = '' } = body;
      const cusId = id || `CUS-${Date.now().toString().slice(-4)}`;
      try {
        await sbRest('customers', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: { id: cusId, name, phone, tier, points: Number(points) || 0, note }
        });
      } catch {
        // Fallback if table not created yet in remote Supabase
      }
      return send(200, { success: true, cusId, data: await getSupabaseBootstrapData() });
    }

    if (req.method === 'POST' && pathname === '/api/loyalty-settings/save') {
      const merged = {
        ...DEFAULT_LOYALTY_SETTINGS,
        spend_per_point: Math.max(1, Number(body.spend_per_point) || 25),
        points_earned: Math.max(0.1, Number(body.points_earned) || 1),
        redeem_points_unit: Math.max(1, Number(body.redeem_points_unit) || 10),
        redeem_discount_baht: Math.max(1, Number(body.redeem_discount_baht) || 10),
        min_redeem_points: Math.max(1, Number(body.min_redeem_points) || 10),
        auto_upgrade_tier: body.auto_upgrade_tier !== false,
        tiers: Array.isArray(body.tiers) && body.tiers.length > 0
          ? body.tiers.map(t => ({
              name: String(t.name || 'สมาชิก').trim(),
              min_spent: Math.max(0, Number(t.min_spent) || 0),
              points_multiplier: Math.max(0.1, Number(t.points_multiplier) || 1),
              discount_pct: Math.max(0, Math.min(100, Number(t.discount_pct) || 0))
            }))
          : DEFAULT_LOYALTY_SETTINGS.tiers
      };
      try {
        await sbRest('customers', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: {
            id: 'SYS-LOYALTY-CONFIG',
            name: '__LOYALTY_CONFIG__',
            phone: '',
            tier: 'SYSTEM',
            points: 0,
            total_spent: 0,
            note: JSON.stringify(merged)
          }
        });
        if (merged.auto_upgrade_tier) {
          const allCus = await sbRest('customers?select=*');
          const sortedTiers = [...merged.tiers].sort((a, b) => b.min_spent - a.min_spent);
          for (const c of allCus) {
            if (c.id === 'SYS-LOYALTY-CONFIG') continue;
            const matched = sortedTiers.find(t => (Number(c.total_spent) || 0) >= t.min_spent);
            if (matched && matched.name !== c.tier) {
              await sbRest(`customers?id=eq.${encodeURIComponent(c.id)}`, {
                method: 'PATCH',
                body: { tier: matched.name }
              });
            }
          }
        }
      } catch {}
      return send(200, { success: true, loyaltySettings: merged, data: await getSupabaseBootstrapData() });
    }

    if (req.method === 'POST' && pathname === '/api/stock-in/update') {
      const { receipt_id, supplier_name = 'ร้านค้าส่ง / ตลาดสด', note = '', items = [] } = body;
      const oldItems = await sbRest(`stock_in_items?select=*&receipt_id=eq.${encodeURIComponent(receipt_id)}`);
      for (const oldIt of oldItems) {
        await sbRevertStockInItem(receipt_id, oldIt);
      }
      await sbRest(`stock_in_items?receipt_id=eq.${encodeURIComponent(receipt_id)}`, { method: 'DELETE' });

      let newTotalCost = 0;
      for (const line of items) {
        const inputQty = Math.max(0, Number(line.input_qty) || 0);
        if (inputQty <= 0) continue;
        const conv = Math.max(1, Number(line.conversion_rate) || 1);
        const lineCost = Math.max(0, Number(line.total_line_cost ?? line.line_cost) || 0);
        const lineType = line.item_target_type || line.target_type || 'GROCERY';
        const lineProdId = line.product_id || (lineType === 'GROCERY' ? line.target_id : null);
        const lineIngId = line.ingredient_id || (lineType === 'INGREDIENT' ? line.target_id : null);
        newTotalCost += lineCost;

        if (lineType === 'GROCERY' && lineProdId) {
          const prods = await sbRest(`products?select=*&id=eq.${encodeURIComponent(lineProdId)}`);
          const prod = prods[0];
          if (!prod) continue;
          const qtyBefore = Number(prod.stock_qty) || 0;
          const qtyAdded = Math.round(inputQty * conv * 100) / 100;
          const qtyAfter = Math.round((qtyBefore + qtyAdded) * 100) / 100;
          const baseCost = weightedAverageCost(qtyBefore, prod.cost, qtyAdded, lineCost, 2);
          await sbRest(`products?id=eq.${encodeURIComponent(prod.id)}`, { method: 'PATCH', body: { stock_qty: qtyAfter, cost: baseCost } });
          await sbRest('stock_in_items', {
            method: 'POST',
            body: {
              id: line.id || `SRI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              receipt_id,
              item_target_type: 'GROCERY',
              product_id: prod.id,
              ingredient_id: null,
              item_name: prod.name,
              unit_label: line.unit_label || prod.purchase_unit,
              input_qty: inputQty,
              conversion_rate: conv,
              qty_before: qtyBefore,
              qty_added: qtyAdded,
              qty_after: qtyAfter,
              purchase_cost_per_base_unit: baseCost,
              total_line_cost: lineCost
            }
          });
        } else if (lineType === 'INGREDIENT' && lineIngId) {
          const ings = await sbRest(`ingredients?select=*&id=eq.${encodeURIComponent(lineIngId)}`);
          const ing = ings[0];
          if (!ing) continue;
          const qtyBefore = Number(ing.current_qty) || 0;
          const qtyAdded = Math.round(inputQty * conv * 100) / 100;
          const qtyAfter = Math.round((qtyBefore + qtyAdded) * 100) / 100;
          const baseCost = weightedAverageCost(qtyBefore, ing.cost_per_unit, qtyAdded, lineCost, 4);
          await sbRest(`ingredients?id=eq.${encodeURIComponent(ing.id)}`, { method: 'PATCH', body: { current_qty: qtyAfter, cost_per_unit: baseCost } });
          await sbRest('stock_in_items', {
            method: 'POST',
            body: {
              id: line.id || `SRI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              receipt_id,
              item_target_type: 'INGREDIENT',
              product_id: null,
              ingredient_id: ing.id,
              item_name: ing.name,
              unit_label: line.unit_label || ing.purchase_unit,
              input_qty: inputQty,
              conversion_rate: conv,
              qty_before: qtyBefore,
              qty_added: qtyAdded,
              qty_after: qtyAfter,
              purchase_cost_per_base_unit: baseCost,
              total_line_cost: lineCost
            }
          });
        }
      }

      await sbRest(`stock_in_receipts?id=eq.${encodeURIComponent(receipt_id)}`, {
        method: 'PATCH',
        body: { supplier_name, note, total_cost: newTotalCost }
      });
      try {
        await sbRest(`expenses?reference_id=eq.${encodeURIComponent(receipt_id)}`, {
          method: 'PATCH',
          body: { title: `รับของเข้าสต็อก (${receipt_id}) - ${supplier_name}`, amount: newTotalCost }
        });
      } catch {}

      return send(200, { success: true, receiptId: receipt_id, data: await getSupabaseBootstrapData() });
    }

    if (req.method === 'POST' && pathname === '/api/stock-in/delete') {
      const { receipt_id } = body;
      const oldItems = await sbRest(`stock_in_items?select=*&receipt_id=eq.${encodeURIComponent(receipt_id)}`);
      const now = new Date().toISOString();
      for (const oldIt of oldItems) {
        await sbRevertStockInItem(receipt_id, oldIt);
        const isGrocery = oldIt.item_target_type === 'GROCERY';
        let currentStock = 0;
        let unit = 'ชิ้น';
        let name = isGrocery ? oldIt.product_name : oldIt.ingredient_name;
        if (isGrocery && oldIt.product_id) {
          const prods = await sbRest(`products?select=stock_qty,unit,name&id=eq.${encodeURIComponent(oldIt.product_id)}`);
          if (prods[0]) {
            currentStock = Number(prods[0].stock_qty);
            unit = prods[0].unit || 'ชิ้น';
            name = prods[0].name || name;
          }
        } else if (!isGrocery && oldIt.ingredient_id) {
          const ings = await sbRest(`ingredients?select=current_qty,stock_unit,name&id=eq.${encodeURIComponent(oldIt.ingredient_id)}`);
          if (ings[0]) {
            currentStock = Number(ings[0].current_qty);
            unit = ings[0].stock_unit || 'กรัม';
            name = ings[0].name || name;
          }
        }
        await sbRest('inventory_logs', {
          method: 'POST',
          body: {
            id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            target_type: oldIt.item_target_type,
            product_id: oldIt.product_id || null,
            ingredient_id: oldIt.ingredient_id || null,
            item_name: name || 'สินค้า',
            change_qty: -Number(oldIt.qty_added),
            balance_after: currentStock,
            unit,
            reason: 'CANCEL_STOCK_IN',
            reference_id: receipt_id,
            note: `ลบใบรับของ #${receipt_id} (หักคืนสต็อก -${oldIt.qty_added} ${unit})`,
            created_at: now
          }
        });
      }
      await sbRest(`stock_in_items?receipt_id=eq.${encodeURIComponent(receipt_id)}`, { method: 'DELETE' });
      await sbRest(`stock_in_receipts?id=eq.${encodeURIComponent(receipt_id)}`, { method: 'DELETE' });
      try {
        await sbRest(`expenses?reference_id=eq.${encodeURIComponent(receipt_id)}`, { method: 'DELETE' });
      } catch {}
      return send(200, { success: true, data: await getSupabaseBootstrapData() });
    }

    return send(404, { error: `API route not found: ${pathname}` });
  } catch (err) {
    console.error('Vercel API Error:', err);
    return send(500, { error: err.message || 'Internal Server Error' });
  }
};

