const { getSupabaseConfig, sbRest, getSupabaseBootstrapData } = require('../supabaseAdapter');

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
const THAI_NUM_MAP = {
  'ครึ่ง': 1, 'หนึ่ง': 1, 'นึง': 1, 'สอง': 2, 'คู่': 2, 'สาม': 3, 'สี่': 4,
  'ห้า': 5, 'หก': 6, 'เจ็ด': 7, 'แปด': 8, 'เก้า': 9, 'สิบ': 10, 'โหล': 12
};

function normalizeThaiNumbers(text) {
  let out = text;
  const keys = Object.keys(THAI_NUM_MAP).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const re = new RegExp(`(โต๊ะ\\s*|เบอร์\\s*|ซุ้ม\\s*|เอา\\s*|จำนวน\\s*|\\s+)${k}(?=\\s|$|จาน|ถ้วย|ขวด|ซอง|ห่อ|ถัง|ชิ้น|กล่อง|แพ็ค|ฟอง)`, 'g');
    out = out.replace(re, `$1${THAI_NUM_MAP[k]}`);
  }
  return out;
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
    const nextStart = i + 1 < matches.length ? matches[i + 1].start : workingText.length;
    const tail = workingText.slice(cur.end, nextStart);

    let quantity = 1;
    const qm = tail.match(/(\d+)/);
    if (qm) quantity = Math.min(100, Math.max(1, parseInt(qm[1], 10)));

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
  const body = typeof req.body === 'object' && req.body !== null
    ? req.body
    : (typeof req.body === 'string' && req.body ? JSON.parse(req.body) : {});

  const send = (code, payload) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
  };

  try {
    if (pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      return res.end(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
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

      if (existingOrderId) {
        try {
          await sbRest(`orders?id=eq.${encodeURIComponent(existingOrderId)}`, {
            method: 'PATCH',
            body: {
              bill_title,
              bill_note,
              customer_id,
              customer_name,
              status: settle_immediately ? 'PAID' : 'OPEN',
              paid_at: settle_immediately ? now : null
            }
          });
        } catch {}
      } else if (order_type === 'DINE_IN' && table_id) {
        const tbl = data.tables.find(t => t.id === table_id);
        if (tbl) contextLabel = tbl.name;
        if (tbl && tbl.active_order) {
          orderId = tbl.active_order.id;
          orderRound = Math.max(1, ...tbl.active_order.items.map(i => Number(i.order_round || 1))) + 1;
          try {
            await sbRest(`orders?id=eq.${encodeURIComponent(orderId)}`, {
              method: 'PATCH',
              body: { bill_title, bill_note, customer_id, customer_name }
            });
          } catch {}
        } else {
          await sbRest('orders', {
            method: 'POST',
            body: {
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
            }
          });
          await sbRest(`dining_tables?id=eq.${encodeURIComponent(table_id)}`, {
            method: 'PATCH',
            body: { status: 'OCCUPIED', current_order_id: orderId }
          });
        }
      } else {
        await sbRest('orders', {
          method: 'POST',
          body: {
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
          }
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
      await sbRest(`order_items?id=eq.${encodeURIComponent(targetItem.id)}`, {
        method: 'PATCH',
        body: {
          item_status: validMode,
          kitchen_status: targetItem.item_type === 'FOOD' ? 'CANCELLED' : 'NONE'
        }
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
      const { order_id, table_id, payment_method = 'CASH', discount = 0, cash_received = 0 } = body;
      const now = new Date().toISOString();
      let targetOrderId = order_id;

      if (!targetOrderId && table_id) {
        const tbls = await sbRest(`dining_tables?select=*&id=eq.${encodeURIComponent(table_id)}`);
        if (tbls[0]) targetOrderId = tbls[0].current_order_id;
      }
      if (!targetOrderId) return send(404, { error: 'ไม่พบบิลที่ต้องการชำระเงิน' });

      await sbRest(`orders?id=eq.${encodeURIComponent(targetOrderId)}`, {
        method: 'PATCH',
        body: { discount: Number(discount) || 0 }
      });
      await recalculateSupabaseOrderTotals(targetOrderId);

      const ords = await sbRest(`orders?select=*&id=eq.${encodeURIComponent(targetOrderId)}`);
      const refreshed = ords[0];
      const totalAmt = Number(refreshed.total_amount);
      const received = Number(cash_received) >= totalAmt ? Number(cash_received) : totalAmt;
      const change = Math.round(Math.max(0, received - totalAmt) * 100) / 100;

      await sbRest(`orders?id=eq.${encodeURIComponent(targetOrderId)}`, {
        method: 'PATCH',
        body: { status: 'PAID', payment_method, cash_received: received, change_amount: change, paid_at: now }
      });

      if (refreshed.table_id) {
        await sbRest(`dining_tables?id=eq.${encodeURIComponent(refreshed.table_id)}`, {
          method: 'PATCH',
          body: { status: 'AVAILABLE', current_order_id: null }
        });
      }

      return send(200, { success: true, orderId: targetOrderId, change, data: await getSupabaseBootstrapData() });
    }

    if (req.method === 'POST' && pathname === '/api/kds/status') {
      const { order_item_id, kitchen_status } = body;
      await sbRest(`order_items?id=eq.${encodeURIComponent(order_item_id)}`, {
        method: 'PATCH',
        body: { kitchen_status }
      });
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
        const lineCost = Math.max(0, Number(line.total_line_cost) || 0);
        totalReceiptCost += lineCost;

        if (line.item_target_type === 'GROCERY') {
          const prod = data.products.find(p => p.id === line.target_id);
          if (!prod) continue;
          const conv = usePurchaseUnit ? (prod.conversion_rate || 1) : 1;
          const qtyBefore = prod.stock_qty;
          const qtyAdded = Math.round(inputQty * conv * 100) / 100;
          const qtyAfter = Math.round((qtyBefore + qtyAdded) * 100) / 100;
          const baseCost = qtyAdded > 0 && lineCost > 0 ? Math.round((lineCost / qtyAdded) * 100) / 100 : prod.cost;

          await sbRest(`products?id=eq.${encodeURIComponent(prod.id)}`, {
            method: 'PATCH',
            body: { stock_qty: qtyAfter, cost: baseCost }
          });

          processed.push({
            item_target_type: 'GROCERY',
            product_id: prod.id,
            ingredient_id: null,
            item_name: prod.name,
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
          const ing = data.ingredients.find(i => i.id === line.target_id);
          if (!ing) continue;
          const conv = usePurchaseUnit ? (ing.conversion_rate || 1) : 1;
          const qtyBefore = ing.current_qty;
          const qtyAdded = Math.round(inputQty * conv * 100) / 100;
          const qtyAfter = Math.round((qtyBefore + qtyAdded) * 100) / 100;
          const baseCost = qtyAdded > 0 && lineCost > 0 ? Math.round((lineCost / qtyAdded) * 10000) / 10000 : ing.cost_per_unit;

          await sbRest(`ingredients?id=eq.${encodeURIComponent(ing.id)}`, {
            method: 'PATCH',
            body: { current_qty: qtyAfter, cost_per_unit: baseCost }
          });

          processed.push({
            item_target_type: 'INGREDIENT',
            product_id: null,
            ingredient_id: ing.id,
            item_name: ing.name,
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
            note: `นำเข้า ${pl.input_qty} ${pl.unit_label} (เดิม ${pl.qty_before} -> ใหม่ ${pl.qty_after})`,
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
      const { name, zone_name = 'โซนในร้าน' } = body;
      const tblId = `T${Date.now().toString().slice(-3)}`;
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
      return send(200, { success: true, tblId, data: await getSupabaseBootstrapData() });
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

    return send(404, { error: `API route not found: ${pathname}` });
  } catch (err) {
    console.error('Vercel API Error:', err);
    return send(500, { error: err.message || 'Internal Server Error' });
  }
};

