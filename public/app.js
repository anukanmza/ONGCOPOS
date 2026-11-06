const state = {
  theme: 'teal',
  activeView: 'pos', // 'pos' | 'bills' | 'tables' | 'kds' | 'inventory' | 'customers' | 'dashboard'
  inventoryTab: 'stock_in', // 'stock_in' | 'products' | 'recipes' | 'audit'
  billsFilter: 'OPEN', // 'OPEN' | 'PAID' | 'ALL'
  posMode: 'DINE_IN', // 'RETAIL' | 'DINE_IN'
  selectedTableId: 'T1',
  activeHeldOrderId: null, // When resuming an open/held retail bill
  billTitle: '',
  billNote: '',
  selectedCustomerId: '',
  billDrawerOpen: false, // Floating Bill Drawer toggle state
  categoryFilter: 'ALL',
  searchQuery: '',
  zoneFilter: 'ALL',
  customerSearch: '',
  cart: [], // New draft items before submitting to table/held bill or checking out
  voiceListening: false,
  voiceText: '',
  lastVoiceSummary: null, // Feedback banner after instant voice-to-bill
  // Modals
  modifierModalProduct: null,
  selectedModifiers: [],
  modifierQty: 1,
  checkoutModalOrder: null, // { mode: 'CART' | 'ORDER', tableId, orderId, totalAmount, subtotal, label }
  checkoutPaymentMethod: 'CASH',
  checkoutCashReceived: '',
  checkoutDiscount: 0,
  editingBillMetaOrder: null, // Modal to edit bill_title, bill_note, customer_id of any bill
  showNewTableModal: false,
  showNewProductModal: false,
  showNewIngredientModal: false,
  showNewExpenseModal: false,
  showNewCustomerModal: false,
  // Stock-In Draft State
  stockInSupplier: 'แม็คโคร & ตลาดสด',
  stockInNote: '',
  stockInRecordExpense: false,
  stockInDraftItems: [],
  stockInTargetType: 'GROCERY',
  stockInTargetId: 'G-001',
  stockInUsePurchaseUnit: true,
  stockInInputQty: 2,
  stockInLineCost: 264,
  // Recipe BOM Editor State
  selectedBomFoodId: 'F-001',
  bomDraftRows: [],
  // Toast
  toastMessage: null,
  // Server Data
  data: null
};

let recognition = null;
let toastTimer = null;

function showToast(msg) {
  state.toastMessage = msg;
  render();
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    state.toastMessage = null;
    render();
  }, 3600);
}

function formatMoney(num) {
  const n = Number(num) || 0;
  return '฿' + n.toLocaleString('th-TH', { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
}

function formatTimeAgo(isoStr) {
  if (!isoStr) return '-';
  const diffMin = Math.max(0, Math.floor((Date.now() - new Date(isoStr).getTime()) / 60000));
  if (diffMin < 1) return 'เมื่อสักครู่';
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  const hrs = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return `${hrs} ชม. ${mins} นาทีที่แล้ว`;
}

async function apiCall(endpoint, method = 'GET', bodyObj = null) {
  try {
    const res = await fetch(endpoint, {
      method,
      headers: bodyObj ? { 'Content-Type': 'application/json' } : undefined,
      body: bodyObj ? JSON.stringify(bodyObj) : undefined
    });
    if (res.ok) {
      const json = await res.json();
      if (json && !json.error) {
        state.backendMode = 'CLOUD_API';
        return json;
      }
    }
  } catch {
    // Fallback to LocalPosEngine
  }

  state.backendMode = 'LOCAL_ENGINE';
  const eng = window.LocalPosEngine;
  if (!eng) return null;

  if (endpoint === '/api/bootstrap') return eng.getBootstrap();
  if (endpoint === '/api/voice/parse') return eng.parseVoice(bodyObj?.text, bodyObj?.fallbackTableId);
  if (endpoint === '/api/orders/submit') return eng.submitOrder(bodyObj || {});
  if (endpoint === '/api/orders/item-return') return eng.returnItem(bodyObj || {});
  if (endpoint === '/api/orders/checkout') return eng.checkoutOrder(bodyObj || {});
  if (endpoint === '/api/orders/update-meta') return eng.updateOrderMeta(bodyObj || {});
  if (endpoint === '/api/kds/status') return eng.updateKds(bodyObj || {});
  if (endpoint === '/api/stock-in') return eng.stockIn(bodyObj || {});
  if (endpoint === '/api/products/save') return eng.saveProduct(bodyObj || {});
  if (endpoint === '/api/ingredients/save') return eng.saveIngredient(bodyObj || {});
  if (endpoint === '/api/tables/save') return eng.saveTable(bodyObj || {});
  if (endpoint === '/api/expenses/save') return eng.saveExpense(bodyObj || {});
  if (endpoint === '/api/customers/save') return eng.saveCustomer(bodyObj || {});
  return eng.getBootstrap();
}

async function fetchBootstrap() {
  const data = await apiCall('/api/bootstrap', 'GET');
  if (data && Array.isArray(data.products)) {
    state.data = data;
    syncBomEditorWithProduct(state.selectedBomFoodId);
    syncCurrentBillMetaFromContext();
  } else if (window.LocalPosEngine) {
    state.data = window.LocalPosEngine.getBootstrap();
    syncBomEditorWithProduct(state.selectedBomFoodId);
    syncCurrentBillMetaFromContext();
  }
  render();
}

function getActiveContextOrder() {
  if (!state.data) return null;
  if (state.posMode === 'DINE_IN') {
    const tbl = state.data.tables.find(t => t.id === state.selectedTableId);
    return tbl && tbl.active_order ? tbl.active_order : null;
  }
  if (state.activeHeldOrderId) {
    const allBills = state.data.allBills || [];
    return allBills.find(b => b.id === state.activeHeldOrderId && b.status === 'OPEN') || null;
  }
  return null;
}

function syncCurrentBillMetaFromContext() {
  const activeOrd = getActiveContextOrder();
  if (activeOrd) {
    state.billTitle = activeOrd.bill_title || '';
    state.billNote = activeOrd.bill_note || '';
    state.selectedCustomerId = activeOrd.customer_id || '';
  } else {
    state.billTitle = '';
    state.billNote = '';
    state.selectedCustomerId = '';
  }
}

function selectPosContext(mode, tableId = null, heldOrderId = null) {
  state.posMode = mode;
  if (tableId) state.selectedTableId = tableId;
  state.activeHeldOrderId = heldOrderId;
  syncCurrentBillMetaFromContext();
  render();
}

function resumeBillInPos(orderId) {
  if (!state.data) return;
  const allBills = state.data.allBills || [];
  const ord = allBills.find(b => b.id === orderId);
  if (!ord) return;

  if (ord.table_id) {
    state.posMode = 'DINE_IN';
    state.selectedTableId = ord.table_id;
    state.activeHeldOrderId = null;
  } else {
    state.posMode = 'RETAIL';
    state.activeHeldOrderId = ord.id;
  }
  syncCurrentBillMetaFromContext();
  state.activeView = 'pos';
  state.billDrawerOpen = true;
  render();
  showToast(`🧾 เปิดบิล "${ord.bill_title || ord.id}" เพื่อสั่งเพิ่มหรือเช็คบิลแล้ว`);
}

function startNewRetailBill() {
  state.posMode = 'RETAIL';
  state.activeHeldOrderId = null;
  state.cart = [];
  state.billTitle = '';
  state.billNote = '';
  state.selectedCustomerId = '';
  render();
  showToast('🆕 เริ่มบิลขายหน้าร้านใบใหม่แล้ว');
}

function syncBomEditorWithProduct(foodId) {
  if (!state.data) return;
  state.selectedBomFoodId = foodId;
  const prod = state.data.products.find(p => p.id === foodId);
  if (prod && Array.isArray(prod.recipe_items)) {
    state.bomDraftRows = prod.recipe_items.map(r => ({
      ingredient_id: r.ingredient_id,
      quantity_used: r.quantity_used
    }));
  } else {
    state.bomDraftRows = [];
  }
}

// ============================================================================
// VOICE ORDERING: Instant Add to Draft Bill (No confirmation step required!)
// ============================================================================
function initSpeechRecognition() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) return null;
  const rec = new SpeechRec();
  rec.lang = 'th-TH';
  rec.continuous = false;
  rec.interimResults = true;

  rec.onstart = () => {
    state.voiceListening = true;
    render();
  };

  rec.onresult = (event) => {
    let transcript = '';
    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    state.voiceText = transcript;
    const inputEl = document.getElementById('voice-command-input');
    if (inputEl) inputEl.value = transcript;
  };

  rec.onerror = () => {
    state.voiceListening = false;
    render();
  };

  rec.onend = () => {
    state.voiceListening = false;
    render();
    if (state.voiceText.trim()) {
      analyzeVoiceCommand(state.voiceText);
    }
  };

  return rec;
}

function toggleVoiceMic() {
  if (!recognition) {
    recognition = initSpeechRecognition();
  }
  if (!recognition) {
    showToast('เบราว์เซอร์นี้ไม่รองรับไมค์โดยตรง สามารถพิมพ์หรือกดปุ่มตัวอย่างคำสั่งเสียงได้เลยครับ');
    const inputEl = document.getElementById('voice-command-input');
    if (inputEl) inputEl.focus();
    return;
  }
  if (state.voiceListening) {
    recognition.stop();
  } else {
    state.voiceText = '';
    recognition.start();
  }
}

async function analyzeVoiceCommand(text) {
  const query = (text !== undefined ? text : state.voiceText).trim();
  if (!query) {
    showToast('กรุณาพูดหรือพิมพ์คำสั่งออเดอร์');
    return;
  }
  const fallbackTableId = state.posMode === 'DINE_IN' ? state.selectedTableId : null;
  const pv = await apiCall('/api/voice/parse', 'POST', { text: query, fallbackTableId });

  if (!pv || !pv.success || !Array.isArray(pv.items) || pv.items.length === 0) {
    showToast(`⚠️ ไม่พบชื่อเมนูหรือสินค้าจากคำว่า "${query}"`);
    return;
  }

  // Case 1: Return command by voice
  if (pv.intent === 'RETURN') {
    const targetTableId = pv.table ? pv.table.id : state.selectedTableId;
    for (const it of pv.items) {
      await apiCall('/api/orders/item-return', 'POST', {
        table_id: targetTableId,
        product_id: it.product_id,
        mode: pv.return_mode || 'RETURNED_RESTOCK',
        reason_note: `สั่งคืนด้วยเสียง: "${pv.raw_text}"`
      });
    }
    state.voiceText = '';
    await fetchBootstrap();
    showToast(`↩️ คืนสินค้าจากเสียง "${pv.items.map(i => i.name).join(', ')}" เรียบร้อย`);
    return;
  }

  // Case 2: Order command by voice -> ALWAYS put into Draft Bill (state.cart) immediately!
  // Never auto-submit to committed table items so staff can inspect/adjust in the bill first.
  if (pv.table && pv.raw_text.includes(pv.table.name.replace(/\s+/g, '')) || (pv.table && /โต๊ะ\s*\d+/.test(pv.raw_text))) {
    state.posMode = 'DINE_IN';
    state.selectedTableId = pv.table.id;
    state.activeHeldOrderId = null;
    syncCurrentBillMetaFromContext();
  }

  for (const i of pv.items) {
    addToCartDirect({
      product_id: i.product_id,
      name: i.name,
      item_type: i.item_type,
      unit: i.unit,
      unit_price: i.unit_price,
      quantity: i.quantity,
      modifiers: i.modifiers || [],
      send_to_kitchen: Boolean(i.send_to_kitchen),
      input_source: 'VOICE'
    });
  }

  const summaryNames = pv.items.map(i => `${i.name}${i.modifiers?.length ? ' (' + i.modifiers.join(',') + ')' : ''} x${i.quantity}`).join(', ');
  state.lastVoiceSummary = {
    text: summaryNames,
    total: pv.total_preview,
    targetLabel: state.posMode === 'DINE_IN'
      ? (state.data.tables.find(t => t.id === state.selectedTableId)?.name || 'โต๊ะ')
      : (state.billTitle || 'บิลหน้าร้าน')
  };
  state.voiceText = '';
  render();
  showToast(`🎙️ เพิ่ม ${summaryNames} เข้าบิล (รายการใหม่) แล้ว!`);
}

function addToCartDirect(itemObj) {
  const modKey = (itemObj.modifiers || []).slice().sort().join('|');
  const existing = state.cart.find(c => c.product_id === itemObj.product_id && c.modKey === modKey);
  if (existing) {
    existing.quantity += itemObj.quantity || 1;
  } else {
    state.cart.push({
      id: 'DRAFT-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      product_id: itemObj.product_id,
      name: itemObj.name,
      item_type: itemObj.item_type,
      unit: itemObj.unit || 'ชิ้น',
      unit_price: itemObj.unit_price,
      quantity: itemObj.quantity || 1,
      modifiers: itemObj.modifiers || [],
      modKey,
      send_to_kitchen: Boolean(itemObj.send_to_kitchen),
      input_source: itemObj.input_source || 'TOUCH'
    });
  }
}

function handleProductCardClick(productId) {
  if (!state.data) return;
  const prod = state.data.products.find(p => p.id === productId);
  if (!prod) return;

  if (prod.item_type === 'FOOD') {
    state.modifierModalProduct = prod;
    state.selectedModifiers = [];
    state.modifierQty = 1;
    render();
  } else {
    addToCartDirect({
      product_id: prod.id,
      name: prod.name,
      item_type: prod.item_type,
      unit: prod.unit,
      unit_price: prod.price,
      quantity: 1,
      modifiers: [],
      send_to_kitchen: prod.send_to_kitchen,
      input_source: 'TOUCH'
    });
    render();
    showToast(`+ เพิ่ม "${prod.name}" เข้าบิลแล้ว`);
  }
}

function handleBarcodeScan(barcodeStr) {
  if (!state.data) return;
  const code = String(barcodeStr || '').trim();
  if (!code) return;
  const prod = state.data.products.find(p => p.barcode === code || p.id.toLowerCase() === code.toLowerCase());
  if (!prod) {
    showToast(`⚠️ ไม่พบรหัสบาร์โค้ด "${code}"`);
    return;
  }
  addToCartDirect({
    product_id: prod.id,
    name: prod.name,
    item_type: prod.item_type,
    unit: prod.unit,
    unit_price: prod.price,
    quantity: 1,
    modifiers: [],
    send_to_kitchen: prod.send_to_kitchen,
    input_source: 'BARCODE'
  });
  state.searchQuery = '';
  render();
  showToast(`🔫 ยิงบาร์โค้ด "${prod.name}" (${formatMoney(prod.price)}) เข้าบิลแล้ว`);
}

