// ==========================================================================
// ONG CO POS - CUSTOMER SELF-ORDERING & PIXEL ART STOREFRONT JS
// ==========================================================================

const DEFAULT_STORE_ZONES = [
  { id: 'ZONE-CHILLER-1', name: 'ตู้แช่ 1 (เครื่องดื่มเย็น & น้ำแข็ง)', type: 'CHILLER', icon: '❄️', pixel_sprite: 'chiller', custom_image_url: '', category_ids: ['CAT-DRINK'], description: 'เครื่องดื่มเย็นเจี๊ยบ น้ำอัดลม น้ำดื่ม และน้ำแข็งสดชื่น', sort_order: 1, is_active: true },
  { id: 'ZONE-SHELF-1', name: 'ชั้นวางขนม & ของชำทั่วไป', type: 'SHELF', icon: '🧺', pixel_sprite: 'shelf', custom_image_url: '', category_ids: ['CAT-SNACK', 'CAT-PANTRY'], description: 'ขนมขบเคี้ยว บะหมี่กึ่งสำเร็จรูป เครื่องปรุง และของใช้ในบ้าน', sort_order: 2, is_active: true },
  { id: 'ZONE-KITCHEN-1', name: 'ครัวอาหารตามสั่ง (สั่งปรุงสด)', type: 'KITCHEN', icon: '🍳', pixel_sprite: 'kitchen', custom_image_url: '', category_ids: ['CAT-RICE', 'CAT-NOODLE', 'CAT-APPETIZER'], description: 'อาหารจานเดียว กะเพรา ผัด ต้มยำ สั่งทำสดใหม่จานต่อจาน', sort_order: 3, is_active: true },
  { id: 'ZONE-BAR-1', name: 'บาร์น้ำชง & เครื่องดื่มพิเศษ', type: 'BAR', icon: '🥤', pixel_sprite: 'bar', custom_image_url: '', category_ids: [], description: 'ชา กาแฟโบราณ เครื่องดื่มชง และเมนูพิเศษ', sort_order: 4, is_active: true }
];

