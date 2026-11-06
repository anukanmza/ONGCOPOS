const state = {
  theme: 'teal',
  showHeroBanner: true,
  activeView: 'pos', // 'pos' | 'tables' | 'kds' | 'inventory' | 'dashboard'
  inventoryTab: 'stock_in', // 'stock_in' | 'products' | 'recipes' | 'audit'
  posMode: 'DINE_IN', // 'RETAIL' | 'DINE_IN'
  selectedTableId: 'T1',
  categoryFilter: 'ALL',
  searchQuery: '',
  zoneFilter: 'ALL',
  cart: [], // Draft items before submitting to walk-in or table
  voiceListening: false,
  voiceText: '',
  voicePreview: null,
  // Modals
  modifierModalProduct: null,
  selectedModifiers: [],
  modifierQty: 1,
  checkoutModalOrder: null, // { mode: 'CART' | 'TABLE', tableId, orderId, totalAmount, subtotal, label }
  checkoutPaymentMethod: 'CASH',
  checkoutCashReceived: '',
  checkoutDiscount: 0,
  showNewTableModal: false,
  showNewProductModal: false,
  showNewIngredientModal: false,
  showNewExpenseModal: false,
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
  }, 3800);
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
  if (endpoint === '/api/kds/status') return eng.updateKds(bodyObj || {});
  if (endpoint === '/api/stock-in') return eng.stockIn(bodyObj || {});
  if (endpoint === '/api/products/save') return eng.saveProduct(bodyObj || {});
  if (endpoint === '/api/ingredients/save') return eng.saveIngredient(bodyObj || {});
  if (endpoint === '/api/tables/save') return eng.saveTable(bodyObj || {});
  if (endpoint === '/api/expenses/save') return eng.saveExpense(bodyObj || {});
  return eng.getBootstrap();
}

async function fetchBootstrap() {
  const data = await apiCall('/api/bootstrap', 'GET');
  if (data && Array.isArray(data.products)) {
    state.data = data;
    syncBomEditorWithProduct(state.selectedBomFoodId);
  } else if (window.LocalPosEngine) {
    state.data = window.LocalPosEngine.getBootstrap();
    syncBomEditorWithProduct(state.selectedBomFoodId);
  }
  render();
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

// Initialize Web Speech API for Thai Voice Ordering
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
    showToast('เบราว์เซอร์นี้ไม่รองรับไมค์โดยตรง สามารถพิมพ์หรือกดปุ่มตัวอย่างคำสั่งเสียงด้านล่างได้เลยครับ');
    const inputEl = document.getElementById('voice-command-input');
    if (inputEl) inputEl.focus();
    return;
  }
  if (state.voiceListening) {
    recognition.stop();
  } else {
    state.voiceText = '';
    state.voicePreview = null;
    recognition.start();
  }
}

async function analyzeVoiceCommand(text) {
  const query = (text !== undefined ? text : state.voiceText).trim();
  state.voiceText = query;
  if (!query) {
    showToast('กรุณาพูดหรือเลือกประโยคคำสั่งเสียง');
    return;
  }
  const fallbackTableId = state.posMode === 'DINE_IN' ? state.selectedTableId : null;
  const parsed = await apiCall('/api/voice/parse', 'POST', { text: query, fallbackTableId });
  state.voicePreview = parsed;
  render();
}

async function confirmVoicePreview() {
  const pv = state.voicePreview;
  if (!pv || !pv.success || pv.items.length === 0) return;

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
    state.voicePreview = null;
    state.voiceText = '';
    await fetchBootstrap();
    showToast(`คืนสินค้าจากคำสั่งเสียงเรียบร้อยแล้ว (${pv.return_mode === 'VOID_WASTE' ? 'ตัดของเสีย' : 'บวกกลับเข้าสต็อก'})`);
    return;
  }

  // Otherwise intent === 'ORDER'
  if (pv.table) {
    state.posMode = 'DINE_IN';
    state.selectedTableId = pv.table.id;
    const out = await apiCall('/api/orders/submit', 'POST', {
      order_type: 'DINE_IN',
      table_id: pv.table.id,
      items: pv.items.map(i => ({
        product_id: i.product_id,
        quantity: i.quantity,
        modifiers: i.modifiers,
        unit_price: i.unit_price,
        input_source: 'VOICE'
      })),
      input_source: 'VOICE'
    });
    if (out && out.data) state.data = out.data;
    state.voicePreview = null;
    state.voiceText = '';
    render();
    showToast(`🎙️ ส่งออเดอร์เสียงเข้า ${pv.table.name} เรียบร้อย! (แยกของชำตัดสต็อก & ส่งอาหารเข้าจอครัว KDS แล้ว)`);
  } else {
    // Add to Walk-in Retail Cart
    state.posMode = 'RETAIL';
    for (const i of pv.items) {
      addToCartDirect({
        product_id: i.product_id,
        name: i.name,
        item_type: i.item_type,
        unit: i.unit,
        unit_price: i.unit_price,
        quantity: i.quantity,
        modifiers: i.modifiers,
        send_to_kitchen: i.send_to_kitchen,
        input_source: 'VOICE'
      });
    }
    state.voicePreview = null;
    state.voiceText = '';
    render();
    showToast(`🎙️ เพิ่ม ${pv.items.length} รายการจากเสียงลงตะกร้าขายหน้าร้านแล้ว`);
  }
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
    showToast(`+ เพิ่ม "${prod.name}" ลงรายการแล้ว`);
  }
}

