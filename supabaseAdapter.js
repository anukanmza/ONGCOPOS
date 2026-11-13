// Supabase REST (PostgREST) Adapter for Vercel Serverless Deployment
// Works with zero external npm dependencies using native Node.js fetch()

const DEFAULT_LOYALTY_SETTINGS = {
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

function computeCustomerLoyaltyUpdate(customer, netTotal, redeemPoints, loyaltySettings = DEFAULT_LOYALTY_SETTINGS) {
  const cfg = { ...DEFAULT_LOYALTY_SETTINGS, ...(loyaltySettings || {}) };
  const spendPerPt = Math.max(1, Number(cfg.spend_per_point) || 25);
  const ptsEarnedUnit = Math.max(0, Number(cfg.points_earned) || 1);
  const tiers = Array.isArray(cfg.tiers) && cfg.tiers.length > 0 ? cfg.tiers : DEFAULT_LOYALTY_SETTINGS.tiers;

  const currentPts = Math.max(0, Number(customer?.points) || 0);
  const currentSpent = Math.max(0, Number(customer?.total_spent) || 0);
  const usedPts = Math.min(currentPts, Math.max(0, Math.floor(Number(redeemPoints) || 0)));

  const nextSpent = Math.round((currentSpent + Math.max(0, Number(netTotal) || 0)) * 100) / 100;
  let nextTier = customer?.tier || tiers[0].name;

  if (cfg.auto_upgrade_tier !== false) {
    const sortedTiers = [...tiers].sort((a, b) => (Number(b.min_spent) || 0) - (Number(a.min_spent) || 0));
    const matched = sortedTiers.find(t => nextSpent >= (Number(t.min_spent) || 0));
    if (matched) nextTier = matched.name;
  }

  const tierObj = tiers.find(t => t.name === nextTier) || tiers.find(t => t.name === customer?.tier) || { points_multiplier: 1 };
  const multiplier = Math.max(0.1, Number(tierObj.points_multiplier) || 1);
  const earnedPts = netTotal > 0 ? Math.floor((netTotal / spendPerPt) * ptsEarnedUnit * multiplier) : 0;
  const nextPts = Math.max(0, currentPts - usedPts + earnedPts);

  return {
    usedPts,
    earnedPts,
    nextPts,
    nextSpent,
    nextTier
  };
}

let runtimeSupabaseUrl = '';
let runtimeSupabaseKey = '';

function normalizeSupabaseBaseUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    return parsed.origin;
  } catch {
    return trimmed.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
  }
}

function setRuntimeSupabaseConfig(url, key) {
  if (url && key) {
    runtimeSupabaseUrl = normalizeSupabaseBaseUrl(url);
    runtimeSupabaseKey = String(key).trim();
  }
}

function getSupabaseConfig() {
  const url = normalizeSupabaseBaseUrl(
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    runtimeSupabaseUrl ||
    ''
  );
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    runtimeSupabaseKey ||
    ''
  ).trim();
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

function computeKdsSyncSig(items) {
  const kdsStatuses = new Set(['PENDING', 'COOKING', 'SERVED', 'CANCEL_REQUESTED']);
  return (items || [])
    .filter(i => i.item_type === 'FOOD' && kdsStatuses.has(i.kitchen_status))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map(i => `${i.id}:${i.kitchen_status}:${i.item_status}:${Number(i.quantity)}:${Number(i.returned_qty || 0)}`)
    .join('|');
}

function computeAllSyncSig({ orders = [], orderItems = [], tables = [], products = [], ingredients = [], customers = [], receipts = [], expenses = [] }) {
  const ordPart = orders.slice(0, 30).map(o => `${o.id}:${o.status}:${Number(o.total_amount || 0)}:${o.table_id || ''}:${o.bill_title || ''}:${o.customer_id || ''}`).join(',');
  const itemPart = [...orderItems]
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, 60)
    .map(i => `${i.id}:${i.item_status}:${i.kitchen_status}:${Number(i.quantity)}:${Number(i.returned_qty || 0)}`)
    .join(',');
  const tblPart = tables.map(t => `${t.id}:${t.status}:${t.current_order_id || ''}`).join(',');
  const prodPart = products.map(p => `${p.id}:${Number(p.stock_qty || 0)}:${Number(p.price || 0)}`).join(',');
  const ingPart = ingredients.map(i => `${i.id}:${Number(i.current_qty || 0)}`).join(',');
  const cusPart = customers.filter(c => c.id !== 'SYS-LOYALTY-CONFIG').map(c => `${c.id}:${Number(c.points || 0)}:${Number(c.total_spent || 0)}:${c.tier || ''}`).join(',');
  const recPart = receipts.slice(0, 10).map(r => `${r.id}:${Number(r.total_cost || 0)}`).join(',');
  const expPart = expenses.slice(0, 10).map(e => `${e.id}:${Number(e.amount || 0)}`).join(',');
  return [ordPart, itemPart, tblPart, prodPart, ingPart, cusPart, recPart, expPart].join('~');
}