const orderState = {
  viewMode: 'PIXEL', // 'PIXEL' (แบบ C: Virtual Storefront) | 'LIST' (รายการเมนูด่วน)
  orderMode: 'DELIVERY', // 'DELIVERY' | 'DINE_IN' | 'TAKEAWAY'
  tableId: '',
  selectedStoreZoneId: null, // null = หน้าโถงร้านจำลอง (เลือกตู้/ชั้น/ครัว) | string = ID ของตู้/พื้นที่ที่เลือก
  activeZoneCategory: 'ALL', // กรองหมวดหมู่ย่อยในตู้นั้น
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
    const nameEl = document.getElementById('co-input-name');
    if (nameEl) nameEl.value = m.name;
  }
  orderState.redeemPoints = 0;

  // Directly update member badge in DOM without calling render() to preserve input focus!
  const badgeEl = document.getElementById('co-member-badge');
  if (badgeEl) {
    if (m) {
      badgeEl.innerHTML = `
        <div style="margin-top:10px; padding:8px 12px; background:#fef3c7; border:1px solid #fde68a; border-radius:8px; display:flex; justify-content:space-between; align-items:center; font-size:12px;">
          <span>⭐ สมาชิก: <b>${m.name}</b> (${m.tier})</span>
          <span style="color:#b45309; font-weight:700;">แต้มสะสม: ${m.points} แต้ม</span>
        </div>
      `;
      badgeEl.style.display = 'block';
    } else {
      badgeEl.innerHTML = '';
      badgeEl.style.display = 'none';
    }
  }
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

  let contentHtml = '';
  if (orderState.viewMode === 'PIXEL') {
    contentHtml = renderPixelStorefront(products);
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

// Render Delivery Section with Indochina Market Pixel Map (Horizontal: North on Left, South on Right, Mekong River on Top)
function renderDeliverySection() {
  const pts = (orderState.data?.deliveryPoints || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const curPt = pts.find(p => p.id === orderState.selectedDeliveryPointId) || pts[0];
  const mapCfg = orderState.data?.deliveryMapConfig || { orientation: 'HORIZONTAL', river_position: 'TOP', custom_image_url: '', custom_landmarks: [] };
  const customLandmarks = Array.isArray(mapCfg.custom_landmarks) ? mapCfg.custom_landmarks : [];

  return `
    <div class="co-notice-banner">
      <span style="font-size:18px;">📍</span>
      <div>
        <b>บริการส่งด่วนเฉพาะเส้น ตลาดอินโดจีน มุกดาหาร</b>
        <div style="font-size:11px; color:#155e75;">เลือกจุดรับของบนแผนที่ด้านล่าง ไรเดอร์จะนำส่งถึงจุดที่ใกล้คุณที่สุด (เหนืออยู่ซ้าย ◀ | ใต้อยู่ขวา ▶ | โขงอยู่บน ▲)</div>
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

      <!-- Interactive Pixel Map (Horizontal Orientation) -->
      <div class="co-map-wrapper">
        ${mapCfg.custom_image_url ? `
          <!-- Custom Drawn Map Background -->
          <img
            src="${mapCfg.custom_image_url}"
            alt="แผนผังที่วาดเอง"
            style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; display:block;"
          />
        ` : `
          <!-- แผนผัง Pixel Art มาตรฐานแบบแนวนอน (ทิศเหนืออยู่ซ้าย, ทิศใต้อยู่ขวา, แม่น้ำโขงอยู่ด้านบน) -->
          <svg viewBox="0 0 1000 380" preserveAspectRatio="none" style="width:100%; height:100%; display:block;">
            <defs>
              <linearGradient id="odMekongHorizontalWater" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#0284c7" />
                <stop offset="60%" stop-color="#0369a1" />
                <stop offset="100%" stop-color="#075985" />
              </linearGradient>
              <pattern id="odPixelWaveH" width="24" height="12" patternUnits="userSpaceOnUse">
                <rect x="0" y="2" width="10" height="2" fill="#38bdf8" opacity="0.6"/>
                <rect x="12" y="8" width="10" height="2" fill="#bae6fd" opacity="0.5"/>
              </pattern>
            </defs>

            <!-- 1. Top Section (Y: 0 to 110): แม่น้ำโขง (Mekong River) ทอดยาวจากซ้าย (เหนือ) ไปขวา (ใต้) -->
            <rect x="0" y="0" width="1000" height="110" fill="url(#odMekongHorizontalWater)" />
            <rect x="0" y="0" width="1000" height="110" fill="url(#odPixelWaveH)" />

            <!-- Longtail Boats on River -->
            <g transform="translate(180, 40)">
              <polygon points="0,10 42,10 32,22 -8,22" fill="#b45309" />
              <rect x="6" y="2" width="20" height="8" fill="#f59e0b" />
              <line x1="42" y1="10" x2="58" y2="2" stroke="#475569" stroke-width="2" />
              <text x="0" y="34" fill="#e0f2fe" font-size="8.5" font-family="monospace">เรือหางยาว</text>
            </g>

            <g transform="translate(680, 30)">
              <polygon points="0,10 45,10 35,22 -8,22" fill="#b45309" />
              <rect x="8" y="2" width="22" height="8" fill="#ef4444" />
              <line x1="45" y1="10" x2="62" y2="2" stroke="#475569" stroke-width="2" />
              <text x="4" y="34" fill="#e0f2fe" font-size="8.5" font-family="monospace">เรือข้ามฟาก</text>
            </g>

            <text x="500" y="42" fill="#bae6fd" font-size="16" font-family="monospace" font-weight="bold" text-anchor="middle" opacity="0.85">แม่น้ำโขง • MEKONG RIVER</text>
            <text x="500" y="58" fill="#7dd3fc" font-size="9" font-family="monospace" text-anchor="middle" opacity="0.75">(มองข้ามไปเป็นฝั่ง สปป.ลาว / แขวงสะหวันนะเขต)</text>

            <!-- 2. Embankment & Promenade (Y: 110 to 170): ลานคนเดินเลียบแม่น้ำโขง -->
            <rect x="0" y="110" width="1000" height="60" fill="#78716c" />
            <line x1="120" y1="110" x2="120" y2="170" stroke="#a8a29e" stroke-width="1.5" />
            <line x1="260" y1="110" x2="260" y2="170" stroke="#a8a29e" stroke-width="1.5" />
            <line x1="410" y1="110" x2="410" y2="170" stroke="#a8a29e" stroke-width="1.5" />
            <line x1="560" y1="110" x2="560" y2="170" stroke="#a8a29e" stroke-width="1.5" />
            <line x1="720" y1="110" x2="720" y2="170" stroke="#a8a29e" stroke-width="1.5" />
            <line x1="860" y1="110" x2="860" y2="170" stroke="#a8a29e" stroke-width="1.5" />

            <text x="70" y="142" fill="#f5f5f4" font-size="9" font-family="monospace" font-weight="bold">ลานคนเดินริมโขง</text>
            <text x="780" y="142" fill="#f5f5f4" font-size="9" font-family="monospace" font-weight="bold">ลานคนเดินริมโขง</text>

            <!-- ศาลาขาว Rau Rak Mukdahan Pavilion on the promenade (Center) -->
            <rect x="430" y="114" width="115" height="50" fill="#ffffff" stroke="#0f172a" stroke-width="2" rx="4"/>
            <rect x="434" y="118" width="107" height="42" fill="#f8fafc"/>
            <text x="487" y="136" fill="#0f172a" font-size="10" font-family="monospace" font-weight="bold" text-anchor="middle">ศาลาขาวริมโขง</text>
            <text x="487" y="150" fill="#475569" font-size="8" font-family="monospace" text-anchor="middle">Rau Rak Mukdahan</text>

            <!-- 3. Road (Y: 170 to 230): ถนนสำราญชายโขง แนวนอน -->
            <rect x="0" y="170" width="1000" height="60" fill="#1e293b" />
            <line x1="0" y1="200" x2="1000" y2="200" stroke="#facc15" stroke-width="2.5" stroke-dasharray="16,12" />
            <text x="220" y="194" fill="#e2e8f0" font-size="9" font-family="monospace">◀ ทิศเหนือ (ไปสะพานมิตรภาพ 2)</text>
            <text x="500" y="218" fill="#fde047" font-size="10" font-family="monospace" font-weight="bold" text-anchor="middle">ถนนสำราญชายโขง (SAMRAN CHAI KHONG RD)</text>
            <text x="760" y="194" fill="#e2e8f0" font-size="9" font-family="monospace">ทิศใต้ (ไปสะพานห้วยมุก) ▶</text>

            <!-- 4. City / Buildings / Alleys (Y: 230 to 380): ตัวเมืองมุกดาหารและซอยต่างๆ -->
            <rect x="0" y="230" width="1000" height="150" fill="#334155" />

            <!-- North/Left Block: หอเจ้าแม่สองนางพี่น้อง & วัดศรีมงคลใต้ -->
            <rect x="14" y="244" width="105" height="110" fill="#b45309" stroke="#1e293b" stroke-width="2" rx="4"/>
            <text x="66" y="295" fill="#fef3c7" font-size="9.5" font-family="monospace" font-weight="bold" text-anchor="middle">หอเจ้าแม่สองนาง</text>
            <text x="66" y="312" fill="#fde68a" font-size="8" font-family="monospace" text-anchor="middle">& ต้นไม้ศักดิ์สิทธิ์</text>

            <!-- Alley 1: ซอยสองนางสถิตย์ -->
            <rect x="125" y="230" width="36" height="150" fill="#1e293b"/>
            <text x="143" y="290" fill="#94a3b8" font-size="8.5" font-family="monospace" transform="rotate(90, 143, 290)">ซ.สองนางสถิตย์ ▼</text>

            <!-- วัดศรีมงคลใต้ -->
            <rect x="168" y="244" width="95" height="110" fill="#991b1b" stroke="#1e293b" stroke-width="2" rx="4"/>
            <text x="215" y="295" fill="#fee2e2" font-size="10" font-family="monospace" font-weight="bold" text-anchor="middle">วัดศรีมงคลใต้</text>
            <text x="215" y="312" fill="#fecaca" font-size="8" font-family="monospace" text-anchor="middle">พระอารามหลวง</text>

            <!-- Alley 2: ซอยบริหารชนบท -->
            <rect x="270" y="230" width="34" height="150" fill="#1e293b"/>
            <text x="287" y="290" fill="#94a3b8" font-size="8.5" font-family="monospace" transform="rotate(90, 287, 290)">ซ.บริหารชนบท ▼</text>

            <!-- ตึกแถว 1 -->
            <rect x="310" y="244" width="48" height="110" fill="#065f46" stroke="#1e293b" stroke-width="2"/>
            <text x="334" y="300" fill="#d1fae5" font-size="8" font-family="monospace" text-anchor="middle">ร้านค้า</text>

            <!-- Alley 3: ซอยวิเศษมุกดารักษ์ -->
            <rect x="364" y="230" width="34" height="150" fill="#1e293b"/>
            <text x="381" y="290" fill="#94a3b8" font-size="8.5" font-family="monospace" transform="rotate(90, 381, 290)">ซ.วิเศษมุกดารักษ์ ▼</text>

            <!-- ตลาดอินโดจีน อาคารใหญ่ (Center) -->
            <rect x="406" y="244" width="95" height="110" fill="#ca8a04" stroke="#1e293b" stroke-width="2" rx="4"/>
            <text x="453" y="290" fill="#ffffff" font-size="10" font-family="monospace" font-weight="bold" text-anchor="middle">อาคารตลาดอินโดจีน</text>
            <text x="453" y="306" fill="#fef08a" font-size="8" font-family="monospace" text-anchor="middle">INDOCHINA MARKET</text>

            <!-- ถนนพิทักษ์พนมเขต (ทางเข้าหลัก) -->
            <rect x="508" y="230" width="44" height="150" fill="#0f172a"/>
            <text x="530" y="290" fill="#fbbf24" font-size="9" font-family="monospace" font-weight="bold" transform="rotate(90, 530, 290)">ถ.พิทักษ์พนมเขต ▼</text>

            <!-- วัดยอดแก้วศรีวิชัย -->
            <rect x="560" y="244" width="115" height="110" fill="#991b1b" stroke="#1e293b" stroke-width="2" rx="4"/>
            <text x="617" y="295" fill="#fee2e2" font-size="10" font-family="monospace" font-weight="bold" text-anchor="middle">วัดยอดแก้วศรีวิชัย</text>
            <text x="617" y="312" fill="#fecaca" font-size="8" font-family="monospace" text-anchor="middle">ศูนย์กลางชุมชน</text>

            <!-- Alley 4: ซอยศศิวงศ์ -->
            <rect x="682" y="230" width="34" height="150" fill="#1e293b"/>
            <text x="699" y="290" fill="#94a3b8" font-size="8.5" font-family="monospace" transform="rotate(90, 699, 290)">ซ.ศศิวงศ์ ▼</text>

            <!-- ตึกแถว 2 -->
            <rect x="722" y="244" width="48" height="110" fill="#374151" stroke="#1e293b" stroke-width="2"/>
            <text x="746" y="300" fill="#e5e7eb" font-size="8" font-family="monospace" text-anchor="middle">ร้านค้า</text>

            <!-- Alley 5: ซอยจันทร์เทพ -->
            <rect x="776" y="230" width="34" height="150" fill="#1e293b"/>
            <text x="793" y="290" fill="#94a3b8" font-size="8.5" font-family="monospace" transform="rotate(90, 793, 290)">ซ.จันทร์เทพ ▼</text>

            <!-- South/Right Block: Riverfront Hotel & คุ้นคุ้น คิทเช่น -->
            <rect x="818" y="244" width="110" height="110" fill="#1e3a8a" stroke="#1e293b" stroke-width="2" rx="4"/>
            <text x="873" y="290" fill="#bfdbfe" font-size="10" font-family="monospace" font-weight="bold" text-anchor="middle">Riverfront Hotel</text>
            <text x="873" y="306" fill="#93c5fd" font-size="8.5" font-family="monospace" text-anchor="middle">คุ้นคุ้น คิทเช่น</text>

            <!-- Alley 6: ซอยจ่างวาง -->
            <rect x="934" y="230" width="34" height="150" fill="#1e293b"/>
            <text x="951" y="290" fill="#94a3b8" font-size="8.5" font-family="monospace" transform="rotate(90, 951, 290)">ซ.จ่างวาง ▼</text>

            <!-- เข็มทิศ (Compass) แสดงทิศทางชัดเจน -->
            <g transform="translate(48, 48)">
              <rect x="-36" y="-36" width="72" height="72" fill="#0f172a" opacity="0.88" rx="8" stroke="#334155" stroke-width="1.5"/>
              <text x="-24" y="4" fill="#f87171" font-size="10" font-weight="bold">◀ N เหนือ</text>
              <text x="24" y="4" fill="#94a3b8" font-size="9" text-anchor="end">ใต้ ▶</text>
              <text x="0" y="-18" fill="#38bdf8" font-size="8.5" text-anchor="middle">▲ แม่น้ำโขง</text>
              <text x="0" y="24" fill="#94a3b8" font-size="8.5" text-anchor="middle">▼ ในเมือง</text>
            </g>
          </svg>
        `}

        <!-- User-defined Custom Landmarks on Map -->
        ${customLandmarks.map(lm => `
          <div
            style="position:absolute; left:${lm.map_x}%; top:${lm.map_y}%; transform:translate(-50%, -50%); z-index:8; pointer-events:none;"
            title="${lm.name}${lm.details ? ` (${lm.details})` : ''}"
          >
            <div style="background:rgba(15,23,42,0.88); color:#f1f5f9; font-size:9.5px; font-weight:700; padding:2px 6px; border-radius:6px; border:1px solid #38bdf8; display:flex; align-items:center; gap:3px; white-space:nowrap; box-shadow:0 2px 4px rgba(0,0,0,0.6);">
              <span>${lm.icon || '📍'}</span>
              <span>${lm.name}</span>
            </div>
          </div>
        `).join('')}

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
            id="co-input-phone"
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
            id="co-input-name"
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
            id="co-input-note"
            type="text"
            class="co-input"
            placeholder="รายละเอียดเพิ่มเติมให้คนส่งของ"
            value="${orderState.deliveryNote}"
            oninput="orderState.deliveryNote=this.value;"
          />
        </div>
      </div>

      <div id="co-member-badge" style="${orderState.member ? 'display:block;' : 'display:none;'}">
        ${orderState.member ? `
          <div style="margin-top:10px; padding:8px 12px; background:#fef3c7; border:1px solid #fde68a; border-radius:8px; display:flex; justify-content:space-between; align-items:center; font-size:12px;">
            <span>⭐ สมาชิก: <b>${orderState.member.name}</b> (${orderState.member.tier})</span>
            <span style="color:#b45309; font-weight:700;">แต้มสะสม: ${orderState.member.points} แต้ม</span>
          </div>
        ` : ''}
      </div>
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
// Render Store Zone Pixel Sprite Artwork (Chiller, Shelf, Kitchen, Bar, or Custom Image)
function renderStoreZonePixelSprite(spriteType = 'chiller', customImageUrl = '') {
  if (customImageUrl) {
    return `<img src="${customImageUrl}" alt="Zone visual" style="width:100%; height:100%; object-fit:cover; display:block;" />`;
  }

  if (spriteType === 'shelf') {
    return `
      <svg viewBox="0 0 240 130" style="width:100%; height:100%;">
        <rect x="18" y="10" width="204" height="110" fill="#78350f" rx="3" stroke="#451a03" stroke-width="2"/>
        <rect x="22" y="44" width="196" height="8" fill="#92400e" stroke="#451a03" stroke-width="1"/>
        <rect x="22" y="78" width="196" height="8" fill="#92400e" stroke="#451a03" stroke-width="1"/>
        <rect x="22" y="112" width="196" height="6" fill="#92400e"/>
        <rect x="36" y="16" width="168" height="14" fill="#fbbf24" rx="2"/>
        <text x="120" y="27" fill="#78350f" font-size="8.5" font-family="'Press Start 2P', monospace" font-weight="bold" text-anchor="middle">SNACK & GROCERY 🧺</text>
        <polygon points="36,44 48,28 60,44" fill="#ef4444"/>
        <polygon points="66,44 78,28 90,44" fill="#f59e0b"/>
        <polygon points="96,44 108,28 120,44" fill="#10b981"/>
        <rect x="130" y="28" width="14" height="16" fill="#3b82f6" rx="1"/>
        <rect x="148" y="28" width="14" height="16" fill="#8b5cf6" rx="1"/>
        <rect x="168" y="28" width="14" height="16" fill="#ec4899" rx="1"/>
        <polygon points="188,44 200,28 212,44" fill="#eab308"/>
        <rect x="34" y="60" width="16" height="18" fill="#0284c7" rx="1"/>
        <rect x="54" y="60" width="16" height="18" fill="#0284c7" rx="1"/>
        <rect x="76" y="62" width="14" height="16" fill="#f97316" rx="1"/>
        <rect x="94" y="62" width="14" height="16" fill="#f97316" rx="1"/>
        <polygon points="118,78 130,62 142,78" fill="#84cc16"/>
        <polygon points="148,78 160,62 172,78" fill="#ef4444"/>
        <rect x="180" y="62" width="14" height="16" fill="#eab308" rx="1"/>
      </svg>
    `;
  }

  if (spriteType === 'kitchen') {
    return `
      <svg viewBox="0 0 240 130" style="width:100%; height:100%;">
        <rect x="15" y="8" width="210" height="114" fill="#334155" rx="4" stroke="#1e293b" stroke-width="2"/>
        <line x1="15" y1="36" x2="225" y2="36" stroke="#475569" stroke-width="1"/>
        <line x1="15" y1="64" x2="225" y2="64" stroke="#475569" stroke-width="1"/>
        <polygon points="50,8 190,8 175,34 65,34" fill="#64748b" stroke="#334155" stroke-width="1.5"/>
        <text x="120" y="24" fill="#fef08a" font-size="8.5" font-family="'Press Start 2P', monospace" font-weight="bold" text-anchor="middle">LIVE KITCHEN 🍳</text>
        <rect x="25" y="74" width="190" height="42" fill="#94a3b8" stroke="#475569" stroke-width="2" rx="2"/>
        <ellipse cx="75" cy="74" rx="28" ry="8" fill="#1e293b"/>
        <path d="M 52 72 Q 75 90 98 72 Z" fill="#0f172a"/>
        <polygon points="68,76 75,64 82,76" fill="#f97316"/>
        <polygon points="72,76 75,68 78,76" fill="#fde047"/>
        <circle cx="68" cy="54" r="3" fill="#e2e8f0" opacity="0.7"/>
        <circle cx="78" cy="46" r="4" fill="#e2e8f0" opacity="0.6"/>
        <circle cx="72" cy="38" r="5" fill="#e2e8f0" opacity="0.5"/>
        <ellipse cx="165" cy="74" rx="26" ry="7" fill="#1e293b"/>
        <rect x="144" y="56" width="42" height="20" fill="#cbd5e1" stroke="#475569" stroke-width="1.5" rx="2"/>
        <ellipse cx="165" cy="56" rx="21" ry="5" fill="#f87171"/>
        <circle cx="160" cy="44" r="3" fill="#e2e8f0" opacity="0.7"/>
        <circle cx="168" cy="38" r="4" fill="#e2e8f0" opacity="0.5"/>
      </svg>
    `;
  }

  if (spriteType === 'bar') {
    return `
      <svg viewBox="0 0 240 130" style="width:100%; height:100%;">
        <rect x="18" y="10" width="204" height="110" fill="#1e1b4b" rx="4" stroke="#312e81" stroke-width="2"/>
        <rect x="36" y="16" width="168" height="16" fill="#4338ca" rx="2"/>
        <text x="120" y="28" fill="#fde047" font-size="8.5" font-family="'Press Start 2P', monospace" font-weight="bold" text-anchor="middle">DRINK & CAFE BAR 🥤</text>
        <rect x="24" y="74" width="192" height="42" fill="#78350f" stroke="#451a03" stroke-width="2" rx="2"/>
        <line x1="24" y1="84" x2="216" y2="84" stroke="#92400e" stroke-width="3"/>
        <rect x="52" y="50" width="16" height="26" fill="#78350f" rx="2" stroke="#fde68a" stroke-width="1"/>
        <line x1="60" y1="42" x2="68" y2="60" stroke="#f43f5e" stroke-width="2"/>
        <rect x="80" y="48" width="18" height="28" fill="#15803d" rx="2" stroke="#bbf7d0" stroke-width="1"/>
        <line x1="89" y1="40" x2="84" y2="58" stroke="#38bdf8" stroke-width="2"/>
        <rect x="110" y="48" width="18" height="28" fill="#ea580c" rx="2" stroke="#fed7aa" stroke-width="1"/>
        <line x1="120" y1="40" x2="116" y2="58" stroke="#facc15" stroke-width="2"/>
        <rect x="150" y="38" width="56" height="38" fill="#334155" stroke="#1e293b" stroke-width="2" rx="2"/>
        <rect x="156" y="44" width="10" height="10" fill="#ef4444" rx="1"/>
        <rect x="172" y="44" width="10" height="10" fill="#f59e0b" rx="1"/>
        <rect x="188" y="44" width="10" height="10" fill="#3b82f6" rx="1"/>
        <rect x="160" y="60" width="36" height="6" fill="#64748b"/>
      </svg>
    `;
  }

  // Default: chiller (ตู้แช่เย็น)
  return `
    <svg viewBox="0 0 240 130" style="width:100%; height:100%;">
      <rect x="20" y="8" width="200" height="114" fill="#1e293b" rx="4" stroke="#475569" stroke-width="3"/>
      <rect x="28" y="14" width="184" height="18" fill="#38bdf8" rx="2"/>
      <text x="120" y="27" fill="#0f172a" font-size="9" font-family="'Press Start 2P', monospace" font-weight="bold" text-anchor="middle">COLD DRINKS ❄</text>
      <rect x="28" y="36" width="88" height="80" fill="#0284c7" opacity="0.35" stroke="#38bdf8" stroke-width="2"/>
      <rect x="124" y="36" width="88" height="80" fill="#0284c7" opacity="0.35" stroke="#38bdf8" stroke-width="2"/>
      <line x1="30" y1="62" x2="114" y2="62" stroke="#bae6fd" stroke-width="2"/>
      <line x1="30" y1="88" x2="114" y2="88" stroke="#bae6fd" stroke-width="2"/>
      <line x1="126" y1="62" x2="210" y2="62" stroke="#bae6fd" stroke-width="2"/>
      <line x1="126" y1="88" x2="210" y2="88" stroke="#bae6fd" stroke-width="2"/>
      <rect x="36" y="44" width="8" height="16" fill="#ef4444" rx="1"/>
      <rect x="48" y="44" width="8" height="16" fill="#ef4444" rx="1"/>
      <rect x="62" y="42" width="7" height="18" fill="#22c55e" rx="1"/>
      <rect x="74" y="42" width="7" height="18" fill="#22c55e" rx="1"/>
      <rect x="88" y="44" width="8" height="16" fill="#3b82f6" rx="1"/>
      <rect x="36" y="70" width="8" height="16" fill="#f59e0b" rx="1"/>
      <rect x="48" y="70" width="8" height="16" fill="#f59e0b" rx="1"/>
      <rect x="62" y="70" width="8" height="16" fill="#ec4899" rx="1"/>
      <rect x="76" y="70" width="8" height="16" fill="#06b6d4" rx="1"/>
      <rect x="132" y="42" width="7" height="18" fill="#38bdf8" rx="1"/>
      <rect x="144" y="42" width="7" height="18" fill="#38bdf8" rx="1"/>
      <rect x="158" y="44" width="8" height="16" fill="#ca8a04" rx="1"/>
      <rect x="172" y="44" width="8" height="16" fill="#ca8a04" rx="1"/>
      <rect x="186" y="42" width="7" height="18" fill="#10b981" rx="1"/>
      <rect x="134" y="70" width="8" height="16" fill="#a855f7" rx="1"/>
      <rect x="148" y="70" width="8" height="16" fill="#ef4444" rx="1"/>
      <rect x="162" y="70" width="8" height="16" fill="#3b82f6" rx="1"/>
      <rect x="178" y="70" width="8" height="16" fill="#f59e0b" rx="1"/>
      <rect x="108" y="66" width="4" height="18" fill="#f8fafc" rx="1"/>
      <rect x="128" y="66" width="4" height="18" fill="#f8fafc" rx="1"/>
    </svg>
  `;
}

// PIXEL ART STOREFRONT (จำลองหน้าร้านจริง: เลือกพื้นที่จัดวาง ตู้แช่, ชั้นวาง, ครัว, บาร์น้ำ)
// ==========================================================================
function renderPixelStorefront(products = []) {
  const allZones = (orderState.data?.storeZones && orderState.data.storeZones.length > 0)
    ? orderState.data.storeZones
    : DEFAULT_STORE_ZONES;
  const activeZones = allZones.filter(z => z.is_active !== false);
  const categories = orderState.data?.categories || [];
  const catMap = new Map(categories.map(c => [c.id, c.name]));

  // Helper to get products in a zone based on category_ids (Approach A)
  function getZoneProducts(zone) {
    if (!zone || !Array.isArray(zone.category_ids) || zone.category_ids.length === 0) return [];
    return products.filter(p => zone.category_ids.includes(p.category_id));
  }

  // ========================================================================
  // VIEW A: STORE ZONE DETAIL VIEW (เปิดดูสินค้าข้างในตู้แช่ / ชั้นวาง / ครัว)
  // ========================================================================
  if (orderState.selectedStoreZoneId) {
    const curZone = activeZones.find(z => z.id === orderState.selectedStoreZoneId) || activeZones[0];
    if (!curZone) {
      orderState.selectedStoreZoneId = null;
      return renderPixelStorefront(products);
    }

    const zoneAllProds = getZoneProducts(curZone);
    const assignedCats = (curZone.category_ids || []).map(cid => ({
      id: cid,
      name: catMap.get(cid) || cid,
      count: zoneAllProds.filter(p => p.category_id === cid).length
    }));

    let displayedProds = zoneAllProds;
    if (orderState.activeZoneCategory !== 'ALL') {
      displayedProds = displayedProds.filter(p => p.category_id === orderState.activeZoneCategory);
    }

    return `
      <div class="co-pixel-storefront">
        <!-- Retro Awning Roof -->
        <div class="co-storefront-roof"></div>

        <!-- Zone Header & Back Button -->
        <div class="co-zone-detail-header">
          <button
            type="button"
            class="co-zone-back-btn"
            onclick="orderState.selectedStoreZoneId=null; orderState.activeZoneCategory='ALL'; render();"
          >
            ◀ กลับหน้าร้าน (เลือกตู้/จุดอื่น)
          </button>
          
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
            <div>
              <div class="co-zone-detail-title">
                <span>${curZone.icon || '🏪'}</span>
                <span>${curZone.name}</span>
              </div>
              <div style="font-size:12.5px; color:#cbd5e1; margin-top:3px;">
                ${curZone.description || 'เลือกสินค้าที่ต้องการแล้วกดหยิบใส่ตะกร้า'}
              </div>
            </div>
            <div style="background:#0d9488; color:#fff; font-size:11.5px; font-weight:700; padding:4px 10px; border-radius:8px;">
              สินค้าในจุดนี้ ${zoneAllProds.length} รายการ
            </div>
          </div>
        </div>

        <!-- Sub-Category Filter Pills inside this Zone -->
        ${assignedCats.length > 1 ? `
          <div class="co-zone-cat-pills">
            <button
              type="button"
              class="co-pill"
              data-active="${orderState.activeZoneCategory === 'ALL'}"
              onclick="orderState.activeZoneCategory='ALL'; render();"
            >
              ทั้งหมด (${zoneAllProds.length})
            </button>
            ${assignedCats.map(c => `
              <button
                type="button"
                class="co-pill"
                data-active="${orderState.activeZoneCategory === c.id}"
                onclick="orderState.activeZoneCategory='${c.id}'; render();"
              >
                ${c.name.split('(')[0].trim()} (${c.count})
              </button>
            `).join('')}
          </div>
        ` : ''}

        <!-- Zone Products Showcase (Pixel Shelves) -->
        <div class="co-pixel-modules">
          <div class="co-pixel-zone">
            <div class="${curZone.type === 'CHILLER' ? 'co-cooler-case' : (curZone.type === 'KITCHEN' ? 'co-kitchen-case' : 'co-shelf-case')}">
              <div class="co-cooler-shelf">
                ${displayedProds.length === 0 ? `
                  <div style="grid-column: 1 / -1; text-align:center; padding:40px 16px; color:#94a3b8;">
                    <div style="font-size:32px; margin-bottom:8px;">📦</div>
                    <div style="font-weight:700; font-size:14px;">ยังไม่มีสินค้าในหมวดหมู่นี้</div>
                    <div style="font-size:11.5px; margin-top:2px;">สามารถตั้งค่าหมวดหมู่สินค้าของจุดนี้ได้จากระบบหลังบ้าน</div>
                  </div>
                ` : displayedProds.map(p => {
                  const isFood = p.item_type === 'FOOD';
                  const isOutOfStock = !isFood && p.track_stock && (p.stock_qty <= 0);

                  return `
                    <div
                      class="co-pixel-item"
                      style="${isOutOfStock ? 'opacity:0.65;' : ''}"
                      onclick="${isOutOfStock ? `alert('สินค้านี้หมดชั่วคราว');` : `addToCartDirect(${JSON.stringify(p).replace(/"/g, '&quot;')})`}"
                    >
                      <div class="co-item-sprite">${getSpriteIcon(p)}</div>
                      <div class="co-item-name">${p.name}</div>
                      <div class="co-item-price">${formatMoney(p.price)}</div>
                      
                      <div class="co-item-stock-tag" style="${isFood ? 'color:#fca5a5;' : (isOutOfStock ? 'color:#ef4444; font-weight:800;' : '')}">
                        ${isFood ? '🍳 สั่งปรุงสด' : (isOutOfStock ? '❌ สินค้าหมด' : `เหลือ ${p.stock_qty || 0} ${p.unit}`)}
                      </div>

                      <button
                        type="button"
                        class="co-item-add-btn"
                        style="${isOutOfStock ? 'background:#64748b; cursor:not-allowed;' : ''}"
                      >
                        ${isOutOfStock ? 'สินค้าหมด' : (isFood ? '+ สั่งจานนี้' : '+ หยิบ')}
                      </button>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ========================================================================
  // VIEW B: VIRTUAL STOREFRONT HALL (หน้าโถงร้าน: แสดงตู้แช่ ชั้นวาง ครัว บาร์น้ำ ทั้งหมด)
  // ========================================================================
  return `
    <div class="co-pixel-storefront">
      <!-- Retro Awning Roof -->
      <div class="co-storefront-roof"></div>

      <!-- Store Sign -->
      <div class="co-storefront-sign">
        <div class="co-pixel-title">★ ONG CO PIXEL STOREFRONT ★</div>
        <span class="co-open-sign">● OPEN พร้อมรับออเดอร์</span>
      </div>

      <!-- Notice Banner -->
      <div class="co-pixel-hall-banner">
        <div>
          <div class="co-pixel-hall-title">
            <span>🏪</span>
            <span>ยินดีต้อนรับสู่ร้านค้าเสมือนจริง</span>
          </div>
          <div class="co-pixel-hall-subtitle">
            แตะเลือก <b>ตู้แช่, ชั้นวางสินค้า, หรือครัวตามสั่ง</b> ด้านล่าง เพื่อเดินเลือกสินค้าและหยิบใส่ตะกร้า
          </div>
        </div>
        <button
          type="button"
          class="co-view-btn"
          style="background:#0d9488; color:#fff; border-color:#0d9488;"
          onclick="orderState.viewMode='LIST'; render();"
        >
          🔍 ค้นหาด่วน (List View)
        </button>
      </div>

      <!-- Grid of Store Zones (ตู้แช่ 1, ตู้แช่ 2, ชั้นวาง, ครัว, บาร์น้ำ) -->
      <div class="co-pixel-hall-grid">
        ${activeZones.map(zone => {
          const zoneProds = getZoneProducts(zone);
          const assignedCatNames = (zone.category_ids || []).map(cid => catMap.get(cid) || cid);

          return `
            <div
              class="co-zone-card"
              onclick="orderState.selectedStoreZoneId='${zone.id}'; orderState.activeZoneCategory='ALL'; render(); window.scrollTo({ top: 380, behavior: 'smooth' });"
            >
              <!-- Zone Pixel Art Visual -->
              <div class="co-zone-visual">
                ${renderStoreZonePixelSprite(zone.pixel_sprite || 'chiller', zone.custom_image_url || '')}
                
                <div class="co-zone-badge-type">
                  <span>${zone.icon || '🏪'}</span>
                  <span>${zone.type === 'CHILLER' ? 'ตู้แช่เย็น' : (zone.type === 'KITCHEN' ? 'ครัวอาหาร' : (zone.type === 'BAR' ? 'บาร์เครื่องดื่ม' : 'ชั้นวางสินค้า'))}</span>
                </div>

                <div class="co-zone-badge-count">
                  ${zoneProds.length} รายการ
                </div>
              </div>

              <!-- Zone Information & Actions -->
              <div class="co-zone-body">
                <div class="co-zone-name">
                  <span>${zone.name}</span>
                </div>

                <div class="co-zone-desc">
                  ${zone.description || 'แตะเพื่อเปิดดูสินค้าภายในจุดนี้'}
                </div>

                ${assignedCatNames.length > 0 ? `
                  <div class="co-zone-cats">
                    ${assignedCatNames.slice(0, 3).map(cn => `
                      <span class="co-zone-cat-tag">🏷️ ${cn.split('(')[0].trim()}</span>
                    `).join('')}
                    ${assignedCatNames.length > 3 ? `<span class="co-zone-cat-tag">+${assignedCatNames.length - 3}</span>` : ''}
                  </div>
                ` : ''}

                <button type="button" class="co-zone-btn">
                  <span>🛒 เดินไปดูที่จุดนี้</span>
                  <span>▶</span>
                </button>
              </div>
            </div>
          `;
        }).join('')}
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