function getSelectedCustomerObj() {
  if (!state.data || !state.selectedCustomerId) return null;
  return (state.data.customers || []).find(c => c.id === state.selectedCustomerId) || null;
}

// Hold Bill / Save Open Bill with Name & Note (เปิดบิลทิ้งไว้ / ส่งเข้าโต๊ะ)
async function saveOrHoldCurrentBill(mode = 'HOLD') {
  const activeOrd = getActiveContextOrder();
  const cus = getSelectedCustomerObj();
  const customerId = cus ? cus.id : null;
  const customerName = cus ? cus.name : '';

  // If no new items in cart, but there's an existing open order, just update its title/note/member
  if (state.cart.length === 0 && activeOrd) {
    const out = await apiCall('/api/orders/update-meta', 'POST', {
      order_id: activeOrd.id,
      bill_title: state.billTitle.trim(),
      bill_note: state.billNote.trim(),
      customer_id: customerId,
      customer_name: customerName
    });
    if (out && out.data) state.data = out.data;
    render();
    showToast(`📌 บันทึกชื่อบิล/โน้ตของ "${state.billTitle || activeOrd.id}" เรียบร้อย`);
    return;
  }

  if (state.cart.length === 0) {
    showToast('⚠️ กรุณาเลือกสินค้าหรือเมนูเข้าบิลก่อนเปิดบิลทิ้งไว้');
    return;
  }

  const defaultTitle = state.posMode === 'DINE_IN'
    ? (state.data.tables.find(t => t.id === state.selectedTableId)?.name || 'บิลโต๊ะ')
    : (cus ? `บิลคุณ${cus.name}` : `บิลพักไว้ #${String(Date.now()).slice(-3)}`);

  const finalTitle = state.billTitle.trim() || defaultTitle;

  const out = await apiCall('/api/orders/submit', 'POST', {
    order_id: activeOrd ? activeOrd.id : null,
    order_type: state.posMode,
    table_id: state.posMode === 'DINE_IN' ? state.selectedTableId : null,
    bill_title: finalTitle,
    bill_note: state.billNote.trim(),
    customer_id: customerId,
    customer_name: customerName,
    items: state.cart,
    settle_immediately: false,
    input_source: 'TOUCH'
  });

  if (out && out.data) state.data = out.data;
  state.cart = [];
  state.lastVoiceSummary = null;

  if (state.posMode === 'RETAIL' && out?.orderId) {
    state.activeHeldOrderId = out.orderId;
  }
  syncCurrentBillMetaFromContext();
  render();

  if (mode === 'TABLE_SEND') {
    showToast(`📤 ส่งรายการเข้า "${finalTitle}" และส่งครัวเรียบร้อย!`);
  } else {
    showToast(`📌 เปิดบิลทิ้งไว้ "${finalTitle}" เรียบร้อย! (ดูได้ที่หน้าจัดการบิล)`);
  }
}

async function handleReturnTableItem(orderItemId, mode) {
  const label = mode === 'VOID_WASTE'
    ? 'ยืนยันตัดรายการนี้เป็น "ของเสีย/ชำรุด" (หักยอดเงินลูกค้า ไม่บวกสต็อกกลับ และบันทึกเป็นต้นทุนของเสีย)?'
    : 'ยืนยัน "คืนสินค้าเข้าสต็อก" (หักยอดเงินออกจากบิล และบวกสต็อกกลับเข้าคลังอัตโนมัติ)?';
  if (!window.confirm(label)) return;

  const out = await apiCall('/api/orders/item-return', 'POST', { order_item_id: orderItemId, mode });
  if (out && out.data) state.data = out.data;
  render();
  showToast(mode === 'VOID_WASTE' ? '🗑️ ตัดเป็นของเสียและหักยอดออกจากบิลแล้ว' : '↩️ คืนสินค้ากลับเข้าสต็อกและหักยอดบิลเรียบร้อย');
}

async function openCheckoutForCurrentBill() {
  const activeOrd = getActiveContextOrder();
  const draftTotal = state.cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);

  // If there is an open order AND new unsent draft items, commit the draft items into that order first
  if (activeOrd && state.cart.length > 0) {
    await saveOrHoldCurrentBill('SILENT');
  }

  const refreshedOrd = getActiveContextOrder();
  if (refreshedOrd) {
    state.checkoutModalOrder = {
      mode: 'ORDER',
      tableId: refreshedOrd.table_id || null,
      orderId: refreshedOrd.id,
      subtotal: refreshedOrd.subtotal,
      totalAmount: refreshedOrd.total_amount,
      label: refreshedOrd.bill_title || (refreshedOrd.table_name ? `บิล ${refreshedOrd.table_name}` : `บิล ${refreshedOrd.id}`)
    };
    state.checkoutPaymentMethod = 'CASH';
    state.checkoutDiscount = refreshedOrd.discount || 0;
    state.checkoutCashReceived = String(refreshedOrd.total_amount);
    render();
    return;
  }

  if (draftTotal <= 0) {
    showToast('⚠️ ยังไม่มีรายการสินค้าในบิล');
    return;
  }

  state.checkoutModalOrder = {
    mode: 'CART',
    tableId: state.posMode === 'DINE_IN' ? state.selectedTableId : null,
    orderId: null,
    subtotal: draftTotal,
    totalAmount: draftTotal,
    label: state.billTitle.trim() || (state.posMode === 'DINE_IN' ? `เช็คบิลโต๊ะ` : 'บิลขายหน้าร้าน (Walk-in)')
  };
  state.checkoutPaymentMethod = 'CASH';
  state.checkoutDiscount = 0;
  state.checkoutCashReceived = String(draftTotal);
  render();
}

function openCheckoutModalByOrderId(orderId) {
  if (!state.data) return;
  const ord = (state.data.allBills || []).find(b => b.id === orderId);
  if (!ord) return;

  state.checkoutModalOrder = {
    mode: 'ORDER',
    tableId: ord.table_id || null,
    orderId: ord.id,
    subtotal: ord.subtotal,
    totalAmount: ord.total_amount,
    label: ord.bill_title || (ord.table_name ? `เช็คบิล ${ord.table_name}` : `บิล ${ord.id}`)
  };
  state.checkoutPaymentMethod = 'CASH';
  state.checkoutDiscount = ord.discount || 0;
  state.checkoutCashReceived = String(ord.total_amount);
  render();
}

function openCheckoutModalForTable(tableId) {
  if (!state.data) return;
  const tbl = state.data.tables.find(t => t.id === tableId);
  if (!tbl || !tbl.active_order) return;
  openCheckoutModalByOrderId(tbl.active_order.id);
}

async function confirmCheckoutPayment() {
  const co = state.checkoutModalOrder;
  if (!co) return;
  const discount = Math.max(0, Number(state.checkoutDiscount) || 0);
  const netTotal = Math.max(0, co.subtotal - discount);
  const cashRec = Number(state.checkoutCashReceived) || netTotal;
  const cus = getSelectedCustomerObj();

  if (co.mode === 'CART') {
    const out = await apiCall('/api/orders/submit', 'POST', {
      order_type: state.posMode,
      table_id: co.tableId,
      bill_title: state.billTitle.trim() || co.label,
      bill_note: state.billNote.trim(),
      customer_id: cus ? cus.id : null,
      customer_name: cus ? cus.name : '',
      items: state.cart,
      payment_method: state.checkoutPaymentMethod,
      discount,
      cash_received: cashRec,
      settle_immediately: true
    });
    if (out && out.data) state.data = out.data;
    state.cart = [];
    state.billTitle = '';
    state.billNote = '';
    state.selectedCustomerId = '';
    state.checkoutModalOrder = null;
    state.billDrawerOpen = false;
    render();
    showToast(`💰 รับชำระเงิน ${formatMoney(netTotal)} สำเร็จ!${cus ? ` (สะสมแต้มสมาชิก +${Math.floor(netTotal / 25)} แต้ม)` : ''}`);
  } else {
    const out = await apiCall('/api/orders/checkout', 'POST', {
      order_id: co.orderId,
      table_id: co.tableId,
      payment_method: state.checkoutPaymentMethod,
      discount,
      cash_received: cashRec
    });
    if (out && out.data) state.data = out.data;
    if (state.activeHeldOrderId === co.orderId) {
      state.activeHeldOrderId = null;
    }
    state.checkoutModalOrder = null;
    state.billDrawerOpen = false;
    syncCurrentBillMetaFromContext();
    render();
    showToast(`💰 เช็คบิล "${co.label}" ยอด ${formatMoney(netTotal)} เรียบร้อย! (เงินทอน ${formatMoney(out?.change || 0)})`);
  }
}

async function updateKdsStatus(orderItemId, nextStatus) {
  const out = await apiCall('/api/kds/status', 'POST', { order_item_id: orderItemId, kitchen_status: nextStatus });
  if (out && out.data) state.data = out.data;
  render();
  showToast(nextStatus === 'COOKING' ? '🍳 เริ่มทำอาหารรายการนี้แล้ว' : '✅ อาหารเสร็จพร้อมเสิร์ฟแล้ว!');
}

// Stock-In Helper Functions
function addLineToStockInDraft() {
  if (!state.data) return;
  const inputQty = Number(state.stockInInputQty);
  if (!inputQty || inputQty <= 0) {
    showToast('กรุณากรอกจำนวนที่ซื้อมาเติมมากกว่า 0');
    return;
  }

  if (state.stockInTargetType === 'GROCERY') {
    const prod = state.data.products.find(p => p.id === state.stockInTargetId);
    if (!prod) return;
    const conv = state.stockInUsePurchaseUnit ? (prod.conversion_rate || 1) : 1;
    const unitLabel = state.stockInUsePurchaseUnit ? prod.purchase_unit : prod.unit;
    const qtyBefore = prod.stock_qty;
    const qtyAdded = Math.round(inputQty * conv * 100) / 100;
    const qtyAfter = Math.round((qtyBefore + qtyAdded) * 100) / 100;

    state.stockInDraftItems.push({
      id: 'SID-' + Date.now(),
      item_target_type: 'GROCERY',
      target_id: prod.id,
      name: prod.name,
      use_purchase_unit: state.stockInUsePurchaseUnit,
      unit_label: unitLabel,
      base_unit: prod.unit,
      input_qty: inputQty,
      conversion_rate: conv,
      qty_before: qtyBefore,
      qty_added: qtyAdded,
      qty_after: qtyAfter,
      total_line_cost: Number(state.stockInLineCost) || Math.round(qtyAdded * prod.cost)
    });
  } else {
    const ing = state.data.ingredients.find(i => i.id === state.stockInTargetId);
    if (!ing) return;
    const conv = state.stockInUsePurchaseUnit ? (ing.conversion_rate || 1) : 1;
    const unitLabel = state.stockInUsePurchaseUnit ? ing.purchase_unit : ing.stock_unit;
    const qtyBefore = ing.current_qty;
    const qtyAdded = Math.round(inputQty * conv * 100) / 100;
    const qtyAfter = Math.round((qtyBefore + qtyAdded) * 100) / 100;

    state.stockInDraftItems.push({
      id: 'SID-' + Date.now(),
      item_target_type: 'INGREDIENT',
      target_id: ing.id,
      name: ing.name,
      use_purchase_unit: state.stockInUsePurchaseUnit,
      unit_label: unitLabel,
      base_unit: ing.stock_unit,
      input_qty: inputQty,
      conversion_rate: conv,
      qty_before: qtyBefore,
      qty_added: qtyAdded,
      qty_after: qtyAfter,
      total_line_cost: Number(state.stockInLineCost) || Math.round(qtyAdded * ing.cost_per_unit)
    });
  }

  render();
  showToast('➕ เพิ่มลงใบรับของเข้าสต็อกแล้ว');
}

async function submitStockInReceipt() {
  if (state.stockInDraftItems.length === 0) {
    addLineToStockInDraft();
    if (state.stockInDraftItems.length === 0) return;
  }

  const out = await apiCall('/api/stock-in', 'POST', {
    supplier_name: state.stockInSupplier,
    note: state.stockInNote,
    record_as_expense: state.stockInRecordExpense,
    items: state.stockInDraftItems
  });
  if (out && out.data) state.data = out.data;
  state.stockInDraftItems = [];
  state.stockInNote = '';
  render();
  showToast(`📦 บันทึกใบรับของเข้าสต็อก ${out?.receiptId || ''} สำเร็จ!`);
}

async function saveBomForSelectedFood() {
  if (!state.data) return;
  const prod = state.data.products.find(p => p.id === state.selectedBomFoodId);
  if (!prod) return;

  const out = await apiCall('/api/products/save', 'POST', {
    ...prod,
    recipe_items: state.bomDraftRows
  });
  if (out && out.data) {
    state.data = out.data;
    syncBomEditorWithProduct(state.selectedBomFoodId);
  }
  render();
  showToast(`🍲 บันทึกสูตรวัตถุดิบของ "${prod.name}" เรียบร้อย!`);
}

function renderLogoSvg(size = 24) {
  return `
    <svg class="ttl-svg" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="var(--ttl-accent)"></rect>
      <path d="M8.5 9.5h4l3.5 9 3.5-9h4L17.6 23h-3.2z" fill="var(--ttl-page)"></path>
      <circle cx="16" cy="9.6" r="1.8" fill="var(--ttl-gold)"></circle>
    </svg>
  `;
}

