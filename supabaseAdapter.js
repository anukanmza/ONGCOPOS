// Supabase REST (PostgREST) Adapter for Vercel Serverless Deployment
// Works with zero external npm dependencies using native Node.js fetch()

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return { url, key, enabled: Boolean(url && key) };
}

async function sbRest(tableAndQuery, options = {}) {
  const { url, key } = getSupabaseConfig();
  const method = options.method || 'GET';
  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': options.prefer || 'return=representation'
  };

  const res = await fetch(`${url}/rest/v1/${tableAndQuery}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase error (${res.status}): ${errText}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

function ensureArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
}

async function getSupabaseBootstrapData() {
  const [
    categories,
    rawProducts,
    rawModifiers,
    ingredients,
    rawRecipes,
    rawTables,
    openOrders,
    allValidOrders,
    allOrderItems,
    receipts,
    receiptItems,
    inventoryLogs,
    expenses
  ] = await Promise.all([
    sbRest('categories?select=*&order=id.asc'),
    sbRest('products?select=*&is_active=eq.true&order=item_type.desc,id.asc'),
    sbRest('product_modifiers?select=*&order=id.asc'),
    sbRest('ingredients?select=*&order=id.asc'),
    sbRest('recipe_items?select=*'),
    sbRest('dining_tables?select=*&order=id.asc'),
    sbRest('orders?select=*&status=eq.OPEN&order=created_at.desc'),
    sbRest('orders?select=*&status=in.(PAID,OPEN)&order=created_at.desc&limit=100'),
    sbRest('order_items?select=*&order=created_at.asc&limit=400'),
    sbRest('stock_in_receipts?select=*&order=created_at.desc&limit=30'),
    sbRest('stock_in_items?select=*'),
    sbRest('inventory_logs?select=*&order=created_at.desc&limit=60'),
    sbRest('expenses?select=*&order=created_at.desc&limit=40')
  ]);

  const ingMap = new Map(ingredients.map(i => [i.id, i]));
  const recipeItems = rawRecipes.map(r => {
    const ing = ingMap.get(r.ingredient_id);
    return {
      ...r,
      quantity_used: Number(r.quantity_used),
      ingredient_name: ing ? ing.name : r.ingredient_id,
      stock_unit: ing ? ing.stock_unit : '',
      cost_per_unit: ing ? Number(ing.cost_per_unit) : 0
    };
  });

  const products = rawProducts.map(p => {
    const prodRecipes = recipeItems.filter(r => r.product_id === p.id);
    const calcCost = p.item_type === 'FOOD' && prodRecipes.length > 0
      ? Math.round(prodRecipes.reduce((s, r) => s + r.quantity_used * r.cost_per_unit, 0) * 100) / 100
      : Number(p.cost);
    return {
      ...p,
      price: Number(p.price),
      cost: calcCost,
      conversion_rate: Number(p.conversion_rate || 1),
      stock_qty: Number(p.stock_qty || 0),
      low_stock_threshold: Number(p.low_stock_threshold || 5),
      voice_aliases: ensureArray(p.voice_aliases),
      track_stock: Boolean(p.track_stock),
      send_to_kitchen: Boolean(p.send_to_kitchen),
      recipe_items: prodRecipes
    };
  });

  const modifiers = rawModifiers.map(m => ({
    ...m,
    extra_price: Number(m.extra_price || 0),
    extra_cost: Number(m.extra_cost || 0),
    voice_keywords: ensureArray(m.voice_keywords)
  }));

  const normalizedItems = allOrderItems.map(it => ({
    ...it,
    quantity: Number(it.quantity),
    returned_qty: Number(it.returned_qty || 0),
    unit_price: Number(it.unit_price),
    unit_cost: Number(it.unit_cost),
    modifiers: ensureArray(it.modifiers_json),
    recipe_snapshot: ensureArray(it.recipe_snapshot_json)
  }));

  const tables = rawTables.map(t => {
    const activeOrder = openOrders.find(o => o.id === t.current_order_id || (o.table_id === t.id && o.status === 'OPEN')) || null;
    const items = activeOrder ? normalizedItems.filter(i => i.order_id === activeOrder.id) : [];
    return {
      ...t,
      voice_aliases: ensureArray(t.voice_aliases),
      active_order: activeOrder
        ? {
            ...activeOrder,
            subtotal: Number(activeOrder.subtotal),
            discount: Number(activeOrder.discount || 0),
            total_amount: Number(activeOrder.total_amount),
            total_cost: Number(activeOrder.total_cost || 0),
            items
          }
        : null
    };
  });

  const tableMap = new Map(rawTables.map(t => [t.id, t]));
  const orderMap = new Map(allValidOrders.map(o => [o.id, o]));

  const kitchenQueue = normalizedItems
    .filter(it => {
      const ord = orderMap.get(it.order_id);
      return ord && it.item_type === 'FOOD' && it.item_status === 'ACTIVE' && ['PENDING', 'COOKING', 'SERVED'].includes(it.kitchen_status);
    })
    .map(it => {
      const ord = orderMap.get(it.order_id);
      const tbl = ord && ord.table_id ? tableMap.get(ord.table_id) : null;
      return {
        ...it,
        order_type: ord ? ord.order_type : 'RETAIL',
        table_id: ord ? ord.table_id : null,
        table_name: tbl ? tbl.name : null,
        zone_name: tbl ? tbl.zone_name : null
      };
    });

  const stockInReceipts = receipts.map(r => ({
    ...r,
    total_cost: Number(r.total_cost || 0),
    items: receiptItems
      .filter(it => it.receipt_id === r.id)
      .map(it => ({
        ...it,
        input_qty: Number(it.input_qty),
        qty_before: Number(it.qty_before),
        qty_added: Number(it.qty_added),
        qty_after: Number(it.qty_after),
        total_line_cost: Number(it.total_line_cost || 0)
      }))
  }));

  // Analytics calculation
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
    const amt = Number(o.total_amount || 0);
    if (o.status === 'PAID') {
      paidRevenue += amt;
      if (o.payment_method === 'QR_PROMPTPAY') qrRevenue += amt;
      else cashRevenue += amt;
    } else if (o.status === 'OPEN') {
      openTableRevenue += amt;
    }
  }

  for (const item of normalizedItems) {
    if (!orderMap.has(item.order_id)) continue;
    if (item.item_status === 'VOID_WASTE') {
      wasteCost += item.quantity * item.unit_cost;
      continue;
    }
    if (item.item_status === 'RETURNED_RESTOCK') {
      returnedRestockValue += item.quantity * item.unit_price;
      continue;
    }
    const activeQty = Math.max(0, item.quantity - item.returned_qty);
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
  const totalOperatingExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const totalStockInPurchases = stockInReceipts.reduce((sum, r) => sum + Number(r.total_cost || 0), 0);
  const netProfit = grossProfit - wasteCost - totalOperatingExpenses;

  const normalizedIngredients = ingredients.map(i => ({
    ...i,
    conversion_rate: Number(i.conversion_rate || 1),
    current_qty: Number(i.current_qty || 0),
    cost_per_unit: Number(i.cost_per_unit || 0),
    low_stock_threshold: Number(i.low_stock_threshold || 0)
  }));

  return {
    categories,
    products,
    modifiers,
    ingredients: normalizedIngredients,
    recipeItems,
    tables,
    kitchenQueue,
    stockInReceipts,
    inventoryLogs: inventoryLogs.map(l => ({ ...l, change_qty: Number(l.change_qty), balance_after: Number(l.balance_after) })),
    expenses: expenses.map(e => ({ ...e, amount: Number(e.amount) })),
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
      top_sellers: Array.from(productSalesMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 8),
      low_stock_grocery: products.filter(p => p.item_type === 'GROCERY' && p.track_stock && p.stock_qty <= p.low_stock_threshold),
      low_stock_ingredients: normalizedIngredients.filter(i => i.current_qty <= i.low_stock_threshold)
    }
  };
}

module.exports = {
  getSupabaseConfig,
  sbRest,
  getSupabaseBootstrapData
};