async function getSupabaseSyncCheck(scope = 'kds', clientSig = '') {
  if (scope === 'kds') {
    const kdsRows = await sbRest(
      'order_items?select=id,item_type,kitchen_status,item_status,quantity,returned_qty&item_type=eq.FOOD&kitchen_status=in.(PENDING,COOKING,SERVED,CANCEL_REQUESTED)&order=id.asc'
    );
    const sig = computeKdsSyncSig(kdsRows);
    return { changed: Boolean(!clientSig || sig !== clientSig), sig, scope: 'kds' };
  }

  let customers = [];
  const [orders, orderItems, tables, products, ingredients, receipts, expenses] = await Promise.all([
    sbRest('orders?select=id,status,total_amount,table_id,bill_title,customer_id,created_at&order=created_at.desc&limit=30'),
    sbRest('order_items?select=id,item_status,kitchen_status,quantity,returned_qty,created_at&order=created_at.desc&limit=60'),
    sbRest('dining_tables?select=id,status,current_order_id&order=id.asc'),
    sbRest('products?select=id,stock_qty,price&is_active=eq.true&order=item_type.desc,id.asc'),
    sbRest('ingredients?select=id,current_qty&order=id.asc'),
    sbRest('stock_in_receipts?select=id,total_cost&order=created_at.desc&limit=10'),
    sbRest('expenses?select=id,amount&order=created_at.desc&limit=10')
  ]);
  try {
    customers = await sbRest('customers?select=id,points,total_spent,tier&order=total_spent.desc,created_at.desc');
  } catch {
    customers = [];
  }

  const sig = computeAllSyncSig({ orders, orderItems, tables, products, ingredients, customers, receipts, expenses });
  return { changed: Boolean(!clientSig || sig !== clientSig), sig, scope: 'all' };
}