function handleBarcodeScan(barcodeStr) {
  if (!state.data) return;
  const code = String(barcodeStr || '').trim();
  if (!code) return;
  const prod = state.data.products.find(p => p.barcode === code || p.id.toLowerCase() === code.toLowerCase());
  if (!prod) {
    showToast(`⚠️ ไม่พบรหัสบาร์โค้ด "${code}" ในระบบ`);
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
  showToast(`🔫 ยิงบาร์โค้ด "${prod.name}" (${formatMoney(prod.price)}) สำเร็จ!`);
}

async function submitDraftCartToTable() {
  if (state.cart.length === 0) return;
  const out = await apiCall('/api/orders/submit', 'POST', {
    order_type: 'DINE_IN',
    table_id: state.selectedTableId,
    items: state.cart,
    input_source: 'TOUCH'
  });
  if (out && out.data) state.data = out.data;
  state.cart = [];
  render();
  const tbl = state.data.tables.find(t => t.id === state.selectedTableId);
  showToast(`✅ ส่งรายการเข้า ${tbl ? tbl.name : 'โต๊ะ'} เรียบร้อย (ตัดสต็อกของชำ & ส่งเมนูอาหารเข้าจอครัวแล้ว)`);
}

async function handleReturnTableItem(orderItemId, mode) {
  const label = mode === 'VOID_WASTE'
    ? 'ยืนยันตัดรายการนี้เป็น "ของเสีย/ชำรุด" (หักยอดเงินลูกค้า ไม่บวกสต็อกกลับ และบันทึกเป็นต้นทุนของเสีย)?'
    : 'ยืนยัน "คืนสินค้าเข้าสต็อก" (หักยอดเงินออกจากบิลโต๊ะ และบวกสต็อกกลับเข้าคลังอัตโนมัติ)?';
  if (!window.confirm(label)) return;

  const out = await apiCall('/api/orders/item-return', 'POST', { order_item_id: orderItemId, mode });
  if (out && out.data) state.data = out.data;
  render();
  showToast(mode === 'VOID_WASTE' ? '🗑️ ตัดเป็นของเสียและหักยอดออกจากบิลโต๊ะแล้ว' : '↩️ คืนสินค้ากลับเข้าสต็อกและหักยอดบิลโต๊ะเรียบร้อย');
}

function openCheckoutModalForCart() {
  const subtotal = state.cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  if (subtotal <= 0) return;
  state.checkoutModalOrder = {
    mode: 'CART',
    tableId: null,
    orderId: null,
    subtotal,
    totalAmount: subtotal,
    label: 'บิลขายด่วนหน้าร้าน (Walk-in Retail)'
  };
  state.checkoutPaymentMethod = 'CASH';
  state.checkoutDiscount = 0;
  state.checkoutCashReceived = String(subtotal);
  render();
}

function openCheckoutModalForTable(tableId) {
  if (!state.data) return;
  const tbl = state.data.tables.find(t => t.id === tableId);
  if (!tbl || !tbl.active_order) return;

  // If there are unsent cart items while on this table, alert user
  const subtotal = tbl.active_order.subtotal;
  state.checkoutModalOrder = {
    mode: 'TABLE',
    tableId: tbl.id,
    orderId: tbl.active_order.id,
    subtotal,
    totalAmount: tbl.active_order.total_amount,
    label: `เช็คบิล ${tbl.name} (${tbl.zone_name})`
  };
  state.checkoutPaymentMethod = 'CASH';
  state.checkoutDiscount = tbl.active_order.discount || 0;
  state.checkoutCashReceived = String(tbl.active_order.total_amount);
  render();
}

async function confirmCheckoutPayment() {
  const co = state.checkoutModalOrder;
  if (!co) return;
  const discount = Math.max(0, Number(state.checkoutDiscount) || 0);
  const netTotal = Math.max(0, co.subtotal - discount);
  const cashRec = Number(state.checkoutCashReceived) || netTotal;

  if (co.mode === 'CART') {
    const out = await apiCall('/api/orders/submit', 'POST', {
      order_type: 'RETAIL',
      items: state.cart,
      payment_method: state.checkoutPaymentMethod,
      discount,
      cash_received: cashRec,
      settle_immediately: true
    });
    if (out && out.data) state.data = out.data;
    state.cart = [];
    state.checkoutModalOrder = null;
    render();
    showToast(`💰 รับชำระเงินหน้าร้าน ${formatMoney(netTotal)} สำเร็จ!`);
  } else {
    const out = await apiCall('/api/orders/checkout', 'POST', {
      order_id: co.orderId,
      table_id: co.tableId,
      payment_method: state.checkoutPaymentMethod,
      discount,
      cash_received: cashRec
    });
    if (out && out.data) state.data = out.data;
    state.checkoutModalOrder = null;
    render();
    showToast(`💰 เช็คบิล ${co.label} ยอด ${formatMoney(netTotal)} เรียบร้อย! (ทอน ${formatMoney(out?.change || 0)})`);
  }
}

async function updateKdsStatus(orderItemId, nextStatus) {
  const out = await apiCall('/api/kds/status', 'POST', { order_item_id: orderItemId, kitchen_status: nextStatus });
  if (out && out.data) state.data = out.data;
  render();
  showToast(nextStatus === 'COOKING' ? '🍳 เริ่มผัด/ทำอาหารรายการนี้แล้ว' : '✅ อาหารเสร็จพร้อมเสิร์ฟแล้ว!');
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
  showToast('➕ เพิ่มลงใบรับของเข้าสต็อกแล้ว (ตรวจสอบก่อนกดยืนยันด้านล่าง)');
}

async function submitStockInReceipt() {
  if (state.stockInDraftItems.length === 0) {
    // If user didn't click add line yet, add current form line automatically
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
  showToast(`📦 บันทึกใบรับของเข้าสต็อก ${out?.receiptId || ''} สำเร็จ! ระบบบวกสต็อกเพิ่มให้เรียบร้อยแล้ว`);
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
  showToast(`🍲 บันทึกสูตรวัตถุดิบ (Recipe BOM) ของ "${prod.name}" และคำนวณต้นทุนจานใหม่เรียบร้อย!`);
}

// SVG Logo matching #teal-treasury-landing
function renderLogoSvg(size = 24) {
  return `
    <svg class="ttl-svg" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="var(--ttl-accent)"></rect>
      <path d="M8.5 9.5h4l3.5 9 3.5-9h4L17.6 23h-3.2z" fill="var(--ttl-page)"></path>
      <circle cx="16" cy="9.6" r="1.8" fill="var(--ttl-gold)"></circle>
    </svg>
  `;
}

function renderVoiceConsole() {
  const pv = state.voicePreview;
  return `
    <section class="ttl-voice-console">
      <div class="ttl-voice-bar">
        <div class="ttl-voice-top">
          <button type="button" class="ttl-mic-btn" data-listening="${state.voiceListening}" onclick="toggleVoiceMic()">
            <span>${state.voiceListening ? '🔴 กำลังฟังเสียงภาษาไทย...' : '🎙️ กดพูดสั่งออเดอร์ / คืนของ'}</span>
          </button>

          <form class="ttl-voice-input-wrap" onsubmit="event.preventDefault(); analyzeVoiceCommand(document.getElementById('voice-command-input').value);">
            <input
              id="voice-command-input"
              type="text"
              placeholder='พูดหรือพิมพ์ เช่น "โต๊ะ 1 กะเพราหมูกรอบไข่ดาวไม่สุก 2 โค้กขวดเล็ก 2" หรือ "โต๊ะ 1 คืนโค้ก 1 ขวด"'
              value="${(state.voiceText || '').replace(/"/g, '&quot;')}"
              oninput="state.voiceText = this.value"
            />
            <button type="submit" class="ttl-btn ttl-btn-sm ttl-btn-lilac">วิเคราะห์คำสั่งเสียง ➔</button>
          </form>
        </div>

        <div class="ttl-voice-presets">
          <span>💡 ทดลองกดคำสั่งเสียงตัวอย่าง:</span>
          <button type="button" class="ttl-preset-chip" onclick="analyzeVoiceCommand('โต๊ะ 1 กะเพราหมูกรอบไข่ดาวไม่สุก 2 โค้กขวดเล็ก 2')">
            "โต๊ะ 1 กะเพราหมูกรอบไข่ดาวไม่สุก 2 โค้กขวดเล็ก 2"
          </button>
          <button type="button" class="ttl-preset-chip" onclick="analyzeVoiceCommand('โต๊ะ 2 ข้าวผัดกุ้งพิเศษ 1 ต้มยำกุ้ง 1 น้ำแข็ง 1 ถัง')">
            "โต๊ะ 2 ข้าวผัดกุ้งพิเศษ 1 ต้มยำกุ้ง 1 น้ำแข็ง 1 ถัง"
          </button>
          <button type="button" class="ttl-preset-chip" onclick="analyzeVoiceCommand('โต๊ะ 1 คืนโค้กขวดเล็ก 1 ขวด')">
            "โต๊ะ 1 คืนโค้กขวดเล็ก 1 ขวด" (คืนเข้าสต็อก)
          </button>
          <button type="button" class="ttl-preset-chip" onclick="analyzeVoiceCommand('มาม่าหมูสับ 3 ซอง น้ำปลาทิพรส 1 ขวด เอ็มร้อย 2 ขวด')">
            "มาม่าหมูสับ 3 ซอง น้ำปลาทิพรส 1 ขวด เอ็มร้อย 2 ขวด" (หน้าร้าน)
          </button>
        </div>

        ${pv ? `
          <div class="ttl-voice-preview">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:10px;">
              <div class="ttl-flow-row">
                <span class="ttl-flow-chip">
                  <i></i>
                  <b>${pv.intent === 'RETURN' ? '↩️ คำสั่งคืน/ยกเลิกสินค้า' : '🎙️ แยกคำสั่งเสียงอัตโนมัติ'}</b>
                </span>
                <span>⇢</span>
                <span class="ttl-flow-chip ttl-flow-chip-b">
                  <i></i>
                  <b>${pv.table ? `${pv.table.name} (${pv.table.zone_name})` : 'ขายด่วนหน้าร้าน (Walk-in Retail)'}</b>
                </span>
                <span style="font-size:12px; color:var(--ttl-deep-muted);">(${pv.message})</span>
              </div>
              <div style="display:flex; gap:8px;">
                <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="state.voicePreview = null; render();">ยกเลิก</button>
                ${pv.success ? `
                  <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-gold" onclick="confirmVoicePreview()">
                    ✓ ยืนยันทำรายการ (${formatMoney(pv.total_preview)})
                  </button>
                ` : ''}
              </div>
            </div>

            ${pv.items.length > 0 ? `
              <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(270px, 1fr)); gap:8px;">
                ${pv.items.map(item => `
                  <div style="padding:10px 12px; border-radius:10px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.12); display:flex; flex-direction:column; gap:4px;">
                    <div style="display:flex; justify-content:space-between; font-weight:600;">
                      <span>${item.name} × ${item.quantity} ${item.unit}</span>
                      <span style="color:var(--ttl-gold);">${formatMoney(item.line_total)}</span>
                    </div>
                    ${item.modifiers && item.modifiers.length > 0 ? `
                      <div style="font-size:12px; color:#f7dccb;">✨ ตัวเลือกเสริม: ${item.modifiers.join(', ')}</div>
                    ` : ''}
                    <div style="font-size:11.5px; color:var(--ttl-deep-muted);">
                      ${item.send_to_kitchen ? '🍳 ส่งเข้าจอครัว (KDS)' : '📦 ของชำ: ตัดสต็อกหน้าร้านทันที'}
                    </div>
                    ${item.recipe_deductions && item.recipe_deductions.length > 0 ? `
                      <div style="font-size:11px; color:#cdc8f6;">
                        🥩 ตัดวัตถุดิบครัว: ${item.recipe_deductions.map(r => `${r.name} -${r.qty}${r.unit}`).join(', ')}
                      </div>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>
    </section>
  `;
}

function renderPosView() {
  const { products, categories, tables } = state.data;
  const activeTable = tables.find(t => t.id === state.selectedTableId) || tables[0];

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

  const draftTotal = state.cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const openOrder = state.posMode === 'DINE_IN' && activeTable ? activeTable.active_order : null;

  return `
    <div class="pos-grid">
      <!-- Left Catalog -->
      <div>
        <div class="pos-toolbar">
          <div class="ttl-seg" role="tablist">
            <button type="button" aria-selected="${state.posMode === 'DINE_IN'}" onclick="state.posMode='DINE_IN'; render();">
              🍽️ โหมดโต๊ะอาหาร (Dine-in)
            </button>
            <button type="button" aria-selected="${state.posMode === 'RETAIL'}" onclick="state.posMode='RETAIL'; render();">
              🛒 ขายด่วนของชำหน้าร้าน (Walk-in)
            </button>
          </div>

          ${state.posMode === 'DINE_IN' ? `
            <select class="ttl-select" style="width:auto; font-weight:600;" onchange="state.selectedTableId=this.value; render();">
              ${tables.map(t => `
                <option value="${t.id}" ${t.id === state.selectedTableId ? 'selected' : ''}>
                  ${t.name} (${t.zone_name}) — ${t.status === 'OCCUPIED' ? 'มีลูกค้า ' + formatMoney(t.active_order ? t.active_order.total_amount : 0) : 'โต๊ะว่าง'}
                </option>
              `).join('')}
            </select>
          ` : ''}

          <form class="barcode-box" onsubmit="event.preventDefault(); handleBarcodeScan(state.searchQuery);">
            <span>🔫</span>
            <input
              type="text"
              placeholder="ยิงบาร์โค้ด หรือค้นหาชื่อสินค้า/เมนู..."
              value="${state.searchQuery.replace(/"/g, '&quot;')}"
              oninput="state.searchQuery=this.value; render();"
            />
          </form>
        </div>

        <!-- Quick Barcode Simulation & Category Filters -->
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
          <div class="ttl-seg">
            <button type="button" aria-selected="${state.categoryFilter === 'ALL'}" onclick="state.categoryFilter='ALL'; render();">ทั้งหมด (${products.length})</button>
            <button type="button" aria-selected="${state.categoryFilter === 'GROCERY'}" onclick="state.categoryFilter='GROCERY'; render();">📦 สินค้าของชำ</button>
            <button type="button" aria-selected="${state.categoryFilter === 'FOOD'}" onclick="state.categoryFilter='FOOD'; render();">🍳 เมนูอาหารตามสั่ง</button>
            ${categories.map(c => `
              <button type="button" aria-selected="${state.categoryFilter === c.id}" onclick="state.categoryFilter='${c.id}'; render();">${c.name.split(' ')[0]}</button>
            `).join('')}
          </div>

          <div style="display:flex; gap:6px; align-items:center; font-size:12px;">
            <span class="ttl-k">จำลองยิงบาร์โค้ด:</span>
            <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="handleBarcodeScan('8851959132012')">🔫 โค้กเล็ก</button>
            <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="handleBarcodeScan('8850987101083')">🔫 มาม่าหมูสับ</button>
            <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="handleBarcodeScan('8850545111114')">🔫 น้ำปลาทิพรส</button>
          </div>
        </div>

        <!-- Product Grid -->
        <div class="product-cards">
          ${filteredProducts.map(p => {
            const isLow = p.item_type === 'GROCERY' && p.track_stock && p.stock_qty <= p.low_stock_threshold;
            return `
              <button type="button" class="ttl-acc-card" onclick="handleProductCardClick('${p.id}')">
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                  <span class="ttl-tag ${p.item_type === 'FOOD' ? 'ttl-tag-food' : 'ttl-tag-grocery'}">
                    ${p.item_type === 'FOOD' ? '🍳 ส่งครัว KDS' : '📦 ของชำ'}
                  </span>
                  ${p.item_type === 'GROCERY' ? `
                    <span class="ttl-tag ${isLow ? 'ttl-tag-low' : ''}" style="font-variant-numeric:tabular-nums;">
                      คงเหลือ ${p.stock_qty} ${p.unit}
                    </span>
                  ` : `
                    <span style="font-size:11px; color:var(--ttl-muted);">ทุนสูตร ฿${p.cost}</span>
                  `}
                </div>

                <div style="font-weight:600; font-size:14px; color:var(--ttl-ink); margin-top:4px;">
                  ${p.name}
                </div>

                ${p.item_type === 'FOOD' && p.recipe_items && p.recipe_items.length > 0 ? `
                  <div style="font-size:11px; color:var(--ttl-muted); line-height:1.35;">
                    วัตถุดิบ: ${p.recipe_items.map(r => `${r.ingredient_name.split(' ')[0]} ${r.quantity_used}${r.stock_unit}`).join(', ')}
                  </div>
                ` : `
                  <div style="font-size:11px; color:var(--ttl-muted);">
                    ${p.barcode ? `บาร์โค้ด: ${p.barcode}` : ''}
                  </div>
                `}

                <div style="display:flex; justify-content:space-between; align-items:baseline; width:100%; margin-top:4px; padding-top:6px; border-top:1px solid var(--ttl-rule);">
                  <span style="font-size:16px; font-weight:700; color:var(--ttl-ink); font-variant-numeric:tabular-nums;">
                    ${formatMoney(p.price)}<small style="font-weight:400; font-size:11px; color:var(--ttl-muted);">/${p.unit}</small>
                  </span>
                  <span style="font-size:11px; color:var(--ttl-gold); font-weight:600;">+ เลือก</span>
                </div>
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Right Bill & Table Control Panel -->
      <div class="pos-bill-panel">
        <div class="pos-bill-head">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div class="ttl-k">${state.posMode === 'DINE_IN' ? 'บิลโต๊ะอาหาร (DINE-IN)' : 'บิลขายด่วนหน้าร้าน (WALK-IN)'}</div>
              <div style="font-size:18px; font-weight:700;">
                ${state.posMode === 'DINE_IN' && activeTable ? `${activeTable.name} • ${activeTable.zone_name}` : 'ลูกค้าซื้อหน้าร้าน / กลับบ้าน'}
              </div>
            </div>
            ${openOrder ? `
              <span class="ttl-live"><i></i> เปิดโต๊ะอยู่ (${openOrder.id})</span>
            ` : `
              <span class="ttl-tag ttl-tag-grocery">พร้อมรับออเดอร์</span>
            `}
          </div>
        </div>

        <div class="pos-bill-body">
          <!-- Section A: Existing Open Table Items (with Return to Stock vs Waste buttons!) -->
          ${openOrder && openOrder.items.length > 0 ? `
            <div style="display:flex; flex-direction:column; gap:8px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="ttl-k">รายการที่สั่งเข้า ${activeTable.name} แล้ว (ตัดสต็อกแล้ว)</span>
                <span style="font-size:12px; font-weight:600;">รวม ${formatMoney(openOrder.total_amount)}</span>
              </div>
              ${openOrder.items.map(item => `
                <div class="bill-item-row" data-status="${item.item_status}">
                  <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                    <div>
                      <span class="ttl-tag ${item.item_type === 'FOOD' ? 'ttl-tag-food' : 'ttl-tag-grocery'}">
                        ${item.item_type === 'FOOD' ? `ครัว: ${item.kitchen_status}` : 'ของชำ'}
                      </span>
                      <b style="margin-left:4px;">${item.product_name} × ${item.quantity}</b>
                      ${item.modifiers && item.modifiers.length > 0 ? `
                        <div style="font-size:11.5px; color:var(--ttl-gold);">+ ${item.modifiers.join(', ')}</div>
                      ` : ''}
                    </div>
                    <b style="font-variant-numeric:tabular-nums;">
                      ${item.item_status === 'ACTIVE' ? formatMoney(item.unit_price * item.quantity) : 'ยกเลิกแล้ว'}
                    </b>
                  </div>

                  ${item.item_status === 'ACTIVE' ? `
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; padding-top:4px; border-top:1px dashed var(--ttl-rule);">
                      <span style="font-size:11px; color:var(--ttl-muted);">กรณีลูกค้าขอคืน/ยกเลิก:</span>
                      <div style="display:flex; gap:4px;">
                        <button
                          type="button"
                          class="ttl-btn ttl-btn-sm ttl-btn-ghost"
                          style="height:26px; padding:0 9px; font-size:11px;"
                          title="สินค้ายังไม่แกะ บวกสต็อกกลับเข้าคลังอัตโนมัติ"
                          onclick="handleReturnTableItem('${item.id}', 'RETURNED_RESTOCK')"
                        >
                          ↩ คืนเข้าสต็อก (+${item.quantity})
                        </button>
                        <button
                          type="button"
                          class="ttl-btn ttl-btn-sm ttl-btn-danger-outline"
                          style="height:26px; padding:0 9px; font-size:11px;"
                          title="แกะแล้ว/ชำรุด ไม่คืนสต็อก และบันทึกเป็นต้นทุนของเสีย"
                          onclick="handleReturnTableItem('${item.id}', 'VOID_WASTE')"
                        >
                          ✕ ตัดของเสีย
                        </button>
                      </div>
                    </div>
                  ` : `
                    <div style="font-size:11.5px; color:var(--ttl-bad); font-weight:500;">
                      ${item.item_status === 'RETURNED_RESTOCK' ? '↩ คืนสินค้ากลับเข้าสต็อกแล้ว (ไม่คิดเงิน)' : '🗑️ ตัดเป็นของเสียแล้ว (บันทึกต้นทุนเสีย)'}
                    </div>
                  `}
                </div>
              `).join('')}
            </div>
          ` : ''}

          <!-- Section B: New Draft Cart Items -->
          <div style="display:flex; flex-direction:column; gap:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="ttl-k">${state.posMode === 'DINE_IN' ? 'รายการใหม่ที่กำลังจะสั่งเพิ่มเข้าโต๊ะ' : 'ตะกร้าสินค้าหน้าร้านปัจจุบัน'}</span>
              ${state.cart.length > 0 ? `
                <button type="button" style="font-size:11.5px; color:var(--ttl-bad);" onclick="state.cart=[]; render();">ล้างรายการใหม่</button>
              ` : ''}
            </div>

            ${state.cart.length === 0 ? `
              <div style="padding:24px 12px; text-align:center; color:var(--ttl-muted); border:1px dashed var(--ttl-rule); border-radius:10px; font-size:13px;">
                กดเลือกสินค้า/เมนูทางซ้าย, ยิงบาร์โค้ด หรือกดปุ่มไมโครโฟนด้านบนเพื่อสั่งด้วยเสียง
              </div>
            ` : state.cart.map((c, idx) => `
              <div class="bill-item-row" style="border-color:var(--ttl-gold);">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <div>
                    <span class="ttl-tag ${c.send_to_kitchen ? 'ttl-tag-food' : 'ttl-tag-grocery'}">
                      ${c.send_to_kitchen ? 'ส่งครัว' : 'ตัดของชำ'}
                    </span>
                    <b style="margin-left:4px;">${c.name}</b>
                  </div>
                  <b style="font-variant-numeric:tabular-nums;">${formatMoney(c.unit_price * c.quantity)}</b>
                </div>
                ${c.modifiers && c.modifiers.length > 0 ? `
                  <div style="font-size:12px; color:var(--ttl-gold);">+ ${c.modifiers.join(', ')}</div>
                ` : ''}
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
                  <span style="font-size:11.5px; color:var(--ttl-muted);">${formatMoney(c.unit_price)} / ${c.unit}</span>
                  <div style="display:flex; align-items:center; gap:6px;">
                    <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" style="height:26px; width:26px; padding:0;" onclick="state.cart[${idx}].quantity > 1 ? state.cart[${idx}].quantity-- : state.cart.splice(${idx},1); render();">−</button>
                    <b style="min-width:20px; text-align:center;">${c.quantity}</b>
                    <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" style="height:26px; width:26px; padding:0;" onclick="state.cart[${idx}].quantity++; render();">+</button>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="pos-bill-foot">
          ${state.posMode === 'DINE_IN' ? `
            ${state.cart.length > 0 ? `
              <button type="button" class="ttl-btn ttl-btn-lg ttl-btn-gold" style="width:100%;" onclick="submitDraftCartToTable()">
                📤 ยืนยันสั่งเข้า ${activeTable ? activeTable.name : 'โต๊ะ'} (+${formatMoney(draftTotal)})
              </button>
            ` : ''}
            ${openOrder ? `
              <div style="display:flex; justify-content:space-between; align-items:baseline;">
                <span style="color:var(--ttl-muted); font-size:13px;">ยอดรวมค้างชำระ (${activeTable.name})</span>
                <span style="font-size:24px; font-weight:700; color:var(--ttl-ink);">${formatMoney(openOrder.total_amount)}</span>
              </div>
              <button type="button" class="ttl-btn ttl-btn-lg ttl-btn-dark" style="width:100%;" onclick="openCheckoutModalForTable('${activeTable.id}')">
                💳 เช็คบิล / รับชำระเงิน ${activeTable.name} (${formatMoney(openOrder.total_amount)})
              </button>
            ` : ''}
          ` : `
            <div style="display:flex; justify-content:space-between; align-items:baseline;">
              <span style="color:var(--ttl-muted); font-size:13px;">ยอดสุทธิหน้าร้าน</span>
              <span style="font-size:24px; font-weight:700; color:var(--ttl-ink);">${formatMoney(draftTotal)}</span>
            </div>
            <button
              type="button"
              class="ttl-btn ttl-btn-lg ttl-btn-dark"
              style="width:100%;"
              ${draftTotal <= 0 ? 'disabled' : ''}
              onclick="openCheckoutModalForCart()"
            >
              💰 รับชำระเงินทันที (${formatMoney(draftTotal)})
            </button>
          `}
        </div>
      </div>
    </div>
  `;
}

function renderTablesView() {
  const { tables } = state.data;
  const zones = ['ALL', ...Array.from(new Set(tables.map(t => t.zone_name)))];
  const visibleTables = state.zoneFilter === 'ALL' ? tables : tables.filter(t => t.zone_name === state.zoneFilter);

  return `
    <div style="padding-top:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div>
          <h3 style="margin:0; font-size:20px;">ผังโต๊ะอาหาร & โซนที่นั่ง (Dine-in Table Management)</h3>
          <p style="margin:2px 0 0; font-size:13px; color:var(--ttl-muted);">
            รองรับการสั่งอาหารและหยิบสินค้าของชำรวมในบิลเดียว พร้อมปุ่มคืนสินค้าของชำเข้าสต็อกหรือตัดเป็นของเสีย
          </p>
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <div class="ttl-seg">
            ${zones.map(z => `
              <button type="button" aria-selected="${state.zoneFilter === z}" onclick="state.zoneFilter='${z}'; render();">
                ${z === 'ALL' ? 'ทุกโซน' : z}
              </button>
            `).join('')}
          </div>
          <button type="button" class="ttl-btn ttl-btn-dark" onclick="state.showNewTableModal=true; render();">
            + เพิ่มโต๊ะ / โซนใหม่
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
                  <div style="font-size:20px; font-weight:700;">${t.name}</div>
                </div>
                ${t.status === 'OCCUPIED' ? `
                  <span class="ttl-live"><i></i> มีลูกค้านั่ง (${formatTimeAgo(ord ? ord.created_at : null)})</span>
                ` : `
                  <span class="ttl-tag ttl-tag-grocery">ว่าง (Available)</span>
                `}
              </div>

              ${ord ? `
                <div style="padding:10px; border-radius:10px; background:var(--ttl-page); display:flex; flex-direction:column; gap:6px;">
                  <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--ttl-muted);">
                    <span>เลขบิล: ${ord.id}</span>
                    <span>${activeItems.length} รายการ</span>
                  </div>
                  ${ord.items.map(it => `
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px; padding-top:4px; border-top:1px solid var(--ttl-rule); ${it.item_status !== 'ACTIVE' ? 'text-decoration:line-through; opacity:0.5;' : ''}">
                      <div>
                        <span>${it.item_type === 'FOOD' ? '🍳' : '📦'} ${it.product_name} × ${it.quantity}</span>
                        ${it.modifiers && it.modifiers.length > 0 ? `<small style="color:var(--ttl-gold); display:block;">+ ${it.modifiers.join(', ')}</small>` : ''}
                      </div>
                      <div style="display:flex; align-items:center; gap:6px;">
                        <b>${formatMoney(it.unit_price * it.quantity)}</b>
                        ${it.item_status === 'ACTIVE' ? `
                          <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" style="height:24px; padding:0 7px; font-size:10.5px;" onclick="handleReturnTableItem('${it.id}', 'RETURNED_RESTOCK')" title="คืนเข้าสต็อก">↩ คืน</button>
                        ` : ''}
                      </div>
                    </div>
                  `).join('')}
                </div>

                <div style="display:flex; justify-content:space-between; align-items:baseline; margin-top:auto; padding-top:6px;">
                  <span class="ttl-k">ยอดรวมปัจจุบัน</span>
                  <span style="font-size:22px; font-weight:700; color:var(--ttl-ink);">${formatMoney(ord.total_amount)}</span>
                </div>

                <div style="display:flex; gap:8px;">
                  <button type="button" class="ttl-btn ttl-btn-ghost" style="flex:1;" onclick="state.posMode='DINE_IN'; state.selectedTableId='${t.id}'; state.activeView='pos'; render();">
                    + สั่งเพิ่ม / จัดการของคืน
                  </button>
                  <button type="button" class="ttl-btn ttl-btn-dark" style="flex:1;" onclick="openCheckoutModalForTable('${t.id}')">
                    เช็คบิล (${formatMoney(ord.total_amount)})
                  </button>
                </div>
              ` : `
                <div style="padding:26px 12px; text-align:center; color:var(--ttl-muted); background:var(--ttl-page); border-radius:10px; font-size:13px;">
                  โต๊ะว่าง — พร้อมเปิดรับลูกค้า
                </div>
                <button type="button" class="ttl-btn ttl-btn-ghost" style="width:100%; margin-top:auto;" onclick="state.posMode='DINE_IN'; state.selectedTableId='${t.id}'; state.activeView='pos'; render();">
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

function renderKdsView() {
  const { kitchenQueue } = state.data;
  const activeKds = kitchenQueue.filter(k => k.kitchen_status !== 'SERVED');
  const servedKds = kitchenQueue.filter(k => k.kitchen_status === 'SERVED');

  return `
    <div style="padding-top:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div>
          <h3 style="margin:0; font-size:20px;">จอแสดงผลฝั่งครัว (Kitchen Display System - KDS)</h3>
          <p style="margin:2px 0 0; font-size:13px; color:var(--ttl-muted);">
            แยกเฉพาะเมนูอาหารที่ต้องปรุง (ไม่ปนสินค้าของชำ) พร้อมแสดงรายการวัตถุดิบที่ตัดสต็อกตามสูตรอัตโนมัติ
          </p>
        </div>
        <div style="display:flex; gap:10px;">
          <span class="ttl-tag ttl-tag-food" style="font-size:13px; padding:6px 12px;">🔥 รอทำ/กำลังผัด: ${activeKds.length} รายการ</span>
          <span class="ttl-tag ttl-tag-grocery" style="font-size:13px; padding:6px 12px;">✅ เสิร์ฟแล้ววันนี้: ${servedKds.length} รายการ</span>
        </div>
      </div>

      ${activeKds.length === 0 ? `
        <div style="margin-top:24px; padding:48px; text-align:center; background:var(--ttl-page); border-radius:14px; border:1px dashed var(--ttl-rule);">
          <div style="font-size:28px;">👩‍🍳✨</div>
          <h4 style="margin:8px 0 4px;">ไม่มีคิวอาหารค้างในครัวตอนนี้</h4>
          <p style="margin:0; color:var(--ttl-muted); font-size:13px;">ลองสั่งอาหารด้วยเสียงจากแถบไมโครโฟนด้านบน เช่น "โต๊ะ 2 กะเพราหมูกรอบไข่ดาว 2"</p>
        </div>
      ` : `
        <div class="kds-grid">
          ${activeKds.map(item => `
            <div class="kds-card" data-kds="${item.kitchen_status}">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="padding:4px 10px; border-radius:8px; background:var(--ttl-deep); color:var(--ttl-deep-ink); font-weight:700; font-size:14px;">
                  ${item.table_name ? `${item.table_name} (${item.zone_name || ''})` : '🛍️ สั่งกลับบ้าน / หน้าร้าน'}
                </span>
                <span style="font-size:12px; color:var(--ttl-muted);">
                  ${item.input_source === 'VOICE' ? '🎙️ สั่งด้วยเสียง' : '👆 กดหน้าจอ'} • ${formatTimeAgo(item.created_at)}
                </span>
              </div>

              <div style="font-size:20px; font-weight:700; color:var(--ttl-ink); margin-top:4px;">
                ${item.product_name} <span style="color:var(--ttl-gold);">× ${item.quantity}</span>
              </div>

              ${item.modifiers && item.modifiers.length > 0 ? `
                <div style="padding:8px 12px; border-radius:8px; background:color-mix(in srgb, var(--ttl-gold) 14%, transparent); color:var(--ttl-ink); font-weight:600; font-size:14px;">
                  🌶️ คำสั่งพิเศษ: ${item.modifiers.join(' • ')}
                </div>
              ` : ''}

              ${item.recipe_snapshot && item.recipe_snapshot.length > 0 ? `
                <div style="font-size:11.5px; color:var(--ttl-muted); background:var(--ttl-page); padding:7px 10px; border-radius:8px;">
                  <b>🥩 ตัดสต็อกวัตถุดิบครัวแล้ว:</b>
                  ${item.recipe_snapshot.map(r => `${r.name} ${r.qty} ${r.unit}`).join(', ')}
                </div>
              ` : ''}

              <div style="display:flex; gap:8px; margin-top:auto; padding-top:8px;">
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

function renderInventoryView() {
  const { products, ingredients, stockInReceipts, inventoryLogs } = state.data;
  const groceryProducts = products.filter(p => p.item_type === 'GROCERY');
  const foodProducts = products.filter(p => p.item_type === 'FOOD');

  // Calculate preview for Stock-In form
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
    <div style="padding-top:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
        <div>
          <h3 style="margin:0; font-size:20px;">ระบบคลังของชำ, นำเข้าสต็อก & สูตรวัตถุดิบอาหาร (Inventory & Recipe BOM)</h3>
          <p style="margin:2px 0 0; font-size:13px; color:var(--ttl-muted);">
            กรอกเฉพาะจำนวนที่ซื้อมาเติม ระบบบวกเข้าสต็อกให้อัตโนมัติ พร้อมผูกวัตถุดิบอาหารเข้ากับเมนูตามสั่ง
          </p>
        </div>

        <div class="ttl-seg">
          <button type="button" aria-selected="${state.inventoryTab === 'stock_in'}" onclick="state.inventoryTab='stock_in'; render();">
            📥 1. นำเข้าสินค้าเติมสต็อก (Stock-In)
          </button>
          <button type="button" aria-selected="${state.inventoryTab === 'recipes'}" onclick="state.inventoryTab='recipes'; render();">
            🥩 2. คลังวัตถุดิบอาหาร & ผูกสูตรเมนู
          </button>
          <button type="button" aria-selected="${state.inventoryTab === 'products'}" onclick="state.inventoryTab='products'; render();">
            📦 3. รายการของชำ & เมนูทั้งหมด
          </button>
          <button type="button" aria-selected="${state.inventoryTab === 'audit'}" onclick="state.inventoryTab='audit'; render();">
            📜 4. ประวัติใบรับของ & Log ย้อนหลัง
          </button>
        </div>
      </div>

      ${state.inventoryTab === 'stock_in' ? `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
          <!-- Left: Stock-In Form -->
          <div style="padding:20px; border-radius:14px; border:1px solid var(--ttl-rule); background:var(--ttl-page); display:flex; flex-direction:column; gap:14px;">
            <div class="ttl-k">ฟอร์มนำเข้าสินค้าเพื่อเติมสต็อก (ไม่ต้องบวกเลขเอง)</div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div>
                <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">ประเภทที่จะนำเข้า</label>
                <select class="ttl-select" onchange="state.stockInTargetType=this.value; state.stockInTargetId = this.value==='GROCERY' ? '${groceryProducts[0]?.id}' : '${ingredients[0]?.id}'; render();">
                  <option value="GROCERY" ${state.stockInTargetType === 'GROCERY' ? 'selected' : ''}>📦 สินค้าของชำหน้าร้าน</option>
                  <option value="INGREDIENT" ${state.stockInTargetType === 'INGREDIENT' ? 'selected' : ''}>🥩 วัตถุดิบอาหารเข้าครัว</option>
                </select>
              </div>

              <div>
                <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">เลือกสินค้า / วัตถุดิบ</label>
                <select class="ttl-select" onchange="state.stockInTargetId=this.value; render();">
                  ${(state.stockInTargetType === 'GROCERY' ? groceryProducts : ingredients).map(item => `
                    <option value="${item.id}" ${item.id === state.stockInTargetId ? 'selected' : ''}>
                      ${item.name} (คงเหลือ ${state.stockInTargetType === 'GROCERY' ? item.stock_qty + ' ' + item.unit : item.current_qty + ' ' + item.stock_unit})
                    </option>
                  `).join('')}
                </select>
              </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
              <div>
                <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">หน่วยที่กรอกนำเข้า</label>
                <select class="ttl-select" onchange="state.stockInUsePurchaseUnit=(this.value==='PURCHASE'); render();">
                  <option value="PURCHASE" ${state.stockInUsePurchaseUnit ? 'selected' : ''}>หน่วยซื้อยกแพ็ค: ${purchaseUnitLabel}</option>
                  <option value="BASE" ${!state.stockInUsePurchaseUnit ? 'selected' : ''}>หน่วยย่อย: ${baseUnit}</option>
                </select>
              </div>

              <div>
                <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">กรอกจำนวนที่ซื้อมาเติม (+)</label>
                <input
                  type="number"
                  step="any"
                  min="0.1"
                  class="ttl-input"
                  style="font-weight:700; font-size:16px;"
                  value="${state.stockInInputQty}"
                  oninput="state.stockInInputQty=this.value; render();"
                />
              </div>

              <div>
                <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">ต้นทุนซื้อรวมรอบนี้ (บาท)</label>
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

            <!-- Live Auto-Addition Preview Box -->
            <div style="padding:14px 16px; border-radius:12px; background:var(--ttl-deep); color:var(--ttl-deep-ink); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
              <div>
                <div style="font-size:11px; color:var(--ttl-deep-muted);">คำนวณสต็อกอัตโนมัติสำหรับ: <b style="color:#fff;">${selectedItemName}</b></div>
                <div style="font-size:16px; margin-top:4px; font-variant-numeric:tabular-nums;">
                  สต็อกเดิม <b>${currentBefore} ${baseUnit}</b>
                  <span style="color:var(--ttl-gold); font-weight:700;"> + นำเข้า ${previewAdded} ${baseUnit}</span>
                  ➔ คงเหลือใหม่ <b style="color:#7ce8b2; font-size:19px;">${previewAfter} ${baseUnit}</b>
                </div>
              </div>
              <button type="button" class="ttl-btn ttl-btn-gold" onclick="addLineToStockInDraft()">
                + เพิ่มลงรายการรับเข้า
              </button>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; padding-top:8px; border-top:1px solid var(--ttl-rule);">
              <div>
                <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">ซื้อจากร้านค้า / แหล่งที่มา</label>
                <input type="text" class="ttl-input" value="${state.stockInSupplier}" oninput="state.stockInSupplier=this.value" />
              </div>
              <div>
                <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">หมายเหตุใบรับของ</label>
                <input type="text" class="ttl-input" placeholder="เช่น บิลเงินสดแม็คโครรอบเช้า" value="${state.stockInNote}" oninput="state.stockInNote=this.value" />
              </div>
            </div>

            <label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer;">
              <input type="checkbox" ${state.stockInRecordExpense ? 'checked' : ''} onchange="state.stockInRecordExpense=this.checked" />
              บันทึกยอดซื้อรอบนี้เข้า "รายจ่ายรายวัน" ในหน้า Dashboard กำไร/ขาดทุนด้วย
            </label>

            <button type="button" class="ttl-btn ttl-btn-lg ttl-btn-dark" onclick="submitStockInReceipt()">
              📦 ยืนยันนำเข้าสต็อก & บันทึกประวัติใบรับของ (${state.stockInDraftItems.length || 1} รายการ)
            </button>
          </div>

          <!-- Right: Draft Stock-In List & Recent Stock-In Receipts -->
          <div style="display:flex; flex-direction:column; gap:16px;">
            <div style="padding:18px; border-radius:14px; border:1px solid var(--ttl-rule); background:var(--ttl-paper);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <span class="ttl-k">รายการในใบรับของรอบนี้ (${state.stockInDraftItems.length} รายการ)</span>
                ${state.stockInDraftItems.length > 0 ? `<button type="button" style="font-size:12px; color:var(--ttl-bad);" onclick="state.stockInDraftItems=[]; render();">ล้างรายการ</button>` : ''}
              </div>
              ${state.stockInDraftItems.length === 0 ? `
                <div style="padding:18px; text-align:center; color:var(--ttl-muted); font-size:13px; background:var(--ttl-page); border-radius:10px;">
                  กดปุ่ม "+ เพิ่มลงรายการรับเข้า" เพื่อรวมหลายสินค้าในบิลเดียว หรือกดปุ่มยืนยันด้านซ้ายเพื่อนำเข้าทันที
                </div>
              ` : `
                <table class="ttl-table">
                  <thead>
                    <tr>
                      <th>สินค้า/วัตถุดิบ</th>
                      <th>ก่อนนำเข้า</th>
                      <th>+ ที่เติม</th>
                      <th>หลังนำเข้า</th>
                      <th>ทุนรวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${state.stockInDraftItems.map(it => `
                      <tr>
                        <td><b>${it.name}</b><br/><small style="color:var(--ttl-muted);">${it.input_qty} ${it.unit_label}</small></td>
                        <td>${it.qty_before} ${it.base_unit}</td>
                        <td style="color:var(--ttl-good); font-weight:700;">+${it.qty_added} ${it.base_unit}</td>
                        <td><b>${it.qty_after} ${it.base_unit}</b></td>
                        <td>${formatMoney(it.total_line_cost)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              `}
            </div>

            <div style="padding:18px; border-radius:14px; border:1px solid var(--ttl-rule); background:var(--ttl-paper);">
              <div class="ttl-k" style="margin-bottom:10px;">ประวัติใบรับของเข้าสต็อกล่าสุด (ตรวจสอบย้อนหลังได้)</div>
              ${stockInReceipts.slice(0, 4).map(r => `
                <div style="padding:10px 12px; border-radius:10px; background:var(--ttl-page); margin-bottom:8px; border:1px solid var(--ttl-rule);">
                  <div style="display:flex; justify-content:space-between; font-weight:600; font-size:13px;">
                    <span>📄 ${r.id} • ${r.supplier_name}</span>
                    <span style="color:var(--ttl-gold);">รวมทุน ${formatMoney(r.total_cost)}</span>
                  </div>
                  <div style="font-size:11.5px; color:var(--ttl-muted); margin-bottom:6px;">
                    บันทึกโดย ${r.created_by} • ${formatTimeAgo(r.created_at)} ${r.note ? `(${r.note})` : ''}
                  </div>
                  ${r.items.map(line => `
                    <div style="font-size:12px; display:flex; justify-content:space-between; padding-top:4px; border-top:1px dashed var(--ttl-rule);">
                      <span>• ${line.item_name} (${line.input_qty} ${line.unit_label})</span>
                      <span style="font-variant-numeric:tabular-nums;">เดิม ${line.qty_before} <b style="color:var(--ttl-good);">+${line.qty_added}</b> ➔ <b>${line.qty_after}</b></span>
                    </div>
                  `).join('')}
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      ` : state.inventoryTab === 'recipes' ? `
        <div style="display:grid; grid-template-columns:1.1fr 1fr; gap:20px;">
          <!-- Left: Raw Kitchen Ingredients Inventory -->
          <div style="padding:18px; border-radius:14px; border:1px solid var(--ttl-rule); background:var(--ttl-paper);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <div>
                <div class="ttl-k">คลังวัตถุดิบอาหารสดในครัว (INGREDIENTS STOCK)</div>
                <div style="font-size:13px; color:var(--ttl-muted);">ตัดสต็อกอัตโนมัติตามสูตรเมื่อมีการสั่งอาหาร</div>
              </div>
              <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-dark" onclick="state.showNewIngredientModal=true; render();">
                + เพิ่มวัตถุดิบใหม่
              </button>
            </div>

            <table class="ttl-table">
              <thead>
                <tr>
                  <th>วัตถุดิบครัว</th>
                  <th>คงเหลือปัจจุบัน</th>
                  <th>หน่วยซื้อเข้า</th>
                  <th>ทุน/หน่วยย่อย</th>
                  <th>เติมสต็อก</th>
                </tr>
              </thead>
              <tbody>
                ${ingredients.map(ing => {
                  const isLow = ing.current_qty <= ing.low_stock_threshold;
                  return `
                    <tr>
                      <td>
                        <b>${ing.name}</b>
                        ${isLow ? `<span class="ttl-tag ttl-tag-low" style="margin-left:4px;">ใกล้หมด!</span>` : ''}
                      </td>
                      <td style="font-variant-numeric:tabular-nums; font-weight:700; color:${isLow ? 'var(--ttl-bad)' : 'var(--ttl-ink)'};">
                        ${ing.current_qty.toLocaleString()} ${ing.stock_unit}
                      </td>
                      <td style="font-size:12px; color:var(--ttl-muted);">
                        1 ${ing.purchase_unit} = ${ing.conversion_rate} ${ing.stock_unit}
                      </td>
                      <td style="font-variant-numeric:tabular-nums;">฿${ing.cost_per_unit}/${ing.stock_unit}</td>
                      <td>
                        <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="state.stockInTargetType='INGREDIENT'; state.stockInTargetId='${ing.id}'; state.inventoryTab='stock_in'; render();">
                          + นำเข้า
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <!-- Right: Recipe BOM Editor (ผูกวัตถุดิบกับเมนูอาหาร) -->
          <div style="padding:18px; border-radius:14px; border:1px solid var(--ttl-rule); background:var(--ttl-page); display:flex; flex-direction:column; gap:12px;">
            <div class="ttl-k">ผูกสูตรวัตถุดิบเข้ากับเมนูอาหาร (RECIPE BOM BUILDER)</div>
            <div>
              <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">เลือกเมนูอาหารที่ต้องการตั้งค่าสูตรวัตถุดิบ</label>
              <select class="ttl-select" style="font-weight:600;" onchange="syncBomEditorWithProduct(this.value); render();">
                ${foodProducts.map(fp => `
                  <option value="${fp.id}" ${fp.id === state.selectedBomFoodId ? 'selected' : ''}>
                    ${fp.name} (ราคาขาย ${formatMoney(fp.price)} | ทุนวัตถุดิบตามสูตร ${formatMoney(fp.cost)})
                  </option>
                `).join('')}
              </select>
            </div>

            <div style="display:flex; flex-direction:column; gap:8px;">
              ${state.bomDraftRows.map((row, idx) => {
                const ingObj = ingredients.find(i => i.id === row.ingredient_id) || ingredients[0];
                const rowCost = ingObj ? Math.round(row.quantity_used * ingObj.cost_per_unit * 100) / 100 : 0;
                return `
                  <div style="display:grid; grid-template-columns:1.4fr 1fr auto auto; gap:8px; align-items:center; background:var(--ttl-paper); padding:8px 10px; border-radius:9px; border:1px solid var(--ttl-rule);">
                    <select class="ttl-select" onchange="state.bomDraftRows[${idx}].ingredient_id=this.value; render();">
                      ${ingredients.map(i => `
                        <option value="${i.id}" ${i.id === row.ingredient_id ? 'selected' : ''}>${i.name} (${i.stock_unit})</option>
                      `).join('')}
                    </select>
                    <div style="display:flex; align-items:center; gap:4px;">
                      <input
                        type="number"
                        step="any"
                        class="ttl-input"
                        value="${row.quantity_used}"
                        oninput="state.bomDraftRows[${idx}].quantity_used=Number(this.value)||0; render();"
                      />
                      <span style="font-size:12px; color:var(--ttl-muted);">${ingObj ? ingObj.stock_unit : ''}</span>
                    </div>
                    <span style="font-size:12px; color:var(--ttl-gold); min-width:55px; text-align:right;">ทุน ฿${rowCost}</span>
                    <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-danger-outline" onclick="state.bomDraftRows.splice(${idx},1); render();">ลบ</button>
                  </div>
                `;
              }).join('')}
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center;">
              <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="state.bomDraftRows.push({ ingredient_id: '${ingredients[0]?.id}', quantity_used: 50 }); render();">
                + เพิ่มวัตถุดิบในสูตรจานนี้
              </button>
              <span style="font-size:13px; font-weight:600;">
                รวมทุนวัตถุดิบต่อจาน: <b style="color:var(--ttl-gold);">
                  ${formatMoney(state.bomDraftRows.reduce((s, r) => {
                    const ing = ingredients.find(i => i.id === r.ingredient_id);
                    return s + (ing ? r.quantity_used * ing.cost_per_unit : 0);
                  }, 0))}
                </b>
              </span>
            </div>

            <button type="button" class="ttl-btn ttl-btn-dark" style="margin-top:6px;" onclick="saveBomForSelectedFood()">
              💾 บันทึกการผูกสูตรวัตถุดิบ (อัปเดตต้นทุนจานอัตโนมัติ)
            </button>
          </div>
        </div>
      ` : state.inventoryTab === 'products' ? `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div class="ttl-k">รายการสินค้าของชำ & เมนูอาหารทั้งหมด (${products.length} รายการ)</div>
          <button type="button" class="ttl-btn ttl-btn-dark" onclick="state.showNewProductModal=true; render();">
            + เพิ่มสินค้าของชำ / เมนูอาหารใหม่
          </button>
        </div>

        <table class="ttl-table">
          <thead>
            <tr>
              <th>รหัส / บาร์โค้ด</th>
              <th>ชื่อสินค้า / เมนู</th>
              <th>ประเภท</th>
              <th>คำพ้องเสียงพูด (Voice Aliases)</th>
              <th>ราคาขาย</th>
              <th>ราคาทุน</th>
              <th>สต็อกคงเหลือ</th>
              <th>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            ${products.map(p => `
              <tr>
                <td style="font-family:monospace; font-size:12px;">${p.id}<br/><small style="color:var(--ttl-muted);">${p.barcode || '-'}</small></td>
                <td><b>${p.name}</b></td>
                <td>
                  <span class="ttl-tag ${p.item_type === 'FOOD' ? 'ttl-tag-food' : 'ttl-tag-grocery'}">
                    ${p.item_type === 'FOOD' ? 'อาหาร (KDS)' : 'ของชำ'}
                  </span>
                </td>
                <td style="font-size:12px; color:var(--ttl-muted);">${(p.voice_aliases || []).join(', ')}</td>
                <td style="font-weight:700;">${formatMoney(p.price)}/${p.unit}</td>
                <td>${formatMoney(p.cost)}</td>
                <td>
                  ${p.item_type === 'GROCERY' ? `
                    <b>${p.stock_qty} ${p.unit}</b>
                  ` : `<span style="font-size:12px; color:var(--ttl-muted);">ตัดตามสูตรวัตถุดิบ (${p.recipe_items.length} รายการ)</span>`}
                </td>
                <td>
                  ${p.item_type === 'GROCERY' ? `
                    <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="state.stockInTargetType='GROCERY'; state.stockInTargetId='${p.id}'; state.inventoryTab='stock_in'; render();">
                      + เติมสต็อก
                    </button>
                  ` : `
                    <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="syncBomEditorWithProduct('${p.id}'); state.inventoryTab='recipes'; render();">
                      แก้สูตร BOM
                    </button>
                  `}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : `
        <!-- Audit History Tab -->
        <div style="display:grid; grid-template-columns:1fr 1.2fr; gap:20px;">
          <div>
            <div class="ttl-k" style="margin-bottom:10px;">ประวัติใบรับของเข้าสต็อกทั้งหมด (STOCK-IN RECEIPTS)</div>
            ${stockInReceipts.map(r => `
              <div style="padding:12px 14px; border-radius:12px; border:1px solid var(--ttl-rule); background:var(--ttl-page); margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; font-weight:700;">
                  <span>📄 ${r.id} (${r.supplier_name})</span>
                  <span style="color:var(--ttl-gold);">${formatMoney(r.total_cost)}</span>
                </div>
                <div style="font-size:11.5px; color:var(--ttl-muted); margin-bottom:6px;">
                  เวลา: ${new Date(r.created_at).toLocaleString('th-TH')} • ผู้บันทึก: ${r.created_by}
                </div>
                ${r.items.map(line => `
                  <div style="font-size:12.5px; display:flex; justify-content:space-between; padding-top:4px; border-top:1px dashed var(--ttl-rule);">
                    <span>${line.item_name} (+${line.input_qty} ${line.unit_label})</span>
                    <span>ก่อน: ${line.qty_before} ➔ <b style="color:var(--ttl-good);">+${line.qty_added}</b> ➔ หลัง: <b>${line.qty_after}</b></span>
                  </div>
                `).join('')}
              </div>
            `).join('')}
          </div>

          <div>
            <div class="ttl-k" style="margin-bottom:10px;">ประวัติความเคลื่อนไหวสต็อก & การคืนของ (INVENTORY AUDIT LOGS)</div>
            <table class="ttl-table">
              <thead>
                <tr>
                  <th>เวลา</th>
                  <th>รายการ</th>
                  <th>ประเภท</th>
                  <th>เปลี่ยนแปลง</th>
                  <th>คงเหลือ</th>
                  <th>สาเหตุ / อ้างอิง</th>
                </tr>
              </thead>
              <tbody>
                ${inventoryLogs.map(log => `
                  <tr>
                    <td style="font-size:11.5px; color:var(--ttl-muted);">${formatTimeAgo(log.created_at)}</td>
                    <td><b>${log.item_name}</b></td>
                    <td><span class="ttl-tag ${log.target_type === 'INGREDIENT' ? 'ttl-tag-food' : 'ttl-tag-grocery'}">${log.target_type}</span></td>
                    <td style="font-weight:700; color:${log.change_qty > 0 ? 'var(--ttl-good)' : log.reason === 'WASTE' ? 'var(--ttl-bad)' : 'var(--ttl-ink)'};">
                      ${log.change_qty > 0 ? `+${log.change_qty}` : log.change_qty} ${log.unit}
                    </td>
                    <td><b>${log.balance_after} ${log.unit}</b></td>
                    <td style="font-size:11.5px;">
                      <b>${log.reason}</b> (${log.reference_id})<br/>
                      <span style="color:var(--ttl-muted);">${log.note}</span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `}
    </div>
  `;
}

function renderDashboardView() {
  const { analytics, expenses } = state.data;
  const groceryPct = analytics.total_revenue > 0 ? Math.round((analytics.grocery_revenue / analytics.total_revenue) * 100) : 50;
  const foodPct = 100 - groceryPct;

  return `
    <div style="padding-top:16px;">
      <!-- Teal Treasury Overview Header with Gold Sparkline -->
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:20px; padding-bottom:18px; border-bottom:1px solid var(--ttl-rule);">
        <div>
          <div class="ttl-k">TREASURY FINANCIAL OVERVIEW • สรุปผลประกอบการร้านขายของชำ & อาหาร</div>
          <div style="font-size:clamp(28px, 3.6vw, 42px); font-weight:600; letter-spacing:-0.03em; margin-top:4px; font-variant-numeric:tabular-nums;">
            กำไรสุทธิ ${formatMoney(analytics.net_profit)}
            <span style="font-size:15px; font-weight:500; color:${analytics.net_profit >= 0 ? 'var(--ttl-good)' : 'var(--ttl-bad)'};">
              (Net Margin ${analytics.net_margin_pct}%)
            </span>
          </div>
          <div style="font-size:13px; color:var(--ttl-muted); margin-top:4px;">
            คำนวณจาก: ยอดขายรวม (${formatMoney(analytics.total_revenue)}) − ต้นทุนของชำและสูตรอาหาร (${formatMoney(analytics.total_cogs)}) − ต้นทุนของเสีย (${formatMoney(analytics.waste_cost)}) − รายจ่ายรายวัน (${formatMoney(analytics.operating_expenses)})
          </div>
        </div>

        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
          <button type="button" class="ttl-btn ttl-btn-dark" onclick="state.showNewExpenseModal=true; render();">
            + บันทึกรายจ่ายรายวัน (ค่าแก๊ส / น้ำไฟ / ค่าแรง)
          </button>
          <svg width="260" height="64" viewBox="0 0 260 64" aria-hidden="true">
            <defs>
              <linearGradient id="ttlGoldGrad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stop-color="var(--ttl-gold)" stop-opacity="0.32"></stop>
                <stop offset="1" stop-color="var(--ttl-gold)" stop-opacity="0"></stop>
              </linearGradient>
            </defs>
            <path d="M0 52 L40 44 L85 47 L130 28 L175 31 L220 14 L260 8 L260 64 L0 64 Z" fill="url(#ttlGoldGrad)"></path>
            <path d="M0 52 L40 44 L85 47 L130 28 L175 31 L220 14 L260 8" fill="none" stroke="var(--ttl-gold)" stroke-width="2"></path>
          </svg>
        </div>
      </div>

      <!-- KPI Cards -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <span class="ttl-k">1. ยอดขายรวมทั้งหมด (REVENUE)</span>
          <div class="kpi-val">${formatMoney(analytics.total_revenue)}</div>
          <div style="font-size:12px; color:var(--ttl-muted);">
            ชำระแล้ว ${formatMoney(analytics.paid_revenue)} • โต๊ะเปิดอยู่ ${formatMoney(analytics.open_table_revenue)}
          </div>
        </div>

        <div class="kpi-card">
          <span class="ttl-k">2. ต้นทุนขายรวม (COGS ของชำ+สูตรครัว)</span>
          <div class="kpi-val" style="color:var(--ttl-gold);">${formatMoney(analytics.total_cogs)}</div>
          <div style="font-size:12px; color:var(--ttl-muted);">
            ทุนของชำ ${formatMoney(analytics.grocery_cost)} • ทุนวัตถุดิบอาหาร ${formatMoney(analytics.food_cost)}
          </div>
        </div>

        <div class="kpi-card">
          <span class="ttl-k">3. กำไรขั้นต้น (GROSS PROFIT)</span>
          <div class="kpi-val" style="color:var(--ttl-good);">${formatMoney(analytics.gross_profit)}</div>
          <div style="font-size:12px; color:var(--ttl-muted);">
            คิดเป็นอัตรากำไรขั้นต้น ${analytics.gross_margin_pct}%
          </div>
        </div>

        <div class="kpi-card">
          <span class="ttl-k">4. ต้นทุนของเสีย & คืนของ</span>
          <div class="kpi-val" style="color:var(--ttl-bad);">${formatMoney(analytics.waste_cost)}</div>
          <div style="font-size:12px; color:var(--ttl-muted);">
            คืนเข้าสต็อกปกติ: ${formatMoney(analytics.returned_restock_value)} (ไม่เสียทุน)
          </div>
        </div>

        <div class="kpi-card">
          <span class="ttl-k">5. รายจ่ายดำเนินงานรายวัน</span>
          <div class="kpi-val">${formatMoney(analytics.operating_expenses)}</div>
          <div style="font-size:12px; color:var(--ttl-muted);">
            ยอดซื้อของเติมสต็อกสะสม: ${formatMoney(analytics.stock_in_purchases)}
          </div>
        </div>
      </div>

      <!-- Proportional Breakdown Bar (.ttl-bar from Teal Treasury) -->
      <div style="margin-top:20px; padding:18px; border-radius:14px; border:1px solid var(--ttl-rule); background:var(--ttl-page);">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <b>สัดส่วนรายได้และกำไรขั้นต้น: ร้านขายของชำ vs ร้านอาหารตามสั่ง</b>
          <span style="font-size:12px; color:var(--ttl-muted);">ของชำ ${groceryPct}% • อาหารปรุงสด ${foodPct}%</span>
        </div>
        <div class="ttl-bar">
          <span style="width:${groceryPct}%; background:var(--ttl-chart-1);" title="ของชำ ${groceryPct}%"></span>
          <span style="width:${foodPct}%; background:var(--ttl-chart-2);" title="อาหาร ${foodPct}%"></span>
        </div>
        <div style="display:flex; gap:24px; flex-wrap:wrap; margin-top:10px; font-size:12.5px;">
          <span><i style="display:inline-block; width:10px; height:10px; border-radius:3px; background:var(--ttl-chart-1); margin-right:6px;"></i><b>ฝั่งของชำ:</b> ยอดขาย ${formatMoney(analytics.grocery_revenue)} (กำไรขั้นต้น ${formatMoney(analytics.grocery_profit)})</span>
          <span><i style="display:inline-block; width:10px; height:10px; border-radius:3px; background:var(--ttl-chart-2); margin-right:6px;"></i><b>ฝั่งอาหารตามสั่ง:</b> ยอดขาย ${formatMoney(analytics.food_revenue)} (กำไรขั้นต้น ${formatMoney(analytics.food_profit)})</span>
          <span style="margin-left:auto;">💵 เงินสด: <b>${formatMoney(analytics.cash_revenue)}</b> • 📱 สแกน QR PromptPay: <b>${formatMoney(analytics.qr_revenue)}</b></span>
        </div>
      </div>

      <!-- Bottom Split: Top Sellers + Daily Expenses -->
      <div style="display:grid; grid-template-columns:1.2fr 1fr; gap:20px; margin-top:20px;">
        <div style="padding:18px; border-radius:14px; border:1px solid var(--ttl-rule); background:var(--ttl-paper);">
          <div class="ttl-k" style="margin-bottom:10px;">สินค้าของชำและเมนูอาหารทำกำไรสูงสุด (TOP SELLERS BY PROFIT)</div>
          <table class="ttl-table">
            <thead>
              <tr>
                <th>สินค้า / เมนู</th>
                <th>ประเภท</th>
                <th>จำนวนขาย</th>
                <th>ยอดขาย</th>
                <th>ต้นทุนรวม</th>
                <th>กำไรขั้นต้น</th>
              </tr>
            </thead>
            <tbody>
              ${analytics.top_sellers.map(s => `
                <tr>
                  <td><b>${s.name}</b></td>
                  <td><span class="ttl-tag ${s.item_type === 'FOOD' ? 'ttl-tag-food' : 'ttl-tag-grocery'}">${s.item_type}</span></td>
                  <td>${s.qty_sold}</td>
                  <td>${formatMoney(s.revenue)}</td>
                  <td>${formatMoney(s.cost)}</td>
                  <td style="color:var(--ttl-good); font-weight:700;">+${formatMoney(s.profit)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="padding:18px; border-radius:14px; border:1px solid var(--ttl-rule); background:var(--ttl-paper);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span class="ttl-k">รายการค่าใช้จ่ายดำเนินงานรายวัน (EXPENSES)</span>
            <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="state.showNewExpenseModal=true; render();">+ เพิ่มรายจ่าย</button>
          </div>
          <table class="ttl-table">
            <thead>
              <tr>
                <th>วันที่</th>
                <th>หมวดหมู่</th>
                <th>รายละเอียด</th>
                <th>จำนวนเงิน</th>
              </tr>
            </thead>
            <tbody>
              ${expenses.map(e => `
                <tr>
                  <td style="font-size:12px; color:var(--ttl-muted);">${e.expense_date}</td>
                  <td><span class="ttl-tag ttl-tag-grocery">${e.category}</span></td>
                  <td><b>${e.title}</b></td>
                  <td style="color:var(--ttl-bad); font-weight:600;">-${formatMoney(e.amount)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

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
          <div class="ttl-k">เลือกตัวเลือกเสริมส่งเข้าครัว (FOOD MODIFIERS)</div>
          <h3 style="margin:4px 0 12px; font-size:20px;">${p.name} (ราคาปกติ ${formatMoney(p.price)})</h3>

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
                  <div style="display:flex; justify-content:space-between; width:100%;">
                    <b>${isSelected ? '✓ ' : ''}${m.name}</b>
                    <span style="color:var(--ttl-gold);">${m.extra_price > 0 ? `+฿${m.extra_price}` : 'ฟรี'}</span>
                  </div>
                </button>
              `;
            }).join('')}
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; padding-top:12px; border-top:1px solid var(--ttl-rule);">
            <div style="display:flex; align-items:center; gap:8px;">
              <span>จำนวน:</span>
              <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="state.modifierQty=Math.max(1, state.modifierQty-1); render();">−</button>
              <b style="font-size:16px;">${state.modifierQty}</b>
              <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="state.modifierQty++; render();">+</button>
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
                  showToast('+ เพิ่มเมนูอาหารลงรายการแล้ว');
                "
              >
                เพิ่มลงบิล (${formatMoney(unitPrice * state.modifierQty)})
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
          <h3 style="margin:4px 0 14px; font-size:20px;">${co.label}</h3>

          <div style="padding:14px 16px; border-radius:12px; background:var(--ttl-deep); color:var(--ttl-deep-ink); display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
            <span>ยอดสุทธิที่ต้องชำระ</span>
            <span style="font-size:28px; font-weight:700; color:var(--ttl-gold); font-variant-numeric:tabular-nums;">${formatMoney(netTotal)}</span>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
            <div>
              <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">ช่องทางชำระเงิน</label>
              <div class="ttl-seg" style="width:100%;">
                <button type="button" style="flex:1;" aria-selected="${state.checkoutPaymentMethod === 'CASH'}" onclick="state.checkoutPaymentMethod='CASH'; render();">💵 เงินสด</button>
                <button type="button" style="flex:1;" aria-selected="${state.checkoutPaymentMethod === 'QR_PROMPTPAY'}" onclick="state.checkoutPaymentMethod='QR_PROMPTPAY'; render();">📱 QR PromptPay</button>
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
                <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="state.checkoutCashReceived='${netTotal}'; render();">จ่ายพอดี (${formatMoney(netTotal)})</button>
                <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="state.checkoutCashReceived='100'; render();">฿100</button>
                <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="state.checkoutCashReceived='500'; render();">฿500</button>
                <button type="button" class="ttl-btn ttl-btn-sm ttl-btn-ghost" onclick="state.checkoutCashReceived='1000'; render();">฿1,000</button>
              </div>
              <div style="margin-top:10px; font-size:16px; font-weight:600; color:var(--ttl-good);">
                เงินทอนลูกค้า: ${formatMoney(change)}
              </div>
            </div>
          ` : `
            <div style="padding:16px; text-align:center; background:var(--ttl-page); border-radius:12px; margin-bottom:14px; border:1px solid var(--ttl-rule);">
              <div style="font-weight:600; margin-bottom:6px;">สแกน QR PromptPay ยอด ${formatMoney(netTotal)}</div>
              <div style="width:140px; height:140px; margin:0 auto; background:#fff; padding:10px; border-radius:10px; border:1px solid var(--ttl-rule); display:grid; place-items:center;">
                <svg viewBox="0 0 100 100" width="115" height="115">
                  <rect x="5" y="5" width="28" height="28" fill="none" stroke="#10292d" stroke-width="6"/>
                  <rect x="13" y="13" width="12" height="12" fill="#10292d"/>
                  <rect x="67" y="5" width="28" height="28" fill="none" stroke="#10292d" stroke-width="6"/>
                  <rect x="75" y="13" width="12" height="12" fill="#10292d"/>
                  <rect x="5" y="67" width="28" height="28" fill="none" stroke="#10292d" stroke-width="6"/>
                  <rect x="13" y="75" width="12" height="12" fill="#10292d"/>
                  <rect x="42" y="12" width="14" height="14" fill="#8c7b33"/>
                  <rect x="42" y="42" width="16" height="16" fill="#10292d"/>
                  <rect x="66" y="46" width="22" height="10" fill="#10292d"/>
                  <rect x="42" y="68" width="12" height="22" fill="#10292d"/>
                  <rect x="64" y="68" width="26" height="22" fill="#8c7b33"/>
                </svg>
              </div>
              <small style="color:var(--ttl-muted); display:block; margin-top:6px;">ONG CO POS PromptPay Automatic Amount</small>
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

  // 3. New Table / Zone Modal
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
            showToast('+ เพิ่มโต๊ะ/โซนใหม่เรียบร้อยแล้ว');
          });
        ">
          <div class="ttl-k">เพิ่มโต๊ะอาหาร / แบ่งโซนใหม่</div>
          <h3 style="margin:4px 0 12px;">ตั้งชื่อโต๊ะและโซน</h3>
          <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:16px;">
            <div>
              <label style="font-size:12px; font-weight:600;">ชื่อโต๊ะ (ใช้เรียกสั่งด้วยเสียงได้ทันที)</label>
              <input name="tname" class="ttl-input" placeholder="เช่น โต๊ะ 7 หรือ ซุ้ม 1" required />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">ชื่อโซน</label>
              <input name="tzone" class="ttl-input" value="โซนหน้าร้าน" placeholder="เช่น โซนในร้าน, โซนหน้าร้าน, ซุ้มริมสวน" required />
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

  // 4. New Product / Menu Modal
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
                <option value="GROCERY">📦 สินค้าของชำ (ตัดสต็อกตามชิ้น)</option>
                <option value="FOOD">🍳 เมนูอาหาร (ส่งจอครัว KDS + ผูกสูตรได้)</option>
              </select>
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">ชื่อสินค้า / เมนู</label>
              <input name="pname" class="ttl-input" placeholder="เช่น สปอนเซอร์ ขวดแก้ว" required />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">รหัสบาร์โค้ด (เฉพาะของชำ)</label>
              <input name="pbarcode" class="ttl-input" placeholder="เช่น 8850123456789" />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">คำพ้องสั่งด้วยเสียง (คั่นด้วยจุลภาค)</label>
              <input name="paliases" class="ttl-input" placeholder="เช่น สปอนเซอร์, เกลือแร่" />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">ราคาขาย (บาท)</label>
              <input name="pprice" type="number" step="any" class="ttl-input" value="20" required />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">ราคาทุนต่อหน่วย (บาท)</label>
              <input name="pcost" type="number" step="any" class="ttl-input" value="14" required />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">หน่วยขายย่อย (เช่น ขวด, ซอง, จาน)</label>
              <input name="punit" class="ttl-input" value="ขวด" />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">สต็อกเริ่มต้น (ของชำ)</label>
              <input name="pstock" type="number" step="any" class="ttl-input" value="24" />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">หน่วยซื้อเข้ายกแพ็ค/ลัง</label>
              <input name="ppurchase" class="ttl-input" value="ลัง (24 ขวด)" />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">จำนวนชิ้นต่อแพ็ค/ลัง</label>
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

  // 5. New Ingredient Modal
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
              <input name="iname" class="ttl-input" placeholder="เช่น ปลาหมึกกล้วยหั่น" required />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">หน่วยตัดสูตรอาหาร (เช่น กรัม, ฟอง, ช้อน)</label>
              <input name="iunit" class="ttl-input" value="กรัม" required />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">หน่วยตอนซื้อเข้า (เช่น กิโลกรัม, แผง)</label>
              <input name="ipurchase" class="ttl-input" value="กิโลกรัม" required />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">อัตราแปลงหน่วย (เช่น 1 กก. = 1000 กรัม)</label>
              <input name="iconv" type="number" step="any" class="ttl-input" value="1000" required />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">สต็อกคงเหลือเริ่มต้น (หน่วยตัดสูตร)</label>
              <input name="iqty" type="number" step="any" class="ttl-input" value="2000" required />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">ต้นทุนต่อหน่วยย่อย (เช่น 0.22 บาท/กรัม)</label>
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

  // 6. New Daily Expense Modal
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
            showToast('💸 บันทึกรายจ่ายและคำนวณกำไรสุทธิใหม่เรียบร้อย');
          });
        ">
          <div class="ttl-k">บันทึกรายจ่ายรายวัน (หักคำนวณกำไรสุทธิ)</div>
          <h3 style="margin:4px 0 12px;">เพิ่มรายการค่าใช้จ่าย</h3>
          <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:14px;">
            <div>
              <label style="font-size:12px; font-weight:600;">หมวดหมู่รายจ่าย</label>
              <select name="ecat" class="ttl-select">
                <option value="UTILITY">ค่าน้ำ / ค่าไฟ / แก๊สหุงต้ม</option>
                <option value="WAGE">ค่าแรงพนักงานรายวัน</option>
                <option value="RAW_MATERIAL">ซื้อของสดจิปาถะ (นอกใบรับของ)</option>
                <option value="OTHER">ค่าใช้จ่ายอื่นๆ</option>
              </select>
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">รายละเอียด</label>
              <input name="etitle" class="ttl-input" placeholder="เช่น เปลี่ยนถังแก๊ส ปตท. 15 กก." required />
            </div>
            <div>
              <label style="font-size:12px; font-weight:600;">จำนวนเงิน (บาท)</label>
              <input name="eamount" type="number" step="any" min="1" class="ttl-input" placeholder="450" required />
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

function render() {
  document.documentElement.setAttribute('data-theme', state.theme);
  const appEl = document.getElementById('app');
  if (!appEl) return;

  if (!state.data) {
    appEl.innerHTML = `<div style="padding:80px; text-align:center;">กำลังโหลดระบบ ONG CO POS...</div>`;
    return;
  }

  const { tables, kitchenQueue, analytics } = state.data;
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
            <span class="ttl-brand-sub">Teal Treasury Edition</span>
          </a>

          <nav class="ttl-nav-links">
            <button type="button" class="ttl-nav-tab" data-active="${state.activeView === 'pos'}" onclick="state.activeView='pos'; render();">
              🛒 1. หน้าขาย & สั่งด้วยเสียง
            </button>
            <button type="button" class="ttl-nav-tab" data-active="${state.activeView === 'tables'}" onclick="state.activeView='tables'; render();">
              🍽️ 2. ผังโต๊ะอาหาร
              <span class="ttl-badge-count">${occupiedCount}/${tables.length}</span>
            </button>
            <button type="button" class="ttl-nav-tab" data-active="${state.activeView === 'kds'}" onclick="state.activeView='kds'; render();">
              👩‍🍳 3. จอฝั่งครัว (KDS)
              ${pendingKdsCount > 0 ? `<span class="ttl-badge-count">${pendingKdsCount}</span>` : ''}
            </button>
            <button type="button" class="ttl-nav-tab" data-active="${state.activeView === 'inventory'}" onclick="state.activeView='inventory'; render();">
              📦 4. คลังของชำ, นำเข้า & สูตรวัตถุดิบ
              ${lowStockCount > 0 ? `<span class="ttl-badge-count" style="background:var(--ttl-bad);">${lowStockCount}</span>` : ''}
            </button>
            <button type="button" class="ttl-nav-tab" data-active="${state.activeView === 'dashboard'}" onclick="state.activeView='dashboard'; render();">
              📈 5. Dashboard กำไร/ขาดทุน
            </button>
          </nav>

          <div class="ttl-nav-end">
            <div class="ttl-seg" title="สลับโทนสี Teal Treasury">
              <button type="button" aria-selected="${state.theme === 'teal'}" onclick="state.theme='teal'; render();">Teal</button>
              <button type="button" aria-selected="${state.theme === 'plum'}" onclick="state.theme='plum'; render();">Plum</button>
              <button type="button" aria-selected="${state.theme === 'graphite'}" onclick="state.theme='graphite'; render();">Graphite</button>
            </div>
          </div>
        </div>
      </header>

      <!-- Always-Available Dark Teal AI Voice Ordering Bar -->
      ${renderVoiceConsole()}

      <!-- Main Bezel Frame & Sidebar Workspace (.ttl-device-bezel & .ttl-dash) -->
      <main class="ttl-workspace-wrap">
        <div class="ttl-device-bezel">
          <div class="ttl-dash">
            <!-- Left Treasury Sidebar (.ttl-side) -->
            <aside class="ttl-side">
              <div class="ttl-side-brand">
                ${renderLogoSvg(18)}
                <span>ONG CO Treasury</span>
              </div>

              <div class="ttl-side-label">เมนูระบบหลัก</div>
              <button type="button" class="ttl-side-item" data-on="${state.activeView === 'pos'}" onclick="state.activeView='pos'; render();">
                <span>🛒 แคชเชียร์ & สั่งเสียง</span>
              </button>
              <button type="button" class="ttl-side-item" data-on="${state.activeView === 'tables'}" onclick="state.activeView='tables'; render();">
                <span>🍽️ โต๊ะอาหาร (${occupiedCount} โต๊ะ)</span>
              </button>
              <button type="button" class="ttl-side-item" data-on="${state.activeView === 'kds'}" onclick="state.activeView='kds'; render();">
                <span>👩‍🍳 จอครัว KDS (${pendingKdsCount})</span>
              </button>
              <button type="button" class="ttl-side-item" data-on="${state.activeView === 'inventory' && state.inventoryTab === 'stock_in'}" onclick="state.activeView='inventory'; state.inventoryTab='stock_in'; render();">
                <span>📥 นำเข้าสินค้าเติมสต็อก</span>
              </button>
              <button type="button" class="ttl-side-item" data-on="${state.activeView === 'inventory' && state.inventoryTab === 'recipes'}" onclick="state.activeView='inventory'; state.inventoryTab='recipes'; render();">
                <span>🥩 วัตถุดิบ & ผูกสูตรเมนู</span>
              </button>
              <button type="button" class="ttl-side-item" data-on="${state.activeView === 'dashboard'}" onclick="state.activeView='dashboard'; render();">
                <span>📈 กำไร/ขาดทุนสุทธิ</span>
              </button>

              <div class="ttl-side-label">สถานะโต๊ะด่วน</div>
              ${tables.map(t => `
                <button
                  type="button"
                  class="ttl-side-item"
                  data-on="${state.activeView === 'pos' && state.posMode === 'DINE_IN' && state.selectedTableId === t.id}"
                  onclick="state.posMode='DINE_IN'; state.selectedTableId='${t.id}'; state.activeView='pos'; render();"
                >
                  <i class="ttl-side-dot" style="background:${t.status === 'OCCUPIED' ? 'var(--ttl-gold)' : 'var(--ttl-good)'};"></i>
                  <span>${t.name}</span>
                  <small>${t.active_order ? formatMoney(t.active_order.total_amount) : 'ว่าง'}</small>
                </button>
              `).join('')}

              <div class="ttl-side-label" style="margin-top:auto;">สรุปบัญชีวันนี้</div>
              <div style="padding:8px 10px; border-radius:8px; background:var(--ttl-paper); border:1px solid var(--ttl-rule); font-size:12px;">
                <div style="display:flex; justify-content:space-between;">
                  <span style="color:var(--ttl-muted);">ยอดขายรวม:</span>
                  <b>${formatMoney(analytics.total_revenue)}</b>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:2px;">
                  <span style="color:var(--ttl-muted);">กำไรสุทธิ:</span>
                  <b style="color:var(--ttl-good);">${formatMoney(analytics.net_profit)}</b>
                </div>
              </div>
            </aside>

            <!-- Main Content Area (.ttl-main) -->
            <div class="ttl-main">
              <div class="ttl-crumbs">
                <span>ONG CO POS</span>
                <span>/</span>
                <b>${
                  state.activeView === 'pos' ? 'หน้าขายหน้าร้าน & โต๊ะอาหาร (Hybrid POS Terminal)' :
                  state.activeView === 'tables' ? 'ผังโต๊ะอาหาร & โซน (Table & Zone Map)' :
                  state.activeView === 'kds' ? 'จอแสดงผลฝั่งครัว (Kitchen Display System)' :
                  state.activeView === 'inventory' ? 'ระบบคลังของชำ, นำเข้าเติมสต็อก & สูตรวัตถุดิบอาหาร' :
                  'รายงานยอดขาย ต้นทุน และกำไร/ขาดทุนสุทธิ (P&L Treasury)'
                }</b>
                <span class="ttl-live"><i></i> Real-time Sync Active</span>
              </div>

              ${
                state.activeView === 'pos' ? renderPosView() :
                state.activeView === 'tables' ? renderTablesView() :
                state.activeView === 'kds' ? renderKdsView() :
                state.activeView === 'inventory' ? renderInventoryView() :
                renderDashboardView()
              }
            </div>
          </div>
        </div>
      </main>

      ${renderModals()}
      ${state.toastMessage ? `<div class="ttl-toast">${state.toastMessage}</div>` : ''}
    </div>
  `;
}

// Connect SSE for live updates + fallback auto-sync for Vercel Serverless
function connectSse() {
  try {
    const es = new EventSource('/api/events');
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type && msg.type !== 'connected') {
          fetchBootstrap();
        }
      } catch {
        // ignore
      }
    };
  } catch {
    // ignore
  }

  // Lightweight background sync for multi-device KDS & Table updates on Vercel + Supabase
  setInterval(() => {
    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    const isTyping = ['INPUT', 'SELECT', 'TEXTAREA'].includes(activeTag);
    const hasOpenModal = Boolean(
      state.modifierModalProduct ||
      state.checkoutModalOrder ||
      state.showNewTableModal ||
      state.showNewProductModal ||
      state.showNewIngredientModal ||
      state.showNewExpenseModal ||
      state.voiceListening
    );
    if (!isTyping && !hasOpenModal) {
      fetchBootstrap();
    }
  }, 6000);
}

window.addEventListener('DOMContentLoaded', () => {
  fetchBootstrap();
  connectSse();
});