// ============================================================================
// VOICE CONSOLE (Instant-Add to Draft Bill)
// ============================================================================
function renderVoiceConsole() {
  return `
    <section class="ttl-voice-console">
      <div class="ttl-voice-bar">
        <div class="ttl-voice-top">
          <button type="button" class="ttl-mic-btn" data-listening="${state.voiceListening}" onclick="toggleVoiceMic()">
            <span>${state.voiceListening ? '🔴 กำลังฟังเสียง... (พูดเสร็จระบบเพิ่มเข้าบิลทันที)' : '🎙️ กดพูดสั่งออเดอร์ (เข้าบิลทันที ไม่ต้องกดยืนยันซ้ำ)'}</span>
          </button>

          <form class="ttl-voice-input-wrap" onsubmit="event.preventDefault(); analyzeVoiceCommand(document.getElementById('voice-command-input').value);">
            <input
              id="voice-command-input"
              type="text"
              placeholder='พูดหรือพิมพ์ เช่น "กะเพราหมูกรอบไข่ดาว 2 โค้กเล็ก 2" แล้วกด Enter'
              value="${(state.voiceText || '').replace(/"/g, '&quot;')}"
              oninput="state.voiceText = this.value"
            />
            <button type="submit" class="ttl-btn ttl-btn-sm ttl-btn-lilac">สั่งเข้าบิล ➔</button>
          </form>
        </div>

        <div class="ttl-voice-presets">
          <span>💡 กดทดสอบเสียงสั่งเข้าบิลทันที:</span>
          <button type="button" class="ttl-preset-chip" onclick="analyzeVoiceCommand('โต๊ะ 1 กะเพราหมูกรอบไข่ดาวไม่สุก 2 โค้กขวดเล็ก 2')">
            "โต๊ะ 1 กะเพราหมูกรอบไข่ดาวไม่สุก 2 โค้กขวดเล็ก 2"
          </button>
          <button type="button" class="ttl-preset-chip" onclick="analyzeVoiceCommand('ข้าวผัดกุ้งพิเศษ 1 ต้มยำกุ้ง 1 น้ำแข็ง 1 ถัง')">
            "ข้าวผัดกุ้งพิเศษ 1 ต้มยำกุ้ง 1 น้ำแข็ง 1 ถัง"
          </button>
          <button type="button" class="ttl-preset-chip" onclick="analyzeVoiceCommand('มาม่าหมูสับ 3 ซอง น้ำปลาทิพรส 1 ขวด')">
            "มาม่าหมูสับ 3 ซอง น้ำปลาทิพรส 1 ขวด"
          </button>
          <button type="button" class="ttl-preset-chip" onclick="analyzeVoiceCommand('โต๊ะ 1 คืนโค้กขวดเล็ก 1 ขวด')">
            "โต๊ะ 1 คืนโค้กขวดเล็ก 1 ขวด"
          </button>
        </div>

        ${state.lastVoiceSummary ? `
          <div class="ttl-voice-instant-banner">
            <div>
              <b>✅ เพิ่มเข้าบิล (${state.lastVoiceSummary.targetLabel}) ในช่องรายการใหม่แล้ว:</b>
              <span style="margin-left:4px;">${state.lastVoiceSummary.text} (${formatMoney(state.lastVoiceSummary.total)})</span>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
              <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-gold" onclick="state.billDrawerOpen=true; render();">
                🧾 เปิดดูบิลเพื่อตรวจสอบ
              </button>
              <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" style="height:28px; padding:0 8px;" onclick="state.lastVoiceSummary=null; render();">✕</button>
            </div>
          </div>
        ` : ''}
      </div>
    </section>
  `;
}

