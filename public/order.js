// ==========================================================================
// ONG CO POS - CUSTOMER SELF-ORDERING & PIXEL ART STOREFRONT JS
// ==========================================================================

const orderState = {
  viewMode: 'PIXEL', // 'PIXEL' (แบบ C: Virtual Storefront) | 'LIST' (รายการเมนูด่วน)
  orderMode: 'DELIVERY', // 'DELIVERY' | 'DINE_IN' | 'TAKEAWAY'
  tableId: '',
  activeCategory: 'ALL',
  searchQuery: '',
  selectedDeliveryPointId: 'DP-03', // Default: ศาลาขาว ตลาดอินโดจีน
  customerName: '',
  customerPhone: '',
  deliveryNote: '',
  cart: [],
  // Food Modifier Modal
  foodModalProduct: null,
  foodModalModifiers: [],
  foodModalNote: '',
  foodModalQty: 1,
  // Cart & Checkout Modals
  showCartModal: false,
  showCheckoutModal: false,
  paymentMethod: 'QR_PROMPTPAY', // 'QR_PROMPTPAY' | 'CASH'
  member: null,
  redeemPoints: 0,
  // Live Active Order Tracking
  activeOrder: null,
  pollTimer: null,
  // Backend Data
  data: null
};

// URL Parameters initialization
(function initUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const tbl = params.get('table');
  const mode = params.get('mode');
  const view = params.get('view');

  if (tbl) {
    orderState.tableId = tbl;
    orderState.orderMode = 'DINE_IN';
  } else if (mode === 'delivery') {
    orderState.orderMode = 'DELIVERY';
  } else if (mode === 'takeaway') {
    orderState.orderMode = 'TAKEAWAY';
  } else if (mode === 'dine_in') {
    orderState.orderMode = 'DINE_IN';
  }

  if (view === 'list') {
    orderState.viewMode = 'LIST';
  }
})();