async function getSupabaseBootstrapData() {
  const [
    categories,
    rawProducts,
    rawModifiers,
    rawModifierGroups,
    ingredients,
    rawRecipes,
    rawTables,
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
    sbRest('modifier_groups?select=*&order=sort_order.asc,id.asc').catch(() => []),
    sbRest('ingredients?select=*&order=id.asc'),
    sbRest('recipe_items?select=*'),
    sbRest('dining_tables?select=*&order=id.asc'),
    sbRest('orders?select=*&order=created_at.desc&limit=100'),
    sbRest('order_items?select=*&order=created_at.asc&limit=500'),
    sbRest('stock_in_receipts?select=*&order=created_at.desc&limit=60'),
    sbRest('stock_in_items?select=*'),
    sbRest('inventory_logs?select=*&order=created_at.desc&limit=60'),
    sbRest('expenses?select=*&order=created_at.desc&limit=60')
  ]);

  const openOrders = allValidOrders.filter(o => o.status === 'OPEN');

  // Resolve modifierGroups (from native table or fallback in customers table)
  let modifierGroups = [];
  if (Array.isArray(rawModifierGroups) && rawModifierGroups.length > 0) {
    modifierGroups = rawModifierGroups;
  } else {
    const sysModRow = rawCustomers.find(c => c.id === 'SYS-MODIFIER-GROUPS');
    if (sysModRow && sysModRow.note) {
      try {
        const parsed = JSON.parse(sysModRow.note);
        if (Array.isArray(parsed) && parsed.length > 0) modifierGroups = parsed;
      } catch {}
    }
    if (modifierGroups.length === 0) {
      modifierGroups = [
        { id: 'GRP-SPICY', name: 'ระดับความเผ็ด', selection_type: 'SINGLE', is_required: false, sort_order: 1 },
        { id: 'GRP-TOPPING', name: 'ท็อปปิ้งไข่ & เพิ่มเติม', selection_type: 'MULTIPLE', is_required: false, sort_order: 2 }
      ];
    }
  }

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
    let modGrpIds = ensureArray(p.modifier_group_ids);
    if ((!modGrpIds || modGrpIds.length === 0) && p.item_type === 'FOOD') {
      modGrpIds = modifierGroups.map(g => g.id);
    }
    return {
      ...p,
      price: Number(p.price),
      cost: calcCost,
      conversion_rate: Number(p.conversion_rate || 1),
      stock_qty: Number(p.stock_qty || 0),
      low_stock_threshold: Number(p.low_stock_threshold || 5),
      modifier_group_ids: modGrpIds,
      voice_aliases: ensureArray(p.voice_aliases),
      track_stock: Boolean(p.track_stock),
      send_to_kitchen: Boolean(p.send_to_kitchen),
      recipe_items: prodRecipes
    };
  });

  const modifiers = (rawModifiers || []).map(m => ({
    ...m,
    group_id: m.group_id || m.product_id || (m.name.includes('เผ็ด') ? 'GRP-SPICY' : 'GRP-TOPPING'),
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

  const stockInReceipts = receipts.map(r => ({
    ...r,
    total_cost: Number(r.total_cost || 0),
    items: receiptItems
      .filter(it => it.receipt_id === r.id)
      .map(it => ({
        ...it,
        target_type: it.item_target_type || it.target_type || 'GROCERY',
        target_id: it.product_id || it.ingredient_id || it.target_id,
        input_unit: it.unit_label || it.input_unit || '',
        conversion_rate: Number(it.conversion_rate || 1),
        input_qty: Number(it.input_qty),
        qty_before: Number(it.qty_before),
        qty_added: Number(it.qty_added),
        qty_after: Number(it.qty_after),
        line_cost: Number(it.total_line_cost ?? it.line_cost ?? 0),
        total_line_cost: Number(it.total_line_cost ?? it.line_cost ?? 0)
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
    const parentOrd = orderMap.get(item.order_id);
    if (!parentOrd) continue;
    if (item.item_status === 'VOID_WASTE') {
      wasteCost += item.quantity * item.unit_cost;
      continue;
    }
    if (item.item_status === 'RETURNED_RESTOCK') {
      returnedRestockValue += item.quantity * item.unit_price;
      continue;
    }
    // Calculate revenue, COGS, and top sellers strictly from PAID orders!
    if (parentOrd.status !== 'PAID' || item.item_status !== 'ACTIVE') {
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

  const totalRevenue = paidRevenue;
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

  let rawCustomers = [];
  try {
    rawCustomers = await sbRest('customers?select=*&order=total_spent.desc');
  } catch {
    rawCustomers = [
      { id: 'CUS-001', name: 'ป้าสมศรี (ซอย 3)', phone: '081-234-5678', tier: 'VIP', points: 120, total_spent: 3450, note: 'ชอบสั่งกะเพราเผ็ดน้อย' },
      { id: 'CUS-002', name: 'พี่เอก (ช่างแอร์)', phone: '089-876-5432', tier: 'ขาประจำ', points: 45, total_spent: 1120, note: 'ซื้อน้ำแข็งและเครื่องดื่มประจำ' }
    ];
  }

  let loyaltySettings = { ...DEFAULT_LOYALTY_SETTINGS };
  const sysCfgRow = rawCustomers.find(c => c.id === 'SYS-LOYALTY-CONFIG');
  if (sysCfgRow && sysCfgRow.note) {
    try {
      const parsed = JSON.parse(sysCfgRow.note);
      loyaltySettings = { ...DEFAULT_LOYALTY_SETTINGS, ...parsed };
    } catch {}
  }
  const customers = rawCustomers.filter(c => c.id !== 'SYS-LOYALTY-CONFIG' && c.id !== 'SYS-MODIFIER-GROUPS');

  const allBills = allValidOrders.map(o => {
    const tbl = o.table_id ? tableMap.get(o.table_id) : null;
    return {
      ...o,
      subtotal: Number(o.subtotal || 0),
      discount: Number(o.discount || 0),
      total_amount: Number(o.total_amount || 0),
      total_cost: Number(o.total_cost || 0),
      table_name: tbl ? tbl.name : null,
      zone_name: tbl ? tbl.zone_name : null,
      items: normalizedItems.filter(i => i.order_id === o.id)
    };
  });

  const kdsSig = computeKdsSyncSig(normalizedItems);
  const syncSig = computeAllSyncSig({
    orders: allValidOrders,
    orderItems: normalizedItems,
    tables: rawTables,
    products,
    ingredients: normalizedIngredients,
    customers,
    receipts: stockInReceipts,
    expenses
  });

  return {
    backendSource: 'SUPABASE_CLOUD',
    kdsSig,
    syncSig,
    categories,
    products,
    modifierGroups,
    modifiers,
    ingredients: normalizedIngredients,
    recipeItems,
    tables,
    customers: customers.map(c => ({ ...c, points: Number(c.points || 0), total_spent: Number(c.total_spent || 0) })),
    loyaltySettings,
    allBills,
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
  DEFAULT_LOYALTY_SETTINGS,
  computeCustomerLoyaltyUpdate,
  setRuntimeSupabaseConfig,
  getSupabaseConfig,
  sbRest,
  computeKdsSyncSig,
  computeAllSyncSig,
  getSupabaseSyncCheck,
  getSupabaseBootstrapData
};