// ============================================================================
// VIEW 1: POS CASHIER (Clean Full-Width Grid + No Food Cost Shown)
// ============================================================================
function renderPosView() {
  const { products, categories, tables, allBills = [] } = state.data;
  const activeTable = tables.find(t => t.id === state.selectedTableId) || tables[0];
  const activeOrd = getActiveContextOrder();
  const heldRetailBills = allBills.filter(b => b.status === 'OPEN' && !b.table_id);

  const filteredProducts = products.filter(p => {
    if (state.categoryFilter === 'GROCERY' && p.item_type !== 'GROCERY') return false;
    if (state.categoryFilter === 'FOOD' && p.item_type !== 'FOOD') return false;
    if (state.categoryFilter !== 'ALL' && state.categoryFilter !== 'GROCERY' && state.categoryFilter !== 'FOOD' && p.category_id !== state.categoryFilter) {
      return false;
    }
    if (state.searchQuery.trim()) {
      const q = state.searchQuery.trim().toLowerCase();
      const inName = p.name.toLowerCase().includes(q);
      const inBarcode = p.barcode && p.barcode.includes(q);
      const inAlias = (p.voice_aliases || []).some(a => a.toLowerCase().includes(q));
      return inName || inBarcode || inAlias;
    }
    return true;
  });

  const draftCount = state.cart.reduce((s, i) => s + i.quantity, 0);
  const draftTotal = state.cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const committedActiveCount = activeOrd ? (activeOrd.items || []).filter(i => i.item_status === 'ACTIVE').reduce((s, i) => s + i.quantity, 0) : 0;
  const committedTotal = activeOrd ? Number(activeOrd.total_amount || 0) : 0;

  return `
    <div>
      <!-- Top Context Bar: Switch Dine-in vs Walk-in / Held Bills + Quick Open Bill Button -->
      <div class="pos-context-bar">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <div class="ttl-seg" role="tablist">
            <button type="button" aria-selected="${state.posMode === 'DINE_IN'}" onclick="selectPosContext('DINE_IN', state.selectedTableId, null)">
              🍽️ โต๊ะอาหาร
            </button>
            <button type="button" aria-selected="${state.posMode === 'RETAIL'}" onclick="selectPosContext('RETAIL', null, state.activeHeldOrderId)">
              🛍️ ขายหน้าร้าน / เปิดบิลพักไว้
            </button>
          </div>

          ${state.posMode === 'DINE_IN' ? `
            <select class="ttl-select" style="width:auto; font-weight:600; height:36px;" onchange="selectPosContext('DINE_IN', this.value, null)">
              ${tables.map(t => `
                <option value="${t.id}" ${t.id === state.selectedTableId ? 'selected' : ''}>
                  ${t.name} (${t.zone_name}) ${t.status === 'OCCUPIED' ? '• มีลูกค้า ' + formatMoney(t.active_order?.total_amount || 0) : '• ว่าง'}
                </option>
              `).join('')}
            </select>
          ` : `
            <select class="ttl-select" style="width:auto; font-weight:600; height:36px;" onchange="this.value ? selectPosContext('RETAIL', null, this.value) : startNewRetailBill()">
              <option value="" ${!state.activeHeldOrderId ? 'selected' : ''}>🆕 บิลขายหน้าร้านใบใหม่</option>
              ${heldRetailBills.map(b => `
                <option value="${b.id}" ${b.id === state.activeHeldOrderId ? 'selected' : ''}>
                  📌 ${b.bill_title || b.id} (${formatMoney(b.total_amount)})
                </option>
              `).join('')}
            </select>
            ${state.activeHeldOrderId ? `
              <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="startNewRetailBill()">+ เปิดบิลใหม่</button>
            ` : ''}
          `}
        </div>

        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          ${activeOrd ? `
            <span class="ttl-tag ttl-tag-food" style="font-size:12px; padding:5px 10px;">
              📌 บิลเปิดอยู่: <b>${activeOrd.bill_title || activeOrd.id}</b>
              ${activeOrd.customer_name ? ` • 👤 ${activeOrd.customer_name}` : ''}
            </span>
          ` : ''}
          <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-dark" onclick="state.billDrawerOpen=true; render();">
            🧾 เปิดดูบิล (${draftCount + committedActiveCount} รายการ • ${formatMoney(draftTotal + committedTotal)})
          </button>
        </div>
      </div>

      <!-- Search & Barcode Input -->
      <div class="pos-toolbar">
        <form class="barcode-box" onsubmit="event.preventDefault(); handleBarcodeScan(state.searchQuery);">
          <span>🔍</span>
          <input
            type="text"
            placeholder="ค้นหาชื่อเมนู / สินค้า หรือยิงบาร์โค้ด..."
            value="${state.searchQuery.replace(/"/g, '&quot;')}"
            oninput="state.searchQuery=this.value; render();"
          />
          ${state.searchQuery ? `<button type="button" style="color:var(--ttl-muted); font-size:12px;" onclick="state.searchQuery=''; render();">ล้าง</button>` : ''}
        </form>

        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
          <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="handleBarcodeScan('8851959132012')">🔫 โค้กเล็ก</button>
          <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="handleBarcodeScan('8850987101083')">🔫 มาม่า</button>
          <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="handleBarcodeScan('8850545111114')">🔫 น้ำปลา</button>
        </div>
      </div>

      <!-- Category Filter Pills -->
      <div class="category-pills">
        <button type="button" class="cat-pill" data-active="${state.categoryFilter === 'ALL'}" onclick="state.categoryFilter='ALL'; render();">
          ทั้งหมด (${products.length})
        </button>
        <button type="button" class="cat-pill" data-active="${state.categoryFilter === 'FOOD'}" onclick="state.categoryFilter='FOOD'; render();">
          🍳 เมนูอาหารส่งครัว
        </button>
        <button type="button" class="cat-pill" data-active="${state.categoryFilter === 'GROCERY'}" onclick="state.categoryFilter='GROCERY'; render();">
          📦 สินค้าของชำ
        </button>
        ${categories.map(c => `
          <button type="button" class="cat-pill" data-active="${state.categoryFilter === c.id}" onclick="state.categoryFilter='${c.id}'; render();">
            ${c.name.split('(')[0].trim()}
          </button>
        `).join('')}
      </div>

      <!-- Clean Product Cards Grid (NO cost shown on FOOD items!) -->
      <div class="product-cards">
        ${filteredProducts.map(p => {
          const isLow = p.item_type === 'GROCERY' && p.track_stock && p.stock_qty <= p.low_stock_threshold;
          return `
            <button type="button" class="ttl-acc-card" onclick="handleProductCardClick('${p.id}')">
              <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:4px;">
                <span class="ttl-tag ${p.item_type === 'FOOD' ? 'ttl-tag-food' : 'ttl-tag-grocery'}">
                  ${p.item_type === 'FOOD' ? '🍳 ส่งครัว' : '📦 ของชำ'}
                </span>
                ${p.item_type === 'GROCERY' ? `
                  <span class="ttl-tag ${isLow ? 'ttl-tag-low' : ''}" style="font-variant-numeric:tabular-nums;">
                    เหลือ ${p.stock_qty} ${p.unit}
                  </span>
                ` : `
                  <span style="font-size:11px; color:var(--ttl-muted);">เลือกตัวเลือกได้</span>
                `}
              </div>

              <div style="font-weight:600; font-size:14.5px; color:var(--ttl-ink); line-height:1.35; margin-top:2px;">
                ${p.name}
              </div>

              <div style="display:flex; justify-content:space-between; align-items:baseline; width:100%; margin-top:auto; padding-top:8px; border-top:1px solid var(--ttl-rule);">
                <span style="font-size:16.5px; font-weight:700; color:var(--ttl-ink); font-variant-numeric:tabular-nums;">
                  ${formatMoney(p.price)}<small style="font-weight:400; font-size:11px; color:var(--ttl-muted);">/${p.unit}</small>
                </span>
                <span style="font-size:11.5px; color:var(--ttl-gold); font-weight:700;">+ เพิ่ม</span>
              </div>
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ============================================================================
// FLOATING BILL BUTTON (.ttl-fab-bill) & SLIDE-OVER BILL DRAWER (.ttl-bill-drawer)
// ============================================================================
function renderFloatingBillAndDrawer() {
  const { tables, customers = [] } = state.data;
  const activeTable = tables.find(t => t.id === state.selectedTableId) || tables[0];
  const activeOrd = getActiveContextOrder();

  const draftCount = state.cart.reduce((s, i) => s + i.quantity, 0);
  const draftTotal = state.cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const committedItems = activeOrd ? (activeOrd.items || []) : [];
  const committedActiveCount = committedItems.filter(i => i.item_status === 'ACTIVE').reduce((s, i) => s + i.quantity, 0);
  const committedTotal = activeOrd ? Number(activeOrd.total_amount || 0) : 0;

  const totalCount = draftCount + committedActiveCount;
  const grandTotal = draftTotal + committedTotal;

  const billLabel = state.billTitle.trim()
    || (activeOrd && activeOrd.bill_title)
    || (state.posMode === 'DINE_IN' && activeTable ? activeTable.name : 'บิลขายหน้าร้าน');

  const subLabel = draftCount > 0
    ? `รายการใหม่รอส่ง ${draftCount} • สั่งแล้ว ${committedActiveCount}`
    : (committedActiveCount > 0 ? `สั่งในบิลแล้ว ${committedActiveCount} รายการ` : 'กดเพื่อเปิดดูบิล / ตั้งชื่อบิล');

  return `
    <!-- Floating Bill Button (Always accessible on POS & Tables views) -->
    <button type="button" class="ttl-fab-bill" onclick="state.billDrawerOpen = !state.billDrawerOpen; render();">
      <div style="display:flex; align-items:center; gap:10px; min-width:0;">
        <span class="ttl-fab-badge">${totalCount}</span>
        <div class="ttl-fab-info">
          <span class="ttl-fab-title">🧾 ${billLabel}</span>
          <span class="ttl-fab-sub">${subLabel}</span>
        </div>
      </div>
      <div class="ttl-fab-total">${formatMoney(grandTotal)} ▴</div>
    </button>

    <!-- Slide-Over / Bottom-Sheet Bill Drawer -->
    ${state.billDrawerOpen ? `
      <div class="ttl-drawer-backdrop" onclick="if(event.target===this){state.billDrawerOpen=false; render();}">
        <aside class="ttl-bill-drawer">
          <!-- Drawer Header -->
          <div class="pos-bill-head">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
              <div>
                <div class="ttl-k">${state.posMode === 'DINE_IN' ? '🍽️ บิลโต๊ะอาหาร (DINE-IN)' : '🛍️ บิลหน้าร้าน / เปิดบิลพักไว้'}</div>
                <div style="font-size:17px; font-weight:700;">${billLabel}</div>
              </div>
              <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="state.billDrawerOpen=false; render();">
                ✕ ปิดหน้าต่างบิล
              </button>
            </div>

            <!-- Customer Member Selector -->
            <div style="display:flex; gap:6px; align-items:center;">
              <select
                class="ttl-select"
                style="height:34px; font-size:12.5px; flex:1;"
                onchange="state.selectedCustomerId=this.value; render();"
              >
                <option value="">👤 ลูกค้าทั่วไป (ไม่ได้ระบุสมาชิก)</option>
                ${customers.map(c => `
                  <option value="${c.id}" ${c.id === state.selectedCustomerId ? 'selected' : ''}>
                    ⭐ ${c.name} (${c.phone || 'ไม่มีเบอร์'}) — ${c.points || 0} แต้ม [${c.tier || 'สมาชิก'}]
                  </option>
                `).join('')}
              </select>
              <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-lilac" style="height:34px; padding:0 10px;" onclick="state.showNewCustomerModal=true; render();">
                + สมาชิกใหม่
              </button>
            </div>

            <!-- Bill Name & Note Inputs (ตั้งชื่อบิล / โน้ตบิล) -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
              <input
                type="text"
                class="ttl-input"
                style="height:34px; font-size:12.5px;"
                placeholder="🏷️ ตั้งชื่อบิล เช่น พี่เอกเสื้อฟ้า"
                value="${(state.billTitle || '').replace(/"/g, '&quot;')}"
                oninput="state.billTitle=this.value"
              />
              <input
                type="text"
                class="ttl-input"
                style="height:34px; font-size:12.5px;"
                placeholder="📝 โน้ตบิล เช่น ไม่ชูรส / รอรับ"
                value="${(state.billNote || '').replace(/"/g, '&quot;')}"
                oninput="state.billNote=this.value"
              />
            </div>
          </div>

          <!-- Drawer Body: 1. New Draft Items (state.cart) + 2. Committed Order Items -->
          <div class="pos-bill-body">
            <!-- SECTION 1: NEW DRAFT ITEMS (รายการใหม่ที่กำลังจะสั่งเพิ่ม) -->
            <div style="display:flex; flex-direction:column; gap:6px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="ttl-k" style="color:var(--ttl-gold);">
                  ✨ รายการใหม่ที่กำลังจะสั่งเพิ่ม (${draftCount} ชิ้น)
                </span>
                ${state.cart.length > 0 ? `
                  <button type="button" style="font-size:11.5px; color:var(--ttl-bad); font-weight:600;" onclick="state.cart=[]; render();">
                    ล้างรายการใหม่
                  </button>
                ` : ''}
              </div>

              ${state.cart.length === 0 ? `
                <div style="padding:14px 12px; text-align:center; color:var(--ttl-muted); border:1px dashed var(--ttl-rule); border-radius:10px; font-size:12.5px; background:var(--ttl-paper);">
                  ยังไม่มีรายการใหม่ — กดเลือกเมนู หรือพูดสั่งด้วยเสียงได้เลย (รายการเสียงจะเข้ามาพักตรงนี้เพื่อให้ตรวจสอบก่อนเสมอ)
                </div>
              ` : state.cart.map((c, idx) => `
                <div class="bill-item-row" style="border-color:var(--ttl-gold); background:#fffdf7;">
                  <div class="bill-item-top">
                    <div class="bill-item-title">
                      <span class="ttl-tag ${c.send_to_kitchen ? 'ttl-tag-food' : 'ttl-tag-grocery'}" style="margin-right:4px;">
                        ${c.send_to_kitchen ? '🍳 ส่งครัว' : '📦 ของชำ'}
                      </span>
                      ${c.input_source === 'VOICE' ? '<span class="ttl-tag" style="background:var(--ttl-lilac); color:var(--ttl-lilac-ink); margin-right:4px;">🎙️ เสียง</span>' : ''}
                      ${c.name}
                    </div>
                    <div class="bill-item-price">${formatMoney(c.unit_price * c.quantity)}</div>
                  </div>

                  ${c.modifiers && c.modifiers.length > 0 ? `
                    <div style="font-size:12px; color:var(--ttl-gold); font-weight:600;">
                      + ${c.modifiers.join(', ')}
                    </div>
                  ` : ''}

                  <div class="bill-item-bottom">
                    <span style="font-size:11.5px; color:var(--ttl-muted);">${formatMoney(c.unit_price)} / ${c.unit}</span>
                    <div style="display:flex; align-items:center; gap:6px;">
                      <div class="qty-stepper">
                        <button type="button" onclick="state.cart[${idx}].quantity > 1 ? state.cart[${idx}].quantity-- : state.cart.splice(${idx},1); render();">−</button>
                        <span>${c.quantity}</span>
                        <button type="button" onclick="state.cart[${idx}].quantity++; render();">+</button>
                      </div>
                      <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-danger-outline" style="height:26px; padding:0 8px; font-size:11px;" onclick="state.cart.splice(${idx},1); render();">ลบ</button>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>

            <!-- SECTION 2: COMMITTED ITEMS IN THIS OPEN BILL / TABLE -->
            ${activeOrd && committedItems.length > 0 ? `
              <div style="display:flex; flex-direction:column; gap:6px; margin-top:8px; padding-top:10px; border-top:1px solid var(--ttl-rule);">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span class="ttl-k">📌 รายการที่บันทึก/ส่งเข้าบิลนี้แล้ว (${committedActiveCount} ชิ้น)</span>
                  <span style="font-size:12px; font-weight:700;">${formatMoney(committedTotal)}</span>
                </div>

                ${committedItems.map(item => `
                  <div class="bill-item-row" data-status="${item.item_status}">
                    <div class="bill-item-top">
                      <div class="bill-item-title">
                        <span class="ttl-tag ${item.item_type === 'FOOD' ? 'ttl-tag-food' : 'ttl-tag-grocery'}" style="margin-right:4px;">
                          ${item.item_type === 'FOOD' ? `ครัว: ${item.kitchen_status}` : 'ของชำ'}
                        </span>
                        ${item.product_name} × ${item.quantity}
                      </div>
                      <div class="bill-item-price">
                        ${item.item_status === 'ACTIVE' ? formatMoney(item.unit_price * item.quantity) : 'ยกเลิกแล้ว'}
                      </div>
                    </div>

                    ${item.modifiers && item.modifiers.length > 0 ? `
                      <div style="font-size:11.5px; color:var(--ttl-gold);">+ ${item.modifiers.join(', ')}</div>
                    ` : ''}

                    ${item.item_status === 'ACTIVE' ? `
                      <div class="bill-item-bottom" style="padding-top:4px; border-top:1px dashed var(--ttl-rule);">
                        <span style="font-size:11px; color:var(--ttl-muted);">คืน/ยกเลิก:</span>
                        <div style="display:flex; gap:4px; flex-wrap:wrap;">
                          <button
                            type="button"
                            class="ttl-btn ttl-btn-sm ttl-btn-ghost"
                            style="height:25px; padding:0 8px; font-size:11px;"
                            onclick="handleReturnTableItem('${item.id}', 'RETURNED_RESTOCK')"
                          >
                            ↩ คืนสต็อก
                          </button>
                          <button
                            type="button"
                            class="ttl-btn ttl-btn-sm ttl-btn-danger-outline"
                            style="height:25px; padding:0 8px; font-size:11px;"
                            onclick="handleReturnTableItem('${item.id}', 'VOID_WASTE')"
                          >
                            ✕ ของเสีย
                          </button>
                        </div>
                      </div>
                    ` : `
                      <div style="font-size:11px; color:var(--ttl-bad); font-weight:600;">
                        ${item.item_status === 'RETURNED_RESTOCK' ? '↩ คืนเข้าสต็อกแล้ว (ไม่คิดเงิน)' : '🗑️ ตัดเป็นของเสียแล้ว'}
                      </div>
                    `}
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>

          <!-- Drawer Footer Actions -->
          <div class="pos-bill-foot">
            <div style="display:flex; justify-content:space-between; align-items:baseline;">
              <span style="color:var(--ttl-muted); font-size:13px;">
                ยอดรวมทั้งบิล ${draftTotal > 0 && committedTotal > 0 ? `(เดิม ${formatMoney(committedTotal)} + ใหม่ ${formatMoney(draftTotal)})` : ''}
              </span>
              <span style="font-size:22px; font-weight:700; color:var(--ttl-ink); font-variant-numeric:tabular-nums;">
                ${formatMoney(grandTotal)}
              </span>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
              ${state.posMode === 'DINE_IN' ? `
                <button
                  type="button"
                  class="ttl-btn ttl-btn-gold"
                  style="width:100%;"
                  onclick="saveOrHoldCurrentBill('TABLE_SEND')"
                >
                  📤 ${state.cart.length > 0 ? `ส่งเข้าโต๊ะ/ครัว (+${formatMoney(draftTotal)})` : 'บันทึกชื่อบิล/โน้ต'}
                </button>
              ` : `
                <button
                  type="button"
                  class="ttl-btn ttl-btn-gold"
                  style="width:100%;"
                  onclick="saveOrHoldCurrentBill('HOLD')"
                >
                  📌 เปิดบิลทิ้งไว้ / พักบิล
                </button>
              `}

              <button
                type="button"
                class="ttl-btn ttl-btn-dark"
                style="width:100%;"
                ${grandTotal <= 0 ? 'disabled' : ''}
                onclick="openCheckoutForCurrentBill()"
              >
                💰 เช็คบิล (${formatMoney(grandTotal)})
              </button>
            </div>
          </div>
        </aside>
      </div>
    ` : ''}
  `;
}

// ============================================================================
// VIEW 2: BILL MANAGEMENT PAGE (หน้าจัดการบิล - Open/Held Bills & Paid History)
// ============================================================================
function renderBillsView() {
  const { allBills = [] } = state.data;
  const openBills = allBills.filter(b => b.status === 'OPEN');
  const paidBills = allBills.filter(b => b.status === 'PAID');

  const visibleBills = state.billsFilter === 'OPEN'
    ? openBills
    : state.billsFilter === 'PAID'
      ? paidBills
      : allBills;

  return `
    <div>
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:14px;">
        <div>
          <h3 style="margin:0; font-size:20px;">🧾 ระบบจัดการบิลทั้งหมด (Bill Management)</h3>
          <p style="margin:2px 0 0; font-size:13px; color:var(--ttl-muted);">
            ตรวจสอบบิลที่เปิดทิ้งไว้ บิลโต๊ะอาหาร แก้ไขชื่อบิล/โน้ต ผูกสมาชิกลูกค้า เรียกบิลกลับมาสั่งเพิ่ม หรือรับชำระเงิน
          </p>
        </div>

        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <div class="ttl-seg">
            <button type="button" aria-selected="${state.billsFilter === 'OPEN'}" onclick="state.billsFilter='OPEN'; render();">
              📌 บิลที่เปิดค้างไว้ (${openBills.length})
            </button>
            <button type="button" aria-selected="${state.billsFilter === 'PAID'}" onclick="state.billsFilter='PAID'; render();">
              ✅ ชำระเงินแล้ว (${paidBills.length})
            </button>
            <button type="button" aria-selected="${state.billsFilter === 'ALL'}" onclick="state.billsFilter='ALL'; render();">
              ทั้งหมด (${allBills.length})
            </button>
          </div>

          <button type="button" class="ttl-btn ttl-btn-dark" onclick="startNewRetailBill(); state.activeView='pos'; state.billDrawerOpen=true; render();">
            + เปิดบิลใหม่
          </button>
        </div>
      </div>

      ${visibleBills.length === 0 ? `
        <div style="padding:48px 20px; text-align:center; background:var(--ttl-page); border-radius:14px; border:1px dashed var(--ttl-rule);">
          <div style="font-size:28px;">🧾</div>
          <h4 style="margin:8px 0 4px;">ไม่มีรายการบิลในหมวดนี้</h4>
          <p style="margin:0; color:var(--ttl-muted); font-size:13px;">สามารถกดปุ่ม "เปิดบิลทิ้งไว้ / พักบิล" จากหน้าแคชเชียร์เพื่อพักบิลพร้อมตั้งชื่อและโน้ตได้ทันที</p>
        </div>
      ` : `
        <div class="tables-grid">
          ${visibleBills.map(b => {
            const items = b.items || [];
            const activeItems = items.filter(i => i.item_status === 'ACTIVE');
            const isOpen = b.status === 'OPEN';
            return `
              <div class="table-card" data-status="${isOpen ? 'OCCUPIED' : 'AVAILABLE'}">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                  <div>
                    <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                      <span class="ttl-tag ${b.table_id ? 'ttl-tag-food' : 'ttl-tag-grocery'}">
                        ${b.table_name ? `🍽️ ${b.table_name}` : '📌 บิลหน้าร้าน/พักบิล'}
                      </span>
                      <span style="font-size:11.5px; color:var(--ttl-muted); font-family:monospace;">${b.id}</span>
                    </div>
                    <div style="font-size:18px; font-weight:700; margin-top:4px;">
                      ${b.bill_title || (b.table_name ? `บิล ${b.table_name}` : `บิลหน้าร้าน ${b.id}`)}
                    </div>
                  </div>

                  ${isOpen ? `
                    <span class="ttl-live"><i></i> เปิดค้างไว้ (${formatTimeAgo(b.created_at)})</span>
                  ` : `
                    <span class="ttl-tag" style="background:color-mix(in srgb, var(--ttl-good) 14%, transparent); color:var(--ttl-good);">
                      ✓ ชำระแล้ว (${b.payment_method === 'QR_PROMPTPAY' ? 'QR' : 'เงินสด'})
                    </span>
                  `}
                </div>

                <!-- Member & Note badges -->
                <div style="display:flex; flex-direction:column; gap:4px; font-size:12.5px;">
                  ${b.customer_name ? `
                    <div style="color:var(--ttl-ink); font-weight:600;">👤 สมาชิก: ${b.customer_name}</div>
                  ` : ''}
                  ${b.bill_note ? `
                    <div style="padding:6px 10px; border-radius:8px; background:color-mix(in srgb, var(--ttl-gold) 12%, var(--ttl-page)); color:var(--ttl-ink);">
                      📝 <b>โน้ตบิล:</b> ${b.bill_note}
                    </div>
                  ` : ''}
                </div>

                <!-- Items list inside Bill Card -->
                <div style="padding:10px; border-radius:10px; background:var(--ttl-page); display:flex; flex-direction:column; gap:5px; max-height:190px; overflow-y:auto;">
                  <div style="display:flex; justify-content:space-between; font-size:11.5px; color:var(--ttl-muted);">
                    <span>รายการสินค้า (${activeItems.length} รายการ)</span>
                    <button type="button" style="color:var(--ttl-gold); font-weight:600; font-size:11.5px;" onclick="state.editingBillMetaOrder = ${JSON.stringify({ id: b.id, bill_title: b.bill_title || '', bill_note: b.bill_note || '', customer_id: b.customer_id || '' }).replace(/"/g, '&quot;')}; render();">
                      ✏️ แก้ชื่อบิล/โน้ต/สมาชิก
                    </button>
                  </div>
                  ${items.map(it => `
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; font-size:12.5px; padding-top:4px; border-top:1px solid var(--ttl-rule); ${it.item_status !== 'ACTIVE' ? 'text-decoration:line-through; opacity:0.5;' : ''}">
                      <div style="flex:1; word-break:break-word;">
                        <span>${it.item_type === 'FOOD' ? '🍳' : '📦'} ${it.product_name} × ${it.quantity}</span>
                        ${it.modifiers && it.modifiers.length > 0 ? `<small style="color:var(--ttl-gold); display:block;">+ ${it.modifiers.join(', ')}</small>` : ''}
                      </div>
                      <b style="font-variant-numeric:tabular-nums; flex-shrink:0;">${formatMoney(it.unit_price * it.quantity)}</b>
                    </div>
                  `).join('')}
                </div>

                <div style="display:flex; justify-content:space-between; align-items:baseline; margin-top:auto; padding-top:4px;">
                  <span class="ttl-k">${isOpen ? 'ยอดค้างชำระ' : 'ยอดชำระสุทธิ'}</span>
                  <span style="font-size:21px; font-weight:700; color:var(--ttl-ink); font-variant-numeric:tabular-nums;">
                    ${formatMoney(b.total_amount)}
                  </span>
                </div>

                ${isOpen ? `
                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                    <button type="button" class="ttl-btn ttl-btn-ghost" onclick="resumeBillInPos('${b.id}')">
                      ➕ เรียกบิลสั่งเพิ่ม
                    </button>
                    <button type="button" class="ttl-btn ttl-btn-dark" onclick="openCheckoutModalByOrderId('${b.id}')">
                      💰 เช็คบิล (${formatMoney(b.total_amount)})
                    </button>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;
}

// ============================================================================
// VIEW 3: TABLES MAP VIEW
// ============================================================================
function renderTablesView() {
  const { tables } = state.data;
  const zones = ['ALL', ...Array.from(new Set(tables.map(t => t.zone_name)))];
  const visibleTables = state.zoneFilter === 'ALL' ? tables : tables.filter(t => t.zone_name === state.zoneFilter);

  return `
    <div>
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div>
          <h3 style="margin:0; font-size:20px;">🍽️ ผังโต๊ะอาหาร & โซนที่นั่ง</h3>
          <p style="margin:2px 0 0; font-size:13px; color:var(--ttl-muted);">
            กดเลือกโต๊ะเพื่อสั่งอาหาร/ของชำเพิ่ม หรือคืนสินค้าเข้าสต็อก
          </p>
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <div class="ttl-seg">
            ${zones.map(z => `
              <button type="button" aria-selected="${state.zoneFilter === z}" onclick="state.zoneFilter='${z}'; render();">
                ${z === 'ALL' ? 'ทุกโซน' : z}
              </button>
            `).join('')}
          </div>
          <button type="button" class="ttl-btn ttl-btn-dark" onclick="state.showNewTableModal=true; render();">
            + เพิ่มโต๊ะใหม่
          </button>
        </div>
      </div>

      <div class="tables-grid">
        ${visibleTables.map(t => {
          const ord = t.active_order;
          const activeItems = ord ? ord.items.filter(i => i.item_status === 'ACTIVE') : [];
          return `
            <div class="table-card" data-status="${t.status}">
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                  <span class="ttl-k">${t.zone_name}</span>
                  <div style="font-size:20px; font-weight:700;">${t.name} ${ord?.bill_title && ord.bill_title !== t.name ? `• ${ord.bill_title}` : ''}</div>
                </div>
                ${t.status === 'OCCUPIED' ? `
                  <span class="ttl-live"><i></i> มีลูกค้า (${formatTimeAgo(ord ? ord.created_at : null)})</span>
                ` : `
                  <span class="ttl-tag ttl-tag-grocery">โต๊ะว่าง</span>
                `}
              </div>

              ${ord ? `
                ${ord.bill_note ? `<div style="font-size:12px; color:var(--ttl-gold);">📝 โน้ต: ${ord.bill_note}</div>` : ''}
                <div style="padding:10px; border-radius:10px; background:var(--ttl-page); display:flex; flex-direction:column; gap:6px;">
                  <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--ttl-muted);">
                    <span>เลขบิล: ${ord.id}</span>
                    <span>${activeItems.length} รายการ</span>
                  </div>
                  ${ord.items.map(it => `
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; font-size:13px; padding-top:4px; border-top:1px solid var(--ttl-rule); ${it.item_status !== 'ACTIVE' ? 'text-decoration:line-through; opacity:0.5;' : ''}">
                      <div style="flex:1; word-break:break-word;">
                        <span>${it.item_type === 'FOOD' ? '🍳' : '📦'} ${it.product_name} × ${it.quantity}</span>
                        ${it.modifiers && it.modifiers.length > 0 ? `<small style="color:var(--ttl-gold); display:block;">+ ${it.modifiers.join(', ')}</small>` : ''}
                      </div>
                      <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                        <b>${formatMoney(it.unit_price * it.quantity)}</b>
                        ${it.item_status === 'ACTIVE' ? `
                          <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" style="height:24px; padding:0 7px; font-size:10.5px;" onclick="handleReturnTableItem('${it.id}', 'RETURNED_RESTOCK')">↩ คืน</button>
                        ` : ''}
                      </div>
                    </div>
                  `).join('')}
                </div>

                <div style="display:flex; justify-content:space-between; align-items:baseline; margin-top:auto; padding-top:6px;">
                  <span class="ttl-k">ยอดรวมปัจจุบัน</span>
                  <span style="font-size:21px; font-weight:700; color:var(--ttl-ink);">${formatMoney(ord.total_amount)}</span>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                  <button type="button" class="ttl-btn ttl-btn-ghost" onclick="selectPosContext('DINE_IN', '${t.id}', null); state.activeView='pos'; render();">
                    + สั่งเพิ่ม / ดูบิล
                  </button>
                  <button type="button" class="ttl-btn ttl-btn-dark" onclick="openCheckoutModalForTable('${t.id}')">
                    เช็คบิล (${formatMoney(ord.total_amount)})
                  </button>
                </div>
              ` : `
                <div style="padding:24px 12px; text-align:center; color:var(--ttl-muted); background:var(--ttl-page); border-radius:10px; font-size:13px;">
                  โต๊ะว่าง — พร้อมเปิดรับลูกค้า
                </div>
                <button type="button" class="ttl-btn ttl-btn-ghost" style="width:100%; margin-top:auto;" onclick="selectPosContext('DINE_IN', '${t.id}', null); state.activeView='pos'; render();">
                  เปิด ${t.name} / รับออเดอร์ ➔
                </button>
              `}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ============================================================================
// VIEW 4: KITCHEN DISPLAY SYSTEM (KDS)
// ============================================================================
function renderKdsView() {
  const { kitchenQueue } = state.data;
  const activeKds = kitchenQueue.filter(k => k.kitchen_status !== 'SERVED');
  const servedKds = kitchenQueue.filter(k => k.kitchen_status === 'SERVED');

  return `
    <div>
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div>
          <h3 style="margin:0; font-size:20px;">👩‍🍳 จอแสดงผลฝั่งครัว (Kitchen Display System - KDS)</h3>
          <p style="margin:2px 0 0; font-size:13px; color:var(--ttl-muted);">
            แสดงเฉพาะเมนูอาหารที่ยืนยันส่งเข้าโต๊ะ/ครัวแล้ว
          </p>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <span class="ttl-tag ttl-tag-food" style="font-size:13px; padding:6px 12px;">🔥 รอทำ/กำลังผัด: ${activeKds.length} รายการ</span>
          <span class="ttl-tag ttl-tag-grocery" style="font-size:13px; padding:6px 12px;">✅ เสิร์ฟแล้ววันนี้: ${servedKds.length} รายการ</span>
        </div>
      </div>

      ${activeKds.length === 0 ? `
        <div style="margin-top:20px; padding:42px 20px; text-align:center; background:var(--ttl-page); border-radius:14px; border:1px dashed var(--ttl-rule);">
          <div style="font-size:28px;">👩‍🍳✨</div>
          <h4 style="margin:8px 0 4px;">ไม่มีคิวอาหารค้างในครัวตอนนี้</h4>
          <p style="margin:0; color:var(--ttl-muted); font-size:13px;">เมื่อพนักงานตรวจสอบบิลและกด "ส่งเข้าโต๊ะ/ครัว" รายการอาหารจะเด้งขึ้นมาที่หน้าจอนี้ทันที</p>
        </div>
      ` : `
        <div class="kds-grid">
          ${activeKds.map(item => `
            <div class="kds-card" data-kds="${item.kitchen_status}">
              <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                <span style="padding:4px 10px; border-radius:8px; background:var(--ttl-deep); color:var(--ttl-deep-ink); font-weight:700; font-size:13.5px;">
                  ${item.table_name ? `${item.table_name}` : '🛍️ สั่งกลับบ้าน / หน้าร้าน'}
                </span>
                <span style="font-size:11.5px; color:var(--ttl-muted);">
                  ${item.input_source === 'VOICE' ? '🎙️ สั่งด้วยเสียง' : '👆 กดหน้าจอ'} • ${formatTimeAgo(item.created_at)}
                </span>
              </div>

              <div style="font-size:19px; font-weight:700; color:var(--ttl-ink); margin-top:2px;">
                ${item.product_name} <span style="color:var(--ttl-gold);">× ${item.quantity}</span>
              </div>

              ${item.modifiers && item.modifiers.length > 0 ? `
                <div style="padding:7px 10px; border-radius:8px; background:color-mix(in srgb, var(--ttl-gold) 14%, transparent); color:var(--ttl-ink); font-weight:600; font-size:13.5px;">
                  🌶️ คำสั่งพิเศษ: ${item.modifiers.join(' • ')}
                </div>
              ` : ''}

              <div style="display:flex; gap:8px; margin-top:auto; padding-top:6px;">
                ${item.kitchen_status === 'PENDING' ? `
                  <button type="button" class="ttl-btn ttl-btn-gold" style="width:100%;" onclick="updateKdsStatus('${item.id}', 'COOKING')">
                    🍳 เริ่มผัด / กำลังทำอาหาร
                  </button>
                ` : `
                  <button type="button" class="ttl-btn ttl-btn-good" style="width:100%;" onclick="updateKdsStatus('${item.id}', 'SERVED')">
                    ✅ ทำเสร็จแล้ว / พร้อมเสิร์ฟ
                  </button>
                `}
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;
}

// ============================================================================
// VIEW 5: INVENTORY & RECIPE BOM
// ============================================================================
function renderInventoryView() {
  const { products, ingredients, stockInReceipts, inventoryLogs } = state.data;
  const groceryProducts = products.filter(p => p.item_type === 'GROCERY');
  const foodProducts = products.filter(p => p.item_type === 'FOOD');

  let currentBefore = 0;
  let convRate = 1;
  let baseUnit = 'ชิ้น';
  let purchaseUnitLabel = 'แพ็ค';
  let selectedItemName = '';

  if (state.stockInTargetType === 'GROCERY') {
    const prod = groceryProducts.find(p => p.id === state.stockInTargetId) || groceryProducts[0];
    if (prod) {
      state.stockInTargetId = prod.id;
      currentBefore = prod.stock_qty;
      convRate = state.stockInUsePurchaseUnit ? (prod.conversion_rate || 1) : 1;
      baseUnit = prod.unit;
      purchaseUnitLabel = prod.purchase_unit;
      selectedItemName = prod.name;
    }
  } else {
    const ing = ingredients.find(i => i.id === state.stockInTargetId) || ingredients[0];
    if (ing) {
      state.stockInTargetId = ing.id;
      currentBefore = ing.current_qty;
      convRate = state.stockInUsePurchaseUnit ? (ing.conversion_rate || 1) : 1;
      baseUnit = ing.stock_unit;
      purchaseUnitLabel = ing.purchase_unit;
      selectedItemName = ing.name;
    }
  }

  const inputQtyNum = Math.max(0, Number(state.stockInInputQty) || 0);
  const previewAdded = Math.round(inputQtyNum * convRate * 100) / 100;
  const previewAfter = Math.round((currentBefore + previewAdded) * 100) / 100;

  return `
    <div>
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:14px;">
        <div>
          <h3 style="margin:0; font-size:20px;">📦 คลังของชำ, นำเข้าสต็อก & สูตรวัตถุดิบอาหาร</h3>
          <p style="margin:2px 0 0; font-size:13px; color:var(--ttl-muted);">
            กรอกจำนวนซื้อเข้าเพื่อบวกสต็อกอัตโนมัติ และตั้งค่าสูตรวัตถุดิบเมนูอาหาร
          </p>
        </div>

        <div class="ttl-seg">
          <button type="button" aria-selected="${state.inventoryTab === 'stock_in'}" onclick="state.inventoryTab='stock_in'; render();">
            📥 1. นำเข้าสต็อก
          </button>
          <button type="button" aria-selected="${state.inventoryTab === 'recipes'}" onclick="state.inventoryTab='recipes'; render();">
            🥩 2. วัตถุดิบ & ผูกสูตร
          </button>
          <button type="button" aria-selected="${state.inventoryTab === 'products'}" onclick="state.inventoryTab='products'; render();">
            📦 3. สินค้า & เมนูทั้งหมด
          </button>
          <button type="button" aria-selected="${state.inventoryTab === 'audit'}" onclick="state.inventoryTab='audit'; render();">
            📜 4. ประวัตินำเข้า
          </button>
        </div>
      </div>

      ${state.inventoryTab === 'stock_in' ? `
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(310px, 1fr)); gap:16px;">
          <div style="padding:16px; border-radius:14px; border:1px solid var(--ttl-rule); background:var(--ttl-page); display:flex; flex-direction:column; gap:12px;">
            <div class="ttl-k">ฟอร์มนำเข้าสินค้าเพื่อเติมสต็อก (ไม่ต้องบวกเลขเอง)</div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div>
                <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">ประเภทที่จะนำเข้า</label>
                <select class="ttl-select" onchange="state.stockInTargetType=this.value; state.stockInTargetId = this.value==='GROCERY' ? '${groceryProducts[0]?.id}' : '${ingredients[0]?.id}'; render();">
                  <option value="GROCERY" ${state.stockInTargetType === 'GROCERY' ? 'selected' : ''}>📦 สินค้าของชำ</option>
                  <option value="INGREDIENT" ${state.stockInTargetType === 'INGREDIENT' ? 'selected' : ''}>🥩 วัตถุดิบครัว</option>
                </select>
              </div>

              <div>
                <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">เลือกสินค้า / วัตถุดิบ</label>
                <select class="ttl-select" onchange="state.stockInTargetId=this.value; render();">
                  ${(state.stockInTargetType === 'GROCERY' ? groceryProducts : ingredients).map(item => `
                    <option value="${item.id}" ${item.id === state.stockInTargetId ? 'selected' : ''}>
                      ${item.name} (เหลือ ${state.stockInTargetType === 'GROCERY' ? item.stock_qty + ' ' + item.unit : item.current_qty + ' ' + item.stock_unit})
                    </option>
                  `).join('')}
                </select>
              </div>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px;">
              <div>
                <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">หน่วยที่นำเข้า</label>
                <select class="ttl-select" onchange="state.stockInUsePurchaseUnit=(this.value==='PURCHASE'); render();">
                  <option value="PURCHASE" ${state.stockInUsePurchaseUnit ? 'selected' : ''}>${purchaseUnitLabel}</option>
                  <option value="BASE" ${!state.stockInUsePurchaseUnit ? 'selected' : ''}>${baseUnit}</option>
                </select>
              </div>

              <div>
                <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">จำนวนที่ซื้อมาเติม (+)</label>
                <input
                  type="number"
                  step="any"
                  min="0.1"
                  class="ttl-input"
                  style="font-weight:700; font-size:15px;"
                  value="${state.stockInInputQty}"
                  oninput="state.stockInInputQty=this.value; render();"
                />
              </div>

              <div>
                <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">ทุนรวมรอบนี้ (บาท)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  class="ttl-input"
                  value="${state.stockInLineCost}"
                  oninput="state.stockInLineCost=this.value;"
                />
              </div>
            </div>

            <div style="padding:12px 14px; border-radius:12px; background:var(--ttl-deep); color:var(--ttl-deep-ink); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
              <div>
                <div style="font-size:11px; color:var(--ttl-deep-muted);">คำนวณสต็อกอัตโนมัติ: <b style="color:#fff;">${selectedItemName}</b></div>
                <div style="font-size:15px; margin-top:2px; font-variant-numeric:tabular-nums;">
                  เดิม <b>${currentBefore}</b> <span style="color:var(--ttl-gold); font-weight:700;">+${previewAdded}</span> ➔ ใหม่ <b style="color:#7ce8b2; font-size:17px;">${previewAfter} ${baseUnit}</b>
                </div>
              </div>
              <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-gold" onclick="addLineToStockInDraft()">
                + พักลงใบรับของ
              </button>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div>
                <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">ร้านค้าส่ง / แหล่งซื้อ</label>
                <input type="text" class="ttl-input" value="${state.stockInSupplier}" oninput="state.stockInSupplier=this.value" />
              </div>
              <div>
                <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">หมายเหตุ</label>
                <input type="text" class="ttl-input" placeholder="เช่น รอบเช้า" value="${state.stockInNote}" oninput="state.stockInNote=this.value" />
              </div>
            </div>

            <label style="display:flex; align-items:center; gap:8px; font-size:12.5px; cursor:pointer;">
              <input type="checkbox" ${state.stockInRecordExpense ? 'checked' : ''} onchange="state.stockInRecordExpense=this.checked" />
              บันทึกยอดซื้อรอบนี้เข้า "รายจ่ายรายวัน" ด้วย
            </label>

            <button type="button" class="ttl-btn ttl-btn-lg ttl-btn-dark" onclick="submitStockInReceipt()">
              📦 ยืนยันนำเข้าสต็อก (${state.stockInDraftItems.length || 1} รายการ)
            </button>
          </div>

          <div style="display:flex; flex-direction:column; gap:14px;">
            <div style="padding:16px; border-radius:14px; border:1px solid var(--ttl-rule); background:var(--ttl-paper);">
              <div class="ttl-k" style="margin-bottom:8px;">ประวัติใบรับของเข้าสต็อกล่าสุด</div>
              ${stockInReceipts.slice(0, 5).map(r => `
                <div style="padding:10px 12px; border-radius:10px; background:var(--ttl-page); margin-bottom:8px; border:1px solid var(--ttl-rule);">
                  <div style="display:flex; justify-content:space-between; font-weight:600; font-size:13px;">
                    <span>📄 ${r.id} • ${r.supplier_name}</span>
                    <span style="color:var(--ttl-gold);">${formatMoney(r.total_cost)}</span>
                  </div>
                  ${(r.items || []).map(line => `
                    <div style="font-size:12px; display:flex; justify-content:space-between; padding-top:4px; border-top:1px dashed var(--ttl-rule);">
                      <span>• ${line.item_name}</span>
                      <span>เดิม ${line.qty_before} <b style="color:var(--ttl-good);">+${line.qty_added}</b> ➔ <b>${line.qty_after}</b></span>
                    </div>
                  `).join('')}
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      ` : state.inventoryTab === 'recipes' ? `
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(310px, 1fr)); gap:16px;">
          <div style="padding:16px; border-radius:14px; border:1px solid var(--ttl-rule); background:var(--ttl-paper);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <div class="ttl-k">คลังวัตถุดิบอาหารสดในครัว</div>
              <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-dark" onclick="state.showNewIngredientModal=true; render();">
                + เพิ่มวัตถุดิบใหม่
              </button>
            </div>
            <div class="table-scroll-wrap">
              <table class="ttl-table">
                <thead>
                  <tr>
                    <th>วัตถุดิบ</th>
                    <th>คงเหลือ</th>
                    <th>ทุน/หน่วย</th>
                    <th>เติม</th>
                  </tr>
                </thead>
                <tbody>
                  ${ingredients.map(ing => {
                    const isLow = ing.current_qty <= ing.low_stock_threshold;
                    return `
                      <tr>
                        <td><b>${ing.name}</b> ${isLow ? `<span class="ttl-tag ttl-tag-low">ใกล้หมด</span>` : ''}</td>
                        <td style="font-weight:700; color:${isLow ? 'var(--ttl-bad)' : 'var(--ttl-ink)'};">${ing.current_qty.toLocaleString()} ${ing.stock_unit}</td>
                        <td>฿${ing.cost_per_unit}/${ing.stock_unit}</td>
                        <td>
                          <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="state.stockInTargetType='INGREDIENT'; state.stockInTargetId='${ing.id}'; state.inventoryTab='stock_in'; render();">+ เติม</button>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <div style="padding:16px; border-radius:14px; border:1px solid var(--ttl-rule); background:var(--ttl-page); display:flex; flex-direction:column; gap:10px;">
            <div class="ttl-k">ผูกสูตรวัตถุดิบเข้ากับเมนูอาหาร (RECIPE BOM)</div>
            <select class="ttl-select" style="font-weight:600;" onchange="syncBomEditorWithProduct(this.value); render();">
              ${foodProducts.map(fp => `
                <option value="${fp.id}" ${fp.id === state.selectedBomFoodId ? 'selected' : ''}>
                  ${fp.name} (ขาย ${formatMoney(fp.price)} | ทุนสูตร ${formatMoney(fp.cost)})
                </option>
              `).join('')}
            </select>

            <div style="display:flex; flex-direction:column; gap:6px;">
              ${state.bomDraftRows.map((row, idx) => {
                const ingObj = ingredients.find(i => i.id === row.ingredient_id) || ingredients[0];
                return `
                  <div style="display:grid; grid-template-columns:1.3fr 1fr auto; gap:6px; align-items:center; background:var(--ttl-paper); padding:8px; border-radius:8px; border:1px solid var(--ttl-rule);">
                    <select class="ttl-select" onchange="state.bomDraftRows[${idx}].ingredient_id=this.value; render();">
                      ${ingredients.map(i => `<option value="${i.id}" ${i.id === row.ingredient_id ? 'selected' : ''}>${i.name} (${i.stock_unit})</option>`).join('')}
                    </select>
                    <input type="number" step="any" class="ttl-input" value="${row.quantity_used}" oninput="state.bomDraftRows[${idx}].quantity_used=Number(this.value)||0; render();" />
                    <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-danger-outline" onclick="state.bomDraftRows.splice(${idx},1); render();">ลบ</button>
                  </div>
                `;
              }).join('')}
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center;">
              <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="state.bomDraftRows.push({ ingredient_id: '${ingredients[0]?.id}', quantity_used: 50 }); render();">
                + เพิ่มวัตถุดิบในสูตร
              </button>
              <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-dark" onclick="saveBomForSelectedFood()">
                💾 บันทึกสูตรเมนูนี้
              </button>
            </div>
          </div>
        </div>
      ` : state.inventoryTab === 'products' ? `
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div class="ttl-k">รายการสินค้าของชำ & เมนูอาหารทั้งหมด (${products.length})</div>
            <button type="button" class="ttl-btn ttl-btn-dark" onclick="state.showNewProductModal=true; render();">
              + เพิ่มสินค้า/เมนูใหม่
            </button>
          </div>
          <div class="table-scroll-wrap">
            <table class="ttl-table">
              <thead>
                <tr>
                  <th>รหัส</th>
                  <th>ชื่อสินค้า / เมนู</th>
                  <th>ประเภท</th>
                  <th>ราคาขาย</th>
                  <th>ต้นทุนหลังร้าน</th>
                  <th>คงเหลือ</th>
                </tr>
              </thead>
              <tbody>
                ${products.map(p => `
                  <tr>
                    <td style="font-family:monospace; font-size:12px;">${p.id}</td>
                    <td><b>${p.name}</b></td>
                    <td><span class="ttl-tag ${p.item_type === 'FOOD' ? 'ttl-tag-food' : 'ttl-tag-grocery'}">${p.item_type}</span></td>
                    <td style="font-weight:700;">${formatMoney(p.price)}/${p.unit}</td>
                    <td>${formatMoney(p.cost)}</td>
                    <td>${p.item_type === 'GROCERY' ? `<b>${p.stock_qty} ${p.unit}</b>` : 'ตัดตามสูตรครัว'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : `
        <div class="table-scroll-wrap">
          <table class="ttl-table">
            <thead>
              <tr>
                <th>เวลา</th>
                <th>รายการ</th>
                <th>เปลี่ยนแปลง</th>
                <th>คงเหลือ</th>
                <th>สาเหตุ</th>
              </tr>
            </thead>
            <tbody>
              ${inventoryLogs.map(log => `
                <tr>
                  <td style="font-size:11.5px; color:var(--ttl-muted);">${formatTimeAgo(log.created_at)}</td>
                  <td><b>${log.item_name}</b></td>
                  <td style="font-weight:700; color:${log.change_qty > 0 ? 'var(--ttl-good)' : 'var(--ttl-ink)'};">${log.change_qty > 0 ? `+${log.change_qty}` : log.change_qty} ${log.unit}</td>
                  <td><b>${log.balance_after} ${log.unit}</b></td>
                  <td style="font-size:12px;">${log.reason} (${log.note || '-'})</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

// ============================================================================
// VIEW 6: CUSTOMER MEMBERSHIP & TREASURY DASHBOARD
// ============================================================================
function renderCustomersAndDashboardView() {
  const { customers = [], analytics, expenses } = state.data;
  const q = state.customerSearch.trim().toLowerCase();
  const filteredCustomers = customers.filter(c => !q || c.name.toLowerCase().includes(q) || (c.phone || '').includes(q));
  const groceryPct = analytics.total_revenue > 0 ? Math.round((analytics.grocery_revenue / analytics.total_revenue) * 100) : 50;
  const foodPct = 100 - groceryPct;

  return `
    <div style="display:flex; flex-direction:column; gap:24px;">
      <!-- SECTION A: CUSTOMER MEMBERSHIP SYSTEM (ระบบสมาชิกลูกค้า) -->
      <div style="padding:18px; border-radius:16px; border:1px solid var(--ttl-rule); background:var(--ttl-page);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:14px;">
          <div>
            <div class="ttl-k">CUSTOMER MEMBERSHIP • ระบบสมาชิกลูกค้า & สะสมแต้ม</div>
            <h3 style="margin:2px 0 0; font-size:20px;">👥 รายชื่อสมาชิกลูกค้าประจำ (${customers.length} ท่าน)</h3>
          </div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <input
              type="text"
              class="ttl-input"
              style="width:220px; height:36px;"
              placeholder="ค้นหาชื่อ หรือ เบอร์โทรสมาชิก..."
              value="${state.customerSearch.replace(/"/g, '&quot;')}"
              oninput="state.customerSearch=this.value; render();"
            />
            <button type="button" class="ttl-btn ttl-btn-dark" onclick="state.showNewCustomerModal=true; render();">
              + สมัครสมาชิกลูกค้าใหม่
            </button>
          </div>
        </div>

        <div class="tables-grid" style="margin-top:8px;">
          ${filteredCustomers.map(c => `
            <div class="table-card" style="gap:8px;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                  <span class="ttl-tag ttl-tag-food">⭐ ${c.tier || 'สมาชิก'}</span>
                  <div style="font-size:17px; font-weight:700; margin-top:4px;">${c.name}</div>
                  <div style="font-size:12.5px; color:var(--ttl-muted);">📞 ${c.phone || 'ไม่ระบุเบอร์โทร'}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:20px; font-weight:700; color:var(--ttl-gold);">${c.points || 0} แต้ม</div>
                  <div style="font-size:11px; color:var(--ttl-muted);">ยอดซื้อสะสม ${formatMoney(c.total_spent || 0)}</div>
                </div>
              </div>
              ${c.note ? `<div style="font-size:12px; color:var(--ttl-muted); background:var(--ttl-page); padding:6px 10px; border-radius:8px;">📝 ${c.note}</div>` : ''}
              <button
                type="button"
                class="ttl-btn ttl-btn-sm ttl-btn-ghost"
                style="margin-top:auto;"
                onclick="state.selectedCustomerId='${c.id}'; state.billTitle='บิลคุณ${c.name}'; state.activeView='pos'; state.billDrawerOpen=true; render(); showToast('เลือกสมาชิก ${c.name} เข้าบิลปัจจุบันแล้ว');"
              >
                🧾 เลือกสมาชิกท่านนี้เข้าบิลขาย ➔
              </button>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- SECTION B: TREASURY PROFIT / LOSS DASHBOARD -->
      <div>
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:14px; padding-bottom:14px; border-bottom:1px solid var(--ttl-rule);">
          <div>
            <div class="ttl-k">TREASURY FINANCIAL OVERVIEW • สรุปยอดขาย กำไร/ขาดทุน</div>
            <div style="font-size:clamp(24px, 3.2vw, 36px); font-weight:700; letter-spacing:-0.03em; margin-top:2px; font-variant-numeric:tabular-nums;">
              กำไรสุทธิ ${formatMoney(analytics.net_profit)}
              <span style="font-size:14px; font-weight:600; color:${analytics.net_profit >= 0 ? 'var(--ttl-good)' : 'var(--ttl-bad)'};">
                (Net Margin ${analytics.net_margin_pct}%)
              </span>
            </div>
          </div>

          <button type="button" class="ttl-btn ttl-btn-dark" onclick="state.showNewExpenseModal=true; render();">
            + บันทึกรายจ่ายรายวัน
          </button>
        </div>

        <div class="kpi-grid">
          <div class="kpi-card">
            <span class="ttl-k">1. ยอดขายรวม (REVENUE)</span>
            <div class="kpi-val">${formatMoney(analytics.total_revenue)}</div>
            <div style="font-size:12px; color:var(--ttl-muted);">ชำระแล้ว ${formatMoney(analytics.paid_revenue)} • ค้างบิล ${formatMoney(analytics.open_table_revenue)}</div>
          </div>
          <div class="kpi-card">
            <span class="ttl-k">2. ต้นทุนขายรวม (COGS)</span>
            <div class="kpi-val" style="color:var(--ttl-gold);">${formatMoney(analytics.total_cogs)}</div>
            <div style="font-size:12px; color:var(--ttl-muted);">ของชำ ${formatMoney(analytics.grocery_cost)} • ครัว ${formatMoney(analytics.food_cost)}</div>
          </div>
          <div class="kpi-card">
            <span class="ttl-k">3. กำไรขั้นต้น (GROSS)</span>
            <div class="kpi-val" style="color:var(--ttl-good);">${formatMoney(analytics.gross_profit)}</div>
            <div style="font-size:12px; color:var(--ttl-muted);">Margin ${analytics.gross_margin_pct}%</div>
          </div>
          <div class="kpi-card">
            <span class="ttl-k">4. ของเสีย & รายจ่าย</span>
            <div class="kpi-val" style="color:var(--ttl-bad);">${formatMoney(analytics.waste_cost + analytics.operating_expenses)}</div>
            <div style="font-size:12px; color:var(--ttl-muted);">ของเสีย ${formatMoney(analytics.waste_cost)} • รายจ่าย ${formatMoney(analytics.operating_expenses)}</div>
          </div>
        </div>

        <div style="margin-top:14px; padding:14px 16px; border-radius:14px; border:1px solid var(--ttl-rule); background:var(--ttl-page);">
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px;">
            <b>สัดส่วนรายได้: ของชำ (${groceryPct}%) vs อาหารตามสั่ง (${foodPct}%)</b>
            <span>เงินสด ${formatMoney(analytics.cash_revenue)} • QR ${formatMoney(analytics.qr_revenue)}</span>
          </div>
          <div class="ttl-bar">
            <span style="width:${groceryPct}%; background:var(--ttl-chart-1);"></span>
            <span style="width:${foodPct}%; background:var(--ttl-chart-2);"></span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// MODALS
// ============================================================================
function renderModals() {
  let html = '';

  // 1. Food Modifier Modal
  if (state.modifierModalProduct) {
    const p = state.modifierModalProduct;
    const mods = state.data.modifiers || [];
    const extraPrice = state.selectedModifiers.reduce((sum, mName) => {
      const mObj = mods.find(x => x.name === mName);
      return sum + (mObj ? mObj.extra_price : 0);
    }, 0);
    const unitPrice = p.price + extraPrice;

    html += `
      <div class="ttl-modal-backdrop" onclick="if(event.target===this){state.modifierModalProduct=null; render();}">
        <div class="ttl-modal">
          <div class="ttl-k">เลือกตัวเลือกเสริม (FOOD MODIFIERS)</div>
          <h3 style="margin:4px 0 12px; font-size:19px;">${p.name} (${formatMoney(p.price)})</h3>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:16px;">
            ${mods.map(m => {
              const isSelected = state.selectedModifiers.includes(m.name);
              return `
                <button
                  type="button"
                  class="ttl-acc-card"
                  style="padding:10px 12px; border-color:${isSelected ? 'var(--ttl-gold)' : 'var(--ttl-rule)'}; background:${isSelected ? 'color-mix(in srgb, var(--ttl-gold) 12%, var(--ttl-paper))' : 'var(--ttl-paper)'};"
                  onclick="
                    if(state.selectedModifiers.includes('${m.name}')){
                      state.selectedModifiers = state.selectedModifiers.filter(x => x !== '${m.name}');
                    } else {
                      state.selectedModifiers.push('${m.name}');
                    }
                    render();
                  "
                >
                  <div style="display:flex; justify-content:space-between; width:100%; font-size:13px;">
                    <b>${isSelected ? '✓ ' : ''}${m.name}</b>
                    <span style="color:var(--ttl-gold);">${m.extra_price > 0 ? `+฿${m.extra_price}` : 'ฟรี'}</span>
                  </div>
                </button>
              `;
            }).join('')}
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; padding-top:12px; border-top:1px solid var(--ttl-rule);">
            <div class="qty-stepper">
              <button type="button" onclick="state.modifierQty=Math.max(1, state.modifierQty-1); render();">−</button>
              <span>${state.modifierQty}</span>
              <button type="button" onclick="state.modifierQty++; render();">+</button>
            </div>
            <div style="display:flex; gap:8px;">
              <button type="button" class="ttl-btn ttl-btn-ghost" onclick="state.modifierModalProduct=null; render();">ยกเลิก</button>
              <button
                type="button"
                class="ttl-btn ttl-btn-dark"
                onclick="
                  addToCartDirect({
                    product_id: '${p.id}',
                    name: '${p.name}',
                    item_type: 'FOOD',
                    unit: '${p.unit}',
                    unit_price: ${unitPrice},
                    quantity: state.modifierQty,
                    modifiers: [...state.selectedModifiers],
                    send_to_kitchen: true,
                    input_source: 'TOUCH'
                  });
                  state.modifierModalProduct = null;
                  render();
                  showToast('+ เพิ่ม ${p.name} เข้าบิล (รายการใหม่) แล้ว');
                "
              >
                เพิ่มเข้าบิล (${formatMoney(unitPrice * state.modifierQty)})
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 2. Checkout Modal
  if (state.checkoutModalOrder) {
    const co = state.checkoutModalOrder;
    const discount = Math.max(0, Number(state.checkoutDiscount) || 0);
    const netTotal = Math.max(0, co.subtotal - discount);
    const cashRec = Number(state.checkoutCashReceived) || 0;
    const change = Math.max(0, cashRec - netTotal);

    html += `
      <div class="ttl-modal-backdrop" onclick="if(event.target===this){state.checkoutModalOrder=null; render();}">
        <div class="ttl-modal">
          <div class="ttl-k">TREASURY CHECKOUT • รับชำระเงิน</div>
          <h3 style="margin:4px 0 12px; font-size:20px;">${co.label}</h3>

          <div style="padding:14px 16px; border-radius:12px; background:var(--ttl-deep); color:var(--ttl-deep-ink); display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
            <span>ยอดสุทธิที่ต้องชำระ</span>
            <span style="font-size:26px; font-weight:700; color:var(--ttl-gold); font-variant-numeric:tabular-nums;">${formatMoney(netTotal)}</span>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
            <div>
              <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">ช่องทางชำระเงิน</label>
              <div class="ttl-seg" style="width:100%;">
                <button type="button" style="flex:1;" aria-selected="${state.checkoutPaymentMethod === 'CASH'}" onclick="state.checkoutPaymentMethod='CASH'; render();">💵 เงินสด</button>
                <button type="button" style="flex:1;" aria-selected="${state.checkoutPaymentMethod === 'QR_PROMPTPAY'}" onclick="state.checkoutPaymentMethod='QR_PROMPTPAY'; render();">📱 QR</button>
              </div>
            </div>
            <div>
              <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">ส่วนลดท้ายบิล (บาท)</label>
              <input type="number" min="0" class="ttl-input" value="${state.checkoutDiscount}" oninput="state.checkoutDiscount=this.value; render();" />
            </div>
          </div>

          ${state.checkoutPaymentMethod === 'CASH' ? `
            <div style="margin-bottom:14px;">
              <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">รับเงินสดมา (บาท)</label>
              <input type="number" class="ttl-input" style="font-size:20px; font-weight:700; height:44px;" value="${state.checkoutCashReceived}" oninput="state.checkoutCashReceived=this.value; render();" />
              <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
                <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="state.checkoutCashReceived='${netTotal}'; render();">พอดี (${formatMoney(netTotal)})</button>
                <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="state.checkoutCashReceived='100'; render();">฿100</button>
                <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="state.checkoutCashReceived='500'; render();">฿500</button>
                <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="state.checkoutCashReceived='1000'; render();">฿1,000</button>
              </div>
              <div style="margin-top:10px; font-size:16px; font-weight:700; color:var(--ttl-good);">
                เงินทอนลูกค้า: ${formatMoney(change)}
              </div>
            </div>
          ` : `
            <div style="padding:16px; text-align:center; background:var(--ttl-page); border-radius:12px; margin-bottom:14px; border:1px solid var(--ttl-rule);">
              <div style="font-weight:600; margin-bottom:6px;">สแกน QR PromptPay ยอด ${formatMoney(netTotal)}</div>
              <small style="color:var(--ttl-muted);">ONG CO POS PromptPay</small>
            </div>
          `}

          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button type="button" class="ttl-btn ttl-btn-ghost" onclick="state.checkoutModalOrder=null; render();">ปิด</button>
            <button type="button" class="ttl-btn ttl-btn-lg ttl-btn-dark" onclick="confirmCheckoutPayment()">
              ✓ ยืนยันรับชำระเงิน (${formatMoney(netTotal)})
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // 3. Edit Bill Meta Modal (แก้ชื่อบิล / โน้ตบิล / สมาชิก)
  if (state.editingBillMetaOrder) {
    const eb = state.editingBillMetaOrder;
    const customers = state.data.customers || [];
    html += `
      <div class="ttl-modal-backdrop" onclick="if(event.target===this){state.editingBillMetaOrder=null; render();}">
        <form class="ttl-modal" onsubmit="
          event.preventDefault();
          const f = this.elements;
          const cusId = f.bcus.value || null;
          const cusObj = (state.data.customers || []).find(c => c.id === cusId);
          apiCall('/api/orders/update-meta', 'POST', {
            order_id: '${eb.id}',
            bill_title: f.btitle.value.trim(),
            bill_note: f.bnote.value.trim(),
            customer_id: cusId,
            customer_name: cusObj ? cusObj.name : ''
          }).then(out => {
            if (out && out.data) state.data = out.data;
            state.editingBillMetaOrder = null;
            syncCurrentBillMetaFromContext();
            render();
            showToast('✏️ บันทึกชื่อบิล/โน้ต/สมาชิกเรียบร้อยแล้ว');
          });
        ">
          <div class="ttl-k">ตั้งชื่อบิล / โน้ตหมายเหตุ / ผูกสมาชิก</div>
          <h3 style="margin:4px 0 12px;">แก้ไขข้อมูลบิล ${eb.id}</h3>
          <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:14px;">
            <div>
              <label style="font-size:12px; font-weight:600;">🏷️ ชื่อบิล / ชื่อเรียกลูกค้า</label>
              <input name="btitle" class="ttl-input" value="${(eb.bill_title || '').replace(/"/g, '&quot;')}" placeholder="เช่น พี่เอกเสื้อฟ้า, บิลแปะโป้งป้าสมศรี" />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">📝 โน้ตหมายเหตุบิล</label>
              <input name="bnote" class="ttl-input" value="${(eb.bill_note || '').replace(/"/g, '&quot;')}" placeholder="เช่น ไม่ใส่ผงชูรส, ฝากของไว้ก่อน" />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">👤 สมาชิกลูกค้า</label>
              <select name="bcus" class="ttl-select">
                <option value="">-- ไม่ระบุสมาชิก --</option>
                ${customers.map(c => `<option value="${c.id}" ${c.id === eb.customer_id ? 'selected' : ''}>${c.name} (${c.phone || '-'})</option>`).join('')}
              </select>
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button type="button" class="ttl-btn ttl-btn-ghost" onclick="state.editingBillMetaOrder=null; render();">ยกเลิก</button>
            <button type="submit" class="ttl-btn ttl-btn-dark">บันทึกข้อมูลบิล</button>
          </div>
        </form>
      </div>
    `;
  }

  // 4. New Customer Member Modal (สมัครสมาชิกลูกค้า)
  if (state.showNewCustomerModal) {
    html += `
      <div class="ttl-modal-backdrop" onclick="if(event.target===this){state.showNewCustomerModal=false; render();}">
        <form class="ttl-modal" onsubmit="
          event.preventDefault();
          const f = this.elements;
          apiCall('/api/customers/save', 'POST', {
            name: f.cname.value.trim(),
            phone: f.cphone.value.trim(),
            tier: f.ctier.value,
            points: Number(f.cpoints.value) || 10,
            note: f.cnote.value.trim()
          }).then(out => {
            if (out && out.data) state.data = out.data;
            if (out && out.cusId) state.selectedCustomerId = out.cusId;
            state.showNewCustomerModal = false;
            render();
            showToast('⭐ สมัครสมาชิกลูกค้าใหม่เรียบร้อยแล้ว!');
          });
        ">
          <div class="ttl-k">CUSTOMER MEMBERSHIP</div>
          <h3 style="margin:4px 0 12px;">👤 สมัครสมาชิกลูกค้าใหม่</h3>
          <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:14px;">
            <div>
              <label style="font-size:12px; font-weight:600;">ชื่อลูกค้า / ชื่อเล่น *</label>
              <input name="cname" class="ttl-input" placeholder="เช่น พี่ก้อง (บ้านซอย 3)" required />
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div>
                <label style="font-size:12px; font-weight:600;">เบอร์โทรศัพท์</label>
                <input name="cphone" class="ttl-input" placeholder="08X-XXX-XXXX" />
              </div>
              <div>
                <label style="font-size:12px; font-weight:600;">ระดับสมาชิก</label>
                <select name="ctier" class="ttl-select">
                  <option value="สมาชิกใหม่">สมาชิกใหม่</option>
                  <option value="ขาประจำ">ขาประจำ</option>
                  <option value="VIP">VIP</option>
                </select>
              </div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 2fr; gap:10px;">
              <div>
                <label style="font-size:12px; font-weight:600;">แต้มเริ่มต้น</label>
                <input name="cpoints" type="number" class="ttl-input" value="10" />
              </div>
              <div>
                <label style="font-size:12px; font-weight:600;">โน้ตความชอบลูกค้า</label>
                <input name="cnote" class="ttl-input" placeholder="เช่น ชอบเผ็ดน้อย ไม่ใส่ผักชี" />
              </div>
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button type="button" class="ttl-btn ttl-btn-ghost" onclick="state.showNewCustomerModal=false; render();">ยกเลิก</button>
            <button type="submit" class="ttl-btn ttl-btn-dark">บันทึกสมาชิก</button>
          </div>
        </form>
      </div>
    `;
  }

  // 5. New Table Modal
  if (state.showNewTableModal) {
    html += `
      <div class="ttl-modal-backdrop" onclick="if(event.target===this){state.showNewTableModal=false; render();}">
        <form class="ttl-modal" onsubmit="
          event.preventDefault();
          const name = this.elements.tname.value.trim();
          const zone = this.elements.tzone.value.trim() || 'โซนในร้าน';
          apiCall('/api/tables/save', 'POST', { name, zone_name: zone }).then(out=>{
            if(out && out.data) state.data = out.data;
            state.showNewTableModal = false;
            render();
            showToast('+ เพิ่มโต๊ะใหม่เรียบร้อยแล้ว');
          });
        ">
          <div class="ttl-k">เพิ่มโต๊ะอาหาร</div>
          <h3 style="margin:4px 0 12px;">ตั้งชื่อโต๊ะและโซน</h3>
          <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:16px;">
            <div>
              <label style="font-size:12px; font-weight:600;">ชื่อโต๊ะ</label>
              <input name="tname" class="ttl-input" placeholder="เช่น โต๊ะ 7" required />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">ชื่อโซน</label>
              <input name="tzone" class="ttl-input" value="โซนหน้าร้าน" required />
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button type="button" class="ttl-btn ttl-btn-ghost" onclick="state.showNewTableModal=false; render();">ยกเลิก</button>
            <button type="submit" class="ttl-btn ttl-btn-dark">บันทึกโต๊ะใหม่</button>
          </div>
        </form>
      </div>
    `;
  }

  // 6. New Product Modal
  if (state.showNewProductModal) {
    html += `
      <div class="ttl-modal-backdrop" onclick="if(event.target===this){state.showNewProductModal=false; render();}">
        <form class="ttl-modal" onsubmit="
          event.preventDefault();
          const f = this.elements;
          apiCall('/api/products/save', 'POST', {
            name: f.pname.value,
            item_type: f.ptype.value,
            barcode: f.pbarcode.value,
            price: Number(f.pprice.value),
            cost: Number(f.pcost.value),
            unit: f.punit.value || 'ชิ้น',
            purchase_unit: f.ppurchase.value || 'แพ็ค',
            conversion_rate: Number(f.pconv.value) || 1,
            stock_qty: Number(f.pstock.value) || 0,
            voice_aliases: f.paliases.value
          }).then(out=>{
            if(out && out.data) state.data = out.data;
            state.showNewProductModal = false;
            render();
            showToast('+ บันทึกสินค้า/เมนูใหม่เรียบร้อยแล้ว');
          });
        ">
          <div class="ttl-k">เพิ่มสินค้าของชำ หรือ เมนูอาหารใหม่</div>
          <h3 style="margin:4px 0 12px;">ข้อมูลสินค้า / เมนู</h3>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
            <div>
              <label style="font-size:12px; font-weight:600;">ประเภท</label>
              <select name="ptype" class="ttl-select">
                <option value="GROCERY">📦 สินค้าของชำ</option>
                <option value="FOOD">🍳 เมนูอาหารส่งครัว</option>
              </select>
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">ชื่อสินค้า / เมนู</label>
              <input name="pname" class="ttl-input" required />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">บาร์โค้ด (ถ้ามี)</label>
              <input name="pbarcode" class="ttl-input" />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">คำพ้องสั่งด้วยเสียง</label>
              <input name="paliases" class="ttl-input" placeholder="คั่นด้วยจุลภาค ," />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">ราคาขาย (บาท)</label>
              <input name="pprice" type="number" step="any" class="ttl-input" value="20" required />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">ราคาทุนหลังร้าน (บาท)</label>
              <input name="pcost" type="number" step="any" class="ttl-input" value="14" required />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">หน่วยขายย่อย</label>
              <input name="punit" class="ttl-input" value="ขวด" />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">สต็อกเริ่มต้น</label>
              <input name="pstock" type="number" step="any" class="ttl-input" value="24" />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">หน่วยซื้อยกแพ็ค</label>
              <input name="ppurchase" class="ttl-input" value="ลัง (24 ขวด)" />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">จำนวนชิ้นต่อแพ็ค</label>
              <input name="pconv" type="number" step="any" class="ttl-input" value="24" />
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button type="button" class="ttl-btn ttl-btn-ghost" onclick="state.showNewProductModal=false; render();">ยกเลิก</button>
            <button type="submit" class="ttl-btn ttl-btn-dark">บันทึกสินค้า</button>
          </div>
        </form>
      </div>
    `;
  }

  // 7. New Ingredient Modal
  if (state.showNewIngredientModal) {
    html += `
      <div class="ttl-modal-backdrop" onclick="if(event.target===this){state.showNewIngredientModal=false; render();}">
        <form class="ttl-modal" onsubmit="
          event.preventDefault();
          const f = this.elements;
          apiCall('/api/ingredients/save', 'POST', {
            name: f.iname.value,
            stock_unit: f.iunit.value || 'กรัม',
            purchase_unit: f.ipurchase.value || 'กิโลกรัม',
            conversion_rate: Number(f.iconv.value) || 1000,
            current_qty: Number(f.iqty.value) || 0,
            cost_per_unit: Number(f.icost.value) || 0.15
          }).then(out=>{
            if(out && out.data) state.data = out.data;
            state.showNewIngredientModal = false;
            render();
            showToast('+ เพิ่มวัตถุดิบอาหารใหม่เรียบร้อยแล้ว');
          });
        ">
          <div class="ttl-k">เพิ่มวัตถุดิบอาหารเข้าคลังครัว</div>
          <h3 style="margin:4px 0 12px;">ข้อมูลวัตถุดิบอาหาร</h3>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
            <div>
              <label style="font-size:12px; font-weight:600;">ชื่อวัตถุดิบ</label>
              <input name="iname" class="ttl-input" required />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">หน่วยตัดสูตร (กรัม/ฟอง)</label>
              <input name="iunit" class="ttl-input" value="กรัม" required />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">หน่วยซื้อเข้า</label>
              <input name="ipurchase" class="ttl-input" value="กิโลกรัม" required />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">อัตราแปลงหน่วย</label>
              <input name="iconv" type="number" step="any" class="ttl-input" value="1000" required />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">สต็อกเริ่มต้น</label>
              <input name="iqty" type="number" step="any" class="ttl-input" value="2000" required />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">ทุนต่อหน่วยย่อย (บาท)</label>
              <input name="icost" type="number" step="any" class="ttl-input" value="0.22" required />
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button type="button" class="ttl-btn ttl-btn-ghost" onclick="state.showNewIngredientModal=false; render();">ยกเลิก</button>
            <button type="submit" class="ttl-btn ttl-btn-dark">บันทึกวัตถุดิบ</button>
          </div>
        </form>
      </div>
    `;
  }

  // 8. New Daily Expense Modal
  if (state.showNewExpenseModal) {
    html += `
      <div class="ttl-modal-backdrop" onclick="if(event.target===this){state.showNewExpenseModal=false; render();}">
        <form class="ttl-modal" onsubmit="
          event.preventDefault();
          const f = this.elements;
          apiCall('/api/expenses/save', 'POST', {
            category: f.ecat.value,
            title: f.etitle.value,
            amount: Number(f.eamount.value)
          }).then(out=>{
            if(out && out.data) state.data = out.data;
            state.showNewExpenseModal = false;
            render();
            showToast('💸 บันทึกรายจ่ายเรียบร้อย');
          });
        ">
          <div class="ttl-k">บันทึกรายจ่ายรายวัน</div>
          <h3 style="margin:4px 0 12px;">เพิ่มรายการค่าใช้จ่าย</h3>
          <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:14px;">
            <div>
              <label style="font-size:12px; font-weight:600;">หมวดหมู่รายจ่าย</label>
              <select name="ecat" class="ttl-select">
                <option value="UTILITY">ค่าน้ำ / ค่าไฟ / แก๊สหุงต้ม</option>
                <option value="WAGE">ค่าแรงพนักงาน</option>
                <option value="RAW_MATERIAL">ซื้อของสดจิปาถะ</option>
                <option value="OTHER">อื่นๆ</option>
              </select>
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">รายละเอียด</label>
              <input name="etitle" class="ttl-input" required />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">จำนวนเงิน (บาท)</label>
              <input name="eamount" type="number" step="any" min="1" class="ttl-input" required />
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button type="button" class="ttl-btn ttl-btn-ghost" onclick="state.showNewExpenseModal=false; render();">ยกเลิก</button>
            <button type="submit" class="ttl-btn ttl-btn-dark">บันทึกรายจ่าย</button>
          </div>
        </form>
      </div>
    `;
  }

  return html;
}

// ============================================================================
// MAIN SHELL RENDER
// ============================================================================
function render() {
  document.documentElement.setAttribute('data-theme', state.theme);
  const appEl = document.getElementById('app');
  if (!appEl) return;

  if (!state.data) {
    appEl.innerHTML = `<div style="padding:80px; text-align:center;">กำลังโหลดระบบ ONG CO POS...</div>`;
    return;
  }

  const { tables, kitchenQueue, analytics, allBills = [], customers = [] } = state.data;
  const openBillsCount = allBills.filter(b => b.status === 'OPEN').length;
  const occupiedCount = tables.filter(t => t.status === 'OCCUPIED').length;
  const pendingKdsCount = kitchenQueue.filter(k => k.kitchen_status !== 'SERVED').length;
  const lowStockCount = (analytics.low_stock_grocery?.length || 0) + (analytics.low_stock_ingredients?.length || 0);

  appEl.innerHTML = `
    <div class="ttl-Shell">
      <div class="ttl-hero-grid" aria-hidden="true"></div>
      <div class="ttl-hero-glow" aria-hidden="true"></div>

      <!-- Top Sticky Header (.ttl-nav) -->
      <header class="ttl-nav">
        <div class="ttl-nav-in">
          <a href="#" class="ttl-brand" onclick="event.preventDefault(); state.activeView='pos'; render();">
            ${renderLogoSvg(24)}
            <span>ONG CO POS</span>
            <span class="ttl-brand-sub">Teal Treasury</span>
          </a>

          <nav class="ttl-nav-links">
            <button type="button" class="ttl-nav-tab" data-active="${state.activeView === 'pos'}" onclick="state.activeView='pos'; render();">
              🛒 แคชเชียร์ & สั่งด้วยเสียง
            </button>
            <button type="button" class="ttl-nav-tab" data-active="${state.activeView === 'bills'}" onclick="state.activeView='bills'; render();">
              🧾 จัดการบิล
              ${openBillsCount > 0 ? `<span class="ttl-badge-count">${openBillsCount}</span>` : ''}
            </button>
            <button type="button" class="ttl-nav-tab" data-active="${state.activeView === 'tables'}" onclick="state.activeView='tables'; render();">
              🍽️ ผังโต๊ะ
              <span class="ttl-badge-count">${occupiedCount}/${tables.length}</span>
            </button>
            <button type="button" class="ttl-nav-tab" data-active="${state.activeView === 'kds'}" onclick="state.activeView='kds'; render();">
              👩‍🍳 จอครัว
              ${pendingKdsCount > 0 ? `<span class="ttl-badge-count">${pendingKdsCount}</span>` : ''}
            </button>
            <button type="button" class="ttl-nav-tab" data-active="${state.activeView === 'inventory'}" onclick="state.activeView='inventory'; render();">
              📦 สต็อก & สูตร
              ${lowStockCount > 0 ? `<span class="ttl-badge-count" style="background:var(--ttl-bad);">${lowStockCount}</span>` : ''}
            </button>
            <button type="button" class="ttl-nav-tab" data-active="${state.activeView === 'dashboard'}" onclick="state.activeView='dashboard'; render();">
              👥 สมาชิก & กำไร (${customers.length})
            </button>
          </nav>

          <div class="ttl-nav-end">
            <div class="ttl-seg" role="group" aria-label="Theme">
              <button type="button" aria-selected="${state.theme === 'teal'}" onclick="state.theme='teal'; render();">Teal</button>
              <button type="button" aria-selected="${state.theme === 'plum'}" onclick="state.theme='plum'; render();">Plum</button>
              <button type="button" aria-selected="${state.theme === 'graphite'}" onclick="state.theme='graphite'; render();">Dark</button>
            </div>
          </div>
        </div>
      </header>

      <!-- Always-Ready Voice Command Bar -->
      ${renderVoiceConsole()}

      <!-- Main Workspace Card -->
      <main class="ttl-workspace-wrap">
        <div class="ttl-main-card">
          ${state.activeView === 'pos' ? renderPosView() : ''}
          ${state.activeView === 'bills' ? renderBillsView() : ''}
          ${state.activeView === 'tables' ? renderTablesView() : ''}
          ${state.activeView === 'kds' ? renderKdsView() : ''}
          ${state.activeView === 'inventory' ? renderInventoryView() : ''}
          ${state.activeView === 'dashboard' ? renderCustomersAndDashboardView() : ''}
        </div>
      </main>

      <!-- Floating Bill Button & Slide-Over Bill Drawer -->
      ${renderFloatingBillAndDrawer()}

      <!-- Mobile Bottom Navigation Bar -->
      <nav class="ttl-mobile-nav">
        <button type="button" class="ttl-mob-tab" data-active="${state.activeView === 'pos'}" onclick="state.activeView='pos'; render();">
          <span class="mob-ico">🛒</span>
          <span>แคชเชียร์</span>
        </button>
        <button type="button" class="ttl-mob-tab" data-active="${state.activeView === 'bills'}" onclick="state.activeView='bills'; render();">
          <span class="mob-ico">🧾</span>
          <span>จัดการบิล (${openBillsCount})</span>
        </button>
        <button type="button" class="ttl-mob-tab" data-active="${state.activeView === 'tables'}" onclick="state.activeView='tables'; render();">
          <span class="mob-ico">🍽️</span>
          <span>ผังโต๊ะ</span>
        </button>
        <button type="button" class="ttl-mob-tab" data-active="${state.activeView === 'kds'}" onclick="state.activeView='kds'; render();">
          <span class="mob-ico">👩‍🍳</span>
          <span>จอครัว (${pendingKdsCount})</span>
        </button>
        <button type="button" class="ttl-mob-tab" data-active="${state.activeView === 'inventory'}" onclick="state.activeView='inventory'; render();">
          <span class="mob-ico">📦</span>
          <span>สต็อก</span>
        </button>
        <button type="button" class="ttl-mob-tab" data-active="${state.activeView === 'dashboard'}" onclick="state.activeView='dashboard'; render();">
          <span class="mob-ico">👥</span>
          <span>สมาชิก/กำไร</span>
        </button>
      </nav>

      ${renderModals()}
      ${state.toastMessage ? `<div class="ttl-toast">${state.toastMessage}</div>` : ''}
    </div>
  `;
}

// Initialize SSE & Bootstrap on Load
window.addEventListener('DOMContentLoaded', () => {
  fetchBootstrap();
  try {
    const evtSource = new EventSource('/api/events');
    evtSource.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'refresh') fetchBootstrap();
      } catch {
        // ignore
      }
    };
  } catch {
    // ignore if SSE not supported
  }
});