function formatMoney(num) {
  const n = Number(num) || 0;
  return '฿' + n.toLocaleString('th-TH', { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
}

async function fetchBootstrap() {
  try {
    const res = await fetch(`/api/bootstrap?_t=${Date.now()}`, { cache: 'no-store' });
    const json = await res.json().catch(() => null);
    if (res.ok && json && Array.isArray(json.products)) {
      orderState.data = json;
      if (!orderState.tableId && json.tables && json.tables.length > 0) {
        orderState.tableId = json.tables[0].id;
      }
      render();
      return;
    }
  } catch {}

  // Fallback to localEngine if running offline
  if (window.LocalPosEngine) {
    orderState.data = window.LocalPosEngine.getBootstrap();
    if (!orderState.tableId && orderState.data.tables && orderState.data.tables.length > 0) {
      orderState.tableId = orderState.data.tables[0].id;
    }
    render();
  }
}

// Check membership by phone number
function lookupMember(phone) {
  if (!orderState.data || !Array.isArray(orderState.data.customers)) return null;
  const clean = String(phone || '').replace(/\D/g, '');
  if (clean.length < 9) return null;
  return orderState.data.customers.find(c => {
    const cPhone = String(c.phone || '').replace(/\D/g, '');
    return cPhone && (cPhone === clean || cPhone.endsWith(clean) || clean.endsWith(cPhone));
  }) || null;
}

function handlePhoneInput(phone) {
  orderState.customerPhone = phone;
  const m = lookupMember(phone);
  orderState.member = m;
  if (m && !orderState.customerName) {
    orderState.customerName = m.name;
  }
  orderState.redeemPoints = 0;
  render();
}

// Calculate loyalty discount rate
function getPointsDiscountBaht(pts) {
  const cfg = orderState.data?.loyaltySettings || { redeem_points_unit: 4, redeem_discount_baht: 1 };
  const unit = Math.max(1, Number(cfg.redeem_points_unit) || 4);
  const baht = Math.max(1, Number(cfg.redeem_discount_baht) || 1);
  return Math.floor(Math.max(0, pts) / unit) * baht;
}

// Cart Helpers
function getCartCount() {
  return orderState.cart.reduce((sum, it) => sum + it.quantity, 0);
}

function getCartSubtotal() {
  return orderState.cart.reduce((sum, it) => {
    const modExtra = (it.modifiers || []).reduce((s, m) => s + (Number(m.extra_price) || 0), 0);
    return sum + (it.unit_price + modExtra) * it.quantity;
  }, 0);
}

function getCartNetTotal() {
  const sub = getCartSubtotal();
  const disc = getPointsDiscountBaht(orderState.redeemPoints);
  return Math.max(0, sub - disc);
}

function addToCartDirect(product, qty = 1) {
  if (product.item_type === 'FOOD') {
    openFoodModifierModal(product);
    return;
  }
  const existing = orderState.cart.find(it => it.product_id === product.id && (!it.modifiers || it.modifiers.length === 0));
  if (existing) {
    existing.quantity += qty;
  } else {
    orderState.cart.push({
      product_id: product.id,
      name: product.name,
      item_type: product.item_type,
      unit_price: Number(product.price) || 0,
      quantity: qty,
      modifiers: [],
      special_instructions: ''
    });
  }
  render();
}

function openFoodModifierModal(product) {
  orderState.foodModalProduct = product;
  orderState.foodModalModifiers = [];
  orderState.foodModalNote = '';
  orderState.foodModalQty = 1;
  render();
}

function toggleModifierSelection(groupId, modObj, isSingle = false) {
  const allMods = orderState.data?.modifiers || [];
  const groupModIds = allMods.filter(m => m.group_id === groupId).map(m => m.id);

  const idx = orderState.foodModalModifiers.findIndex(m => m.id === modObj.id);
  if (idx >= 0) {
    orderState.foodModalModifiers.splice(idx, 1);
  } else {
    if (isSingle) {
      orderState.foodModalModifiers = orderState.foodModalModifiers.filter(m => !groupModIds.includes(m.id));
    }
    orderState.foodModalModifiers.push(modObj);
  }
  render();
}

function confirmFoodModifiers() {
  const p = orderState.foodModalProduct;
  if (!p) return;

  orderState.cart.push({
    product_id: p.id,
    name: p.name,
    item_type: 'FOOD',
    unit_price: Number(p.price) || 0,
    quantity: orderState.foodModalQty || 1,
    modifiers: [...orderState.foodModalModifiers],
    special_instructions: orderState.foodModalNote.trim()
  });

  orderState.foodModalProduct = null;
  render();
}

function updateCartQty(index, delta) {
  if (!orderState.cart[index]) return;
  orderState.cart[index].quantity += delta;
  if (orderState.cart[index].quantity <= 0) {
    orderState.cart.splice(index, 1);
  }
  render();
}

function getDeliveryPointName() {
  const pts = orderState.data?.deliveryPoints || [];
  const pt = pts.find(p => p.id === orderState.selectedDeliveryPointId);
  return pt ? pt.name : 'ตลาดอินโดจีน มุกดาหาร';
}

// Generate PromptPay QR Code Link (using standard PromptPay payload service)
function getPromptPayQrUrl(amount) {
  const promptPayId = '0812345678'; // ร้านค้าหรือพร้อมเพย์เจ้าของร้าน
  const amt = Math.max(0, Number(amount) || 0);
  return `https://promptpay.io/${promptPayId}/${amt}.png`;
}

// Submit Order to POS Backend
async function submitOrder() {
  if (orderState.cart.length === 0) return;

  if (orderState.orderMode === 'DELIVERY' && !orderState.customerPhone) {
    alert('กรุณาระบุเบอร์โทรศัพท์สำหรับติดต่อส่งของ');
    return;
  }

  const netTotal = getCartNetTotal();
  const subtotal = getCartSubtotal();
  const ptsDisc = getPointsDiscountBaht(orderState.redeemPoints);
  const ptName = getDeliveryPointName();

  let billTitle = '';
  let billNote = '';

  if (orderState.orderMode === 'DELIVERY') {
    billTitle = `🛵 ส่ง ${ptName} (${orderState.customerName || 'ลูกค้า'})`;
    billNote = `จุดรับ: ${ptName} | เบอร์โทร: ${orderState.customerPhone || '-'} ${orderState.deliveryNote ? '| หมายเหตุ: ' + orderState.deliveryNote : ''}`;
  } else if (orderState.orderMode === 'DINE_IN') {
    const tblObj = (orderState.data?.tables || []).find(t => t.id === orderState.tableId);
    billTitle = `🍽️ ${tblObj ? tblObj.name : 'โต๊ะ ' + orderState.tableId} (${orderState.customerName || 'ลูกค้า'})`;
    billNote = orderState.deliveryNote || 'ทานที่ร้าน';
  } else {
    billTitle = `🛍️ สั่งกลับบ้าน (${orderState.customerName || 'ลูกค้า'})`;
    billNote = `เบอร์โทร: ${orderState.customerPhone || '-'} ${orderState.deliveryNote ? '| หมายเหตุ: ' + orderState.deliveryNote : ''}`;
  }

  const payload = {
    order_type: orderState.orderMode === 'DINE_IN' ? 'DINE_IN' : 'RETAIL',
    table_id: orderState.orderMode === 'DINE_IN' ? orderState.tableId : null,
    bill_title: billTitle,
    bill_note: billNote,
    customer_id: orderState.member?.id || null,
    customer_name: orderState.customerName || (orderState.member?.name || ''),
    payment_method: orderState.paymentMethod,
    discount: ptsDisc,
    redeem_points: orderState.redeemPoints,
    items: orderState.cart.map(it => ({
      product_id: it.product_id,
      quantity: it.quantity,
      modifiers: (it.modifiers || []).map(m => m.name),
      special_instructions: it.special_instructions || ''
    }))
  };

  try {
    const res = await fetch('/api/orders/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json && json.success) {
      orderState.activeOrder = {
        id: json.orderId || `ORD-${Date.now().toString().slice(-4)}`,
        title: billTitle,
        netTotal,
        paymentMethod: orderState.paymentMethod,
        orderMode: orderState.orderMode,
        pointName: ptName,
        status: 'PENDING',
        items: [...orderState.cart],
        created_at: new Date().toISOString()
      };
      orderState.cart = [];
      orderState.showCheckoutModal = false;
      orderState.showCartModal = false;
      startLivePolling(orderState.activeOrder.id);
      render();
      return;
    }
  } catch (err) {
    console.error('Order submit error:', err);
  }

  // Fallback if offline
  if (window.LocalPosEngine) {
    const out = window.LocalPosEngine.submitOrder(payload);
    orderState.activeOrder = {
      id: out.orderId || `ORD-${Date.now().toString().slice(-4)}`,
      title: billTitle,
      netTotal,
      paymentMethod: orderState.paymentMethod,
      orderMode: orderState.orderMode,
      pointName: ptName,
      status: 'PENDING',
      items: [...orderState.cart],
      created_at: new Date().toISOString()
    };
    orderState.cart = [];
    orderState.showCheckoutModal = false;
    orderState.showCartModal = false;
    startLivePolling(orderState.activeOrder.id);
    render();
  }
}

function startLivePolling(orderId) {
  if (orderState.pollTimer) clearInterval(orderState.pollTimer);
  orderState.pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`/api/bootstrap?_t=${Date.now()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (json && Array.isArray(json.allBills)) {
        const found = json.allBills.find(b => b.id === orderId);
        if (found) {
          orderState.activeOrder.backendStatus = found.status;
          const kdsItems = found.items ? found.items.filter(i => i.item_type === 'FOOD') : [];
          if (found.status === 'PAID') {
            orderState.activeOrder.status = 'COMPLETED';
          } else if (kdsItems.some(i => i.kitchen_status === 'COOKING')) {
            orderState.activeOrder.status = 'COOKING';
          } else if (kdsItems.every(i => i.kitchen_status === 'SERVED') && kdsItems.length > 0) {
            orderState.activeOrder.status = 'DELIVERING';
          }
          render();
        }
      }
    } catch {}
  }, 4000);
}

// Get Pixel Sprite Icon for products
function getSpriteIcon(item) {
  const name = (item.name || '').toLowerCase();
  if (name.includes('โค้ก')) return '🥤';
  if (name.includes('น้ำ') || name.includes('สิงห์')) return '💧';
  if (name.includes('ชา') || name.includes('อิชิตัน')) return '🍵';
  if (name.includes('เอ็ม') || name.includes('m-150')) return '⚡';
  if (name.includes('น้ำแข็ง')) return '🧊';
  if (name.includes('มาม่า') || name.includes('ก๋วยเตี๋ยว')) return '🍜';
  if (name.includes('เลย์') || name.includes('ขนม')) return '🥔';
  if (name.includes('สาหร่าย')) return '🍙';
  if (name.includes('กะเพรา')) return '🍛';
  if (name.includes('ข้าวผัด')) return '🍳';
  if (name.includes('ไข่เจียว')) return '🥘';
  if (name.includes('ต้มยำ')) return '🍲';
  if (name.includes('หมูกรอบ')) return '🥓';
  return item.item_type === 'FOOD' ? '🍽️' : '📦';
}

// ==========================================================================
// RENDER VIEWS
// ==========================================================================

function render() {
  const appEl = document.getElementById('order-app');
  if (!appEl) return;

  if (!orderState.data) {
    appEl.innerHTML = `
      <div style="padding:60px; text-align:center;">
        <div style="font-size:32px; animation:pulse 1.2s infinite; margin-bottom:12px;">🏪</div>
        <div style="font-size:16px; font-weight:700;">กำลังโหลดร้านค้าเสมือนจริง ONG CO POS...</div>
      </div>
    `;
    return;
  }

  // If currently tracking an active submitted order
  if (orderState.activeOrder) {
    appEl.innerHTML = renderLiveTrackerView();
    return;
  }

  const products = orderState.data.products || [];
  const drinks = products.filter(p => p.category_id === 'CAT-DRINK');
  const snacks = products.filter(p => p.category_id === 'CAT-SNACK' || p.category_id === 'CAT-PANTRY');
  const foods = products.filter(p => p.item_type === 'FOOD');

  let contentHtml = '';
  if (orderState.viewMode === 'PIXEL') {
    contentHtml = renderPixelStorefront(drinks, snacks, foods);
  } else {
    contentHtml = renderListView(products);
  }

  appEl.innerHTML = `
    <!-- Header -->
    <header class="co-header">
      <div class="co-header-inner">
        <a href="#" class="co-brand">
          <div class="co-logo-badge">☕</div>
          <div>
            <div class="co-store-title">ONG CO POS • ร้านค้าและครัวอาหาร</div>
            <div class="co-store-sub">ริมแม่น้ำโขง ตลาดอินโดจีน มุกดาหาร</div>
          </div>
        </a>
        <div class="co-view-toggle">
          <button
            type="button"
            class="co-view-btn"
            data-active="${orderState.viewMode === 'PIXEL'}"
            onclick="orderState.viewMode='PIXEL'; render();"
          >
            🏪 ร้านจำลอง
          </button>
          <button
            type="button"
            class="co-view-btn"
            data-active="${orderState.viewMode === 'LIST'}"
            onclick="orderState.viewMode='LIST'; render();"
          >
            📋 รายการเมนู
          </button>
        </div>
      </div>
    </header>

    <div class="co-container">
      <!-- Order Mode Selector -->
      <div class="co-mode-tabs">
        <div
          class="co-mode-tab"
          data-active="${orderState.orderMode === 'DELIVERY'}"
          onclick="orderState.orderMode='DELIVERY'; render();"
        >
          <span class="co-mode-icon">🛵</span>
          <span class="co-mode-title">ส่งเดลิเวอรี่</span>
          <span class="co-mode-desc">เส้นตลาดอินโดจีน</span>
        </div>
        <div
          class="co-mode-tab"
          data-active="${orderState.orderMode === 'DINE_IN'}"
          onclick="orderState.orderMode='DINE_IN'; render();"
        >
          <span class="co-mode-icon">🍽️</span>
          <span class="co-mode-title">ทานที่ร้าน</span>
          <span class="co-mode-desc">${orderState.tableId ? 'โต๊ะ ' + orderState.tableId : 'เลือกโต๊ะ'}</span>
        </div>
        <div
          class="co-mode-tab"
          data-active="${orderState.orderMode === 'TAKEAWAY'}"
          onclick="orderState.orderMode='TAKEAWAY'; render();"
        >
          <span class="co-mode-icon">🛍️</span>
          <span class="co-mode-title">รับกลับบ้าน</span>
          <span class="co-mode-desc">มารับที่หน้าร้าน</span>
        </div>
      </div>

      <!-- Mode-specific Notices & Delivery Map -->
      ${orderState.orderMode === 'DELIVERY' ? renderDeliverySection() : ''}
      ${orderState.orderMode === 'DINE_IN' ? renderDineInSection() : ''}

      <!-- Main Storefront Content (Pixel or List) -->
      ${contentHtml}
    </div>

    <!-- Sticky Cart Bar -->
    ${renderStickyCart()}

    <!-- Modals -->
    ${orderState.foodModalProduct ? renderFoodModifierModal() : ''}
    ${orderState.showCartModal ? renderCartModal() : ''}
    ${orderState.showCheckoutModal ? renderCheckoutModal() : ''}
  `;
}

// Render Delivery Section with Indochina Market Pixel Map
function renderDeliverySection() {
  const pts = (orderState.data?.deliveryPoints || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const curPt = pts.find(p => p.id === orderState.selectedDeliveryPointId) || pts[0];

  return `
    <div class="co-notice-banner">
      <span style="font-size:18px;">📍</span>
      <div>
        <b>บริการส่งด่วนเฉพาะเส้น ตลาดอินโดจีน มุกดาหาร</b>
        <div style="font-size:11px; color:#155e75;">เลือกจุดรับของบนแผนที่ด้านล่าง ไรเดอร์จะนำส่งถึงจุดที่ใกล้คุณที่สุด</div>
      </div>
    </div>

    <div class="co-map-card">
      <div class="co-map-header">
        <div class="co-map-title">
          <span>🗺️ แผนผังตลาดอินโดจีน มุกดาหาร (เลียบโขง)</span>
        </div>
        <div style="font-size:11.5px; color:#0d9488; font-weight:700;">
          จุดรับที่เลือก: <b>${curPt ? curPt.name : '-'}</b>
        </div>
      </div>

      <!-- Interactive Pixel Map -->
      <div class="co-map-wrapper">
        <svg viewBox="0 0 800 360" preserveAspectRatio="none" style="width:100%; height:100%; display:block;">
          <defs>
            <linearGradient id="odMekongWater" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#0284c7" />
              <stop offset="50%" stop-color="#0369a1" />
              <stop offset="100%" stop-color="#075985" />
            </linearGradient>
            <pattern id="odPixelWave" width="24" height="12" patternUnits="userSpaceOnUse">
              <rect x="0" y="2" width="10" height="2" fill="#38bdf8" opacity="0.6"/>
              <rect x="12" y="8" width="10" height="2" fill="#bae6fd" opacity="0.5"/>
            </pattern>
          </defs>

          <!-- Left: City Area -->
          <rect x="0" y="0" width="280" height="360" fill="#334155" />
          <rect x="16" y="14" width="220" height="42" fill="#475569" stroke="#1e293b" stroke-width="2"/>
          <text x="24" y="38" fill="#fef3c7" font-size="9" font-family="monospace">หอสองนาง / วัดศรีมงคล</text>

          <rect x="0" y="58" width="300" height="12" fill="#1e293b"/>
          <text x="12" y="67" fill="#94a3b8" font-size="8" font-family="monospace">ซ.สองนางสถิตย์ ───</text>

          <rect x="16" y="74" width="220" height="44" fill="#475569" stroke="#1e293b" stroke-width="2"/>
          <text x="24" y="99" fill="#d1fae5" font-size="8.5" font-family="monospace">ซ.บริหารชนบท / ซ.วิเศษฯ</text>

          <rect x="0" y="122" width="300" height="18" fill="#0f172a"/>
          <text x="12" y="134" fill="#fbbf24" font-size="9" font-family="monospace" font-weight="bold">ถ.พิทักษ์พนมเขต ────▶</text>

          <rect x="16" y="144" width="220" height="66" fill="#475569" stroke="#1e293b" stroke-width="2"/>
          <rect x="22" y="148" width="100" height="58" fill="#ca8a04"/>
          <text x="26" y="180" fill="#fff" font-size="9" font-family="monospace" font-weight="bold">ตลาดอินโดจีน</text>

          <rect x="0" y="214" width="300" height="12" fill="#1e293b"/>
          <text x="12" y="223" fill="#94a3b8" font-size="8" font-family="monospace">ซ.ศศิวงศ์ ───</text>

          <rect x="16" y="230" width="220" height="50" fill="#475569" stroke="#1e293b" stroke-width="2"/>
          <text x="24" y="258" fill="#e5e7eb" font-size="8.5" font-family="monospace">ซ.จันทร์เทพ</text>

          <rect x="0" y="284" width="300" height="12" fill="#1e293b"/>
          <text x="12" y="293" fill="#94a3b8" font-size="8" font-family="monospace">ซ.จ่างวาง ───</text>

          <rect x="16" y="300" width="220" height="50" fill="#1e3a8a"/>
          <text x="24" y="328" fill="#bfdbfe" font-size="9" font-family="monospace" font-weight="bold">Riverfront Hotel</text>

          <!-- Middle: Samran Chai Khong Rd -->
          <rect x="280" y="0" width="60" height="360" fill="#1e293b" />
          <line x1="310" y1="0" x2="310" y2="360" stroke="#facc15" stroke-width="2" stroke-dasharray="12,10" />

          <!-- Promenade -->
          <rect x="340" y="0" width="130" height="360" fill="#78716c" />
          <rect x="360" y="116" width="90" height="42" fill="#ffffff" stroke="#0f172a" stroke-width="2" rx="4"/>
          <text x="368" y="140" fill="#0f172a" font-size="9" font-family="monospace" font-weight="bold">ศาลาขาวริมโขง</text>

          <!-- Embankment & Mekong River -->
          <rect x="470" y="0" width="20" height="360" fill="#57534e" />
          <rect x="490" y="0" width="310" height="360" fill="url(#odMekongWater)" />
          <rect x="490" y="0" width="310" height="360" fill="url(#odPixelWave)" />
          <text x="680" y="60" fill="#bae6fd" font-size="14" font-family="monospace" font-weight="bold">แม่น้ำโขง</text>
        </svg>

        <!-- Dynamic Pins from Database -->
        ${pts.map((p, idx) => `
          <div
            class="co-map-pin"
            data-selected="${p.id === orderState.selectedDeliveryPointId}"
            style="left:${p.map_x}%; top:${p.map_y}%;"
            onclick="orderState.selectedDeliveryPointId='${p.id}'; render();"
          >
            <div class="co-pin-badge">
              <span>📍 ${idx + 1}. ${p.name.split('/')[0].split('(')[0].trim()}</span>
            </div>
            <div class="co-pin-arrow"></div>
          </div>
        `).join('')}
      </div>

      <!-- Delivery Contact Form -->
      <div class="co-delivery-form">
        <div class="co-form-group">
          <label class="co-label">จุดส่งของ</label>
          <select
            class="co-select"
            onchange="orderState.selectedDeliveryPointId=this.value; render();"
          >
            ${pts.map(p => `
              <option value="${p.id}" ${p.id === orderState.selectedDeliveryPointId ? 'selected' : ''}>
                ${p.name} ${p.landmark_desc ? `(${p.landmark_desc})` : ''}
              </option>
            `).join('')}
          </select>
        </div>

        <div class="co-form-group">
          <label class="co-label">เบอร์โทรศัพท์ (จำเป็นสำหรับการโทรส่งของ & สะสมแต้ม)</label>
          <input
            type="tel"
            class="co-input"
            placeholder="เช่น 0812345678"
            value="${orderState.customerPhone}"
            oninput="handlePhoneInput(this.value)"
          />
        </div>

        <div class="co-form-group">
          <label class="co-label">ชื่อผู้รับ</label>
          <input
            type="text"
            class="co-input"
            placeholder="เช่น คุณเอก / หน้าร้านขายเสื้อผ้า"
            value="${orderState.customerName}"
            oninput="orderState.customerName=this.value;"
          />
        </div>

        <div class="co-form-group">
          <label class="co-label">จุดสังเกตเพิ่มเติม (เช่น เสื้อสีแดง, หน้าร้านเลขที่...)</label>
          <input
            type="text"
            class="co-input"
            placeholder="รายละเอียดเพิ่มเติมให้คนส่งของ"
            value="${orderState.deliveryNote}"
            oninput="orderState.deliveryNote=this.value;"
          />
        </div>
      </div>

      ${orderState.member ? `
        <div style="margin-top:10px; padding:8px 12px; background:#fef3c7; border:1px solid #fde68a; border-radius:8px; display:flex; justify-content:space-between; align-items:center; font-size:12px;">
          <span>⭐ สมาชิก: <b>${orderState.member.name}</b> (${orderState.member.tier})</span>
          <span style="color:#b45309; font-weight:700;">แต้มสะสม: ${orderState.member.points} แต้ม</span>
        </div>
      ` : ''}
    </div>
  `;
}

// Render Dine-In Table Picker
function renderDineInSection() {
  const tables = orderState.data?.tables || [];
  return `
    <div style="background:#fff; border:1.5px solid var(--co-border); border-radius:14px; padding:12px 14px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
      <div>
        <div style="font-size:13px; font-weight:800;">🍽️ สั่งอาหารทานที่ร้าน</div>
        <div style="font-size:11.5px; color:var(--co-muted);">อาหารและเครื่องดื่มจะถูกเสิร์ฟตรงถึงโต๊ะของคุณ</div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <label style="font-size:12px; font-weight:700;">เบอร์โต๊ะ:</label>
        <select
          class="co-select"
          style="font-weight:700; width:130px;"
          onchange="orderState.tableId=this.value; render();"
        >
          ${tables.map(t => `
            <option value="${t.id}" ${t.id === orderState.tableId ? 'selected' : ''}>
              ${t.name} (${t.zone_name})
            </option>
          `).join('')}
        </select>
      </div>
    </div>
  `;
}

// ==========================================================================
// PIXEL ART STOREFRONT (แบบ C: Hybrid Virtual Shop)
// ==========================================================================
function renderPixelStorefront(drinks, snacks, foods) {
  return `
    <div class="co-pixel-storefront">
      <!-- Retro Awning Roof -->
      <div class="co-storefront-roof"></div>

      <!-- Store Sign -->
      <div class="co-storefront-sign">
        <div class="co-pixel-title">★ ONG CO PIXEL STOREFRONT ★</div>
        <span class="co-open-sign">● OPEN</span>
      </div>

      <div class="co-pixel-modules">
        <!-- 1. Cooler Case: เครื่องดื่มเย็นเจี๊ยบ & น้ำแข็ง -->
        <div class="co-pixel-zone">
          <div class="co-zone-header">
            <div class="co-zone-label">
              <span style="font-size:16px;">❄️</span>
              <span>ตู้แช่เย็นเครื่องดื่ม (Cold Beverage Showcase)</span>
            </div>
            <span class="co-zone-sub">คลิกหยิบใส่ตะกร้า</span>
          </div>

          <div class="co-cooler-case">
            <div class="co-cooler-shelf">
              ${drinks.map(p => `
                <div class="co-pixel-item" onclick="addToCartDirect(${JSON.stringify(p).replace(/"/g, '&quot;')})">
                  <div class="co-item-sprite">${getSpriteIcon(p)}</div>
                  <div class="co-item-name">${p.name}</div>
                  <div class="co-item-price">${formatMoney(p.price)}</div>
                  <div class="co-item-stock-tag">เหลือ ${p.stock_qty || 0} ${p.unit}</div>
                  <button type="button" class="co-item-add-btn">+ หยิบ</button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- 2. Kitchen Station: ครัวตามสั่ง & อาหารปรุงสด -->
        <div class="co-pixel-zone">
          <div class="co-zone-header">
            <div class="co-zone-label">
              <span style="font-size:16px;">🍳</span>
              <span>ครัวอาหารตามสั่ง (Live Cook Station)</span>
            </div>
            <span class="co-zone-sub">เลือกความเผ็ด & ท็อปปิ้งไข่ได้</span>
          </div>

          <div class="co-kitchen-case">
            <div class="co-cooler-shelf">
              ${foods.map(p => `
                <div class="co-pixel-item" onclick="addToCartDirect(${JSON.stringify(p).replace(/"/g, '&quot;')})">
                  <div class="co-item-sprite">${getSpriteIcon(p)}</div>
                  <div class="co-item-name">${p.name}</div>
                  <div class="co-item-price">${formatMoney(p.price)}</div>
                  <div class="co-item-stock-tag" style="color:#fca5a5;">สั่งปรุงสด</div>
                  <button type="button" class="co-item-add-btn">+ สั่งจานนี้</button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- 3. Grocery Shelf: ขนม & ของชำ -->
        <div class="co-pixel-zone">
          <div class="co-zone-header">
            <div class="co-zone-label">
              <span style="font-size:16px;">🥫</span>
              <span>ชั้นวางของชำ & ขนมทานเล่น (Snack Shelf)</span>
            </div>
            <span class="co-zone-sub">คลิกหยิบใส่ตะกร้า</span>
          </div>

          <div class="co-shelf-case">
            <div class="co-cooler-shelf">
              ${snacks.map(p => `
                <div class="co-pixel-item" onclick="addToCartDirect(${JSON.stringify(p).replace(/"/g, '&quot;')})">
                  <div class="co-item-sprite">${getSpriteIcon(p)}</div>
                  <div class="co-item-name">${p.name}</div>
                  <div class="co-item-price">${formatMoney(p.price)}</div>
                  <div class="co-item-stock-tag">เหลือ ${p.stock_qty || 0} ${p.unit}</div>
                  <button type="button" class="co-item-add-btn">+ หยิบ</button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ==========================================================================
// STANDARD LIST VIEW (รายการเมนูด่วน)
// ==========================================================================
function renderListView(products) {
  const cats = orderState.data?.categories || [];
  let filtered = products;

  if (orderState.activeCategory !== 'ALL') {
    filtered = filtered.filter(p => p.category_id === orderState.activeCategory);
  }

  if (orderState.searchQuery) {
    const q = orderState.searchQuery.toLowerCase();
    filtered = filtered.filter(p => (p.name || '').toLowerCase().includes(q));
  }

  return `
    <div>
      <!-- Search Input -->
      <div class="co-search-bar">
        <span class="co-search-icon">🔍</span>
        <input
          type="text"
          class="co-search-input"
          placeholder="ค้นหาชื่ออาหาร, เครื่องดื่ม, ขนม, ของชำ..."
          value="${orderState.searchQuery}"
          oninput="orderState.searchQuery=this.value; render();"
        />
      </div>

      <!-- Category Filter Pills -->
      <div class="co-cat-pills">
        <button
          type="button"
          class="co-pill"
          data-active="${orderState.activeCategory === 'ALL'}"
          onclick="orderState.activeCategory='ALL'; render();"
        >
          ทั้งหมด
        </button>
        ${cats.map(c => `
          <button
            type="button"
            class="co-pill"
            data-active="${orderState.activeCategory === c.id}"
            onclick="orderState.activeCategory='${c.id}'; render();"
          >
            ${c.name}
          </button>
        `).join('')}
      </div>

      <!-- Products Grid -->
      <div class="co-product-grid">
        ${filtered.map(p => `
          <div class="co-prod-card">
            <div>
              <div class="co-prod-icon">${getSpriteIcon(p)}</div>
              <span class="co-prod-type-tag ${p.item_type === 'FOOD' ? 'co-tag-food' : 'co-tag-grocery'}">
                ${p.item_type === 'FOOD' ? '🍳 อาหารปรุงสด' : '📦 สินค้าของชำ'}
              </span>
              <div class="co-prod-name">${p.name}</div>
            </div>
            <div class="co-prod-bottom">
              <span class="co-prod-price">${formatMoney(p.price)}</span>
              <button
                type="button"
                class="co-add-btn"
                onclick="addToCartDirect(${JSON.stringify(p).replace(/"/g, '&quot;')})"
              >
                +
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ==========================================================================
// STICKY BOTTOM CART BAR
// ==========================================================================
function renderStickyCart() {
  const count = getCartCount();
  const subtotal = getCartSubtotal();

  return `
    <div class="co-sticky-cart">
      <div class="co-cart-inner">
        <div class="co-cart-summary" onclick="orderState.showCartModal=true; render();">
          <div class="co-cart-badge">
            🛒
            ${count > 0 ? `<span class="co-cart-count">${count}</span>` : ''}
          </div>
          <div class="co-cart-price-block">
            <span class="co-cart-label">${count} รายการในตะกร้า</span>
            <span class="co-cart-total">${formatMoney(subtotal)}</span>
          </div>
        </div>

        <button
          type="button"
          class="co-checkout-btn"
          ${count === 0 ? 'disabled' : ''}
          onclick="orderState.showCheckoutModal=true; render();"
        >
          <span>สั่งสินค้า & ชำระเงิน</span>
          <span>➔</span>
        </button>
      </div>
    </div>
  `;
}

// ==========================================================================
// FOOD MODIFIER MODAL (ตัวเลือกพิเศษ: ความเผ็ด, ไข่ดาว, ไข่เจียว)
// ==========================================================================
function renderFoodModifierModal() {
  const p = orderState.foodModalProduct;
  if (!p) return '';

  const groups = (orderState.data?.modifierGroups || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const allMods = orderState.data?.modifiers || [];

  return `
    <div class="co-modal-backdrop" onclick="if(event.target===this){orderState.foodModalProduct=null; render();}">
      <div class="co-modal">
        <div class="co-modal-header">
          <div>
            <div style="font-size:11px; color:#0d9488; font-weight:800;">CUSTOMIZE DISH • เลือกตัวเลือกพิเศษ</div>
            <h3 style="margin:2px 0 0; font-size:17px;">${p.name}</h3>
            <div style="font-size:13px; color:var(--co-muted);">ราคาพื้นฐาน: ${formatMoney(p.price)}</div>
          </div>
          <button type="button" class="co-close-btn" onclick="orderState.foodModalProduct=null; render();">✕</button>
        </div>

        ${groups.map(grp => {
          const grpMods = allMods.filter(m => m.group_id === grp.id);
          if (grpMods.length === 0) return '';
          const isSingle = grp.selection_type === 'SINGLE';
          return `
            <div class="co-mod-group">
              <div class="co-mod-title">
                ${grp.name}
                <span style="font-size:10.5px; color:var(--co-muted); font-weight:normal;">
                  (${isSingle ? 'เลือกได้ 1 อย่าง' : 'เลือกได้หลายอย่าง'})
                </span>
              </div>
              <div class="co-mod-pills">
                ${grpMods.map(m => {
                  const isSel = orderState.foodModalModifiers.some(x => x.id === m.id);
                  const priceLabel = Number(m.extra_price) > 0 ? ` (+${formatMoney(m.extra_price)})` : '';
                  return `
                    <button
                      type="button"
                      class="co-mod-pill"
                      data-selected="${isSel}"
                      onclick="toggleModifierSelection('${grp.id}', ${JSON.stringify(m).replace(/"/g, '&quot;')}, ${isSingle})"
                    >
                      ${m.name}${priceLabel}
                    </button>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}

        <!-- Special Note Input -->
        <div style="margin-bottom:14px;">
          <label class="co-label">ข้อความเพิ่มเติมถึงกุ๊ก (เช่น ไม่ใส่ผัก, เผ็ดพิเศษ)</label>
          <input
            type="text"
            class="co-input"
            placeholder="ระบุข้อความถึงครัว..."
            value="${orderState.foodModalNote}"
            oninput="orderState.foodModalNote=this.value;"
          />
        </div>

        <!-- Quantity & Confirm -->
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-top:16px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <button
              type="button"
              class="co-add-btn"
              style="width:30px; height:30px; background:#e2e8f0; color:#0f172a;"
              onclick="orderState.foodModalQty = Math.max(1, orderState.foodModalQty - 1); render();"
            >-</button>
            <b style="font-size:15px; width:24px; text-align:center;">${orderState.foodModalQty}</b>
            <button
              type="button"
              class="co-add-btn"
              style="width:30px; height:30px;"
              onclick="orderState.foodModalQty++; render();"
            >+</button>
          </div>

          <button
            type="button"
            class="co-checkout-btn"
            style="flex:1;"
            onclick="confirmFoodModifiers()"
          >
            ใส่ตะกร้า
          </button>
        </div>
      </div>
    </div>
  `;
}

// ==========================================================================
// CART MODAL (รายการในตะกร้า)
// ==========================================================================
function renderCartModal() {
  const subtotal = getCartSubtotal();

  return `
    <div class="co-modal-backdrop" onclick="if(event.target===this){orderState.showCartModal=false; render();}">
      <div class="co-modal">
        <div class="co-modal-header">
          <div>
            <div class="co-label" style="color:#0d9488;">MY CART</div>
            <h3 style="margin:2px 0 0; font-size:17px;">🛒 ตะกร้าสินค้าของคุณ</h3>
          </div>
          <button type="button" class="co-close-btn" onclick="orderState.showCartModal=false; render();">✕</button>
        </div>

        ${orderState.cart.length === 0 ? `
          <div style="padding:40px; text-align:center; color:var(--co-muted);">
            ยังไม่มีสินค้าในตะกร้า
          </div>
        ` : `
          <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:16px; max-height:360px; overflow-y:auto;">
            ${orderState.cart.map((it, idx) => {
              const modExtra = (it.modifiers || []).reduce((s, m) => s + (Number(m.extra_price) || 0), 0);
              const lineTotal = (it.unit_price + modExtra) * it.quantity;
              const modList = (it.modifiers || []).map(m => m.name).join(', ');
              return `
                <div style="padding:10px 12px; background:#f8fafc; border:1px solid var(--co-border); border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
                  <div>
                    <div style="font-weight:700; font-size:13px;">${it.name}</div>
                    ${modList ? `<div style="font-size:11px; color:#0d9488;">+ ${modList}</div>` : ''}
                    ${it.special_instructions ? `<div style="font-size:10.5px; color:#b45309;">📝 ${it.special_instructions}</div>` : ''}
                    <div style="font-size:12px; font-weight:800; color:#0f3238; margin-top:2px;">${formatMoney(lineTotal)}</div>
                  </div>
                  <div style="display:flex; align-items:center; gap:6px;">
                    <button type="button" class="co-add-btn" style="width:26px; height:26px; font-size:13px; background:#e2e8f0; color:#0f172a;" onclick="updateCartQty(${idx}, -1)">-</button>
                    <b style="font-size:13px; width:18px; text-align:center;">${it.quantity}</b>
                    <button type="button" class="co-add-btn" style="width:26px; height:26px; font-size:13px;" onclick="updateCartQty(${idx}, 1)">+</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <div style="border-top:1px dashed var(--co-border); padding-top:12px; display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <span style="font-size:14px; font-weight:700;">ยอดรวมสินค้า:</span>
            <span style="font-size:18px; font-weight:800; color:#0d9488;">${formatMoney(subtotal)}</span>
          </div>

          <button
            type="button"
            class="co-checkout-btn"
            style="width:100%; justify-content:center;"
            onclick="orderState.showCartModal=false; orderState.showCheckoutModal=true; render();"
          >
            ไปที่หน้าชำระเงิน ➔
          </button>
        `}
      </div>
    </div>
  `;
}

// ==========================================================================
// CHECKOUT & SCAN QR PROMPTPAY MODAL
// ==========================================================================
function renderCheckoutModal() {
  const subtotal = getCartSubtotal();
  const disc = getPointsDiscountBaht(orderState.redeemPoints);
  const netTotal = getCartNetTotal();
  const m = orderState.member;

  return `
    <div class="co-modal-backdrop" onclick="if(event.target===this){orderState.showCheckoutModal=false; render();}">
      <div class="co-modal">
        <div class="co-modal-header">
          <div>
            <div class="co-label" style="color:#0d9488;">CHECKOUT & PAYMENT</div>
            <h3 style="margin:2px 0 0; font-size:17px;">💳 ชำระเงิน & ยืนยันคำสั่งซื้อ</h3>
          </div>
          <button type="button" class="co-close-btn" onclick="orderState.showCheckoutModal=false; render();">✕</button>
        </div>

        <!-- Loyalty Points Redemption Block -->
        ${m ? `
          <div style="background:#fef3c7; border:1px solid #fde68a; border-radius:12px; padding:12px; margin-bottom:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <div>
                <b style="font-size:13px;">⭐ สมาชิก: ${m.name}</b>
                <div style="font-size:11px; color:#b45309;">แต้มคงเหลือ: ${m.points} แต้ม</div>
              </div>
              <button
                type="button"
                style="background:#b45309; color:#fff; border:none; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;"
                onclick="orderState.redeemPoints = Math.min(${m.points}, Math.floor(${subtotal} * 4)); render();"
              >
                ใช้แต้มสูงสุด
              </button>
            </div>
            ${orderState.redeemPoints > 0 ? `
              <div style="display:flex; justify-content:space-between; font-size:12px; color:#b45309; font-weight:700;">
                <span>แลก ${orderState.redeemPoints} แต้ม</span>
                <span>ส่วนลด -${formatMoney(disc)}</span>
              </div>
            ` : ''}
          </div>
        ` : ''}

        <!-- Payment Method Options -->
        <div style="margin-bottom:14px;">
          <div class="co-label" style="margin-bottom:6px;">เลือกช่องทางชำระเงิน</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            <button
              type="button"
              class="co-mode-tab"
              data-active="${orderState.paymentMethod === 'QR_PROMPTPAY'}"
              onclick="orderState.paymentMethod='QR_PROMPTPAY'; render();"
            >
              <span style="font-size:22px;">📱</span>
              <span class="co-mode-title">สแกนจ่ายทันที</span>
              <span class="co-mode-desc">QR PromptPay</span>
            </button>
            <button
              type="button"
              class="co-mode-tab"
              data-active="${orderState.paymentMethod === 'CASH'}"
              onclick="orderState.paymentMethod='CASH'; render();"
            >
              <span style="font-size:22px;">💵</span>
              <span class="co-mode-title">ชำระเงินสด</span>
              <span class="co-mode-desc">จ่ายปลายทาง/ที่ร้าน</span>
            </button>
          </div>
        </div>

        <!-- PromptPay Dynamic QR Code Box -->
        ${orderState.paymentMethod === 'QR_PROMPTPAY' ? `
          <div class="co-qr-box">
            <div style="font-size:12px; font-weight:800; color:#0369a1; margin-bottom:8px;">
              สแกน QR เพื่อชำระเงิน (ยอดสุทธิ ${formatMoney(netTotal)})
            </div>
            <img
              src="${getPromptPayQrUrl(netTotal)}"
              alt="PromptPay QR"
              class="co-qr-image"
            />
            <div style="font-size:11px; color:var(--co-muted);">
              บันทึกภาพหน้าจอหรือเปิดแอปธนาคารสแกนจ่ายได้ทันที
            </div>
          </div>
        ` : ''}

        <!-- Price Breakdown -->
        <div style="background:#f8fafc; border:1px solid var(--co-border); border-radius:10px; padding:10px 14px; margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:4px;">
            <span style="color:var(--co-muted);">ยอดรวมสินค้า:</span>
            <span>${formatMoney(subtotal)}</span>
          </div>
          ${disc > 0 ? `
            <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#ef4444; margin-bottom:4px;">
              <span>ส่วนลดแต้มสะสม:</span>
              <span>-${formatMoney(disc)}</span>
            </div>
          ` : ''}
          <div style="display:flex; justify-content:space-between; font-size:15px; font-weight:800; border-top:1px solid var(--co-border); padding-top:6px; margin-top:4px;">
            <span>ยอดสุทธิที่ต้องชำระ:</span>
            <span style="color:#0d9488;">${formatMoney(netTotal)}</span>
          </div>
        </div>

        <button
          type="button"
          class="co-checkout-btn"
          style="width:100%; justify-content:center; padding:12px;"
          onclick="submitOrder()"
        >
          ✓ ยืนยันคำสั่งซื้อ
        </button>
      </div>
    </div>
  `;
}

// ==========================================================================
// LIVE ORDER TRACKER VIEW (ติดตามสถานะออเดอร์สด)
// ==========================================================================
function renderLiveTrackerView() {
  const ord = orderState.activeOrder;
  const isPending = ord.status === 'PENDING';
  const isCooking = ord.status === 'COOKING';
  const isDelivering = ord.status === 'DELIVERING';
  const isDone = ord.status === 'COMPLETED';

  return `
    <header class="co-header">
      <div class="co-header-inner">
        <div class="co-brand">
          <div class="co-logo-badge">☕</div>
          <div>
            <div class="co-store-title">ONG CO POS • ติดตามสถานะคำสั่งซื้อ</div>
            <div class="co-store-sub">หมายเลขคำสั่งซื้อ: #${ord.id}</div>
          </div>
        </div>
      </div>
    </header>

    <div class="co-container" style="max-width:600px;">
      <div style="background:#fff; border:1.5px solid var(--co-border); border-radius:16px; padding:20px; box-shadow:var(--co-shadow); text-align:center;">
        <div style="font-size:42px; margin-bottom:8px;">
          ${isDone ? '🎉' : (isDelivering ? '🛵' : (isCooking ? '🍳' : '⏳'))}
        </div>
        <h2 style="font-size:20px; font-weight:800; margin-bottom:4px;">
          ${isDone ? 'จัดส่งสำเร็จเรียบร้อยแล้ว!' : (isDelivering ? 'ไรเดอร์กำลังนำส่งถึงคุณ!' : (isCooking ? 'ครัวกำลังปรุงอาหารอย่างพิถีพิถัน' : 'ทางร้านได้รับออเดอร์แล้ว'))}
        </h2>
        <p style="font-size:12.5px; color:var(--co-muted); margin-bottom:18px;">
          ${ord.title}
        </p>

        <!-- Progress Tracker Bar -->
        <div class="co-tracker-steps">
          <div class="co-tracker-line"></div>

          <div class="co-tracker-step" data-active="${isPending}" data-done="${!isPending}">
            <div class="co-step-dot">1</div>
            <span class="co-step-label">รับออเดอร์</span>
          </div>

          <div class="co-tracker-step" data-active="${isCooking}" data-done="${isDelivering || isDone}">
            <div class="co-step-dot">2</div>
            <span class="co-step-label">กำลังปรุง</span>
          </div>

          <div class="co-tracker-step" data-active="${isDelivering}" data-done="${isDone}">
            <div class="co-step-dot">3</div>
            <span class="co-step-label">กำลังนำส่ง</span>
          </div>

          <div class="co-tracker-step" data-active="${isDone}" data-done="${isDone}">
            <div class="co-step-dot">4</div>
            <span class="co-step-label">สำเร็จ</span>
          </div>
        </div>

        <!-- Order Items Summary Card -->
        <div style="background:#f8fafc; border:1px solid var(--co-border); border-radius:12px; padding:14px; text-align:left; margin:20px 0;">
          <div style="font-weight:700; font-size:13px; margin-bottom:8px; color:var(--co-ink);">รายการในคำสั่งซื้อ:</div>
          ${(ord.items || []).map(it => `
            <div style="display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:4px;">
              <span>• ${it.name} x${it.quantity}</span>
              <span style="font-weight:700;">${formatMoney(it.unit_price * it.quantity)}</span>
            </div>
          `).join('')}
          <div style="border-top:1px dashed var(--co-border); margin-top:8px; padding-top:8px; display:flex; justify-content:space-between; font-weight:800; font-size:14px;">
            <span>ยอดชำระ (${ord.paymentMethod === 'QR_PROMPTPAY' ? 'สแกน QR' : 'เงินสด'}):</span>
            <span style="color:#0d9488;">${formatMoney(ord.netTotal)}</span>
          </div>
        </div>

        <button
          type="button"
          class="co-checkout-btn"
          style="width:100%; justify-content:center; background:#0f3238;"
          onclick="orderState.activeOrder=null; if(orderState.pollTimer) clearInterval(orderState.pollTimer); render();"
        >
          + สั่งออเดอร์ใหม่
        </button>
      </div>
    </div>
  `;
}

// Start App
fetchBootstrap();
