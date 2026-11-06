const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { db, recalculateAllFoodCosts } = require('./db');
const { parseVoiceCommand, getRecipePreviewForProduct } = require('./voiceParser');

const PORT = process.env.PORT || 3000;
const sseClients = new Set();

function broadcastUpdate(eventType = 'state_updated', payload = {}) {
  const msg = `data: ${JSON.stringify({ type: eventType, payload, timestamp: new Date().toISOString() })}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(msg);
    } catch {
      sseClients.delete(res);
    }
  }
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString('utf8');
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

function recalculateOrderTotals(orderId) {
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  let subtotal = 0;
  let totalCost = 0;

  for (const item of items) {
    if (item.item_status === 'ACTIVE') {
      const activeQty = Math.max(0, item.quantity - (item.returned_qty || 0));
      subtotal += activeQty * item.unit_price;
      totalCost += activeQty * item.unit_cost;
    }
  }

  const order = db.prepare('SELECT discount FROM orders WHERE id = ?').get(orderId);
  const discount = order ? (order.discount || 0) : 0;
  const totalAmount = Math.max(0, subtotal - discount);

  db.prepare(`
    UPDATE orders
    SET subtotal = ?, total_amount = ?, total_cost = ?
    WHERE id = ?
  `).run(
    Math.round(subtotal * 100) / 100,
    Math.round(totalAmount * 100) / 100,
    Math.round(totalCost * 100) / 100,
    orderId
  );
}

function getFullBootstrapData() {
  recalculateAllFoodCosts();

  const categories = db.prepare('SELECT * FROM categories ORDER BY id').all();
  const rawProducts = db.prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY item_type DESC, id ASC').all();
  const modifiers = db.prepare('SELECT * FROM product_modifiers ORDER BY id').all().map(m => ({
    ...m,
    voice_keywords: JSON.parse(m.voice_keywords || '[]')
  }));
  const ingredients = db.prepare('SELECT * FROM ingredients ORDER BY id').all();
  const recipeItems = db.prepare(`
    SELECT r.*, i.name as ingredient_name, i.stock_unit, i.cost_per_unit
    FROM recipe_items r
    JOIN ingredients i ON r.ingredient_id = i.id
  `).all();

  const products = rawProducts.map(p => {
    const prodRecipes = recipeItems.filter(r => r.product_id === p.id);
    return {
      ...p,
      voice_aliases: JSON.parse(p.voice_aliases || '[]'),
      track_stock: Boolean(p.track_stock),
      send_to_kitchen: Boolean(p.send_to_kitchen),
      recipe_items: prodRecipes
    };
  });

  const rawTables = db.prepare('SELECT * FROM dining_tables ORDER BY id').all();
  const customers = db.prepare('SELECT * FROM customers ORDER BY total_spent DESC, created_at DESC').all();
  const openOrders = db.prepare("SELECT * FROM orders WHERE status = 'OPEN' ORDER BY created_at DESC").all();
  const allRecentOrders = db.prepare("SELECT * FROM orders WHERE status IN ('OPEN', 'PAID', 'CANCELLED') ORDER BY created_at DESC LIMIT 60").all();
  const allOrderIds = allRecentOrders.map(o => o.id);

  let allOrderItemsWithMeta = [];
  if (allOrderIds.length > 0) {
    allOrderItemsWithMeta = db.prepare(`
      SELECT * FROM order_items
      WHERE order_id IN (${allOrderIds.map(() => '?').join(',')})
      ORDER BY created_at ASC
    `).all(...allOrderIds).map(it => ({
      ...it,
      modifiers: JSON.parse(it.modifiers_json || '[]'),
      recipe_snapshot: JSON.parse(it.recipe_snapshot_json || '[]')
    }));
  }

  const allOpenItems = allOrderItemsWithMeta;

  const tables = rawTables.map(t => {
    const activeOrder = openOrders.find(o => o.id === t.current_order_id || (o.table_id === t.id && o.status === 'OPEN')) || null;
    const items = activeOrder ? allOpenItems.filter(i => i.order_id === activeOrder.id) : [];
    return {
      ...t,
      voice_aliases: JSON.parse(t.voice_aliases || '[]'),
      active_order: activeOrder ? { ...activeOrder, items } : null
    };
  });

  const tableMap = new Map(rawTables.map(t => [t.id, t]));
  const allBills = allRecentOrders.map(o => {
    const tbl = o.table_id ? tableMap.get(o.table_id) : null;
    return {
      ...o,
      table_name: tbl ? tbl.name : null,
      zone_name: tbl ? tbl.zone_name : null,
      items: allOrderItemsWithMeta.filter(i => i.order_id === o.id)
    };
  });

  // Kitchen Queue (KDS): all active FOOD items that are PENDING or COOKING (plus recently SERVED in last 30 mins)
  const kdsRows = db.prepare(`
    SELECT oi.*, o.order_type, o.table_id, dt.name as table_name, dt.zone_name
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    LEFT JOIN dining_tables dt ON o.table_id = dt.id
    WHERE oi.item_type = 'FOOD'
      AND oi.item_status = 'ACTIVE'
      AND oi.kitchen_status IN ('PENDING', 'COOKING', 'SERVED')
      AND o.status IN ('OPEN', 'PAID')
    ORDER BY
      CASE oi.kitchen_status
        WHEN 'PENDING' THEN 1
        WHEN 'COOKING' THEN 2
        WHEN 'SERVED' THEN 3
      END,
      oi.created_at ASC
    LIMIT 40
  `).all().map(row => ({
    ...row,
    modifiers: JSON.parse(row.modifiers_json || '[]'),
    recipe_snapshot: JSON.parse(row.recipe_snapshot_json || '[]')
  }));

  // Stock-in receipts with items
  const receipts = db.prepare('SELECT * FROM stock_in_receipts ORDER BY created_at DESC LIMIT 30').all();
  const receiptItems = db.prepare('SELECT * FROM stock_in_items').all();
  const stockInReceipts = receipts.map(r => ({
    ...r,
    items: receiptItems.filter(it => it.receipt_id === r.id)
  }));

  const inventoryLogs = db.prepare('SELECT * FROM inventory_logs ORDER BY created_at DESC LIMIT 60').all();
  const expenses = db.prepare('SELECT * FROM expenses ORDER BY created_at DESC LIMIT 40').all();

  // Dashboard Analytics (Sales, COGS, Waste, Profit/Loss)
  const allValidOrders = db.prepare("SELECT * FROM orders WHERE status IN ('PAID', 'OPEN') ORDER BY created_at DESC").all();
  const allOrderItems = db.prepare(`
    SELECT oi.*, o.status as order_status, o.payment_method, o.order_type, dt.name as table_name
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    LEFT JOIN dining_tables dt ON o.table_id = dt.id
    WHERE o.status IN ('PAID', 'OPEN')
    ORDER BY oi.created_at DESC
  `).all();

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

  const productSalesMap = new Map();

  for (const o of allValidOrders) {
    if (o.status === 'PAID') {
      paidRevenue += o.total_amount;
      if (o.payment_method === 'QR_PROMPTPAY') {
        qrRevenue += o.total_amount;
      } else {
        cashRevenue += o.total_amount;
      }
    } else if (o.status === 'OPEN') {
      openTableRevenue += o.total_amount;
    }
  }

  for (const item of allOrderItems) {
    if (item.item_status === 'VOID_WASTE') {
      wasteCost += item.quantity * item.unit_cost;
      continue;
    }
    if (item.item_status === 'RETURNED_RESTOCK') {
      returnedRestockValue += item.quantity * item.unit_price;
      continue;
    }
    const activeQty = Math.max(0, item.quantity - (item.returned_qty || 0));
    const lineRev = activeQty * item.unit_price;
    const lineCost = activeQty * item.unit_cost;

    if (item.item_type === 'GROCERY') {
      groceryRevenue += lineRev;
      groceryCost += lineCost;
    } else {
      foodRevenue += lineRev;
      foodCost += lineCost;
    }

    const prev = productSalesMap.get(item.product_id) || {
      product_id: item.product_id,
      name: item.product_name,
      item_type: item.item_type,
      qty_sold: 0,
      revenue: 0,
      cost: 0,
      profit: 0
    };
    prev.qty_sold += activeQty;
    prev.revenue += lineRev;
    prev.cost += lineCost;
    prev.profit += (lineRev - lineCost);
    productSalesMap.set(item.product_id, prev);
  }

  const totalRevenue = groceryRevenue + foodRevenue;
  const totalCogs = groceryCost + foodCost;
  const grossProfit = totalRevenue - totalCogs;
  const totalOperatingExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalStockInPurchases = stockInReceipts.reduce((sum, r) => sum + r.total_cost, 0);
  const netProfit = grossProfit - wasteCost - totalOperatingExpenses;

  const topSellers = Array.from(productSalesMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  const lowStockGrocery = products.filter(p => p.item_type === 'GROCERY' && p.track_stock && p.stock_qty <= p.low_stock_threshold);
  const lowStockIngredients = ingredients.filter(i => i.current_qty <= i.low_stock_threshold);

  return {
    categories,
    products,
    modifiers,
    ingredients,
    recipeItems,
    tables,
    customers,
    allBills,
    kitchenQueue: kdsRows,
    stockInReceipts,
    inventoryLogs,
    expenses,
    recentOrders: allValidOrders.slice(0, 20),
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
      operating_expenses: Math.round(totalOperatingExpenses * 100) / 100,
      stock_in_purchases: Math.round(totalStockInPurchases * 100) / 100,
      net_profit: Math.round(netProfit * 100) / 100,
      net_margin_pct: totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 1000) / 10 : 0,
      cash_revenue: Math.round(cashRevenue * 100) / 100,
      qr_revenue: Math.round(qrRevenue * 100) / 100,
      top_sellers: topSellers,
      low_stock_grocery: lowStockGrocery,
      low_stock_ingredients: lowStockIngredients
    }
  };
}

// Helper to deduct stock for a single order item
function deductStockAndRecipeForItem(product, modifierNames, quantity, orderId, contextLabel) {
  const now = new Date().toISOString();
  const insertLog = db.prepare(`
    INSERT INTO inventory_logs (id, target_type, product_id, ingredient_id, item_name, change_qty, balance_after, unit, reason, reference_id, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const allMods = db.prepare('SELECT * FROM product_modifiers').all();
  const matchedModIds = allMods.filter(m => modifierNames.includes(m.name)).map(m => m.id);

  if (product.item_type === 'GROCERY' && product.track_stock) {
    const newStock = Math.round((product.stock_qty - quantity) * 100) / 100;
    db.prepare('UPDATE products SET stock_qty = ? WHERE id = ?').run(newStock, product.id);
    insertLog.run(
      `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      'GROCERY',
      product.id,
      null,
      product.name,
      -quantity,
      newStock,
      product.unit,
      'SALE',
      orderId,
      contextLabel,
      now
    );
    return [];
  }

  if (product.item_type === 'FOOD') {
    const deductions = getRecipePreviewForProduct(product.id, matchedModIds, quantity);
    const updateIng = db.prepare('UPDATE ingredients SET current_qty = ? WHERE id = ?');

    for (const d of deductions) {
      const ingRow = db.prepare('SELECT current_qty, stock_unit, name FROM ingredients WHERE id = ?').get(d.ingredient_id);
      if (ingRow) {
        const nextQty = Math.round((ingRow.current_qty - d.qty) * 100) / 100;
        updateIng.run(nextQty, d.ingredient_id);
        insertLog.run(
          `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          'INGREDIENT',
          null,
          d.ingredient_id,
          ingRow.name,
          -d.qty,
          nextQty,
          ingRow.stock_unit,
          'RECIPE_DEDUCT',
          orderId,
          `ตัดสูตร ${product.name} x${quantity} (${contextLabel})`,
          now
        );
      }
    }
    return deductions;
  }

  return [];
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  try {
    // SSE Endpoint
    if (req.method === 'GET' && pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    // Bootstrap Full State
    if (req.method === 'GET' && pathname === '/api/bootstrap') {
      return sendJson(res, 200, getFullBootstrapData());
    }

    // Voice Command Parser
    if (req.method === 'POST' && pathname === '/api/voice/parse') {
      const body = await parseJsonBody(req);
      const result = parseVoiceCommand(body.text || '', body.fallbackTableId || null);
      return sendJson(res, 200, result);
    }

    // Submit Order (Walk-in Retail, Held Bill, or Dine-In Table)
    if (req.method === 'POST' && pathname === '/api/orders/submit') {
      const body = await parseJsonBody(req);
      const {
        order_id = null,
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

      if (!Array.isArray(items) || items.length === 0) {
        return sendJson(res, 400, { error: 'ไม่มีรายการสินค้าในออเดอร์' });
      }

      const now = new Date().toISOString();
      let orderId = order_id;
      let orderRound = 1;
      let contextLabel = bill_title ? `บิล: ${bill_title}` : 'ขายหน้าร้าน (Walk-in)';

      if (orderId) {
        const existingById = db.prepare("SELECT * FROM orders WHERE id = ? AND status = 'OPEN'").get(orderId);
        if (existingById) {
          const maxRoundRow = db.prepare('SELECT MAX(order_round) as mr FROM order_items WHERE order_id = ?').get(orderId);
          orderRound = (maxRoundRow && maxRoundRow.mr ? maxRoundRow.mr : 1) + 1;
          db.prepare(`
            UPDATE orders SET bill_title = COALESCE(NULLIF(?, ''), bill_title), bill_note = COALESCE(NULLIF(?, ''), bill_note),
            customer_id = COALESCE(?, customer_id), customer_name = COALESCE(NULLIF(?, ''), customer_name)
            WHERE id = ?
          `).run(bill_title, bill_note, customer_id, customer_name, orderId);
        } else {
          orderId = null;
        }
      }

      if (!orderId && order_type === 'DINE_IN' && table_id) {
        const tableRow = db.prepare('SELECT * FROM dining_tables WHERE id = ?').get(table_id);
        if (!tableRow) return sendJson(res, 404, { error: 'ไม่พบโต๊ะที่เลือก' });
        contextLabel = tableRow.name;

        const existingOrder = tableRow.current_order_id
          ? db.prepare("SELECT * FROM orders WHERE id = ? AND status = 'OPEN'").get(tableRow.current_order_id)
          : null;

        if (existingOrder) {
          orderId = existingOrder.id;
          const maxRoundRow = db.prepare('SELECT MAX(order_round) as mr FROM order_items WHERE order_id = ?').get(orderId);
          orderRound = (maxRoundRow && maxRoundRow.mr ? maxRoundRow.mr : 1) + 1;
          db.prepare(`
            UPDATE orders SET bill_title = COALESCE(NULLIF(?, ''), bill_title), bill_note = COALESCE(NULLIF(?, ''), bill_note),
            customer_id = COALESCE(?, customer_id), customer_name = COALESCE(NULLIF(?, ''), customer_name)
            WHERE id = ?
          `).run(bill_title, bill_note, customer_id, customer_name, orderId);
        } else {
          orderId = `ORD-${Date.now().toString().slice(-6)}`;
          db.prepare(`
            INSERT INTO orders (id, order_type, table_id, bill_title, bill_note, customer_id, customer_name, status, subtotal, discount, total_amount, total_cost, payment_method, created_at)
            VALUES (?, 'DINE_IN', ?, ?, ?, ?, ?, 'OPEN', 0, 0, 0, 0, ?, ?)
          `).run(orderId, table_id, bill_title, bill_note, customer_id, customer_name, payment_method, now);

          db.prepare("UPDATE dining_tables SET status = 'OCCUPIED', current_order_id = ? WHERE id = ?").run(orderId, table_id);
        }
      } else if (!orderId) {
        // RETAIL Walk-in or Held Bill
        orderId = `ORD-${Date.now().toString().slice(-6)}`;
        const status = settle_immediately ? 'PAID' : 'OPEN';
        db.prepare(`
          INSERT INTO orders (id, order_type, table_id, bill_title, bill_note, customer_id, customer_name, status, subtotal, discount, total_amount, total_cost, payment_method, cash_received, change_amount, created_at, paid_at)
          VALUES (?, 'RETAIL', NULL, ?, ?, ?, ?, ?, 0, ?, 0, 0, ?, ?, 0, ?, ?)
        `).run(orderId, bill_title || (settle_immediately ? 'ขายหน้าร้าน' : 'บิลเปิดค้างไว้'), bill_note, customer_id, customer_name, status, discount, payment_method, cash_received, now, settle_immediately ? now : null);
      }

      const insertItem = db.prepare(`
        INSERT INTO order_items (
          id, order_id, product_id, product_name, item_type, order_round, quantity, returned_qty,
          unit_price, unit_cost, modifiers_json, recipe_snapshot_json, item_status, kitchen_status, input_source, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
      `);

      const allMods = db.prepare('SELECT * FROM product_modifiers').all();

      for (const it of items) {
        const prod = db.prepare('SELECT * FROM products WHERE id = ?').get(it.product_id);
        if (!prod) continue;

        const qty = Math.max(1, Number(it.quantity) || 1);
        const modNames = Array.isArray(it.modifiers) ? it.modifiers : [];
        let extraPrice = 0;
        let extraCost = 0;

        for (const mName of modNames) {
          const mRow = allMods.find(m => m.name === mName);
          if (mRow) {
            extraPrice += mRow.extra_price;
            extraCost += mRow.extra_cost;
          }
        }

        const unitPrice = it.unit_price !== undefined ? Number(it.unit_price) : (prod.price + extraPrice);
        const unitCost = Math.round((prod.cost + extraCost) * 100) / 100;
        const kitchenStatus = prod.send_to_kitchen ? 'PENDING' : 'NONE';
        const itemSource = it.input_source || input_source || 'TOUCH';

        const recipeSnapshot = deductStockAndRecipeForItem(prod, modNames, qty, orderId, contextLabel);

        insertItem.run(
          `OI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          orderId,
          prod.id,
          prod.name,
          prod.item_type,
          orderRound,
          qty,
          unitPrice,
          unitCost,
          JSON.stringify(modNames),
          JSON.stringify(recipeSnapshot),
          kitchenStatus,
          itemSource,
          now
        );
      }

      recalculateOrderTotals(orderId);

      if (settle_immediately) {
        const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
        const received = cash_received >= updatedOrder.total_amount ? cash_received : updatedOrder.total_amount;
        const change = Math.max(0, received - updatedOrder.total_amount);
        db.prepare(`
          UPDATE orders SET status = 'PAID', payment_method = ?, cash_received = ?, change_amount = ?, paid_at = ?
          WHERE id = ?
        `).run(payment_method, received, change, now, orderId);

        if (updatedOrder.customer_id && updatedOrder.total_amount > 0) {
          const pts = Math.floor(updatedOrder.total_amount / 25);
          db.prepare('UPDATE customers SET points = points + ?, total_spent = total_spent + ? WHERE id = ?')
            .run(pts, updatedOrder.total_amount, updatedOrder.customer_id);
        }
      }

      broadcastUpdate('order_submitted', { orderId, table_id });
      return sendJson(res, 200, { success: true, orderId, data: getFullBootstrapData() });
    }

    // Update Bill Meta (Title, Note, Customer Member)
    if (req.method === 'POST' && pathname === '/api/orders/update-meta') {
      const body = await parseJsonBody(req);
      const { order_id, bill_title = '', bill_note = '', customer_id = null, customer_name = '' } = body;
      if (!order_id) return sendJson(res, 400, { error: 'กรุณาระบุเลขที่บิล' });
      db.prepare(`
        UPDATE orders
        SET bill_title = ?, bill_note = ?, customer_id = ?, customer_name = ?
        WHERE id = ?
      `).run(bill_title, bill_note, customer_id, customer_name, order_id);
      broadcastUpdate('order_meta_updated', { order_id });
      return sendJson(res, 200, { success: true, data: getFullBootstrapData() });
    }

    // Save Customer Member
    if (req.method === 'POST' && pathname === '/api/customers/save') {
      const body = await parseJsonBody(req);
      const { id, name, phone = '', tier = 'ขาประจำ', points = 0, note = '' } = body;
      if (!name) return sendJson(res, 400, { error: 'กรุณาระบุชื่อสมาชิกลูกค้า' });
      const cusId = id || `CUS-${Date.now().toString().slice(-4)}`;
      const now = new Date().toISOString();
      const existing = db.prepare('SELECT id FROM customers WHERE id = ?').get(cusId);
      if (existing) {
        db.prepare('UPDATE customers SET name = ?, phone = ?, tier = ?, points = ?, note = ? WHERE id = ?')
          .run(name, phone, tier, Number(points) || 0, note, cusId);
      } else {
        db.prepare('INSERT INTO customers (id, name, phone, tier, points, total_spent, note, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)')
          .run(cusId, name, phone, tier, Number(points) || 0, note, now);
      }
      broadcastUpdate('customer_saved', { cusId });
      return sendJson(res, 200, { success: true, cusId, data: getFullBootstrapData() });
    }

    // Return / Void Item from Table or Order (Supports RETURNED_RESTOCK vs VOID_WASTE)
    if (req.method === 'POST' && pathname === '/api/orders/item-return') {
      const body = await parseJsonBody(req);
      const { order_item_id, table_id, product_id, mode = 'RETURNED_RESTOCK', reason_note = '' } = body;
      const now = new Date().toISOString();

      let targetItem = null;
      if (order_item_id) {
        targetItem = db.prepare('SELECT * FROM order_items WHERE id = ?').get(order_item_id);
      } else if (table_id && product_id) {
        const tbl = db.prepare('SELECT * FROM dining_tables WHERE id = ?').get(table_id);
        if (tbl && tbl.current_order_id) {
          targetItem = db.prepare(`
            SELECT * FROM order_items
            WHERE order_id = ? AND product_id = ? AND item_status = 'ACTIVE'
            ORDER BY created_at DESC LIMIT 1
          `).get(tbl.current_order_id, product_id);
        }
      }

      if (!targetItem) {
        return sendJson(res, 404, { error: 'ไม่พบรายการสินค้าที่ต้องการคืนในบิลนี้' });
      }
      if (targetItem.item_status !== 'ACTIVE') {
        return sendJson(res, 400, { error: 'รายการนี้ถูกคืนหรือยกเลิกไปแล้ว' });
      }

      const validMode = mode === 'VOID_WASTE' ? 'VOID_WASTE' : 'RETURNED_RESTOCK';
      const newKitchenStatus = targetItem.item_type === 'FOOD' ? 'CANCELLED' : 'NONE';

      db.prepare(`
        UPDATE order_items
        SET item_status = ?, kitchen_status = ?
        WHERE id = ?
      `).run(validMode, newKitchenStatus, targetItem.id);

      const insertLog = db.prepare(`
        INSERT INTO inventory_logs (id, target_type, product_id, ingredient_id, item_name, change_qty, balance_after, unit, reason, reference_id, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const prod = db.prepare('SELECT * FROM products WHERE id = ?').get(targetItem.product_id);

      if (validMode === 'RETURNED_RESTOCK') {
        // Return to stock if GROCERY
        if (prod && prod.item_type === 'GROCERY' && prod.track_stock) {
          const nextStock = Math.round((prod.stock_qty + targetItem.quantity) * 100) / 100;
          db.prepare('UPDATE products SET stock_qty = ? WHERE id = ?').run(nextStock, prod.id);
          insertLog.run(
            `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            'GROCERY',
            prod.id,
            null,
            prod.name,
            targetItem.quantity,
            nextStock,
            prod.unit,
            'RETURN_FROM_TABLE',
            targetItem.order_id,
            reason_note || 'ลูกค้าคืนสินค้าของชำ (สภาพดี บวกกลับเข้าสต็อก)',
            now
          );
        } else if (prod && prod.item_type === 'FOOD' && targetItem.kitchen_status === 'PENDING') {
          // Return ingredients if food was still PENDING
          let snapshot = [];
          try { snapshot = JSON.parse(targetItem.recipe_snapshot_json || '[]'); } catch { snapshot = []; }
          for (const s of snapshot) {
            if (!s.ingredient_id) continue;
            const ing = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(s.ingredient_id);
            if (ing) {
              const nextIngQty = Math.round((ing.current_qty + s.qty) * 100) / 100;
              db.prepare('UPDATE ingredients SET current_qty = ? WHERE id = ?').run(nextIngQty, ing.id);
              insertLog.run(
                `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                'INGREDIENT',
                null,
                ing.id,
                ing.name,
                s.qty,
                nextIngQty,
                ing.stock_unit,
                'RETURN_FROM_TABLE',
                targetItem.order_id,
                `คืนวัตถุดิบจากยกเลิกเมนูรอก่อนผัด (${targetItem.product_name})`,
                now
              );
            }
          }
        }
      } else {
        // VOID_WASTE: do not add back to stock; record waste log
        insertLog.run(
          `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          targetItem.item_type === 'GROCERY' ? 'GROCERY' : 'INGREDIENT',
          targetItem.item_type === 'GROCERY' ? targetItem.product_id : null,
          null,
          targetItem.product_name,
          0,
          prod ? prod.stock_qty : 0,
          prod ? prod.unit : 'รายการ',
          'WASTE',
          targetItem.order_id,
          reason_note || `ตัดเป็นของเสีย/ชำรุด มูลค่าทุน ${(targetItem.quantity * targetItem.unit_cost).toFixed(2)}฿`,
          now
        );
      }

      recalculateOrderTotals(targetItem.order_id);
      broadcastUpdate('item_returned', { orderId: targetItem.order_id, itemId: targetItem.id, mode: validMode });
      return sendJson(res, 200, { success: true, data: getFullBootstrapData() });
    }

    // Checkout / Settle Open Table Order
    if (req.method === 'POST' && pathname === '/api/orders/checkout') {
      const body = await parseJsonBody(req);
      const { order_id, table_id, payment_method = 'CASH', discount = 0, cash_received = 0 } = body;
      const now = new Date().toISOString();

      let targetOrder = null;
      if (order_id) {
        targetOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(order_id);
      } else if (table_id) {
        const tbl = db.prepare('SELECT * FROM dining_tables WHERE id = ?').get(table_id);
        if (tbl && tbl.current_order_id) {
          targetOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(tbl.current_order_id);
        }
      }

      if (!targetOrder) {
        return sendJson(res, 404, { error: 'ไม่พบบิลที่ต้องการชำระเงิน' });
      }

      db.prepare('UPDATE orders SET discount = ? WHERE id = ?').run(Number(discount) || 0, targetOrder.id);
      recalculateOrderTotals(targetOrder.id);

      const refreshed = db.prepare('SELECT * FROM orders WHERE id = ?').get(targetOrder.id);
      const received = cash_received >= refreshed.total_amount ? Number(cash_received) : refreshed.total_amount;
      const change = Math.round(Math.max(0, received - refreshed.total_amount) * 100) / 100;

      db.prepare(`
        UPDATE orders
        SET status = 'PAID', payment_method = ?, cash_received = ?, change_amount = ?, paid_at = ?
        WHERE id = ?
      `).run(payment_method, received, change, now, targetOrder.id);

      // Mark any remaining food items as SERVED
      db.prepare(`
        UPDATE order_items
        SET kitchen_status = 'SERVED'
        WHERE order_id = ? AND item_type = 'FOOD' AND item_status = 'ACTIVE' AND kitchen_status IN ('PENDING', 'COOKING')
      `).run(targetOrder.id);

      if (refreshed.table_id) {
        db.prepare("UPDATE dining_tables SET status = 'AVAILABLE', current_order_id = NULL WHERE id = ?").run(refreshed.table_id);
      }

      if (refreshed.customer_id && refreshed.total_amount > 0) {
        const pts = Math.floor(refreshed.total_amount / 25);
        db.prepare('UPDATE customers SET points = points + ?, total_spent = total_spent + ? WHERE id = ?')
          .run(pts, refreshed.total_amount, refreshed.customer_id);
      }

      broadcastUpdate('order_paid', { orderId: targetOrder.id, tableId: refreshed.table_id });
      return sendJson(res, 200, { success: true, orderId: targetOrder.id, change, data: getFullBootstrapData() });
    }

    // Update Kitchen Display (KDS) Status
    if (req.method === 'POST' && pathname === '/api/kds/status') {
      const body = await parseJsonBody(req);
      const { order_item_id, kitchen_status } = body;
      if (!order_item_id || !['PENDING', 'COOKING', 'SERVED', 'CANCELLED'].includes(kitchen_status)) {
        return sendJson(res, 400, { error: 'ข้อมูลสถานะครัวไม่ถูกต้อง' });
      }
      db.prepare('UPDATE order_items SET kitchen_status = ? WHERE id = ?').run(kitchen_status, order_item_id);
      broadcastUpdate('kds_updated', { order_item_id, kitchen_status });
      return sendJson(res, 200, { success: true, data: getFullBootstrapData() });
    }

    // Stock-In / Purchase Receiving (นำเข้าสินค้าของชำ หรือ วัตถุดิบอาหาร พร้อมบวกสต็อกอัตโนมัติ & ประวัติย้อนหลัง)
    if (req.method === 'POST' && pathname === '/api/stock-in') {
      const body = await parseJsonBody(req);
      const {
        supplier_name = 'ร้านค้าส่ง / ตลาดสด',
        note = '',
        created_by = 'เจ้าของร้าน',
        record_as_expense = false,
        items = []
      } = body;

      if (!Array.isArray(items) || items.length === 0) {
        return sendJson(res, 400, { error: 'กรุณาเลือกรายการสินค้าหรือวัตถุดิบที่ต้องการนำเข้าสต็อก' });
      }

      const now = new Date().toISOString();
      const todayStr = now.slice(0, 10);
      const receiptId = `RCV-${todayStr.replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;

      let totalReceiptCost = 0;
      const typesSet = new Set();

      const processedLines = [];

      for (const line of items) {
        const inputQty = Number(line.input_qty);
        if (!inputQty || inputQty <= 0) continue;

        const usePurchaseUnit = Boolean(line.use_purchase_unit);
        const lineTotalCost = Math.max(0, Number(line.total_line_cost) || 0);
        totalReceiptCost += lineTotalCost;

        if (line.item_target_type === 'GROCERY') {
          const prod = db.prepare('SELECT * FROM products WHERE id = ?').get(line.target_id);
          if (!prod) continue;
          typesSet.add('GROCERY');

          const conv = usePurchaseUnit ? (prod.conversion_rate || 1) : 1;
          const unitLabel = usePurchaseUnit ? prod.purchase_unit : prod.unit;
          const qtyBefore = prod.stock_qty;
          const qtyAdded = Math.round(inputQty * conv * 100) / 100;
          const qtyAfter = Math.round((qtyBefore + qtyAdded) * 100) / 100;
          const baseUnitCost = qtyAdded > 0 && lineTotalCost > 0
            ? Math.round((lineTotalCost / qtyAdded) * 100) / 100
            : prod.cost;

          db.prepare('UPDATE products SET stock_qty = ?, cost = ? WHERE id = ?').run(qtyAfter, baseUnitCost, prod.id);

          processedLines.push({
            item_target_type: 'GROCERY',
            product_id: prod.id,
            ingredient_id: null,
            item_name: prod.name,
            base_unit: prod.unit,
            unit_label: unitLabel,
            input_qty: inputQty,
            conversion_rate: conv,
            qty_before: qtyBefore,
            qty_added: qtyAdded,
            qty_after: qtyAfter,
            purchase_cost_per_base_unit: baseUnitCost,
            total_line_cost: lineTotalCost
          });
        } else if (line.item_target_type === 'INGREDIENT') {
          const ing = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(line.target_id);
          if (!ing) continue;
          typesSet.add('INGREDIENT');

          const conv = usePurchaseUnit ? (ing.conversion_rate || 1) : 1;
          const unitLabel = usePurchaseUnit ? ing.purchase_unit : ing.stock_unit;
          const qtyBefore = ing.current_qty;
          const qtyAdded = Math.round(inputQty * conv * 100) / 100;
          const qtyAfter = Math.round((qtyBefore + qtyAdded) * 100) / 100;
          const baseUnitCost = qtyAdded > 0 && lineTotalCost > 0
            ? Math.round((lineTotalCost / qtyAdded) * 10000) / 10000
            : ing.cost_per_unit;

          db.prepare('UPDATE ingredients SET current_qty = ?, cost_per_unit = ? WHERE id = ?').run(qtyAfter, baseUnitCost, ing.id);

          processedLines.push({
            item_target_type: 'INGREDIENT',
            product_id: null,
            ingredient_id: ing.id,
            item_name: ing.name,
            base_unit: ing.stock_unit,
            unit_label: unitLabel,
            input_qty: inputQty,
            conversion_rate: conv,
            qty_before: qtyBefore,
            qty_added: qtyAdded,
            qty_after: qtyAfter,
            purchase_cost_per_base_unit: baseUnitCost,
            total_line_cost: lineTotalCost
          });
        }
      }

      if (processedLines.length === 0) {
        return sendJson(res, 400, { error: 'จำนวนนำเข้าต้องมากกว่า 0' });
      }

      const receiptType = typesSet.size > 1 ? 'MIXED' : (typesSet.has('GROCERY') ? 'GROCERY' : 'INGREDIENT');

      db.prepare(`
        INSERT INTO stock_in_receipts (id, receipt_type, supplier_name, note, total_cost, record_as_expense, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(receiptId, receiptType, supplier_name, note, totalReceiptCost, record_as_expense ? 1 : 0, created_by, now);

      const insertReceiptItem = db.prepare(`
        INSERT INTO stock_in_items (
          id, receipt_id, item_target_type, product_id, ingredient_id, item_name, unit_label,
          input_qty, conversion_rate, qty_before, qty_added, qty_after, purchase_cost_per_base_unit, total_line_cost
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertLog = db.prepare(`
        INSERT INTO inventory_logs (id, target_type, product_id, ingredient_id, item_name, change_qty, balance_after, unit, reason, reference_id, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'STOCK_IN_RECEIPT', ?, ?, ?)
      `);

      for (const pl of processedLines) {
        insertReceiptItem.run(
          `SRI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          receiptId,
          pl.item_target_type,
          pl.product_id,
          pl.ingredient_id,
          pl.item_name,
          pl.unit_label,
          pl.input_qty,
          pl.conversion_rate,
          pl.qty_before,
          pl.qty_added,
          pl.qty_after,
          pl.purchase_cost_per_base_unit,
          pl.total_line_cost
        );

        insertLog.run(
          `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          pl.item_target_type,
          pl.product_id,
          pl.ingredient_id,
          pl.item_name,
          pl.qty_added,
          pl.qty_after,
          pl.base_unit,
          receiptId,
          `นำเข้า ${pl.input_qty} ${pl.unit_label} (เดิม ${pl.qty_before} -> ใหม่ ${pl.qty_after} ${pl.base_unit}) จาก ${supplier_name}`,
          now
        );
      }

      if (record_as_expense && totalReceiptCost > 0) {
        db.prepare(`
          INSERT INTO expenses (id, category, title, amount, expense_date, reference_id, created_at)
          VALUES (?, 'STOCK_IN', ?, ?, ?, ?, ?)
        `).run(
          `EXP-${Date.now().toString().slice(-6)}`,
          `รับของเข้าสต็อก (${receiptId}) - ${supplier_name}`,
          totalReceiptCost,
          todayStr,
          receiptId,
          now
        );
      }

      recalculateAllFoodCosts();
      broadcastUpdate('stock_in_completed', { receiptId });
      return sendJson(res, 200, { success: true, receiptId, data: getFullBootstrapData() });
    }

    // Create / Update Product + Recipe BOM
    if (req.method === 'POST' && pathname === '/api/products/save') {
      const body = await parseJsonBody(req);
      const {
        id,
        category_id,
        barcode = null,
        name,
        voice_aliases = [],
        price = 0,
        cost = 0,
        unit = 'ชิ้น',
        purchase_unit = 'แพ็ค',
        conversion_rate = 1,
        item_type = 'GROCERY',
        stock_qty = 0,
        low_stock_threshold = 5,
        recipe_items = []
      } = body;

      if (!name) return sendJson(res, 400, { error: 'กรุณาระบุชื่อสินค้าหรือเมนูอาหาร' });

      const prodId = id || `${item_type === 'FOOD' ? 'F' : 'G'}-${Date.now().toString().slice(-4)}`;
      const defaultCat = item_type === 'FOOD' ? 'CAT-RICE' : 'CAT-DRINK';
      const cleanBarcode = barcode && String(barcode).trim() ? String(barcode).trim() : null;
      const sendToKitchen = item_type === 'FOOD' ? 1 : 0;
      const trackStock = item_type === 'GROCERY' ? 1 : 0;
      const aliasesJson = JSON.stringify(Array.isArray(voice_aliases) ? voice_aliases : String(voice_aliases || '').split(',').map(s => s.trim()).filter(Boolean));

      const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(prodId);
      if (existing) {
        db.prepare(`
          UPDATE products
          SET category_id = ?, barcode = ?, name = ?, voice_aliases = ?, price = ?, cost = ?,
              unit = ?, purchase_unit = ?, conversion_rate = ?, item_type = ?, track_stock = ?,
              stock_qty = ?, low_stock_threshold = ?, send_to_kitchen = ?
          WHERE id = ?
        `).run(
          category_id || defaultCat, cleanBarcode, name, aliasesJson, Number(price), Number(cost),
          unit, purchase_unit, Number(conversion_rate) || 1, item_type, trackStock,
          Number(stock_qty) || 0, Number(low_stock_threshold) || 5, sendToKitchen, prodId
        );
      } else {
        db.prepare(`
          INSERT INTO products (
            id, category_id, barcode, name, voice_aliases, price, cost, unit, purchase_unit, conversion_rate,
            item_type, track_stock, stock_qty, low_stock_threshold, send_to_kitchen, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).run(
          prodId, category_id || defaultCat, cleanBarcode, name, aliasesJson, Number(price), Number(cost),
          unit, purchase_unit, Number(conversion_rate) || 1, item_type, trackStock,
          Number(stock_qty) || 0, Number(low_stock_threshold) || 5, sendToKitchen
        );
      }

      if (item_type === 'FOOD' && Array.isArray(recipe_items)) {
        db.prepare('DELETE FROM recipe_items WHERE product_id = ?').run(prodId);
        const insRec = db.prepare('INSERT INTO recipe_items (id, product_id, modifier_id, ingredient_id, quantity_used) VALUES (?, ?, NULL, ?, ?)');
        for (const r of recipe_items) {
          if (r.ingredient_id && Number(r.quantity_used) > 0) {
            insRec.run(`REC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, prodId, r.ingredient_id, Number(r.quantity_used));
          }
        }
        recalculateAllFoodCosts();
      }

      broadcastUpdate('product_saved', { prodId });
      return sendJson(res, 200, { success: true, prodId, data: getFullBootstrapData() });
    }

    // Create / Update Kitchen Ingredient
    if (req.method === 'POST' && pathname === '/api/ingredients/save') {
      const body = await parseJsonBody(req);
      const {
        id,
        name,
        stock_unit = 'กรัม',
        purchase_unit = 'กิโลกรัม',
        conversion_rate = 1000,
        current_qty = 0,
        cost_per_unit = 0,
        low_stock_threshold = 500
      } = body;

      if (!name) return sendJson(res, 400, { error: 'กรุณาระบุชื่อวัตถุดิบอาหาร' });
      const ingId = id || `ING-${Date.now().toString().slice(-4)}`;
      const existing = db.prepare('SELECT id FROM ingredients WHERE id = ?').get(ingId);

      if (existing) {
        db.prepare(`
          UPDATE ingredients
          SET name = ?, stock_unit = ?, purchase_unit = ?, conversion_rate = ?, current_qty = ?, cost_per_unit = ?, low_stock_threshold = ?
          WHERE id = ?
        `).run(name, stock_unit, purchase_unit, Number(conversion_rate) || 1, Number(current_qty) || 0, Number(cost_per_unit) || 0, Number(low_stock_threshold) || 0, ingId);
      } else {
        db.prepare(`
          INSERT INTO ingredients (id, name, stock_unit, purchase_unit, conversion_rate, current_qty, cost_per_unit, low_stock_threshold)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(ingId, name, stock_unit, purchase_unit, Number(conversion_rate) || 1, Number(current_qty) || 0, Number(cost_per_unit) || 0, Number(low_stock_threshold) || 0);
      }

      recalculateAllFoodCosts();
      broadcastUpdate('ingredient_saved', { ingId });
      return sendJson(res, 200, { success: true, ingId, data: getFullBootstrapData() });
    }

    // Create New Dining Table / Zone
    if (req.method === 'POST' && pathname === '/api/tables/save') {
      const body = await parseJsonBody(req);
      const { name, zone_name = 'โซนในร้าน', voice_aliases = [] } = body;
      if (!name) return sendJson(res, 400, { error: 'กรุณาระบุชื่อโต๊ะ' });

      const countRow = db.prepare('SELECT COUNT(*) as c FROM dining_tables').get();
      const tblId = `T${(countRow ? countRow.c : 0) + 1}`;
      const aliases = Array.isArray(voice_aliases) && voice_aliases.length > 0
        ? voice_aliases
        : [name, name.replace(/\s+/g, '')];

      db.prepare(`
        INSERT INTO dining_tables (id, name, zone_name, voice_aliases, status, current_order_id)
        VALUES (?, ?, ?, ?, 'AVAILABLE', NULL)
      `).run(tblId, name, zone_name, JSON.stringify(aliases));

      broadcastUpdate('table_saved', { tblId });
      return sendJson(res, 200, { success: true, tblId, data: getFullBootstrapData() });
    }

    // Add Daily Expense
    if (req.method === 'POST' && pathname === '/api/expenses/save') {
      const body = await parseJsonBody(req);
      const { category = 'OTHER', title, amount } = body;
      if (!title || !amount || Number(amount) <= 0) {
        return sendJson(res, 400, { error: 'กรุณาระบุรายละเอียดและจำนวนเงินรายจ่าย' });
      }
      const now = new Date().toISOString();
      const todayStr = now.slice(0, 10);
      const expId = `EXP-${Date.now().toString().slice(-5)}`;

      db.prepare(`
        INSERT INTO expenses (id, category, title, amount, expense_date, reference_id, created_at)
        VALUES (?, ?, ?, ?, ?, '', ?)
      `).run(expId, category, title, Number(amount), todayStr, now);

      broadcastUpdate('expense_saved', { expId });
      return sendJson(res, 200, { success: true, expId, data: getFullBootstrapData() });
    }

    // Static Files from /public
    const publicDir = path.join(__dirname, 'public');
    let filePath = pathname === '/' ? path.join(publicDir, 'index.html') : path.join(publicDir, pathname);

    // Prevent directory traversal
    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.webp': 'image/webp'
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      // Fallback to index.html for SPA
      const indexFile = path.join(publicDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(indexFile).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    }
  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { error: err.message || 'Internal Server Error' });
  }
});

server.listen(PORT, () => {
  console.log(`ONG CO POS running at http://localhost:${PORT}`);
});

