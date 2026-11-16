// ==========================================================================
// ONG CO POS - CUSTOMER SELF-ORDERING & PIXEL ART STOREFRONT JS
// ==========================================================================

const DEFAULT_STORE_ZONES = [
  { id: 'ZONE-CHILLER-1', name: 'ตู้แช่ 1 (เครื่องดื่มเย็น & น้ำแข็ง)', type: 'CHILLER', icon: '❄️', pixel_sprite: 'chiller', custom_image_url: '', category_ids: ['CAT-DRINK'], description: 'เครื่องดื่มเย็นเจี๊ยบ น้ำอัดลม น้ำดื่ม และน้ำแข็งสดชื่น', sort_order: 1, is_active: true },
  { id: 'ZONE-SHELF-1', name: 'ชั้นวางขนม & ของชำทั่วไป', type: 'SHELF', icon: '🧺', pixel_sprite: 'shelf', custom_image_url: '', category_ids: ['CAT-SNACK', 'CAT-PANTRY'], description: 'ขนมขบเคี้ยว บะหมี่กึ่งสำเร็จรูป เครื่องปรุง และของใช้ในบ้าน', sort_order: 2, is_active: true },
  { id: 'ZONE-KITCHEN-1', name: 'ครัวอาหารตามสั่ง (สั่งปรุงสด)', type: 'KITCHEN', icon: '🍳', pixel_sprite: 'kitchen', custom_image_url: '', category_ids: ['CAT-RICE', 'CAT-NOODLE', 'CAT-APPETIZER'], description: 'อาหารจานเดียว กะเพรา ผัด ต้มยำ สั่งทำสดใหม่จานต่อจาน', sort_order: 3, is_active: true },
  { id: 'ZONE-BAR-1', name: 'บาร์น้ำชง & เครื่องดื่มพิเศษ', type: 'BAR', icon: '🥤', pixel_sprite: 'bar', custom_image_url: '', category_ids: [], description: 'ชา กาแฟโบราณ เครื่องดื่มชง และเมนูพิเศษ', sort_order: 4, is_active: true }
];

const DEFAULT_STORE_CONFIG = {
  is_open: true,
  closed_message: 'ขออภัย ขณะนี้ร้านปิดรับออเดอร์ชั่วคราว กรุณาแวะมาใหม่ในเวลาทำการครับ 🙏',
  delivery_enabled: true,
  takeaway_enabled: true,
  dine_in_enabled: true,
  delivery_fee_tiers: [
    { id: 'TIER-1', min_amount: 0, max_amount: 99, fee: 20, label: 'สั่งต่ำกว่า ฿100' },
    { id: 'TIER-2', min_amount: 100, max_amount: 199, fee: 10, label: 'สั่ง ฿100 - ฿199' },
    { id: 'TIER-3', min_amount: 200, max_amount: 999999, fee: 0, label: 'สั่ง ฿200 ขึ้นไป (ส่งฟรี!)' }
  ]
};

const DEFAULT_PROMOTIONS = [
  {
    id: 'PROMO-BILL-150',
    name: 'อิ่มคุ้ม! สั่งครบ ฿150 ลดทันที ฿15',
    description: 'สั่งอาหารหรือของชำครบ 150 บาทขึ้นไป ลดท้ายบิลทันที 15 บาท',
    type: 'BILL_DISCOUNT',
    icon: '🎉',
    badge_text: 'ลด ฿15',
    is_active: true,
    min_spend: 150,
    discount_type: 'FIXED',
    discount_value: 15,
    sort_order: 1
  },
  {
    id: 'PROMO-COMBO-MEAL',
    name: 'คู่หูอิ่มอร่อย (อาหารจานหลัก + เครื่องดื่ม) ลด ฿10',
    description: 'สั่งอาหารตามสั่ง/ก๋วยเตี๋ยว คู่กับเครื่องดื่มเย็นในตู้แช่ ลดทันทีชุดละ 10 บาท',
    type: 'COMBO_SET',
    icon: '🍛🥤',
    badge_text: 'จับคู่ลด ฿10',
    is_active: true,
    combo_group_a_categories: ['CAT-RICE', 'CAT-NOODLE'],
    combo_group_a_products: [],
    combo_group_b_categories: ['CAT-DRINK'],
    combo_group_b_products: [],
    discount_type: 'FIXED',
    discount_value: 10,
    sort_order: 2
  },
  {
    id: 'PROMO-BUY3-SNACK',
    name: 'ขนมขบเคี้ยว ซื้อครบ 3 ชิ้น ลดทันที ฿5',
    description: 'หยิบขนมขบเคี้ยวจากชั้นวางครบทุกๆ 3 ชิ้น รับส่วนลดทันที 5 บาท',
    type: 'BUY_X_GET_Y',
    icon: '🧺',
    badge_text: '3 ชิ้นลด ฿5',
    is_active: true,
    target_categories: ['CAT-SNACK'],
    target_products: [],
    buy_qty: 3,
    reward_type: 'DISCOUNT_FIXED',
    reward_value: 5,
    sort_order: 3
  },
  {
    id: 'PROMO-CODE-ONGCO20',
    name: 'โค้ดส่วนลด ONGCO20 ลด ฿20',
    description: 'กรอกโค้ด ONGCO20 เมื่อสั่งครบ 200 บาท ลดเพิ่มทันที 20 บาท',
    type: 'PROMO_CODE',
    icon: '🎟️',
    badge_text: 'โค้ด ONGCO20',
    promo_code: 'ONGCO20',
    is_active: true,
    min_spend: 200,
    discount_type: 'FIXED',
    discount_value: 20,
    sort_order: 4
  },
  {
    id: 'PROMO-HAPPY-HOUR',
    name: 'Happy Hour บ่ายคลายร้อน เครื่องดื่มลด 10%',
    description: 'ช่วงเวลา 14:00 - 17:00 น. เครื่องดื่มทุกชนิดลดทันที 10%',
    type: 'HAPPY_HOUR',
    icon: '⏰',
    badge_text: 'Happy Hour -10%',
    is_active: true,
    start_time: '14:00',
    end_time: '17:00',
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    target_categories: ['CAT-DRINK'],
    target_products: [],
    discount_type: 'PERCENT',
    discount_value: 10,
    sort_order: 5
  }
];

const orderState = {
  viewMode: 'PIXEL', // 'PIXEL' (แบบ C: Virtual Storefront) | 'LIST' (รายการเมนูด่วน)
  orderMode: 'DELIVERY', // 'DELIVERY' | 'DINE_IN' | 'TAKEAWAY'
  tableId: '',
  isTableLocked: false, // true เมื่อเข้าผ่าน QR Code ประจำโต๊ะ (?table=...)
  // Takeaway Pickup Time
  pickupTimeType: 'ASAP', // 'ASAP' (15 นาที) | '30M' | '45M' | '60M' | 'CUSTOM'
  pickupCustomTime: '',
  // Map Zoom State
  mapZoom: 1.0, // 1.0 ถึง 2.5
  // My Orders Modal
  showMyOrdersModal: false,
  myOrdersSearchPhone: '',
  myOrdersTab: 'ACTIVE', // 'ACTIVE' | 'HISTORY'
  searchedOrders: null,
  isSearchingOrders: false,
  // Table Bill Modal
  showTableBillModal: false,
  tableBillData: null,
  selectedStoreZoneId: null, // null = หน้าโถงร้านจำลอง (เลือกตู้/ชั้น/ครัว) | string = ID ของตู้/พื้นที่ที่เลือก
  storefrontView: 'ROOM', // 'ROOM' (ผังห้อง RPG เหมือนรูปที่ 2) | 'CARDS' (การ์ดแยกตู้)
  activeZoneCategory: 'ALL', // กรองหมวดหมู่ย่อยในตู้นั้น
  activeCategory: 'ALL',
  searchQuery: '',
  // Promotions & Voucher State
  promoCodeInput: '',
  appliedPromoCode: '',
  activePromoFilterId: null,
  selectedPromoId: null, // null = เลือกโปรที่คุ้มที่สุดอัตโนมัติ | 'NONE' = ไม่ใช้โปรฯ (เช่น เลือกใช้แต้มลดแทน) | string = ID ของโปรฯ ที่เลือก
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

// URL Parameters initialization: Isolated Table QR Code vs Online Customers
(function initUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const tbl = params.get('table');
  const mode = params.get('mode');
  const view = params.get('view');

  if (tbl) {
    // สแกน QR โต๊ะมา: ล็อกโต๊ะนั้นทันที ซ่อนการสลับโหมด และบังคับโหมดทานที่ร้าน
    orderState.tableId = tbl;
    orderState.orderMode = 'DINE_IN';
    orderState.isTableLocked = true;
  } else {
    // ลูกค้าภายนอก: ป้องกันคนนอกร้านสั่งแกล้งโต๊ะ ซ่อนโหมดทานที่ร้าน เหลือเฉพาะเดลิเวอรี่และรับกลับบ้าน
    orderState.isTableLocked = false;
    if (mode === 'takeaway') {
      orderState.orderMode = 'TAKEAWAY';
    } else {
      orderState.orderMode = 'DELIVERY';
    }
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

// ==========================================================================
// STORE CONFIG, TIERED DELIVERY FEE & 5-TYPE PROMOTIONS ENGINE
// ==========================================================================

function getStoreConfig() {
  const raw = orderState.data?.storeConfig;
  if (!raw || typeof raw !== 'object') return DEFAULT_STORE_CONFIG;
  return {
    ...DEFAULT_STORE_CONFIG,
    ...raw,
    delivery_fee_tiers: Array.isArray(raw.delivery_fee_tiers) && raw.delivery_fee_tiers.length > 0
      ? raw.delivery_fee_tiers
      : DEFAULT_STORE_CONFIG.delivery_fee_tiers
  };
}

function getAllPromotions() {
  const raw = orderState.data?.promotions;
  const list = Array.isArray(raw) && raw.length > 0 ? raw : DEFAULT_PROMOTIONS;
  return list.slice().sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
}

function getActivePromotions() {
  return getAllPromotions().filter(p => p && p.is_active !== false);
}

function isHappyHourCurrentlyActive(promo) {
  if (!promo || promo.type !== 'HAPPY_HOUR') return true;
  const now = new Date();
  const day = now.getDay();
  if (Array.isArray(promo.days_of_week) && promo.days_of_week.length > 0) {
    if (!promo.days_of_week.map(Number).includes(day)) return false;
  }
  const hhmm = now.toTimeString().slice(0, 5);
  const start = promo.start_time || '00:00';
  const end = promo.end_time || '23:59';
  return hhmm >= start && hhmm <= end;
}

function getDeliveryFeeInfo(subtotal = getCartSubtotal()) {
  if (orderState.orderMode !== 'DELIVERY') {
    return { fee: 0, matchedTier: null, nextBetterTier: null, hint: '', tiers: [] };
  }
  const cfg = getStoreConfig();
  const tiers = (cfg.delivery_fee_tiers || []).slice().sort((a, b) => (Number(a.min_amount) || 0) - (Number(b.min_amount) || 0));
  if (tiers.length === 0) {
    return { fee: 0, matchedTier: null, nextBetterTier: null, hint: '', tiers: [] };
  }

  let matched = tiers[0];
  for (const t of tiers) {
    const min = Number(t.min_amount) || 0;
    const max = (t.max_amount !== undefined && t.max_amount !== null && t.max_amount !== '') ? Number(t.max_amount) : 9999999;
    if (subtotal >= min && subtotal <= max) {
      matched = t;
      break;
    }
    if (subtotal >= min) {
      matched = t;
    }
  }

  const fee = Math.max(0, Number(matched?.fee) || 0);
  const nextBetterTier = tiers.find(t => (Number(t.min_amount) || 0) > subtotal && (Number(t.fee) || 0) < fee) || null;
  let hint = '';
  if (subtotal > 0) {
    if (fee === 0) {
      hint = '🎉 ยอดสั่งซื้อถึงเกณฑ์ ได้รับสิทธิ์ส่งฟรี!';
    } else if (nextBetterTier) {
      const diff = Math.max(1, (Number(nextBetterTier.min_amount) || 0) - subtotal);
      const nextFee = Number(nextBetterTier.fee) || 0;
      hint = nextFee === 0
        ? `🛵 สั่งเพิ่มอีกเพียง ${formatMoney(diff)} ได้รับสิทธิ์ ส่งฟรี!`
        : `🛵 สั่งเพิ่มอีก ${formatMoney(diff)} ค่าส่งลดเหลือเพียง ${formatMoney(nextFee)}!`;
    }
  }

  return { fee, matchedTier: matched, nextBetterTier, hint, tiers };
}

function isProductInListOrCat(prod, prodIds = [], catIds = []) {
  if (!prod) return false;
  if (Array.isArray(prodIds) && prodIds.includes(prod.id)) return true;
  if (Array.isArray(catIds) && catIds.includes(prod.category_id)) return true;
  return false;
}

function getProductPromoBadges(product) {
  if (!product) return [];
  const activePromos = getActivePromotions();
  const badges = [];
  for (const pr of activePromos) {
    if (pr.type === 'BILL_DISCOUNT' || pr.type === 'PROMO_CODE') {
      const hasRestriction = (Array.isArray(pr.target_products) && pr.target_products.length > 0) || (Array.isArray(pr.target_categories) && pr.target_categories.length > 0);
      if (hasRestriction && isProductInListOrCat(product, pr.target_products, pr.target_categories)) {
        badges.push(pr.badge_text || '🔥 ร่วมโปรฯ');
      }
    } else if (pr.type === 'COMBO_SET') {
      const inA = isProductInListOrCat(product, pr.combo_group_a_products, pr.combo_group_a_categories);
      const inB = isProductInListOrCat(product, pr.combo_group_b_products, pr.combo_group_b_categories);
      if (inA || inB) {
        badges.push(pr.badge_text || '🔥 จับคู่ลด');
      }
    } else if (pr.type === 'BUY_X_GET_Y') {
      if (isProductInListOrCat(product, pr.target_products, pr.target_categories)) {
        badges.push(pr.badge_text || `🔥 ซื้อ ${pr.buy_qty || 3} ลดคุ้ม`);
      }
    } else if (pr.type === 'HAPPY_HOUR') {
      if (isProductInListOrCat(product, pr.target_products, pr.target_categories)) {
        const isNow = isHappyHourCurrentlyActive(pr);
        badges.push(isNow ? (pr.badge_text || '⏰ Happy Hour') : `⏰ ${pr.start_time || '14:00'}-${pr.end_time || '17:00'}`);
      }
    }
  }
  return badges;
}

// คำนวณโปรโมชั่นทั้ง 5 รูปแบบอัตโนมัติในตะกร้า (กฎเหล็ก: ห้ามใช้โปรฯ ซ้อนกัน และห้ามใช้ซ้อนกับแต้มลด!)
function evaluateCustomerPromotions() {
  const subtotal = getCartSubtotal();
  const activePromos = getActivePromotions();
  const productsMap = new Map((orderState.data?.products || []).map(p => [p.id, p]));

  const expandedItems = [];
  orderState.cart.forEach(it => {
    const prod = productsMap.get(it.product_id) || { id: it.product_id, name: it.name, category_id: it.category_id || '', price: it.unit_price };
    const modExtra = (it.modifiers || []).reduce((s, m) => s + (Number(m.extra_price) || 0), 0);
    const unitFullPrice = (Number(it.unit_price) || 0) + modExtra;
    const qty = Number(it.quantity) || 0;
    for (let i = 0; i < qty; i++) {
      expandedItems.push({
        product_id: it.product_id,
        name: it.name,
        category_id: prod.category_id || '',
        unit_price: unitFullPrice,
        prod
      });
    }
  });

  const eligibleList = [];
  const upsellHints = [];
  let codeError = '';

  for (const pr of activePromos) {
    // 1. BILL_DISCOUNT (ส่วนลดท้ายบิลตามยอดซื้อขั้นต่ำ หรือตามหมวด/รายสินค้าที่กำหนด)
    if (pr.type === 'BILL_DISCOUNT') {
      const minSpend = Number(pr.min_spend) || 0;
      const hasRestriction = (Array.isArray(pr.target_products) && pr.target_products.length > 0) || (Array.isArray(pr.target_categories) && pr.target_categories.length > 0);
      const baseSpend = hasRestriction
        ? expandedItems.filter(x => isProductInListOrCat(x.prod, pr.target_products, pr.target_categories)).reduce((s, x) => s + x.unit_price, 0)
        : subtotal;

      if (baseSpend >= minSpend && baseSpend > 0) {
        const disc = pr.discount_type === 'PERCENT'
          ? Math.round((baseSpend * (Number(pr.discount_value) || 0)) / 100)
          : (Number(pr.discount_value) || 0);
        if (disc > 0) {
          eligibleList.push({ id: pr.id, name: pr.name, icon: pr.icon || '🎉', amount: Math.min(subtotal, disc) });
        }
      } else if (baseSpend > 0 && baseSpend < minSpend && (minSpend - baseSpend) <= 120) {
        const diff = minSpend - baseSpend;
        const rewardTxt = pr.discount_type === 'PERCENT' ? `ลด ${pr.discount_value}%` : `ลดทันที ${formatMoney(pr.discount_value)}`;
        upsellHints.push(`💡 สั่งเพิ่มอีกเพียง <b>${formatMoney(diff)}</b> รับสิทธิ์ "${pr.name}" (${rewardTxt})!`);
      }
    }

    // 2. COMBO_SET (โปรจับคู่อิ่มคุ้มข้ามหมวด / รายเมนู)
    else if (pr.type === 'COMBO_SET') {
      const groupA = expandedItems.filter(x => isProductInListOrCat(x.prod, pr.combo_group_a_products, pr.combo_group_a_categories));
      const groupB = expandedItems.filter(x => isProductInListOrCat(x.prod, pr.combo_group_b_products, pr.combo_group_b_categories));
      const pairs = Math.min(groupA.length, groupB.length);
      if (pairs > 0) {
        const perSet = Number(pr.discount_value) || 10;
        const disc = pairs * perSet;
        if (disc > 0) {
          eligibleList.push({ id: pr.id, name: `${pr.name} (×${pairs} ชุด)`, icon: pr.icon || '🍛🥤', amount: Math.min(subtotal, disc) });
        }
      } else if (groupA.length > 0 && groupB.length === 0) {
        upsellHints.push(`💡 คุณมีเมนูหลักในตะกร้าแล้ว! หยิบคู่ <b>สินค้าที่ร่วมโปรฯ "${pr.name}"</b> เพิ่มอีก 1 ชิ้น รับส่วนลดจับคู่ทันที <b>${formatMoney(pr.discount_value)}</b>!`);
      } else if (groupB.length > 0 && groupA.length === 0) {
        upsellHints.push(`💡 สั่งคู่กับ <b>เมนูหลักที่ร่วมโปรฯ "${pr.name}"</b> เพิ่มอีก 1 รายการ รับส่วนลดจับคู่ทันที <b>${formatMoney(pr.discount_value)}</b>!`);
      }
    }

    // 3. BUY_X_GET_Y (ซื้อครบ X ชิ้น ลดทันที / แถมฟรี)
    else if (pr.type === 'BUY_X_GET_Y') {
      const matched = expandedItems
        .filter(x => isProductInListOrCat(x.prod, pr.target_products, pr.target_categories))
        .sort((a, b) => a.unit_price - b.unit_price);
      const buyQty = Math.max(2, Number(pr.buy_qty) || 3);
      const sets = Math.floor(matched.length / buyQty);
      if (sets > 0) {
        let disc = 0;
        if (pr.reward_type === 'FREE_CHEAPEST') {
          for (let i = 0; i < sets; i++) {
            disc += matched[i]?.unit_price || 0;
          }
        } else {
          disc = sets * (Number(pr.reward_value || pr.discount_value) || 5);
        }
        if (disc > 0) {
          eligibleList.push({ id: pr.id, name: `${pr.name} (×${sets} ชุด)`, icon: pr.icon || '🧺', amount: Math.min(subtotal, disc) });
        }
      } else if (matched.length > 0 && (buyQty - matched.length) <= 2) {
        const need = buyQty - matched.length;
        upsellHints.push(`💡 หยิบสินค้าโปรฯ "${pr.name}" เพิ่มอีก <b>${need} ชิ้น</b> รับส่วนลดทันที!`);
      }
    }

    // 4. HAPPY_HOUR (โปรช่วงเวลาพิเศษ)
    else if (pr.type === 'HAPPY_HOUR') {
      if (isHappyHourCurrentlyActive(pr)) {
        const matched = expandedItems.filter(x => isProductInListOrCat(x.prod, pr.target_products, pr.target_categories));
        if (matched.length > 0) {
          const matchedSum = matched.reduce((s, x) => s + x.unit_price, 0);
          const disc = pr.discount_type === 'PERCENT'
            ? Math.round((matchedSum * (Number(pr.discount_value) || 0)) / 100)
            : matched.length * (Number(pr.discount_value) || 0);
          if (disc > 0) {
            eligibleList.push({ id: pr.id, name: pr.name, icon: pr.icon || '⏰', amount: Math.min(subtotal, disc) });
          }
        }
      }
    }

    // 5. PROMO_CODE (โค้ดส่วนลด / คูปอง)
    else if (pr.type === 'PROMO_CODE') {
      const targetCode = String(pr.promo_code || '').trim().toUpperCase();
      const userCode = String(orderState.appliedPromoCode || '').trim().toUpperCase();
      if (targetCode && userCode && targetCode === userCode) {
        const minSpend = Number(pr.min_spend) || 0;
        const hasRestriction = (Array.isArray(pr.target_products) && pr.target_products.length > 0) || (Array.isArray(pr.target_categories) && pr.target_categories.length > 0);
        const baseSpend = hasRestriction
          ? expandedItems.filter(x => isProductInListOrCat(x.prod, pr.target_products, pr.target_categories)).reduce((s, x) => s + x.unit_price, 0)
          : subtotal;

        if (baseSpend >= minSpend && baseSpend > 0) {
          const disc = pr.discount_type === 'PERCENT'
            ? Math.round((baseSpend * (Number(pr.discount_value) || 0)) / 100)
            : (Number(pr.discount_value) || 0);
          if (disc > 0) {
            eligibleList.push({ id: pr.id, name: `โค้ด ${targetCode}: ${pr.name}`, icon: pr.icon || '🎟️', amount: Math.min(subtotal, disc) });
          }
        } else {
          codeError = `โค้ด ${targetCode} ต้องมียอดสั่งซื้อสินค้าที่ร่วมรายการขั้นต่ำ ${formatMoney(minSpend)} (ขาดอีก ${formatMoney(Math.max(0, minSpend - baseSpend))})`;
        }
      }
    }
  }

  // ตรวจสอบกรณีลูกค้ากรอกโค้ดที่ไม่พบในระบบ
  if (orderState.appliedPromoCode) {
    const uCode = String(orderState.appliedPromoCode).trim().toUpperCase();
    const exists = activePromos.some(p => p.type === 'PROMO_CODE' && String(p.promo_code || '').trim().toUpperCase() === uCode);
    if (!exists) {
      codeError = `ไม่พบโค้ดส่วนลด "${uCode}" หรือโค้ดหมดอายุแล้ว`;
    }
  }

  // เรียงโปรที่ลดเยอะสุดขึ้นก่อน
  eligibleList.sort((a, b) => b.amount - a.amount);

  // กฎเหล็ก:
  // 1) ถ้าลูกค้าเลือกใช้แต้มสะสมลดราคา (orderState.redeemPoints > 0) จะไม่สามารถใช้โปรโมชั่นซ้อนได้
  // 2) ถ้าเข้าเกณฑ์ตั้งแต่ 2 โปรโมชั่นขึ้นไป เลือกใช้ได้เพียง 1 โปรโมชั่นเท่านั้น (ค่าเริ่มต้นเลือกอันที่ลดคุ้มสุดให้ หรือตามที่ลูกค้ากดเลือก)
  let chosenPromo = null;
  if (orderState.redeemPoints > 0 || orderState.selectedPromoId === 'NONE') {
    chosenPromo = null;
  } else if (eligibleList.length > 0) {
    chosenPromo = eligibleList.find(p => p.id === orderState.selectedPromoId) || eligibleList[0];
  }

  const totalDiscount = chosenPromo ? Math.min(subtotal, Math.max(0, chosenPromo.amount)) : 0;
  const appliedList = chosenPromo ? [chosenPromo] : [];

  return {
    totalDiscount,
    appliedList,
    eligibleList,
    chosenPromo,
    upsellHints,
    codeError
  };
}

function selectCustomerPromotion(promoId) {
  if (!promoId || promoId === 'NONE') {
    orderState.selectedPromoId = 'NONE';
  } else {
    orderState.selectedPromoId = promoId;
    // ห้ามใช้โปรโมชั่นซ้อนกับแต้มลด! หากเลือกโปรโมชั่น ให้ยกเลิกการใช้แต้มลดทันที
    orderState.redeemPoints = 0;
  }
  renderCartAndModals();
}

function selectCustomerPointsRedeem(points) {
  const pts = Math.max(0, Number(points) || 0);
  orderState.redeemPoints = pts;
  if (pts > 0) {
    // ห้ามใช้แต้มลดซ้อนกับโปรโมชั่น! หากเลือกใช้แต้มลด ให้ปิดการใช้โปรโมชั่นทันที
    orderState.selectedPromoId = 'NONE';
    showOrderToast('⭐ เลือกใช้แต้มสะสมเป็นส่วนลด (ไม่สามารถใช้ร่วมกับโปรโมชั่นอื่นได้)', false);
  } else {
    orderState.selectedPromoId = null;
  }
  renderCartAndModals();
}

function applyCustomerPromoCode(codeStr) {
  const clean = String(codeStr !== undefined ? codeStr : orderState.promoCodeInput || '').trim().toUpperCase();
  if (!clean) {
    orderState.appliedPromoCode = '';
    orderState.promoCodeInput = '';
    if (orderState.selectedPromoId && orderState.selectedPromoId !== 'NONE') {
      orderState.selectedPromoId = null;
    }
    renderCartAndModals();
    return;
  }
  orderState.promoCodeInput = clean;
  orderState.appliedPromoCode = clean;
  orderState.redeemPoints = 0;
  const matchedPromo = getActivePromotions().find(p => p.type === 'PROMO_CODE' && String(p.promo_code || '').trim().toUpperCase() === clean);
  if (matchedPromo) {
    orderState.selectedPromoId = matchedPromo.id;
  }
  const evalRes = evaluateCustomerPromotions();
  if (evalRes.codeError) {
    showOrderToast(`⚠️ ${evalRes.codeError}`, false);
  } else {
    showOrderToast(`🎉 ใช้โค้ดส่วนลด "${clean}" เรียบร้อยแล้ว!`, false);
  }
  renderCartAndModals();
}

function handleShowcasePromoClick(promoId) {
  const promo = getActivePromotions().find(p => p.id === promoId);
  if (!promo) return;

  if (promo.type === 'PROMO_CODE' && promo.promo_code) {
    orderState.promoCodeInput = promo.promo_code;
    orderState.appliedPromoCode = promo.promo_code;
    orderState.selectedPromoId = promo.id;
    orderState.redeemPoints = 0;
    showOrderToast(`🎟️ เก็บโค้ด "${promo.promo_code}" เรียบร้อย! เมื่อสั่งครบ ${formatMoney(promo.min_spend || 0)} จะลดทันที`, false);
    renderCartAndModals();
    return;
  }

  orderState.selectedPromoId = promo.id;
  orderState.redeemPoints = 0;

  // สำหรับโปรจับคู่ / ซื้อครบ / Happy Hour / ลดท้ายบิลเฉพาะรายการ ให้พาไปดูรายการสินค้าที่ร่วมโปรฯ
  if (orderState.activePromoFilterId === promo.id) {
    orderState.activePromoFilterId = null;
    showOrderToast('แสดงสินค้าทั้งหมดตามปกติ', false);
  } else {
    orderState.activePromoFilterId = promo.id;
    orderState.viewMode = 'LIST';
    orderState.activeCategory = 'ALL';
    showOrderToast(`🔥 กรองเฉพาะสินค้าที่ร่วมโปรฯ: ${promo.name}`, false);
  }
  render();
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
  if (sub <= 0) return 0;
  const ptsDisc = getPointsDiscountBaht(orderState.redeemPoints);
  const promoEval = evaluateCustomerPromotions();
  const delivInfo = getDeliveryFeeInfo(sub);
  return Math.max(0, sub + delivInfo.fee - promoEval.totalDiscount - ptsDisc);
}

function getProductQtyInCart(productId) {
  return orderState.cart
    .filter(it => it.product_id === productId)
    .reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
}

// รวมรายการสินค้าหรือเมนูที่เหมือนกัน (ชื่อ/รหัสเดียวกัน + ตัวเลือกเสริมเหมือนกัน + ราคาเท่ากัน + โน้ตเดียวกัน)
// เพื่อแสดงจำนวนรวมในหน้าเช็คบิล, สถานะบิลโต๊ะ และใบเสร็จของลูกค้าโดยไม่ต้องบวกเลขเอง
function groupCustomerOrderItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return [];
  const map = new Map();

  for (const it of rawItems) {
    if (!it) continue;
    const status = it.item_status || 'ACTIVE';
    const itemName = String(it.product_name || it.name || 'สินค้า').trim();
    const prodKey = it.product_id || itemName;
    const rawMods = Array.isArray(it.modifiers) ? it.modifiers : [];
    const modNames = rawMods.map(m => (typeof m === 'object' && m !== null ? (m.name || '') : String(m))).filter(Boolean);
    const modExtra = rawMods.reduce((s, m) => s + (typeof m === 'object' && m !== null ? (Number(m.extra_price) || 0) : 0), 0);
    const uPrice = Number(it.unit_price ?? it.price ?? 0) + modExtra;
    const modKey = modNames.slice().sort().join('|');
    const noteKey = String(it.special_instructions || '').trim();
    const key = `${status}::${prodKey}::${uPrice}::${modKey}::${noteKey}`;

    const qty = Number(it.quantity) || 1;
    const kSt = it.kitchen_status || '';

    if (map.has(key)) {
      const existing = map.get(key);
      existing.quantity += qty;
      existing.merged_count += 1;
      if (kSt === 'SERVED') existing.served_qty += qty;
      else if (kSt === 'COOKING') existing.cooking_qty += qty;
      else existing.pending_qty += qty;

      if (existing.served_qty === existing.quantity) existing.kitchen_status = 'SERVED';
      else if (existing.cooking_qty > 0 || existing.served_qty > 0) existing.kitchen_status = 'COOKING';
    } else {
      map.set(key, {
        ...it,
        product_name: itemName,
        name: itemName,
        unit_price: uPrice,
        quantity: qty,
        modifiers: modNames,
        special_instructions: noteKey,
        item_status: status,
        merged_count: 1,
        served_qty: kSt === 'SERVED' ? qty : 0,
        cooking_qty: kSt === 'COOKING' ? qty : 0,
        pending_qty: (kSt !== 'SERVED' && kSt !== 'COOKING') ? qty : 0
      });
    }
  }

  return Array.from(map.values());
}

// แสดงแถบแจ้งเตือนสถานะกำลังดำเนินการ (Loading / Toast) เพื่อป้องกันการกดซ้ำ
let coToastTimer = null;
function showOrderToast(message, isBusy = false) {
  let el = document.getElementById('co-global-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'co-global-toast';
    el.style.cssText = 'position:fixed; top:16px; left:50%; transform:translateX(-50%); z-index:99999; padding:10px 18px; border-radius:999px; font-size:13.5px; font-weight:800; color:#fff; box-shadow:0 8px 24px rgba(0,0,0,0.3); display:flex; align-items:center; gap:8px; transition:opacity 0.2s, transform 0.2s; pointer-events:none; white-space:nowrap;';
    document.body.appendChild(el);
  }
  if (coToastTimer) {
    clearTimeout(coToastTimer);
    coToastTimer = null;
  }
  el.style.background = isBusy ? '#0284c7' : '#0f3238';
  el.style.border = isBusy ? '2px solid #7dd3fc' : '2px solid #2dd4bf';
  el.innerHTML = isBusy
    ? `<span style="display:inline-block; animation:spin 0.8s linear infinite;">⏳</span><span>${message}</span>`
    : `<span>${message}</span>`;
  el.style.opacity = '1';
  el.style.transform = 'translateX(-50%) translateY(0)';

  if (!isBusy) {
    coToastTimer = setTimeout(() => {
      if (el) {
        el.style.opacity = '0';
        el.style.transform = 'translateX(-50%) translateY(-10px)';
      }
    }, 2600);
  }
}

function hideOrderToast() {
  const el = document.getElementById('co-global-toast');
  if (el) {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(-10px)';
  }
}

// อัปเดตเฉพาะแถบตะกร้าด้านล่าง, หน้าต่างป๊อปอัป (Modal), และป้ายจำนวนบนการ์ดสินค้า โดยไม่รีเฟรชหน้าจอหลัก!
function renderCartAndModals() {
  const stickyRoot = document.getElementById('co-sticky-cart-root');
  const modalsRoot = document.getElementById('co-modals-root');
  if (!stickyRoot || !modalsRoot) {
    render();
    return;
  }

  stickyRoot.innerHTML = renderStickyCart();
  modalsRoot.innerHTML = `
    ${orderState.foodModalProduct ? renderFoodModifierModal() : ''}
    ${orderState.showCartModal ? renderCartModal() : ''}
    ${orderState.showCheckoutModal ? renderCheckoutModal() : ''}
    ${orderState.showMyOrdersModal ? renderMyOrdersModal() : ''}
    ${orderState.showTableBillModal ? renderTableBillModal() : ''}
  `;

  // อัปเดตป้ายจำนวนสินค้าที่อยู่ในตะกร้าบนการ์ดสินค้าแต่ละใบทันทีโดยไม่ขยับ Scroll
  document.querySelectorAll('[data-prod-qty-badge]').forEach(el => {
    const pid = el.getAttribute('data-prod-qty-badge');
    const q = getProductQtyInCart(pid);
    if (q > 0) {
      el.textContent = `✓ ${q} ในตะกร้า`;
      el.style.display = 'inline-block';
    } else {
      el.textContent = '';
      el.style.display = 'none';
    }
  });
}

function renderModalsOnly() {
  renderCartAndModals();
}

// อัปเดตเฉพาะโซนหน้าร้าน (#co-storefront-root) เมื่อกดเข้าตู้/ออกจากตู้ เพื่อไม่ให้หน้าจอกระตุกหรือเลื่อนขึ้น
function renderStorefrontOnly() {
  const sfRoot = document.getElementById('co-storefront-root');
  if (!sfRoot || !orderState.data) {
    render();
    return;
  }
  const activeEl = document.activeElement;
  const activeId = activeEl && activeEl.id ? activeEl.id : null;
  let selStart = null;
  let selEnd = null;
  if (activeId && typeof activeEl.selectionStart === 'number') {
    try {
      selStart = activeEl.selectionStart;
      selEnd = activeEl.selectionEnd;
    } catch {}
  }

  const prevWinY = window.scrollY;
  const prevRoomEl = document.querySelector('.co-room-floor');
  const prevRoomLeft = prevRoomEl ? prevRoomEl.scrollLeft : 0;
  const prevCatPillsEl = document.querySelector('.co-cat-pills');
  const prevCatPillsLeft = prevCatPillsEl ? prevCatPillsEl.scrollLeft : 0;

  const products = orderState.data.products || [];
  sfRoot.innerHTML = orderState.viewMode === 'PIXEL'
    ? renderPixelStorefront(products)
    : renderListView(products);

  const nextRoomEl = document.querySelector('.co-room-floor');
  if (nextRoomEl && prevRoomLeft > 0) {
    nextRoomEl.scrollLeft = prevRoomLeft;
  }
  const nextCatPillsEl = document.querySelector('.co-cat-pills');
  if (nextCatPillsEl && prevCatPillsLeft > 0) {
    nextCatPillsEl.scrollLeft = prevCatPillsLeft;
  }
  window.scrollTo(0, prevWinY);

  if (activeId) {
    const nextInput = document.getElementById(activeId);
    if (nextInput) {
      nextInput.focus();
      if (selStart !== null && typeof nextInput.setSelectionRange === 'function') {
        try { nextInput.setSelectionRange(selStart, selEnd); } catch {}
      }
    }
  }
}

function enterStoreZone(zoneId) {
  orderState.selectedStoreZoneId = zoneId;
  orderState.activeZoneCategory = 'ALL';
  renderStorefrontOnly();
}

function exitStoreZone() {
  orderState.selectedStoreZoneId = null;
  orderState.activeZoneCategory = 'ALL';
  renderStorefrontOnly();
}

function addToCartById(productId, qty = 1) {
  const products = orderState.data?.products || [];
  const product = products.find(p => p.id === productId);
  if (!product) return;
  addToCartDirect(product, qty);
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
      image_url: product.image_url || '',
      quantity: qty,
      modifiers: [],
      special_instructions: ''
    });
  }
  renderCartAndModals();
}

function openFoodModifierModal(product) {
  orderState.foodModalProduct = product;
  orderState.foodModalModifiers = [];
  orderState.foodModalNote = '';
  orderState.foodModalQty = 1;
  renderCartAndModals();
}

function toggleModifierSelection(groupId, modId, isSingle = false) {
  const allMods = orderState.data?.modifiers || [];
  const modObj = allMods.find(m => m.id === modId);
  if (!modObj) return;
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
  renderCartAndModals();
}

function confirmFoodModifiers() {
  const p = orderState.foodModalProduct;
  if (!p) return;

  const newMods = [...orderState.foodModalModifiers];
  const newModKey = newMods.map(m => m.id || m.name).slice().sort().join('|');
  const newNote = orderState.foodModalNote.trim();
  const addQty = orderState.foodModalQty || 1;

  const existing = orderState.cart.find(it => {
    if (it.product_id !== p.id) return false;
    const itModKey = (it.modifiers || []).map(m => (typeof m === 'object' && m !== null ? (m.id || m.name) : String(m))).slice().sort().join('|');
    const itNote = String(it.special_instructions || '').trim();
    return itModKey === newModKey && itNote === newNote;
  });

  if (existing) {
    existing.quantity += addQty;
  } else {
    orderState.cart.push({
      product_id: p.id,
      name: p.name,
      item_type: 'FOOD',
      unit_price: Number(p.price) || 0,
      image_url: p.image_url || '',
      quantity: addQty,
      modifiers: newMods,
      special_instructions: newNote
    });
  }

  orderState.foodModalProduct = null;
  renderCartAndModals();
}

function updateCartQty(index, delta) {
  if (!orderState.cart[index]) return;
  orderState.cart[index].quantity += delta;
  if (orderState.cart[index].quantity <= 0) {
    orderState.cart.splice(index, 1);
  }
  renderCartAndModals();
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

  const storeCfg = getStoreConfig();
  if (!storeCfg.is_open) {
    alert(storeCfg.closed_message || 'ขออภัย ขณะนี้ร้านปิดรับออเดอร์ชั่วคราว');
    return;
  }

  if (orderState.isSubmitting) {
    showOrderToast('กำลังส่งคำสั่งซื้อ กรุณารอสักครู่...', true);
    return;
  }

  if (orderState.orderMode === 'DELIVERY' && !orderState.customerPhone) {
    alert('กรุณาระบุเบอร์โทรศัพท์สำหรับติดต่อส่งของ');
    return;
  }
  if (orderState.orderMode === 'TAKEAWAY' && !orderState.customerPhone) {
    alert('กรุณาระบุเบอร์โทรศัพท์สำหรับติดต่อรับอาหาร');
    return;
  }

  orderState.isSubmitting = true;
  showOrderToast('กำลังส่งคำสั่งซื้อเข้าสู่ระบบ... กรุณารอสักครู่', true);
  renderCartAndModals();

  const subtotal = getCartSubtotal();
  const ptsDisc = getPointsDiscountBaht(orderState.redeemPoints);
  const promoEval = evaluateCustomerPromotions();
  const delivInfo = getDeliveryFeeInfo(subtotal);
  const totalDiscount = Math.min(subtotal, promoEval.totalDiscount + ptsDisc);
  const netTotal = Math.max(0, subtotal + delivInfo.fee - totalDiscount);
  const ptName = getDeliveryPointName();

  let billTitle = '';
  let billNote = '';

  if (orderState.orderMode === 'DELIVERY') {
    billTitle = `🛵 ส่ง ${ptName} (${orderState.customerName || 'ลูกค้า'})`;
    billNote = `จุดรับ: ${ptName} | เบอร์โทร: ${orderState.customerPhone || '-'} ${orderState.deliveryNote ? '| หมายเหตุ: ' + orderState.deliveryNote : ''}`;
  } else if (orderState.orderMode === 'DINE_IN') {
    const tblObj = (orderState.data?.tables || []).find(t => t.id === orderState.tableId);
    billTitle = `🍽️ ${tblObj ? tblObj.name : 'โต๊ะ ' + orderState.tableId} (${orderState.customerName || 'ลูกค้า'})`;
    billNote = `ทานที่ร้าน${orderState.customerPhone ? ' | โทร: ' + orderState.customerPhone : ''}${orderState.deliveryNote ? ' | หมายเหตุ: ' + orderState.deliveryNote : ''}`;
  } else {
    // โหมดรับกลับบ้าน (Takeaway) พร้อมช่วงเวลามารับ
    let pickupText = 'มารับทันที (~15 นาที)';
    if (orderState.pickupTimeType === '30M') pickupText = 'อีก 30 นาที';
    else if (orderState.pickupTimeType === '45M') pickupText = 'อีก 45 นาที';
    else if (orderState.pickupTimeType === '60M') pickupText = 'อีก 1 ชั่วโมง';
    else if (orderState.pickupTimeType === 'CUSTOM' && orderState.pickupCustomTime) pickupText = `เวลา ${orderState.pickupCustomTime}`;

    billTitle = `🛍️ รับกลับบ้าน: ${pickupText} (${orderState.customerName || 'ลูกค้า'})`;
    billNote = `เวลามารับ: ${pickupText} | โทร: ${orderState.customerPhone || '-'} ${orderState.deliveryNote ? '| หมายเหตุ: ' + orderState.deliveryNote : ''}`;
  }

  // บันทึกค่าส่งเดลิเวอรี่ขั้นบันไดและโปรโมชั่นลงในหมายเหตุบิล เพื่อให้ระบบหลังบ้านคำนวณยอดสุทธิตรงกัน
  if (orderState.orderMode === 'DELIVERY' && delivInfo.fee > 0) {
    billNote += ` [ค่าส่ง ฿${delivInfo.fee}]`;
  } else if (orderState.orderMode === 'DELIVERY' && delivInfo.fee === 0) {
    billNote += ` [ส่งฟรี]`;
  }
  if (promoEval.appliedList.length > 0) {
    const pNames = promoEval.appliedList.map(p => `${p.name} (-฿${p.amount})`).join(', ');
    billNote += ` | โปรฯ: ${pNames}`;
  }

  const payload = {
    order_type: orderState.orderMode === 'DINE_IN' ? 'DINE_IN' : 'RETAIL',
    table_id: orderState.orderMode === 'DINE_IN' ? orderState.tableId : null,
    bill_title: billTitle,
    bill_note: billNote,
    customer_id: orderState.member?.id || null,
    customer_name: orderState.customerName || (orderState.member?.name || ''),
    payment_method: orderState.paymentMethod,
    discount: totalDiscount,
    delivery_fee: delivInfo.fee,
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
      if (json.data) orderState.data = json.data;
      orderState.activeOrder = {
        id: json.orderId || `ORD-${Date.now().toString().slice(-4)}`,
        title: billTitle,
        netTotal,
        paymentMethod: orderState.paymentMethod,
        orderMode: orderState.orderMode,
        pointName: ptName,
        status: 'OPEN',
        items: [...orderState.cart],
        created_at: new Date().toISOString()
      };
      saveOrderToMyHistory(orderState.activeOrder);
      orderState.cart = [];
      orderState.showCheckoutModal = false;
      orderState.showCartModal = false;
      orderState.isSubmitting = false;
      showOrderToast('✅ ส่งคำสั่งซื้อสำเร็จเรียบร้อยแล้ว!', false);
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
    if (out && out.data) orderState.data = out.data;
    orderState.activeOrder = {
      id: out.orderId || `ORD-${Date.now().toString().slice(-4)}`,
      title: billTitle,
      netTotal,
      paymentMethod: orderState.paymentMethod,
      orderMode: orderState.orderMode,
      pointName: ptName,
      status: 'OPEN',
      items: [...orderState.cart],
      created_at: new Date().toISOString()
    };
    saveOrderToMyHistory(orderState.activeOrder);
    orderState.cart = [];
    orderState.showCheckoutModal = false;
    orderState.showCartModal = false;
    orderState.isSubmitting = false;
    showOrderToast('✅ ส่งคำสั่งซื้อสำเร็จเรียบร้อยแล้ว!', false);
    startLivePolling(orderState.activeOrder.id);
    render();
    return;
  }

  orderState.isSubmitting = false;
  hideOrderToast();
  renderCartAndModals();
}

// Save Order to LocalStorage History (แนวทาง A)
function saveOrderToMyHistory(orderObj) {
  if (!orderObj || !orderObj.id) return;
  try {
    let list = JSON.parse(localStorage.getItem('co_my_orders') || '[]');
    if (!Array.isArray(list)) list = [];
    list = list.filter(o => o.id !== orderObj.id);
    list.unshift({
      id: orderObj.id,
      title: orderObj.title,
      netTotal: orderObj.netTotal,
      orderMode: orderObj.orderMode,
      phone: orderState.customerPhone || '',
      name: orderState.customerName || '',
      pointName: orderObj.pointName || '',
      created_at: orderObj.created_at || new Date().toISOString(),
      items: (orderObj.items || []).map(it => ({
        product_id: it.product_id,
        name: it.product?.name || it.name,
        price: it.product?.price || it.price,
        quantity: it.quantity,
        modifiers: (it.modifiers || []).map(m => m.name || m)
      }))
    });
    if (list.length > 40) list = list.slice(0, 40);
    localStorage.setItem('co_my_orders', JSON.stringify(list));
    if (orderState.customerPhone) {
      localStorage.setItem('co_customer_phone', orderState.customerPhone);
    }
  } catch (err) {
    console.warn('saveOrderToMyHistory error:', err);
  }
}

function startLivePolling(orderId) {
  if (orderState.pollTimer) {
    clearInterval(orderState.pollTimer);
    orderState.pollTimer = null;
  }
  if (!orderId) return;

  const checkStatus = async () => {
    if (document.visibilityState === 'hidden') return;
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
            if (orderState.pollTimer) {
              clearInterval(orderState.pollTimer);
              orderState.pollTimer = null;
            }
          } else if (found.status === 'CANCELLED' || found.status === 'VOIDED') {
            orderState.activeOrder.status = 'CANCELLED';
            if (orderState.pollTimer) {
              clearInterval(orderState.pollTimer);
              orderState.pollTimer = null;
            }
          } else if (kdsItems.some(i => i.kitchen_status === 'COOKING')) {
            orderState.activeOrder.status = 'COOKING';
          } else if (kdsItems.every(i => i.kitchen_status === 'SERVED') && kdsItems.length > 0) {
            orderState.activeOrder.status = 'DELIVERING';
          }
          render();
        }
      }
    } catch {}
  };

  orderState.pollTimer = setInterval(checkStatus, 8500);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && orderState.activeOrder && orderState.activeOrder.id) {
    const isFinished = orderState.activeOrder.status === 'COMPLETED' || orderState.activeOrder.status === 'CANCELLED';
    if (!isFinished && !orderState.pollTimer) {
      startLivePolling(orderState.activeOrder.id);
    }
  }
});

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

function getProductVisualHtml(item) {
  if (item && item.image_url) {
    return `<img src="${item.image_url}" alt="${(item.name || '').replace(/"/g, '&quot;')}" loading="lazy" />`;
  }
  return getSpriteIcon(item);
}

// ==========================================================================
// RENDER VIEWS
// ==========================================================================

function renderPromoShowcaseBanner() {
  const activePromos = getActivePromotions();
  if (activePromos.length === 0) return '';

  return `
    <div class="co-promo-showcase">
      <div class="co-promo-showcase-title">
        <span>🎁 โปรโมชั่นพิเศษ & คูปองวันนี้ (${activePromos.length} รายการ)</span>
        ${orderState.activePromoFilterId ? `
          <button
            type="button"
            style="border:none; background:#ef4444; color:#fff; font-size:11px; font-weight:800; padding:3px 8px; border-radius:6px; cursor:pointer;"
            onclick="orderState.activePromoFilterId=null; render();"
          >
            ✕ ล้างตัวกรองโปรฯ
          </button>
        ` : `<span style="font-size:11px; color:#b45309; font-weight:700;">แตะที่การ์ดเพื่อใช้โปรฯ</span>`}
      </div>
      <div class="co-promo-cards-row">
        ${activePromos.map(pr => {
          const isFiltered = orderState.activePromoFilterId === pr.id;
          const isCodeApplied = pr.type === 'PROMO_CODE' && pr.promo_code && String(orderState.appliedPromoCode || '').toUpperCase() === String(pr.promo_code).toUpperCase();
          return `
            <div
              class="co-promo-card ${isFiltered || isCodeApplied ? 'is-selected' : ''}"
              onclick="handleShowcasePromoClick('${pr.id}')"
            >
              <span class="co-promo-card-tag">${pr.icon || '🔥'} ${pr.badge_text || 'โปรฯ พิเศษ'}</span>
              <div class="co-promo-card-name">${pr.name}</div>
              <div class="co-promo-card-desc">${pr.description || ''}</div>
              <div style="font-size:11px; font-weight:800; color:${isCodeApplied || isFiltered ? '#5eead4' : '#fbbf24'}; margin-top:2px;">
                ${pr.type === 'PROMO_CODE'
                  ? (isCodeApplied ? `✓ ใช้โค้ด ${pr.promo_code} แล้ว` : `🎟️ แตะเพื่อเก็บโค้ด: ${pr.promo_code}`)
                  : (isFiltered ? '✓ กำลังดูสินค้าที่ร่วมรายการ' : '🛒 แตะดูสินค้าที่ร่วมโปรฯ →')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

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

  // บันทึกตำแหน่ง Scroll ปัจจุบันก่อนวาดหน้าจอใหม่ เพื่อไม่ให้หน้าจอกระตุกหรือเด้งขึ้น
  const prevWinY = window.scrollY;
  const prevRoomEl = document.querySelector('.co-room-floor');
  const prevRoomLeft = prevRoomEl ? prevRoomEl.scrollLeft : 0;
  const prevCatPillsEl = document.querySelector('.co-cat-pills');
  const prevCatPillsLeft = prevCatPillsEl ? prevCatPillsEl.scrollLeft : 0;

  const products = orderState.data.products || [];
  const storeCfg = getStoreConfig();

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
        <a href="#" class="co-brand" onclick="event.preventDefault();">
          <div class="co-logo-badge">☕</div>
          <div>
            <div class="co-store-title">ONG CO POS • ร้านค้าและครัวอาหาร</div>
            <div class="co-store-sub">ริมแม่น้ำโขง ตลาดอินโดจีน มุกดาหาร</div>
          </div>
        </a>
        <div class="co-header-actions">
          <button
            type="button"
            class="co-orders-nav-btn"
            onclick="openMyOrdersModal();"
            title="ดูสถานะออเดอร์สดและประวัติการสั่งซื้อ"
          >
            📋 ออเดอร์ของฉัน
          </button>
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
              📋 เมนูด่วน
            </button>
          </div>
        </div>
      </div>
    </header>

    <div class="co-container">
      <!-- Store Closed Banner (แสดงทันทีเมื่อหลังบ้านกดปิดร้าน) -->
      ${!storeCfg.is_open ? `
        <div class="co-store-closed-banner">
          <span style="font-size:26px;">🔴</span>
          <div>
            <div style="font-weight:900; font-size:15px;">ขณะนี้ร้านปิดรับออเดอร์ชั่วคราว (CLOSED)</div>
            <div style="font-size:12.5px; margin-top:2px; opacity:0.95;">${storeCfg.closed_message || 'กรุณาแวะมาสั่งใหม่อีกครั้งในเวลาทำการ ขอบคุณครับ'}</div>
          </div>
        </div>
      ` : ''}

      <!-- Order Mode Selector -->
      ${orderState.isTableLocked ? `
        <!-- Table Mode Locked (สแกน QR โต๊ะมา ล็อคโต๊ะทันที ซ่อนแท็บสลับโหมด) -->
        <div class="co-table-locked-card">
          <div class="co-table-locked-header">
            <div class="co-table-locked-info">
              <span class="co-table-locked-icon">🍽️</span>
              <div>
                <div class="co-table-locked-title">โต๊ะ: ${(orderState.data?.tables || []).find(t => t.id === orderState.tableId)?.name || 'โต๊ะ ' + orderState.tableId}</div>
                <div class="co-table-locked-sub">สั่งอาหารทานที่ร้าน • อาหารจะเสิร์ฟตรงถึงโต๊ะคุณ</div>
              </div>
            </div>
            <button type="button" class="co-table-bill-status-btn" onclick="openTableBillModal()">
              📋 ดูสถานะบิลโต๊ะ
            </button>
          </div>
          <div class="co-table-service-bar">
            <button type="button" class="co-svc-btn" onclick="requestTableService('CALL_STAFF')">
              🔔 เรียกพนักงาน
            </button>
            <button type="button" class="co-svc-btn" onclick="requestTableService('ICE')">
              🧊 ขอน้ำแข็ง
            </button>
            <button type="button" class="co-svc-btn" onclick="requestTableService('CHECKOUT')">
              🧾 ขอเช็คบิล
            </button>
          </div>
        </div>
      ` : `
        <!-- Normal Customer: Only 2 Modes (Delivery & Takeaway) - ซ่อนทานที่ร้าน ป้องกันสั่งแกล้ง -->
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
            data-active="${orderState.orderMode === 'TAKEAWAY'}"
            onclick="orderState.orderMode='TAKEAWAY'; render();"
          >
            <span class="co-mode-icon">🛍️</span>
            <span class="co-mode-title">รับกลับบ้าน</span>
            <span class="co-mode-desc">มารับที่หน้าร้าน</span>
          </div>
        </div>
      `}

      <!-- Mode-specific Sections -->
      ${orderState.orderMode === 'DELIVERY' ? renderDeliverySection() : ''}
      ${orderState.orderMode === 'TAKEAWAY' ? renderTakeawaySection() : ''}
      ${orderState.orderMode === 'DINE_IN' && !orderState.isTableLocked ? renderDineInSection() : ''}

      <!-- Hybrid Promotions Showcase Banner (แนวทาง C) -->
      ${renderPromoShowcaseBanner()}

      <!-- Main Storefront Content (Pixel or List) -->
      <div id="co-storefront-root">
        ${contentHtml}
      </div>
    </div>

    <!-- Sticky Cart Bar -->
    <div id="co-sticky-cart-root">
      ${renderStickyCart()}
    </div>

    <!-- Modals -->
    <div id="co-modals-root">
      ${orderState.foodModalProduct ? renderFoodModifierModal() : ''}
      ${orderState.showCartModal ? renderCartModal() : ''}
      ${orderState.showCheckoutModal ? renderCheckoutModal() : ''}
      ${orderState.showMyOrdersModal ? renderMyOrdersModal() : ''}
      ${orderState.showTableBillModal ? renderTableBillModal() : ''}
    </div>
  `;

  // คืนค่าตำแหน่ง Scroll เดิมทันที
  const nextRoomEl = document.querySelector('.co-room-floor');
  if (nextRoomEl && prevRoomLeft > 0) nextRoomEl.scrollLeft = prevRoomLeft;
  const nextCatPillsEl = document.querySelector('.co-cat-pills');
  if (nextCatPillsEl && prevCatPillsLeft > 0) nextCatPillsEl.scrollLeft = prevCatPillsLeft;
  if (prevWinY > 0) window.scrollTo(0, prevWinY);
}

// Render Delivery Section with Indochina Market Pixel Map (Horizontal: North on Left, South on Right, Mekong River on Top)
function renderDeliverySection() {
  const pts = (orderState.data?.deliveryPoints || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const curPtIndex = pts.findIndex(p => p.id === orderState.selectedDeliveryPointId);
  const curPt = curPtIndex >= 0 ? pts[curPtIndex] : pts[0];
  const mapCfg = orderState.data?.deliveryMapConfig || { orientation: 'HORIZONTAL', river_position: 'TOP', custom_image_url: '', custom_landmarks: [] };
  const customLandmarks = Array.isArray(mapCfg.custom_landmarks) ? mapCfg.custom_landmarks : [];

  return `
    <div class="co-notice-banner">
      <span style="font-size:18px;">📍</span>
      <div>
        <b>บริการส่งด่วนเฉพาะเส้น ตลาดอินโดจีน มุกดาหาร</b>
        <div style="font-size:11px; color:#155e75;">เลือกหมุดจุดรับของบนแผนที่ด้านล่าง ไรเดอร์จะนำส่งถึงจุดที่ใกล้คุณที่สุด (กดซูม 🔍 เพื่อดูชัดๆ บนมือถือได้)</div>
      </div>
    </div>

    <div class="co-map-card">
      <div class="co-map-header">
        <div class="co-map-title">
          <span>🗺️ แผนผังตลาดอินโดจีน มุกดาหาร (เลียบโขง)</span>
        </div>
        <div class="co-map-zoom-tools">
          <button type="button" class="co-zoom-btn" onclick="zoomMap(0.25)" title="ซูมเข้า">🔍 +</button>
          <button type="button" class="co-zoom-btn" onclick="zoomMap(-0.25)" title="ซูมออก">🔍 −</button>
          <button type="button" class="co-zoom-btn" onclick="resetMapZoom()" title="รีเซ็ตขนาดปกติ">↺ <span id="co-zoom-label">${Math.round(orderState.mapZoom * 100)}%</span></button>
        </div>
      </div>

      <!-- Interactive Pixel Map (Horizontal Orientation with Zoom & Free Pan) -->
      <div
        class="co-map-viewport"
        id="co-map-viewport"
        onmousedown="startMapDrag(event)"
      >
        <div
          class="co-map-canvas"
          id="co-map-canvas"
          style="width: ${Math.round(orderState.mapZoom * 100)}%; height: ${Math.round(orderState.mapZoom * 100)}%;"
        >
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

              <!-- 1. Top Section (Y: 0 to 110): แม่น้ำโขง (Mekong River) -->
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

              <!-- 4. City / Buildings / Alleys (Y: 230 to 380) -->
              <rect x="0" y="230" width="1000" height="150" fill="#334155" />

              <!-- North/Left Block: หอเจ้าแม่สองนางพี่น้อง -->
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

              <!-- South/Right Block: Riverfront Hotel -->
              <rect x="818" y="244" width="110" height="110" fill="#1e3a8a" stroke="#1e293b" stroke-width="2" rx="4"/>
              <text x="873" y="290" fill="#bfdbfe" font-size="10" font-family="monospace" font-weight="bold" text-anchor="middle">Riverfront Hotel</text>
              <text x="873" y="306" fill="#93c5fd" font-size="8.5" font-family="monospace" text-anchor="middle">คุ้นคุ้น คิทเช่น</text>

              <!-- Alley 6: ซอยจ่างวาง -->
              <rect x="934" y="230" width="34" height="150" fill="#1e293b"/>
              <text x="951" y="290" fill="#94a3b8" font-size="8.5" font-family="monospace" transform="rotate(90, 951, 290)">ซ.จ่างวาง ▼</text>

              <!-- เข็มทิศ (Compass) -->
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

          <!-- Dynamic Compact Pins (โชว์เฉพาะหมุดตัวเลข ไม่บังรูปและตัวหนังสือ) -->
          ${pts.map((p, idx) => {
            const isSelected = p.id === orderState.selectedDeliveryPointId;
            return `
              <div
                class="co-compact-pin ${isSelected ? 'is-selected' : ''}"
                style="left:${p.map_x}%; top:${p.map_y}%;"
                onclick="selectDeliveryPoint('${p.id}')"
                title="จุดที่ ${idx + 1}: ${p.name}"
              >
                <div class="co-compact-pin-dot">
                  <span class="co-compact-pin-num">${idx + 1}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- สรุปจุดรับที่เลือก (ใต้แผนที่) -->
      <div class="co-selected-point-banner">
        <span class="co-selected-point-tag">📍 จุดที่ ${curPtIndex >= 0 ? curPtIndex + 1 : 1}</span>
        <div style="flex:1;">
          <div style="font-weight:800; font-size:13.5px; color:#0f172a;">${curPt ? curPt.name : '-'}</div>
          ${curPt?.landmark_desc ? `<div style="font-size:11.5px; color:#0284c7; margin-top:2px;">${curPt.landmark_desc}</div>` : ''}
        </div>
      </div>

      <!-- อัตราค่าส่งเดลิเวอรี่แบบขั้นบันได (Tiered Delivery Fee) -->
      ${(function() {
        const delivInfo = getDeliveryFeeInfo();
        if (!delivInfo.tiers || delivInfo.tiers.length === 0) return '';
        return `
          <div style="margin-bottom:14px; padding:10px 12px; background:#f0f9ff; border:1px solid #bae6fd; border-radius:10px;">
            <div style="font-size:12px; font-weight:800; color:#0369a1; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
              <span>🛵 อัตราค่าส่งเดลิเวอรี่ (ขั้นบันไดตามยอดสั่ง):</span>
              ${getCartSubtotal() > 0 ? `<span style="background:#0284c7; color:#fff; padding:2px 8px; border-radius:999px; font-size:11px;">ค่าส่งปัจจุบัน: ${delivInfo.fee === 0 ? 'ส่งฟรี!' : formatMoney(delivInfo.fee)}</span>` : ''}
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
              ${delivInfo.tiers.map(t => {
                const isActive = getCartSubtotal() > 0 && delivInfo.matchedTier && delivInfo.matchedTier.id === t.id;
                const feeTxt = Number(t.fee) === 0 ? 'ส่งฟรี!' : `ค่าส่ง ${formatMoney(t.fee)}`;
                const rangeTxt = t.label || (Number(t.max_amount) >= 99999 ? `฿${t.min_amount} ขึ้นไป` : `฿${t.min_amount}-${t.max_amount}`);
                return `
                  <span style="font-size:11px; font-weight:${isActive ? '800' : '600'}; padding:4px 8px; border-radius:6px; background:${isActive ? '#0284c7' : '#fff'}; color:${isActive ? '#fff' : '#0f172a'}; border:1px solid ${isActive ? '#0284c7' : '#cbd5e1'};">
                    ${rangeTxt}: <b>${feeTxt}</b>
                  </span>
                `;
              }).join('')}
            </div>
          </div>
        `;
      })()}

      <!-- Delivery Contact Form -->
      <div class="co-delivery-form">
        <div class="co-form-group">
          <label class="co-label">จุดส่งของ</label>
          <select
            class="co-select"
            onchange="orderState.selectedDeliveryPointId=this.value; render();"
          >
            ${pts.map((p, idx) => `
              <option value="${p.id}" ${p.id === orderState.selectedDeliveryPointId ? 'selected' : ''}>
                📍 จุดที่ ${idx + 1}: ${p.name} ${p.landmark_desc ? `(${p.landmark_desc})` : ''}
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

// Render Takeaway Section (หน้ารับกลับบ้าน พร้อมเลือกเวลามารับ)
function renderTakeawaySection() {
  const pickupOptions = [
    { type: 'ASAP', label: '⚡ ทันที (~15 นาที)' },
    { type: '30M', label: '🕒 อีก 30 นาที' },
    { type: '45M', label: '🕒 อีก 45 นาที' },
    { type: '60M', label: '🕒 อีก 1 ชั่วโมง' },
    { type: 'CUSTOM', label: '⏰ ระบุเวลาเอง' }
  ];

  return `
    <div class="co-takeaway-card">
      <div class="co-notice-banner" style="background:#fdf4ff; border-color:#f0abfc;">
        <span style="font-size:20px;">🛍️</span>
        <div>
          <b style="color:#86198f;">สั่งล่วงหน้า & มารับที่หน้าร้าน (Takeaway)</b>
          <div style="font-size:11px; color:#a21caf;">สั่งล่วงหน้าตามเวลานัดหมาย ทางร้านจะปรุงสดและแพ็คของไว้ให้พร้อมรับทันทีที่มาถึงหน้าร้าน</div>
        </div>
      </div>

      <div class="co-delivery-form">
        <div class="co-form-group">
          <label class="co-label">⏰ ช่วงเวลาที่จะมารับของ</label>
          <div class="co-pickup-time-pills">
            ${pickupOptions.map(opt => `
              <button
                type="button"
                class="co-pickup-pill"
                data-active="${orderState.pickupTimeType === opt.type}"
                onclick="orderState.pickupTimeType='${opt.type}'; render();"
              >
                ${opt.label}
              </button>
            `).join('')}
          </div>
          ${orderState.pickupTimeType === 'CUSTOM' ? `
            <div style="margin-top:10px; display:flex; align-items:center; gap:8px;">
              <label style="font-size:12px; font-weight:700;">ระบุเวลาที่มารับ:</label>
              <input
                type="time"
                class="co-input"
                style="width:140px; font-weight:700; font-size:14px;"
                value="${orderState.pickupCustomTime || '12:00'}"
                onchange="orderState.pickupCustomTime=this.value;"
              />
            </div>
          ` : ''}
        </div>

        <div class="co-form-group">
          <label class="co-label">เบอร์โทรศัพท์ (จำเป็นสำหรับการติดต่อรับอาหาร & สะสมแต้ม)</label>
          <input
            id="co-input-takeaway-phone"
            type="tel"
            class="co-input"
            placeholder="เช่น 0812345678"
            value="${orderState.customerPhone}"
            oninput="handlePhoneInput(this.value)"
          />
        </div>

        <div class="co-form-group">
          <label class="co-label">ชื่อผู้สั่ง</label>
          <input
            id="co-input-takeaway-name"
            type="text"
            class="co-input"
            placeholder="เช่น คุณเอก / พี่นิด"
            value="${orderState.customerName}"
            oninput="orderState.customerName=this.value;"
          />
        </div>

        <div class="co-form-group">
          <label class="co-label">หมายเหตุเพิ่มเติม (เช่น แยกน้ำแข็ง, ขอช้อนส้อม)</label>
          <input
            id="co-input-takeaway-note"
            type="text"
            class="co-input"
            placeholder="เช่น แยกน้ำแข็ง, ไม่ใส่ผักชี, ขอช้อนส้อม"
            value="${orderState.deliveryNote}"
            oninput="orderState.deliveryNote=this.value;"
          />
        </div>
      </div>

      <div id="co-takeaway-member-badge" style="${orderState.member ? 'display:block;' : 'display:none;'}">
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

  if (spriteType === 'fruit') {
    return `
      <svg viewBox="0 0 240 130" style="width:100%; height:100%;">
        <!-- Wooden Produce Stand -->
        <rect x="15" y="30" width="210" height="90" fill="#78350f" rx="3" stroke="#451a03" stroke-width="2"/>
        <line x1="15" y1="72" x2="225" y2="72" stroke="#92400e" stroke-width="3"/>
        
        <!-- Crate 1: Apples -->
        <rect x="22" y="36" width="58" height="32" fill="#92400e" stroke="#451a03" stroke-width="1.5" rx="2"/>
        <circle cx="34" cy="50" r="6" fill="#ef4444"/>
        <circle cx="48" cy="48" r="6" fill="#ef4444"/>
        <circle cx="62" cy="50" r="6" fill="#ef4444"/>
        <circle cx="41" cy="58" r="6" fill="#dc2626"/>
        <circle cx="55" cy="58" r="6" fill="#dc2626"/>
        
        <!-- Crate 2: Watermelons -->
        <rect x="86" y="36" width="68" height="32" fill="#92400e" stroke="#451a03" stroke-width="1.5" rx="2"/>
        <ellipse cx="102" cy="52" rx="10" ry="8" fill="#16a34a" stroke="#14532d" stroke-width="1"/>
        <line x1="97" y1="46" x2="107" y2="58" stroke="#15803d" stroke-width="1.5"/>
        <ellipse cx="124" cy="52" rx="10" ry="8" fill="#16a34a" stroke="#14532d" stroke-width="1"/>
        <line x1="119" y1="46" x2="129" y2="58" stroke="#15803d" stroke-width="1.5"/>
        <ellipse cx="142" cy="52" rx="8" ry="7" fill="#16a34a"/>
        
        <!-- Crate 3: Bananas -->
        <rect x="160" y="36" width="58" height="32" fill="#92400e" stroke="#451a03" stroke-width="1.5" rx="2"/>
        <path d="M 168 56 Q 176 44 186 52" stroke="#facc15" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M 174 60 Q 182 48 192 56" stroke="#eab308" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M 188 56 Q 196 44 206 52" stroke="#facc15" stroke-width="4" fill="none" stroke-linecap="round"/>
        
        <!-- Bottom Row: Burlap Sack & Oranges -->
        <ellipse cx="46" cy="98" rx="16" ry="14" fill="#d97706" stroke="#b45309" stroke-width="1.5"/>
        <circle cx="42" cy="92" r="3" fill="#92400e"/>
        <circle cx="50" cy="90" r="3" fill="#92400e"/>
        <rect x="76" y="80" width="80" height="34" fill="#92400e" stroke="#451a03" stroke-width="1.5" rx="2"/>
        <circle cx="92" cy="96" r="7" fill="#f97316"/>
        <circle cx="108" cy="94" r="7" fill="#f97316"/>
        <circle cx="124" cy="96" r="7" fill="#f97316"/>
        <circle cx="140" cy="94" r="7" fill="#f97316"/>
        <circle cx="100" cy="104" r="7" fill="#ea580c"/>
        <circle cx="116" cy="104" r="7" fill="#ea580c"/>
        
        <rect x="166" y="78" width="52" height="36" fill="#92400e" stroke="#451a03" stroke-width="1.5" rx="2"/>
        <circle cx="182" cy="96" r="7" fill="#22c55e"/>
        <circle cx="198" cy="96" r="7" fill="#84cc16"/>
        
        <!-- Price Stand Sign -->
        <rect x="95" y="10" width="50" height="18" fill="#fef08a" stroke="#ca8a04" stroke-width="1.5" rx="3"/>
        <text x="120" y="22" fill="#854d0e" font-size="8.5" font-family="'Press Start 2P', monospace" font-weight="bold" text-anchor="middle">FRESH 🍉</text>
      </svg>
    `;
  }

  if (spriteType === 'cashier') {
    return `
      <svg viewBox="0 0 240 130" style="width:100%; height:100%;">
        <!-- Counter Body -->
        <rect x="20" y="44" width="200" height="76" fill="#78350f" rx="3" stroke="#451a03" stroke-width="2"/>
        <rect x="50" y="74" width="140" height="24" fill="#92400e" rx="3" stroke="#451a03" stroke-width="1.5"/>
        <text x="120" y="90" fill="#fef08a" font-size="9" font-family="'Press Start 2P', monospace" font-weight="bold" text-anchor="middle">Good Place</text>
        
        <!-- Classic Red Cash Register -->
        <rect x="36" y="16" width="46" height="34" fill="#ef4444" stroke="#991b1b" stroke-width="2" rx="2"/>
        <rect x="42" y="22" width="34" height="12" fill="#fee2e2"/>
        <rect x="44" y="38" width="8" height="6" fill="#fef08a"/>
        <rect x="56" y="38" width="8" height="6" fill="#fef08a"/>
        <rect x="68" y="38" width="8" height="6" fill="#fef08a"/>
        
        <!-- Cookie / Candy Glass Jar with Blue Lid -->
        <rect x="94" y="20" width="26" height="28" fill="#bae6fd" opacity="0.8" stroke="#0284c7" stroke-width="1.5" rx="3"/>
        <rect x="96" y="16" width="22" height="6" fill="#0284c7" rx="1"/>
        <circle cx="102" cy="30" r="3" fill="#ca8a04"/>
        <circle cx="110" cy="32" r="3" fill="#92400e"/>
        <circle cx="106" cy="40" r="3" fill="#ea580c"/>
        
        <!-- Receipt Pad & Box -->
        <rect x="130" y="32" width="22" height="14" fill="#fef3c7" stroke="#d97706" stroke-width="1"/>
        <rect x="162" y="24" width="38" height="24" fill="#b45309" stroke="#78350f" stroke-width="1.5" rx="2"/>
        <line x1="162" y1="34" x2="200" y2="34" stroke="#fde047" stroke-width="2"/>
      </svg>
    `;
  }

  if (spriteType === 'cooler') {
    return `
      <svg viewBox="0 0 240 130" style="width:100%; height:100%;">
        <rect x="20" y="30" width="200" height="90" fill="#334155" rx="4" stroke="#1e293b" stroke-width="2"/>
        <polygon points="25,36 215,36 205,74 35,74" fill="#38bdf8" opacity="0.4" stroke="#0284c7" stroke-width="2"/>
        <rect x="40" y="44" width="30" height="16" fill="#f87171" rx="2"/>
        <rect x="80" y="44" width="30" height="16" fill="#fbbf24" rx="2"/>
        <rect x="120" y="44" width="30" height="16" fill="#34d399" rx="2"/>
        <rect x="160" y="44" width="30" height="16" fill="#60a5fa" rx="2"/>
        <rect x="25" y="78" width="190" height="38" fill="#1e293b" rx="2"/>
        <text x="120" y="102" fill="#93c5fd" font-size="9" font-family="'Press Start 2P', monospace" font-weight="bold" text-anchor="middle">FRESH COOLER ❄</text>
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
            onclick="exitStoreZone()"
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
              onclick="orderState.activeZoneCategory='ALL'; renderStorefrontOnly();"
            >
              ทั้งหมด (${zoneAllProds.length})
            </button>
            ${assignedCats.map(c => `
              <button
                type="button"
                class="co-pill"
                data-active="${orderState.activeZoneCategory === c.id}"
                onclick="orderState.activeZoneCategory='${c.id}'; renderStorefrontOnly();"
              >
                ${c.name.split('(')[0].trim()} (${c.count})
              </button>
            `).join('')}
          </div>
        ` : ''}

        <!-- Zone Products Showcase (Pixel Shelves) -->
        <div class="co-pixel-modules">
          <div class="co-pixel-zone">
            <div class="${(curZone.type || curZone.zone_type) === 'CHILLER' ? 'co-cooler-case' : ((curZone.type || curZone.zone_type) === 'KITCHEN' ? 'co-kitchen-case' : 'co-shelf-case')}">
              <div class="co-cooler-shelf" data-total-prods="${displayedProds.length}" onscroll="handleShelfScroll(this)">
                ${displayedProds.length === 0 ? `
                  <div style="grid-column: 1 / -1; text-align:center; padding:40px 16px; color:#94a3b8;">
                    <div style="font-size:32px; margin-bottom:8px;">📦</div>
                    <div style="font-weight:700; font-size:14px;">ยังไม่มีสินค้าในหมวดหมู่นี้</div>
                    <div style="font-size:11.5px; margin-top:2px;">สามารถตั้งค่าหมวดหมู่สินค้าของจุดนี้ได้จากระบบหลังบ้าน</div>
                  </div>
                ` : displayedProds.map(p => {
                  const isFood = p.item_type === 'FOOD';
                  const isOutOfStock = !isFood && p.track_stock && (p.stock_qty <= 0);
                  const inCartQty = getProductQtyInCart(p.id);
                  const promoBadges = getProductPromoBadges(p);

                  return `
                    <div
                      class="co-pixel-item"
                      style="${isOutOfStock ? 'opacity:0.65;' : ''}"
                      onclick="${isOutOfStock ? `alert('สินค้านี้หมดชั่วคราว');` : `addToCartById('${p.id}')`}"
                    >
                      ${promoBadges.length > 0 ? `<span class="co-prod-promo-badge">${promoBadges[0]}</span>` : ''}
                      <span class="co-prod-qty-badge" data-prod-qty-badge="${p.id}" style="display:${inCartQty > 0 ? 'inline-block' : 'none'};">
                        ${inCartQty > 0 ? `✓ ${inCartQty} ในตะกร้า` : ''}
                      </span>
                      <div class="co-item-sprite">${getProductVisualHtml(p)}</div>
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
                        ${isOutOfStock ? 'สินค้าหมด' : (isFood ? '+ สั่งจานนี้' : '+ หยิบใส่ตะกร้า')}
                      </button>
                    </div>
                  `;
                }).join('')}
              </div>
              ${displayedProds.length > 8 ? `
                <div data-shelf-hint style="text-align:center; padding:8px 12px; background:rgba(15,23,42,0.9); border-top:1px solid #334155; font-size:11.5px; color:#38bdf8; font-weight:700; transition:color 0.2s;">
                  ⬇️ เลื่อนลงเพื่อดูสินค้าเพิ่มเติม (ทั้งหมด ${displayedProds.length} รายการ)
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ========================================================================
  // VIEW B: VIRTUAL STOREFRONT HALL & RPG PIXEL ROOM (หน้าโถงร้านเสมือนจริงแบบรูปที่ 2)
  // ========================================================================
  const COLS = 6;
  const ROWS = 4;
  const cellOccupancy = {};

  activeZones.forEach((zone, idx) => {
    let r = Math.max(1, Math.min(ROWS, Number(zone.grid_row) || Math.min(ROWS, Math.floor(idx / 3) + 1)));
    let c = Math.max(1, Math.min(COLS, Number(zone.grid_col) || (((idx % 3) * 2) + 1)));
    let span = Math.max(1, Math.min(2, Number(zone.col_span) || 1));
    if (c + span - 1 > COLS) c = COLS - span + 1;

    const canFit = (tr, tc, tspan) => {
      if (tc + tspan - 1 > COLS) return false;
      for (let s = 0; s < tspan; s++) {
        if (cellOccupancy[`${tr},${tc + s}`]) return false;
      }
      return true;
    };

    let placed = false;
    if (canFit(r, c, span)) {
      placed = true;
    } else {
      for (let tr = 1; tr <= ROWS && !placed; tr++) {
        for (let tc = 1; tc <= COLS && !placed; tc++) {
          if (canFit(tr, tc, span)) {
            r = tr;
            c = tc;
            placed = true;
          } else if (span > 1 && canFit(tr, tc, 1)) {
            r = tr;
            c = tc;
            span = 1;
            placed = true;
          }
        }
      }
    }

    if (placed) {
      cellOccupancy[`${r},${c}`] = { isStart: true, zone, span };
      for (let s = 1; s < span; s++) {
        cellOccupancy[`${r},${c + s}`] = { isCovered: true };
      }
    }
  });

  let roomCellsHtml = '';
  for (let r = 1; r <= ROWS; r++) {
    for (let c = 1; c <= COLS; c++) {
      const occ = cellOccupancy[`${r},${c}`];
      if (occ) {
        if (occ.isStart) {
          const z = occ.zone;
          const zProds = getZoneProducts(z);
          roomCellsHtml += `
            <div
              class="co-room-slot co-room-fixture"
              style="grid-column:${c} / span ${occ.span}; grid-row:${r};"
              onclick="enterStoreZone('${z.id}')"
              title="คลิกเพื่อเดินไปดูสินค้าที่ ${z.name}"
            >
              <!-- Floating Retro Name Plate with Icon & Item Count -->
              <div class="co-fixture-plate">
                <span class="co-plate-icon">${z.icon || '🏪'}</span>
                <span class="co-plate-name">${z.name.split('(')[0].trim()}</span>
                <span class="co-plate-count">${zProds.length} ชิ้น</span>
              </div>

              <!-- Pixel Sprite Artwork -->
              <div class="co-fixture-sprite">
                ${renderStoreZonePixelSprite(z.pixel_sprite || 'chiller', z.custom_image_url || '')}
              </div>

              <!-- Floor Shadow -->
              <div class="co-fixture-shadow"></div>
            </div>
          `;
        }
      } else {
        roomCellsHtml += `
          <div class="co-room-slot co-room-empty" style="grid-column:${c}; grid-row:${r};"></div>
        `;
      }
    }
  }

  return `
    <div class="co-pixel-storefront">
      <!-- Retro Awning Roof -->
      <div class="co-storefront-roof"></div>

      <!-- Store Sign -->
      <div class="co-storefront-sign">
        <div class="co-pixel-title">★ ONG CO PIXEL STOREFRONT ★</div>
        <span class="co-open-sign ${getStoreConfig().is_open ? '' : 'is-closed'}">
          ${getStoreConfig().is_open ? '● OPEN พร้อมรับออเดอร์' : '● CLOSED ร้านปิดชั่วคราว'}
        </span>
      </div>

      <!-- Notice Banner & View Switcher -->
      <div class="co-pixel-hall-banner">
        <div>
          <div class="co-pixel-hall-title">
            <span>🏪</span>
            <span>ผังห้องร้านค้าเสมือนจริง (Interactive Pixel Store)</span>
          </div>
          <div class="co-pixel-hall-subtitle">
            แตะเลือก <b>ตู้แช่, ชั้นวางสินค้า, บาร์น้ำ หรือครัว</b> ในผังห้องเพื่อเดินดูสินค้าภายในจุดนั้นๆ
          </div>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
          <button
            type="button"
            class="co-view-btn"
            style="${orderState.storefrontView !== 'CARDS' ? 'background:#f59e0b; color:#0f172a; font-weight:800; border-color:#f59e0b;' : 'background:#334155; color:#fff;'}"
            onclick="orderState.storefrontView='ROOM'; render();"
          >
            🏪 ผังห้องร้าน
          </button>
          <button
            type="button"
            class="co-view-btn"
            style="${orderState.storefrontView === 'CARDS' ? 'background:#f59e0b; color:#0f172a; font-weight:800; border-color:#f59e0b;' : 'background:#334155; color:#fff;'}"
            onclick="orderState.storefrontView='CARDS'; render();"
          >
            🗂️ การ์ดตู้
          </button>
          <button
            type="button"
            class="co-view-btn"
            style="background:#0d9488; color:#fff; border-color:#0d9488;"
            onclick="orderState.viewMode='LIST'; render();"
          >
            🔍 ค้นหาด่วน
          </button>
        </div>
      </div>

      ${orderState.storefrontView !== 'CARDS' ? `
        <!-- VIEW 1: RPG PIXEL STORE ROOM FLOOR PLAN (แบบรูปที่ 2) -->
        <div class="co-pixel-room-wrap">
          <!-- Upper Wood Wall with Clock & Staff Door -->
          <div class="co-room-wall">
            <div class="co-room-wall-title">
              <span>🏠</span>
              <span>ONG CO CONVENIENCE & KITCHEN</span>
            </div>
            <div class="co-room-wall-decor">
              <div class="co-room-clock" title="เปิดบริการทุกวัน">🕒</div>
              <div class="co-room-staff-door" title="ห้องสต็อกสินค้าหลังร้าน">STAFF 🚪</div>
            </div>
          </div>

          <!-- Checkerboard Tiled Floor Grid (6 cols x 4 rows) -->
          <div class="co-room-floor">
            <div class="co-room-grid">
              ${roomCellsHtml}
            </div>
          </div>
        </div>
      ` : `
        <!-- VIEW 2: Grid of Store Zone Cards -->
        <div class="co-pixel-hall-grid">
          ${activeZones.map(zone => {
            const zoneProds = getZoneProducts(zone);
            const assignedCatNames = (zone.category_ids || []).map(cid => catMap.get(cid) || cid);

            return `
              <div
                class="co-zone-card"
                onclick="enterStoreZone('${zone.id}')"
              >
                <!-- Zone Pixel Art Visual -->
                <div class="co-zone-visual">
                  ${renderStoreZonePixelSprite(zone.pixel_sprite || 'chiller', zone.custom_image_url || '')}
                  
                  <div class="co-zone-badge-type">
                    <span>${zone.icon || '🏪'}</span>
                    <span>${zone.type === 'CHILLER' ? 'ตู้แช่เย็น' : (zone.type === 'KITCHEN' ? 'ครัวอาหาร' : (zone.type === 'BAR' ? 'บาร์เครื่องดื่ม' : (zone.type === 'FRUIT' ? 'ของสด' : 'ชั้นวางสินค้า')))}</span>
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
      `}
    </div>
  `;
}

// ==========================================================================
// STANDARD LIST VIEW (รายการเมนูด่วน)
// ==========================================================================
function renderListView(products) {
  const cats = orderState.data?.categories || [];
  let filtered = products;

  if (orderState.activePromoFilterId) {
    const promo = getActivePromotions().find(p => p.id === orderState.activePromoFilterId);
    if (promo) {
      filtered = filtered.filter(p => {
        if (promo.type === 'COMBO_SET') {
          return isProductInListOrCat(p, promo.combo_group_a_products, promo.combo_group_a_categories) ||
                 isProductInListOrCat(p, promo.combo_group_b_products, promo.combo_group_b_categories);
        }
        return isProductInListOrCat(p, promo.target_products, promo.target_categories);
      });
    }
  }

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
          id="co-search-input"
          type="text"
          class="co-search-input"
          placeholder="ค้นหาชื่ออาหาร, เครื่องดื่ม, ขนม, ของชำ..."
          value="${orderState.searchQuery}"
          oninput="orderState.searchQuery=this.value; renderStorefrontOnly();"
        />
      </div>

      <!-- Category Filter Pills -->
      <div class="co-cat-pills">
        <button
          type="button"
          class="co-pill"
          data-active="${orderState.activeCategory === 'ALL'}"
          onclick="orderState.activeCategory='ALL'; renderStorefrontOnly();"
        >
          ทั้งหมด
        </button>
        ${cats.map(c => `
          <button
            type="button"
            class="co-pill"
            data-active="${orderState.activeCategory === c.id}"
            onclick="orderState.activeCategory='${c.id}'; renderStorefrontOnly();"
          >
            ${c.name}
          </button>
        `).join('')}
      </div>

      <!-- Products Grid -->
      <div class="co-product-grid">
        ${filtered.map(p => {
          const inCartQty = getProductQtyInCart(p.id);
          const promoBadges = getProductPromoBadges(p);
          return `
            <div class="co-prod-card" onclick="addToCartById('${p.id}')" style="cursor:pointer;">
              ${promoBadges.length > 0 ? `<span class="co-prod-promo-badge">${promoBadges[0]}</span>` : ''}
              <span class="co-prod-qty-badge" data-prod-qty-badge="${p.id}" style="display:${inCartQty > 0 ? 'inline-block' : 'none'};">
                ${inCartQty > 0 ? `✓ ${inCartQty} ในตะกร้า` : ''}
              </span>
              <div>
                <div class="co-prod-icon">${getProductVisualHtml(p)}</div>
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
                  onclick="event.stopPropagation(); addToCartById('${p.id}')"
                >
                  +
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
// STICKY BOTTOM CART BAR
// ==========================================================================
function renderStickyCart() {
  const count = getCartCount();
  const subtotal = getCartSubtotal();
  const netTotal = getCartNetTotal();
  const promoEval = evaluateCustomerPromotions();
  const delivInfo = getDeliveryFeeInfo(subtotal);
  const storeCfg = getStoreConfig();

  return `
    <div class="co-sticky-cart">
      <div class="co-cart-inner">
        <div class="co-cart-summary" onclick="orderState.showCartModal=true; renderCartAndModals();">
          <div class="co-cart-badge">
            🛒
            ${count > 0 ? `<span class="co-cart-count">${count}</span>` : ''}
          </div>
          <div class="co-cart-price-block">
            <span class="co-cart-label">
              ${count} รายการในตะกร้า ${promoEval.totalDiscount > 0 ? `<b style="color:#4ade80;">(ลด -${formatMoney(promoEval.totalDiscount)})</b>` : ''}
            </span>
            <span class="co-cart-total">
              ${formatMoney(count > 0 ? netTotal : 0)}
              ${count > 0 && orderState.orderMode === 'DELIVERY' ? `<span style="font-size:11px; color:#bae6fd; font-weight:600;"> (รวมค่าส่ง ${delivInfo.fee === 0 ? 'ฟรี' : formatMoney(delivInfo.fee)})</span>` : ''}
            </span>
          </div>
        </div>

        <button
          type="button"
          class="co-checkout-btn"
          style="${!storeCfg.is_open ? 'background:#ef4444;' : ''}"
          ${count === 0 || !storeCfg.is_open ? 'disabled' : ''}
          onclick="orderState.showCheckoutModal=true; renderCartAndModals();"
        >
          <span>${!storeCfg.is_open ? '🔴 ร้านปิดชั่วคราว' : 'สั่งสินค้า & ชำระเงิน'}</span>
          <span>${!storeCfg.is_open ? '' : '➔'}</span>
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
    <div class="co-modal-backdrop" onclick="if(event.target===this){orderState.foodModalProduct=null; renderCartAndModals();}">
      <div class="co-modal">
        <div class="co-modal-header">
          <div style="display:flex; align-items:center; gap:10px;">
            ${p.image_url ? `<img src="${p.image_url}" alt="" style="width:48px; height:48px; object-fit:cover; border-radius:8px; border:1px solid var(--co-border);" />` : ''}
            <div>
              <div style="font-size:11px; color:#0d9488; font-weight:800;">CUSTOMIZE DISH • เลือกตัวเลือกพิเศษ</div>
              <h3 style="margin:2px 0 0; font-size:17px;">${p.name}</h3>
              <div style="font-size:13px; color:var(--co-muted);">ราคาพื้นฐาน: ${formatMoney(p.price)}</div>
            </div>
          </div>
          <button type="button" class="co-close-btn" onclick="orderState.foodModalProduct=null; renderCartAndModals();">✕</button>
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
                      onclick="toggleModifierSelection('${grp.id}', '${m.id}', ${isSingle})"
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
              onclick="orderState.foodModalQty = Math.max(1, orderState.foodModalQty - 1); renderCartAndModals();"
            >-</button>
            <b style="font-size:15px; width:24px; text-align:center;">${orderState.foodModalQty}</b>
            <button
              type="button"
              class="co-add-btn"
              style="width:30px; height:30px;"
              onclick="orderState.foodModalQty++; renderCartAndModals();"
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
  const groupedCart = groupCustomerOrderItems(orderState.cart);
  const totalCartQty = getCartCount();

  return `
    <div class="co-modal-backdrop" onclick="if(event.target===this){orderState.showCartModal=false; renderCartAndModals();}">
      <div class="co-modal">
        <div class="co-modal-header">
          <div>
            <div class="co-label" style="color:#0d9488;">MY CART</div>
            <h3 style="margin:2px 0 0; font-size:17px;">🛒 ตะกร้าสินค้าของคุณ (${groupedCart.length} รายการ • รวม ${totalCartQty} ชิ้น)</h3>
          </div>
          <button type="button" class="co-close-btn" onclick="orderState.showCartModal=false; renderCartAndModals();">✕</button>
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
                <div style="padding:10px 12px; background:#f8fafc; border:1px solid var(--co-border); border-radius:10px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                  <div style="display:flex; align-items:center; gap:8px;">
                    ${it.image_url ? `<img src="${it.image_url}" alt="" style="width:40px; height:40px; object-fit:cover; border-radius:6px; border:1px solid var(--co-border); flex-shrink:0;" />` : ''}
                    <div>
                      <div style="font-weight:700; font-size:13px;">${it.name} <span style="color:#0d9488; font-weight:800;">× ${it.quantity}</span></div>
                      ${modList ? `<div style="font-size:11px; color:#0d9488;">+ ${modList}</div>` : ''}
                      ${it.special_instructions ? `<div style="font-size:10.5px; color:#b45309;">📝 ${it.special_instructions}</div>` : ''}
                      <div style="font-size:12px; font-weight:800; color:#0f3238; margin-top:2px;">${formatMoney(lineTotal)}</div>
                    </div>
                  </div>
                  <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                    <button type="button" class="co-add-btn" style="width:26px; height:26px; font-size:13px; background:#e2e8f0; color:#0f172a;" onclick="updateCartQty(${idx}, -1)">-</button>
                    <b style="font-size:13px; width:18px; text-align:center;">${it.quantity}</b>
                    <button type="button" class="co-add-btn" style="width:26px; height:26px; font-size:13px;" onclick="updateCartQty(${idx}, 1)">+</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          ${renderPromoAndFeeSummary(subtotal, false)}

          <button
            type="button"
            class="co-checkout-btn"
            style="width:100%; justify-content:center; ${!getStoreConfig().is_open ? 'background:#ef4444;' : ''}"
            ${!getStoreConfig().is_open ? 'disabled' : ''}
            onclick="orderState.showCartModal=false; orderState.showCheckoutModal=true; renderCartAndModals();"
          >
            ${!getStoreConfig().is_open ? '🔴 ร้านปิดรับออเดอร์ชั่วคราว' : 'ไปที่หน้าชำระเงิน ➔'}
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
  const groupedCart = groupCustomerOrderItems(orderState.cart);
  const totalCartQty = groupedCart.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

  return `
    <div class="co-modal-backdrop" onclick="if(event.target===this){orderState.showCheckoutModal=false; renderCartAndModals();}">
      <div class="co-modal">
        <div class="co-modal-header">
          <div>
            <div class="co-label" style="color:#0d9488;">CHECKOUT & PAYMENT</div>
            <h3 style="margin:2px 0 0; font-size:17px;">💳 ชำระเงิน & ยืนยันคำสั่งซื้อ</h3>
          </div>
          <button type="button" class="co-close-btn" onclick="orderState.showCheckoutModal=false; renderCartAndModals();">✕</button>
        </div>

        <!-- กล่องสรุปรวมจำนวนรายการที่สั่งเพื่อรีเช็คก่อนยืนยัน -->
        <div style="background:#f8fafc; border:1px solid var(--co-border); border-radius:12px; padding:10px 12px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; font-weight:800; color:var(--co-ink); margin-bottom:6px; padding-bottom:4px; border-bottom:1px dashed var(--co-border);">
            <span>📋 สรุปรายการที่สั่ง (${groupedCart.length} รายการ)</span>
            <span style="color:#0d9488;">รวม ${totalCartQty} ชิ้น/จาน</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:5px; max-height:140px; overflow-y:auto;">
            ${groupedCart.map((it, idx) => `
              <div style="display:flex; justify-content:space-between; align-items:center; font-size:12.5px; gap:8px;">
                <span style="flex:1;">
                  ${idx + 1}. <b>${it.name}</b>
                  ${it.modifiers && it.modifiers.length > 0 ? `<small style="color:#0d9488;"> (+${it.modifiers.join(', ')})</small>` : ''}
                </span>
                <span style="background:#ccfbf1; color:#0f766e; font-weight:800; font-size:11.5px; padding:1px 7px; border-radius:999px;">× ${it.quantity}</span>
                <b style="min-width:52px; text-align:right;">${formatMoney(it.unit_price * it.quantity)}</b>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Loyalty Points Redemption Block (ห้ามใช้ซ้อนกับโปรโมชั่น) -->
        ${m ? `
          <div style="background:#fef3c7; border:1px solid #fde68a; border-radius:12px; padding:12px; margin-bottom:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; gap:8px; flex-wrap:wrap;">
              <div>
                <b style="font-size:13px;">⭐ สมาชิก: ${m.name}</b>
                <div style="font-size:11px; color:#b45309;">แต้มคงเหลือ: ${m.points} แต้ม (เลือกใช้แต้ม หรือ โปรโมชั่น อย่างใดอย่างหนึ่ง)</div>
              </div>
              <div style="display:flex; gap:6px;">
                ${orderState.redeemPoints > 0 ? `
                  <button
                    type="button"
                    style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:800; cursor:pointer;"
                    onclick="selectCustomerPointsRedeem(0)"
                  >
                    ยกเลิกใช้แต้ม (กลับไปใช้โปรฯ)
                  </button>
                ` : `
                  <button
                    type="button"
                    style="background:#b45309; color:#fff; border:none; padding:5px 10px; border-radius:6px; font-size:11px; font-weight:800; cursor:pointer;"
                    onclick="selectCustomerPointsRedeem(Math.min(${m.points}, Math.floor(${subtotal} * 4)))"
                  >
                    ใช้แต้มลดแทนโปรฯ
                  </button>
                `}
              </div>
            </div>
            ${orderState.redeemPoints > 0 ? `
              <div style="display:flex; justify-content:space-between; font-size:12px; color:#b45309; font-weight:800; padding-top:4px; border-top:1px dashed #fde68a;">
                <span>✓ เลือกใช้แต้มสะสม ${orderState.redeemPoints} แต้ม (ปิดโปรโมชั่นอื่น)</span>
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
              onclick="orderState.paymentMethod='QR_PROMPTPAY'; renderCartAndModals();"
            >
              <span style="font-size:22px;">📱</span>
              <span class="co-mode-title">สแกนจ่ายทันที</span>
              <span class="co-mode-desc">QR PromptPay</span>
            </button>
            <button
              type="button"
              class="co-mode-tab"
              data-active="${orderState.paymentMethod === 'CASH'}"
              onclick="orderState.paymentMethod='CASH'; renderCartAndModals();"
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

        <!-- Promo Code, Upsell Hints & Price Breakdown -->
        ${renderPromoAndFeeSummary(subtotal, true)}

        <button
          type="button"
          class="co-checkout-btn"
          style="width:100%; justify-content:center; padding:12px; ${!getStoreConfig().is_open ? 'background:#ef4444;' : ''}"
          ${orderState.isSubmitting || !getStoreConfig().is_open ? 'disabled' : ''}
          onclick="submitOrder()"
        >
          ${!getStoreConfig().is_open ? '🔴 ร้านปิดรับออเดอร์ชั่วคราว' : (orderState.isSubmitting ? '⏳ กำลังส่งคำสั่งซื้อ... กรุณารอสักครู่' : '✓ ยืนยันคำสั่งซื้อ')}
        </button>
      </div>
    </div>
  `;
}

// สรุปโปรโมชั่น / โค้ดส่วนลด / ค่าส่งขั้นบันได / ส่วนลดแต้ม (ใช้ทั้งในตะกร้าและหน้าชำระเงิน)
function renderPromoAndFeeSummary(subtotal, isCheckout) {
  const promoEval = evaluateCustomerPromotions();
  const delivInfo = getDeliveryFeeInfo(subtotal);
  const ptsDisc = isCheckout ? getPointsDiscountBaht(orderState.redeemPoints) : 0;
  const netTotal = Math.max(0, subtotal + delivInfo.fee - promoEval.totalDiscount - ptsDisc);
  const hints = [...promoEval.upsellHints];
  if (delivInfo.hint && delivInfo.fee > 0) hints.unshift(delivInfo.hint);
  const safeCode = String(orderState.promoCodeInput || '').replace(/"/g, '&quot;');

  return `
    ${hints.length > 0 ? `
      <div class="co-upsell-box">
        ${hints.slice(0, 3).map(h => `<div>${h}</div>`).join('')}
      </div>
    ` : ''}

    ${promoEval.eligibleList && promoEval.eligibleList.length > 0 ? `
      <div class="co-applied-promo-box">
        <div style="font-weight:800; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
          <span>🎁 โปรโมชั่นที่เข้าเกณฑ์ (${promoEval.eligibleList.length > 1 ? 'เลือกใช้ได้ 1 โปรฯ เท่านั้น' : 'ใช้สิทธิ์ได้ 1 โปรฯ ไม่ซ้อนกับแต้มลด'}):</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${promoEval.eligibleList.map(p => {
            const isChosen = promoEval.chosenPromo && promoEval.chosenPromo.id === p.id;
            return `
              <label
                style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:7px 10px; border-radius:8px; background:${isChosen ? '#dcfce7' : '#ffffff'}; border:1.5px solid ${isChosen ? '#16a34a' : '#cbd5e1'}; cursor:pointer;"
                onclick="selectCustomerPromotion('${p.id}')"
              >
                <div style="display:flex; align-items:center; gap:6px; font-weight:${isChosen ? '800' : '600'}; color:#0f172a;">
                  <input type="radio" name="co_promo_choice" ${isChosen ? 'checked' : ''} style="accent-color:#0d9488;" />
                  <span>${p.icon} ${p.name}</span>
                </div>
                <b style="white-space:nowrap; color:${isChosen ? '#15803d' : '#64748b'};">-${formatMoney(p.amount)}</b>
              </label>
            `;
          }).join('')}
        </div>
        ${orderState.redeemPoints > 0 ? `
          <div style="font-size:11px; color:#b45309; font-weight:700; margin-top:6px;">
            ⚠️ ขณะนี้คุณเลือกใช้แต้มสะสมลดราคาอยู่ (แตะเลือกโปรโมชั่นด้านบนหากต้องการเปลี่ยนมาใช้โปรฯ แทนแต้ม)
          </div>
        ` : ''}
      </div>
    ` : ''}

    <!-- Promo Code Input -->
    <div style="margin-bottom:12px;">
      <div class="co-label" style="margin-bottom:4px;">🎟️ โค้ดส่วนลด (ถ้ามี)</div>
      <div style="display:flex; gap:8px;">
        <input
          id="co-promo-code-input"
          type="text"
          class="co-input"
          style="flex:1; min-width:0; text-transform:uppercase;"
          placeholder="เช่น ONGCO20"
          value="${safeCode}"
          oninput="orderState.promoCodeInput=this.value;"
          onkeydown="if(event.key==='Enter') applyCustomerPromoCode(this.value);"
        />
        ${orderState.appliedPromoCode ? `
          <button type="button" style="flex-shrink:0; border:none; background:#fee2e2; color:#b91c1c; font-weight:800; padding:0 12px; border-radius:10px; cursor:pointer;" onclick="applyCustomerPromoCode('')">ลบโค้ด</button>
        ` : `
          <button type="button" style="flex-shrink:0; border:none; background:#0f3238; color:#fff; font-weight:800; padding:0 14px; border-radius:10px; cursor:pointer;" onclick="applyCustomerPromoCode(document.getElementById('co-promo-code-input').value)">ใช้โค้ด</button>
        `}
      </div>
      ${promoEval.codeError ? `<div style="font-size:11.5px; color:#dc2626; font-weight:700; margin-top:4px;">⚠️ ${promoEval.codeError}</div>` : ''}
    </div>

    <!-- Price Breakdown -->
    <div style="background:#f8fafc; border:1px solid var(--co-border); border-radius:10px; padding:10px 14px; margin-bottom:16px;">
      <div style="display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:4px;">
        <span style="color:var(--co-muted);">ยอดรวมสินค้า:</span>
        <span>${formatMoney(subtotal)}</span>
      </div>
      ${orderState.orderMode === 'DELIVERY' ? `
        <div style="display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:4px;">
          <span style="color:var(--co-muted);">🛵 ค่าส่งเดลิเวอรี่${delivInfo.matchedTier?.label ? ` (${delivInfo.matchedTier.label})` : ''}:</span>
          <span style="${delivInfo.fee === 0 ? 'color:#16a34a; font-weight:800;' : ''}">${delivInfo.fee === 0 ? 'ส่งฟรี!' : '+' + formatMoney(delivInfo.fee)}</span>
        </div>
      ` : ''}
      ${promoEval.totalDiscount > 0 ? `
        <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#ef4444; margin-bottom:4px;">
          <span>🎁 ส่วนลดโปรโมชั่น:</span>
          <span>-${formatMoney(promoEval.totalDiscount)}</span>
        </div>
      ` : ''}
      ${ptsDisc > 0 ? `
        <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#ef4444; margin-bottom:4px;">
          <span>⭐ ส่วนลดแต้มสะสม:</span>
          <span>-${formatMoney(ptsDisc)}</span>
        </div>
      ` : ''}
      <div style="display:flex; justify-content:space-between; font-size:15px; font-weight:800; border-top:1px solid var(--co-border); padding-top:6px; margin-top:4px;">
        <span>${isCheckout ? 'ยอดสุทธิที่ต้องชำระ:' : 'ยอดสุทธิโดยประมาณ:'}</span>
        <span style="color:#0d9488;">${formatMoney(netTotal)}</span>
      </div>
    </div>
  `;
}

// ==========================================================================
// LIVE ORDER TRACKER VIEW (ติดตามสถานะออเดอร์สด)
// ==========================================================================
function renderLiveTrackerView() {
  const ord = orderState.activeOrder;
  const isDone = ord.status === 'COMPLETED' || ord.status === 'PAID';
  const isDelivering = ord.status === 'DELIVERING';
  const isCooking = ord.status === 'COOKING';
  const isPending = !isDone && !isDelivering && !isCooking;

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
        <div class="co-header-actions">
          <button
            type="button"
            class="co-orders-nav-btn"
            onclick="openMyOrdersModal();"
          >
            📋 ออเดอร์ของฉัน
          </button>
        </div>
      </div>
    </header>

    <div class="co-container" style="max-width:600px;">
      <div style="background:#fff; border:1.5px solid var(--co-border); border-radius:16px; padding:20px; box-shadow:var(--co-shadow); text-align:center;">
        <div style="font-size:42px; margin-bottom:8px;">
          ${isDone ? '🎉' : (isDelivering ? '🛵' : (isCooking ? '🍳' : '⏳'))}
        </div>
        <h2 style="font-size:20px; font-weight:800; margin-bottom:4px;">
          ${isDone ? 'ชำระเงิน / จัดส่งสำเร็จเรียบร้อยแล้ว!' : (isDelivering ? 'อาหารพร้อมเสิร์ฟ / กำลังนำส่งถึงคุณ!' : (isCooking ? 'ครัวกำลังปรุงอาหารอย่างพิถีพิถัน' : 'กำลังดำเนินการ (บิลยังเปิดอยู่)'))}
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
            <span class="co-step-label">เสิร์ฟ/นำส่ง</span>
          </div>

          <div class="co-tracker-step" data-active="${isDone}" data-done="${isDone}">
            <div class="co-step-dot">4</div>
            <span class="co-step-label">เช็คบิลสำเร็จ</span>
          </div>
        </div>

        <!-- Order Items Summary Card -->
        <div style="background:#f8fafc; border:1px solid var(--co-border); border-radius:12px; padding:14px; text-align:left; margin:20px 0;">
          ${(function() {
            const groupedOrdItems = groupCustomerOrderItems(ord.items || []);
            const totalOrdQty = groupedOrdItems.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
            return `
              <div style="display:flex; justify-content:space-between; align-items:center; font-weight:700; font-size:13px; margin-bottom:8px; color:var(--co-ink);">
                <span>รายการในคำสั่งซื้อ (${groupedOrdItems.length} รายการ):</span>
                <span style="color:#0d9488;">รวม ${totalOrdQty} ชิ้น/จาน</span>
              </div>
              ${groupedOrdItems.map(it => `
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:12.5px; margin-bottom:4px;">
                  <span>• ${it.name}${it.modifiers?.length ? ` (+${it.modifiers.join(', ')})` : ''} <b style="color:#0d9488;">× ${it.quantity}</b></span>
                  <span style="font-weight:700;">${formatMoney(it.unit_price * it.quantity)}</span>
                </div>
              `).join('')}
            `;
          })()}
          <div style="border-top:1px dashed var(--co-border); margin-top:8px; padding-top:8px; display:flex; justify-content:space-between; font-weight:800; font-size:14px;">
            <span>ยอดชำระ (${ord.paymentMethod === 'QR_PROMPTPAY' ? 'สแกน QR' : 'เงินสด'}):</span>
            <span style="color:#0d9488;">${formatMoney(ord.netTotal)}</span>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <button
            type="button"
            class="co-checkout-btn"
            style="width:100%; justify-content:center; background:#0284c7;"
            onclick="openMyOrdersModal();"
          >
            📋 ดูออเดอร์ทั้งหมด
          </button>
          <button
            type="button"
            class="co-checkout-btn"
            style="width:100%; justify-content:center; background:#0f3238;"
            onclick="orderState.activeOrder=null; if(orderState.pollTimer) clearInterval(orderState.pollTimer); render();"
          >
            + สั่งออเดอร์เพิ่ม
          </button>
        </div>
      </div>
    </div>

    <div id="co-modals-root">
      ${orderState.showMyOrdersModal ? renderMyOrdersModal() : ''}
      ${orderState.showTableBillModal ? renderTableBillModal() : ''}
    </div>
  `;
}

// ==========================================================================
// TABLE SERVICE ACTIONS & MAP ZOOM / PAN CONTROLS
// ==========================================================================

let mapDragState = { isDown: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0, moved: false };

function startMapDrag(e) {
  const vp = document.getElementById('co-map-viewport');
  if (!vp) return;
  if (e.button !== undefined && e.button !== 0) return;
  mapDragState.isDown = true;
  mapDragState.moved = false;
  mapDragState.startX = e.clientX;
  mapDragState.startY = e.clientY;
  mapDragState.scrollLeft = vp.scrollLeft;
  mapDragState.scrollTop = vp.scrollTop;
  vp.classList.add('is-dragging');

  const onMove = (ev) => {
    if (!mapDragState.isDown) return;
    const dx = ev.clientX - mapDragState.startX;
    const dy = ev.clientY - mapDragState.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      mapDragState.moved = true;
    }
    vp.scrollLeft = mapDragState.scrollLeft - dx;
    vp.scrollTop = mapDragState.scrollTop - dy;
  };

  const onUp = () => {
    mapDragState.isDown = false;
    vp.classList.remove('is-dragging');
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function zoomMap(delta) {
  const prevZoom = orderState.mapZoom || 1.0;
  const next = Math.max(1.0, Math.min(3.0, Math.round((prevZoom + delta) * 100) / 100));
  orderState.mapZoom = next;

  const vp = document.getElementById('co-map-viewport');
  const canvas = document.getElementById('co-map-canvas');
  if (canvas && vp) {
    // Preserve the center point while zooming
    const centerRatioX = (vp.scrollLeft + vp.clientWidth / 2) / (canvas.offsetWidth || vp.clientWidth);
    const centerRatioY = (vp.scrollTop + vp.clientHeight / 2) / (canvas.offsetHeight || vp.clientHeight);

    canvas.style.width = `${Math.round(next * 100)}%`;
    canvas.style.height = `${Math.round(next * 100)}%`;

    requestAnimationFrame(() => {
      vp.scrollLeft = Math.max(0, centerRatioX * canvas.offsetWidth - vp.clientWidth / 2);
      vp.scrollTop = Math.max(0, centerRatioY * canvas.offsetHeight - vp.clientHeight / 2);
    });
  }
  const label = document.getElementById('co-zoom-label');
  if (label) label.textContent = `${Math.round(next * 100)}%`;
}

function resetMapZoom() {
  orderState.mapZoom = 1.0;
  const vp = document.getElementById('co-map-viewport');
  const canvas = document.getElementById('co-map-canvas');
  if (canvas) {
    canvas.style.width = '100%';
    canvas.style.height = '100%';
  }
  if (vp) {
    vp.scrollLeft = 0;
    vp.scrollTop = 0;
  }
  const label = document.getElementById('co-zoom-label');
  if (label) label.textContent = '100%';
}

function selectDeliveryPoint(id) {
  if (mapDragState.moved) {
    mapDragState.moved = false;
    return;
  }
  orderState.selectedDeliveryPointId = id;
  render();
}

async function requestTableService(type) {
  if (!orderState.tableId) {
    alert('กรุณาระบุโต๊ะของคุณก่อนทำรายการ');
    return;
  }
  const labelMap = {
    CALL_STAFF: '🔔 เรียกพนักงาน',
    ICE: '🧊 ขอน้ำแข็ง',
    CHECKOUT: '🧾 ขอเช็คบิล'
  };
  const label = labelMap[type] || '🔔 บริการ';
  const tblObj = (orderState.data?.tables || []).find(t => t.id === orderState.tableId);
  const tblName = tblObj ? tblObj.name : `โต๊ะ ${orderState.tableId}`;

  if (!confirm(`ยืนยันการส่งคำขอ "${label}" สำหรับ ${tblName} ไปยังพนักงานร้าน?`)) return;

  showOrderToast(`กำลังส่งคำขอ "${label}" ไปยังพนักงาน...`, true);
  try {
    const res = await fetch('/api/tables/service-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table_id: orderState.tableId,
        request_type: type,
        note: ''
      })
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json && json.success) {
      showOrderToast(`✓ ส่งคำขอ "${label}" ให้ ${tblName} เรียบร้อยแล้ว`, false);
      return;
    }
  } catch {}

  if (window.LocalPosEngine) {
    window.LocalPosEngine.callTableService({
      table_id: orderState.tableId,
      request_type: type,
      note: ''
    });
    showOrderToast(`✓ ส่งคำขอ "${label}" ให้ ${tblName} เรียบร้อยแล้ว`, false);
  } else {
    hideOrderToast();
  }
}

// ==========================================================================
// TABLE BILL STATUS MODAL
// ==========================================================================

async function openTableBillModal() {
  if (!orderState.tableId) {
    alert('กรุณาเลือกโต๊ะก่อนดูสถานะบิล');
    return;
  }
  orderState.showTableBillModal = true;
  orderState.tableBillData = null;
  renderModalsOnly();

  try {
    const res = await fetch(`/api/customer/orders?table_id=${encodeURIComponent(orderState.tableId)}&_t=${Date.now()}`);
    const json = await res.json().catch(() => null);
    if (res.ok && json && Array.isArray(json.orders)) {
      // เลือกบิลที่ยังเปิดอยู่ (OPEN) ก่อน ถ้าไม่มีค่อยเอาบิลล่าสุด
      const openBill = json.orders.find(o => o.status !== 'PAID' && o.status !== 'CANCELLED' && o.status !== 'VOIDED');
      orderState.tableBillData = openBill || json.orders[0] || null;
      renderModalsOnly();
      return;
    }
  } catch {}

  const tbl = (orderState.data?.tables || []).find(t => t.id === orderState.tableId);
  if (tbl && tbl.active_order) {
    orderState.tableBillData = tbl.active_order;
  }
  renderModalsOnly();
}

function closeTableBillModal() {
  orderState.showTableBillModal = false;
  renderModalsOnly();
}

function renderTableBillModal() {
  const tblObj = (orderState.data?.tables || []).find(t => t.id === orderState.tableId);
  const tblName = tblObj ? tblObj.name : `โต๊ะ ${orderState.tableId}`;
  const bill = orderState.tableBillData;
  const items = bill?.items || [];
  const activeItems = items.filter(i => i.item_status === 'ACTIVE' || !i.item_status);
  const groupedItems = groupCustomerOrderItems(activeItems);
  const totalQty = groupedItems.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);
  const subtotal = activeItems.reduce((sum, it) => sum + (Number(it.unit_price || it.price || 0) * (it.quantity || 1)), 0);

  return `
    <div class="co-modal-backdrop" onclick="if(event.target===this) closeTableBillModal();">
      <div class="co-modal" style="max-width:480px;">
        <div class="co-modal-header">
          <div>
            <div style="font-size:11px; font-weight:700; color:#0d9488; text-transform:uppercase; letter-spacing:0.5px;">TABLE BILL STATUS</div>
            <h3 style="margin:2px 0 0; font-size:18px; font-weight:800; color:var(--co-ink);">🍽️ สถานะบิล: ${tblName}</h3>
          </div>
          <button type="button" class="co-close-btn" onclick="closeTableBillModal();">✕</button>
        </div>

        <div class="co-modal-body">
          ${!bill ? `
            <div style="text-align:center; padding:40px 16px; color:var(--co-muted);">
              <div style="font-size:40px; margin-bottom:8px;">🍽️</div>
              <div style="font-weight:700; font-size:15px; color:var(--co-ink);">ยังไม่มีบิลที่เปิดอยู่สำหรับ ${tblName}</div>
              <div style="font-size:12.5px; margin-top:4px;">เลือกสั่งอาหารหรือเครื่องดื่มจากเมนูด้านล่าง แล้วอาหารจะเสิร์ฟตรงถึงโต๊ะคุณ</div>
            </div>
          ` : `
            <div style="background:#f8fafc; border:1px solid var(--co-border); border-radius:12px; padding:12px 14px; margin-bottom:14px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; font-size:12px; color:var(--co-muted);">
                <span>เลขบิล: <b>${bill.id}</b></span>
                <span class="co-status-pill ${bill.status === 'PAID' ? 'is-paid' : 'is-pending'}">
                  ${bill.status === 'PAID' ? '✅ เช็คบิลชำระแล้ว' : '⏳ กำลังดำเนินการ (ยังไม่เช็คบิล)'}
                </span>
              </div>
              <div style="font-size:12px; color:var(--co-muted);">
                🕒 สั่งเมื่อ: ${new Date(bill.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
              </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px; font-weight:800; margin-bottom:8px; color:var(--co-ink);">
              <span>รายการที่สั่ง (${groupedItems.length} รายการ):</span>
              <span style="color:#0d9488; background:#ccfbf1; padding:2px 8px; border-radius:999px; font-size:12px;">รวมทั้งหมด ${totalQty} ชิ้น/จาน</span>
            </div>

            <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
              ${groupedItems.map((it, idx) => {
                const kStatus = it.kitchen_status;
                let kLabel = '⏳ ได้รับออเดอร์';
                let kColor = '#0284c7';
                let kBg = '#e0f2fe';
                if (it.served_qty > 0 && it.served_qty < it.quantity) {
                  kLabel = `🍽️ เสิร์ฟแล้ว ${it.served_qty}/${it.quantity}`;
                  kColor = '#d97706';
                  kBg = '#fef3c7';
                } else if (kStatus === 'COOKING') {
                  kLabel = '🍳 กำลังปรุง';
                  kColor = '#d97706';
                  kBg = '#fef3c7';
                } else if (kStatus === 'SERVED') {
                  kLabel = '🍽️ เสิร์ฟแล้ว';
                  kColor = '#16a34a';
                  kBg = '#dcfce7';
                }
                const price = Number(it.unit_price || it.price || 0) * (it.quantity || 1);

                return `
                  <div style="background:#fff; border:1px solid var(--co-border); border-radius:10px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                    <div style="flex:1;">
                      <div style="font-weight:700; font-size:13.5px; color:var(--co-ink);">
                        ${idx + 1}. ${it.product_name || it.name} <span style="color:#0d9488; font-weight:800;">× ${it.quantity}</span>
                        ${it.merged_count > 1 ? `<small style="color:var(--co-muted); font-weight:600; font-size:11px;"> (รวม ${it.merged_count} รอบ)</small>` : ''}
                      </div>
                      ${it.modifiers && it.modifiers.length > 0 ? `
                        <div style="font-size:11px; color:#d97706; margin-top:2px;">+ ${it.modifiers.join(', ')}</div>
                      ` : ''}
                    </div>
                    <div style="text-align:right; flex-shrink:0;">
                      <div style="font-weight:800; font-size:13.5px; color:#0f172a;">${formatMoney(price)}</div>
                      <span style="font-size:10px; font-weight:700; color:${kColor}; background:${kBg}; padding:2px 6px; border-radius:4px; display:inline-block; margin-top:2px;">
                        ${kLabel}
                      </span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            <div style="background:#f0fdf4; border:1.5px solid #86efac; border-radius:12px; padding:12px 14px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:800; font-size:14px; color:#166534;">ยอดรวมปัจจุบัน:</span>
              <span style="font-weight:900; font-size:20px; color:#15803d;">${formatMoney(bill.net_total || bill.total_amount || subtotal)}</span>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
              <button type="button" class="co-svc-btn" onclick="requestTableService('ICE')">
                🧊 ขอน้ำแข็ง
              </button>
              <button type="button" class="co-svc-btn" onclick="requestTableService('CALL_STAFF')">
                🔔 เรียกพนักงาน
              </button>
            </div>

            <button
              type="button"
              class="co-checkout-btn"
              style="width:100%; justify-content:center; background:#0f3238; font-size:15px; padding:12px;"
              onclick="requestTableService('CHECKOUT')"
            >
              🧾 ขอเช็คบิล / ชำระเงิน
            </button>
          `}
        </div>
      </div>
    </div>
  `;
}

// ==========================================================================
// MY ORDERS MODAL (แนวทาง A: ดูสถานะออเดอร์สด & ประวัติการสั่งซื้อ)
// ==========================================================================

async function openMyOrdersModal() {
  orderState.showMyOrdersModal = true;
  if (!orderState.myOrdersSearchPhone) {
    orderState.myOrdersSearchPhone = orderState.customerPhone || localStorage.getItem('co_customer_phone') || '';
  }
  renderModalsOnly();

  // อัปเดตสถานะบิลล่าสุดจากระบบหลังบ้านแบบอัตโนมัติทันทีที่เปิดหน้าต่าง
  await refreshMyOrdersLiveStatus();
}

async function refreshMyOrdersLiveStatus() {
  try {
    const res = await fetch(`/api/bootstrap?_t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const freshData = await res.json().catch(() => null);
      if (freshData && Array.isArray(freshData.allBills)) {
        orderState.data = freshData;
      }
    }
  } catch {}
  if (orderState.showMyOrdersModal) {
    renderModalsOnly();
  }
}

function closeMyOrdersModal() {
  orderState.showMyOrdersModal = false;
  renderModalsOnly();
}

async function searchCustomerOrders(phone) {
  const clean = String(phone || '').replace(/\D/g, '');
  if (clean.length < 6) {
    alert('กรุณากรอกเบอร์โทรศัพท์อย่างน้อย 6-10 หลักเพื่อค้นหา');
    return;
  }
  orderState.myOrdersSearchPhone = clean;
  orderState.isSearchingOrders = true;
  renderModalsOnly();

  showOrderToast('กำลังค้นหาประวัติคำสั่งซื้อ...', true);
  try {
    const res = await fetch(`/api/customer/orders?phone=${encodeURIComponent(clean)}&_t=${Date.now()}`);
    const json = await res.json().catch(() => null);
    if (res.ok && json && Array.isArray(json.orders)) {
      orderState.searchedOrders = json.orders;
      orderState.isSearchingOrders = false;
      hideOrderToast();
      renderModalsOnly();
      return;
    }
  } catch {}

  if (window.LocalPosEngine) {
    orderState.searchedOrders = window.LocalPosEngine.getCustomerOrders(clean);
  }
  orderState.isSearchingOrders = false;
  hideOrderToast();
  renderModalsOnly();
}

function getMyStoredOrders() {
  try {
    const raw = localStorage.getItem('co_my_orders');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// รวมออเดอร์ในเครื่อง + ซิงค์สถานะสดกับบิลจริงในระบบ (allBills)
// กฎสำคัญ: ถ้ายังไม่มีการเช็คบิล (status !== 'PAID' และไม่ได้ยกเลิก) จะถือว่าบิลนั้นยังดำเนินการอยู่เสมอ!
function getResolvedMyOrders() {
  const allBills = orderState.data?.allBills || [];
  const billMap = new Map(allBills.map(b => [b.id, b]));
  const storedOrders = getMyStoredOrders();
  const baseList = orderState.searchedOrders !== null ? orderState.searchedOrders : storedOrders;

  const mergedMap = new Map();

  // 1. นำออเดอร์จากรายการที่ค้นหาหรือที่บันทึกไว้ในเครื่องมาอัปเดตสถานะสดจาก allBills
  baseList.forEach(ord => {
    const live = billMap.get(ord.id);
    if (live) {
      mergedMap.set(ord.id, {
        ...ord,
        ...live,
        status: live.status || 'OPEN',
        bill_title: live.bill_title || ord.bill_title || ord.title,
        net_total: live.net_total ?? live.total_amount ?? ord.net_total ?? ord.netTotal,
        items: (Array.isArray(live.items) && live.items.length > 0) ? live.items : (ord.items || [])
      });
    } else {
      mergedMap.set(ord.id, {
        ...ord,
        status: ord.status || 'OPEN'
      });
    }
  });

  // 2. หากไม่ได้อยู่ในโหมดค้นหาเบอร์อื่น ให้ดึงบิลที่เปิดอยู่ของโต๊ะนี้ (กรณีสแกน QR โต๊ะ) หรือบิลที่ตรงกับเบอร์โทรลูกค้ามารวมด้วยอัตโนมัติ
  if (orderState.searchedOrders === null) {
    const myPhone = (orderState.customerPhone || localStorage.getItem('co_customer_phone') || '').replace(/\D/g, '');
    allBills.forEach(b => {
      if (mergedMap.has(b.id)) return;
      const matchTable = orderState.isTableLocked && orderState.tableId && b.table_id === orderState.tableId;
      const matchPhone = myPhone.length >= 8 && (
        String(b.customer_name || '').includes(myPhone) ||
        String(b.bill_note || '').includes(myPhone) ||
        String(b.bill_title || '').includes(myPhone)
      );
      if (matchTable || matchPhone) {
        mergedMap.set(b.id, {
          ...b,
          status: b.status || 'OPEN'
        });
      }
    });
  }

  return Array.from(mergedMap.values()).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

function reorderPastOrder(orderId) {
  const allResolved = getResolvedMyOrders();
  const target = allResolved.find(o => o.id === orderId);
  if (!target || !target.items || target.items.length === 0) {
    alert('ไม่พบรายการอาหารในคำสั่งซื้อนี้');
    return;
  }

  const allProds = orderState.data?.products || [];
  let addedCount = 0;
  target.items.forEach(it => {
    const pid = it.product_id;
    const prod = allProds.find(p => p.id === pid || p.name === (it.product_name || it.name));
    if (prod) {
      const qty = Number(it.quantity) || 1;
      const existing = orderState.cart.find(c => c.product_id === prod.id && (!c.modifiers || c.modifiers.length === 0) && !c.special_instructions);
      if (existing) {
        existing.quantity += qty;
      } else {
        orderState.cart.push({
          product_id: prod.id,
          name: prod.name,
          unit_price: prod.price,
          image_url: prod.image_url || '',
          item_type: prod.item_type,
          quantity: qty,
          modifiers: [],
          special_instructions: ''
        });
      }
      addedCount += qty;
    }
  });

  if (addedCount > 0) {
    closeMyOrdersModal();
    orderState.showCartModal = true;
    render();
    showOrderToast(`✓ นำสินค้า ${addedCount} ชิ้น ใส่ตะกร้าเรียบร้อยแล้ว`, false);
  } else {
    alert('สินค้าในคำสั่งซื้อเดิมไม่พร้อมให้บริการในขณะนี้');
  }
}

function renderMyOrdersModal() {
  const displayOrders = getResolvedMyOrders();

  // กฎเหล็ก: ถ้ายังไม่มีการเช็คบิล (status ไม่ใช่ PAID / COMPLETED / CANCELLED / VOIDED) ถือว่าบิลนั้นยังดำเนินการอยู่เสมอ!
  const isOrderClosed = (o) => {
    const st = String(o.status || 'OPEN').toUpperCase();
    return st === 'PAID' || st === 'COMPLETED' || st === 'CANCELLED' || st === 'VOIDED';
  };

  const activeOrders = displayOrders.filter(o => !isOrderClosed(o));
  const pastOrders = displayOrders.filter(o => isOrderClosed(o));

  return `
    <div class="co-modal-backdrop" onclick="if(event.target===this) closeMyOrdersModal();">
      <div class="co-modal" style="max-width:540px;">
        <div class="co-modal-header">
          <div>
            <div style="font-size:11px; font-weight:700; color:#0d9488; text-transform:uppercase; letter-spacing:0.5px;">ORDER TRACKING & HISTORY</div>
            <h3 style="margin:2px 0 0; font-size:18px; font-weight:800; color:var(--co-ink);">📋 ออเดอร์ของฉัน</h3>
          </div>
          <button
            type="button"
            class="co-close-btn"
            style="width:34px; height:34px; border-radius:8px; background:#f1f5f9; color:#0f172a; font-weight:900; display:flex; align-items:center; justify-content:center;"
            onclick="closeMyOrdersModal();"
            title="ปิดหน้าต่าง"
          >✕</button>
        </div>

        <div class="co-modal-body">
          <!-- Search Phone Box (แก้ไขขนาดช่องกรอกให้กว้างเต็มพื้นที่ ไม่โดนปุ่มเบียด) -->
          <div style="background:#f8fafc; border:1px solid var(--co-border); border-radius:12px; padding:12px; margin-bottom:14px;">
            <label style="font-size:12px; font-weight:700; color:#334155; display:block; margin-bottom:8px;">
              🔍 ค้นหาออเดอร์ด้วยเบอร์โทรศัพท์ (สั่งจากเครื่องอื่น / เช็คสถานะบิล):
            </label>
            <div class="co-orders-search-row">
              <input
                type="tel"
                id="co-orders-search-input"
                class="co-orders-phone-input"
                placeholder="กรอกเบอร์โทร เช่น 0812345678"
                value="${orderState.myOrdersSearchPhone || ''}"
                oninput="orderState.myOrdersSearchPhone = this.value;"
                onkeydown="if(event.key==='Enter') searchCustomerOrders(this.value);"
              />
              <button
                type="button"
                class="co-orders-search-btn"
                onclick="searchCustomerOrders(document.getElementById('co-orders-search-input').value);"
              >
                ${orderState.isSearchingOrders ? '⏳ ค้นหา...' : '🔍 ค้นหา'}
              </button>
            </div>
            ${orderState.searchedOrders !== null ? `
              <div style="font-size:12px; color:#0d9488; font-weight:700; margin-top:8px; display:flex; justify-content:space-between; align-items:center;">
                <span>✓ ผลการค้นหาเบอร์ ${orderState.myOrdersSearchPhone}: พบ ${orderState.searchedOrders.length} ออเดอร์</span>
                <button type="button" style="border:none; background:#fee2e2; color:#b91c1c; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;" onclick="orderState.searchedOrders=null; renderModalsOnly();">✕ ล้างตัวกรอง</button>
              </div>
            ` : ''}
          </div>

          <!-- Tab Selector: Active Orders vs Past History -->
          <div style="display:flex; border-bottom:2px solid var(--co-border); margin-bottom:14px;">
            <button
              type="button"
              style="flex:1; padding:10px; font-size:13.5px; font-weight:800; border:none; background:none; cursor:pointer; border-bottom:3px solid ${orderState.myOrdersTab === 'ACTIVE' ? '#0d9488' : 'transparent'}; color:${orderState.myOrdersTab === 'ACTIVE' ? '#0d9488' : 'var(--co-muted)'};"
              onclick="orderState.myOrdersTab='ACTIVE'; renderModalsOnly();"
            >
              ⏳ กำลังดำเนินการ (${activeOrders.length})
            </button>
            <button
              type="button"
              style="flex:1; padding:10px; font-size:13.5px; font-weight:800; border:none; background:none; cursor:pointer; border-bottom:3px solid ${orderState.myOrdersTab === 'HISTORY' ? '#0d9488' : 'transparent'}; color:${orderState.myOrdersTab === 'HISTORY' ? '#0d9488' : 'var(--co-muted)'};"
              onclick="orderState.myOrdersTab='HISTORY'; renderModalsOnly();"
            >
              📜 ประวัติที่เช็คบิลแล้ว (${pastOrders.length})
            </button>
          </div>

          <!-- Orders List -->
          ${(function() {
            const list = orderState.myOrdersTab === 'ACTIVE' ? activeOrders : pastOrders;
            if (list.length === 0) {
              return `
                <div style="text-align:center; padding:36px 16px; color:var(--co-muted);">
                  <div style="font-size:36px; margin-bottom:8px;">📦</div>
                  <div style="font-weight:700; font-size:14px; color:var(--co-ink);">
                    ${orderState.myOrdersTab === 'ACTIVE' ? 'ไม่มีออเดอร์ที่กำลังดำเนินการ' : 'ยังไม่มีประวัติที่เช็คบิลแล้ว'}
                  </div>
                  <div style="font-size:12px; margin-top:4px;">
                    ${orderState.myOrdersTab === 'ACTIVE' ? 'บิลที่ยังไม่ได้เช็คบิลจะแสดงสถานะขั้นตอนการปรุงและจัดส่งสดๆ ที่นี่' : 'เมื่อพนักงานเช็คบิลเรียบร้อยแล้ว รายการจะย้ายมาเก็บไว้ที่หน้าประวัตินี้ครับ'}
                  </div>
                </div>
              `;
            }

            return `
              <div style="display:flex; flex-direction:column; gap:12px;">
                ${list.map(ord => {
                  const items = (ord.items || []).filter(i => i.item_status !== 'VOIDED');
                  const isDone = isOrderClosed(ord);
                  const foodItems = items.filter(i => i.item_type === 'FOOD' || i.kitchen_status);
                  const allFoodServed = foodItems.length > 0 && foodItems.every(i => i.kitchen_status === 'SERVED');
                  const anyFoodCooking = foodItems.some(i => i.kitchen_status === 'COOKING' || i.kitchen_status === 'SERVED');

                  const isDelivering = !isDone && (ord.status === 'DELIVERING' || allFoodServed);
                  const isCooking = !isDone && !isDelivering && (ord.status === 'COOKING' || anyFoodCooking);

                  let badgeLabel = '⏳ กำลังดำเนินการ (ยังไม่เช็คบิล)';
                  if (isDone) {
                    badgeLabel = ord.status === 'CANCELLED' || ord.status === 'VOIDED' ? '❌ ยกเลิกบิล' : '✅ เช็คบิลชำระแล้ว';
                  } else if (isDelivering) {
                    badgeLabel = '🛵 เสิร์ฟครบ / พร้อมส่ง (รอเช็คบิล)';
                  } else if (isCooking) {
                    badgeLabel = '🍳 กำลังปรุงอาหาร (ยังไม่เช็คบิล)';
                  }

                  return `
                    <div style="background:#fff; border:1.5px solid ${isDone ? 'var(--co-border)' : '#99f6e4'}; border-radius:12px; padding:12px 14px; box-shadow:0 2px 6px rgba(0,0,0,0.04);">
                      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px; flex-wrap:wrap; gap:6px;">
                        <div>
                          <div style="font-weight:800; font-size:14px; color:var(--co-ink);">${ord.bill_title || ord.title || `ออเดอร์ #${ord.id}`}</div>
                          <div style="font-size:11px; color:var(--co-muted);">
                            🕒 ${new Date(ord.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })} • เลขบิล: ${ord.id}
                          </div>
                        </div>
                        <span class="co-status-pill ${isDone ? ((ord.status === 'CANCELLED' || ord.status === 'VOIDED') ? 'is-cancelled' : 'is-paid') : 'is-pending'}">
                          ${badgeLabel}
                        </span>
                      </div>

                      ${!isDone ? `
                        <!-- Step Tracker Indicator -->
                        <div class="co-tracker-steps" style="margin:12px 0 10px;">
                          <div class="co-tracker-line"></div>
                          <div class="co-tracker-step" data-active="true" data-done="${isCooking || isDelivering || isDone}">
                            <div class="co-step-dot">1</div>
                            <span class="co-step-label">รับออเดอร์</span>
                          </div>
                          <div class="co-tracker-step" data-active="${isCooking || isDelivering || isDone}" data-done="${isDelivering || isDone}">
                            <div class="co-step-dot">2</div>
                            <span class="co-step-label">กำลังปรุง</span>
                          </div>
                          <div class="co-tracker-step" data-active="${isDelivering || isDone}" data-done="${isDone}">
                            <div class="co-step-dot">3</div>
                            <span class="co-step-label">เสิร์ฟ/นำส่ง</span>
                          </div>
                          <div class="co-tracker-step" data-active="${isDone}" data-done="${isDone}">
                            <div class="co-step-dot">4</div>
                            <span class="co-step-label">เช็คบิลแล้ว</span>
                          </div>
                        </div>
                      ` : ''}

                      <!-- Item List Summary (รวมจำนวนสินค้าหรือเมนูที่เหมือนกันให้อัตโนมัติ) -->
                      <div style="background:#f8fafc; border-radius:8px; padding:8px 10px; margin:8px 0; font-size:12px;">
                        ${(function() {
                          const groupedOrdItems = groupCustomerOrderItems(items);
                          const totalOrdQty = groupedOrdItems.reduce((s, i) => s + (Number(i.quantity) || 1), 0);
                          return `
                            <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; font-weight:700; color:var(--co-muted); margin-bottom:5px; padding-bottom:4px; border-bottom:1px dashed var(--co-border);">
                              <span>รายการที่สั่ง (${groupedOrdItems.length} รายการ)</span>
                              <span style="color:#0d9488;">รวม ${totalOrdQty} ชิ้น/จาน</span>
                            </div>
                            ${groupedOrdItems.map(it => {
                              const kSt = it.kitchen_status === 'SERVED'
                                ? ' <span style="color:#16a34a; font-weight:700;">(เสิร์ฟแล้ว)</span>'
                                : (it.kitchen_status === 'COOKING' ? ' <span style="color:#d97706; font-weight:700;">(กำลังปรุง)</span>' : '');
                              const mods = it.modifiers && it.modifiers.length > 0 ? ` (+${it.modifiers.join(', ')})` : '';
                              return `
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; gap:6px;">
                                  <span style="flex:1;">• ${it.product_name || it.name}${mods} <b style="color:#0d9488;">× ${it.quantity}</b>${it.merged_count > 1 ? ` <small style="color:var(--co-muted);">(รวม ${it.merged_count} รอบ)</small>` : ''}${!isDone ? kSt : ''}</span>
                                  <span style="font-weight:700; flex-shrink:0;">${formatMoney(Number(it.unit_price || it.price || 0) * (it.quantity || 1))}</span>
                                </div>
                              `;
                            }).join('')}
                          `;
                        })()}
                      </div>

                      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; padding-top:6px; border-top:1px dashed var(--co-border);">
                        <div>
                          <span style="font-size:12px; color:var(--co-muted);">ยอดสุทธิ: </span>
                          <b style="font-size:15px; color:#0d9488;">${formatMoney(ord.net_total || ord.total_amount || ord.netTotal)}</b>
                        </div>
                        <div style="display:flex; gap:6px;">
                          ${isDone ? `
                            <button
                              type="button"
                              style="padding:6px 14px; font-size:12px; font-weight:800; color:#fff; background:#0f3238; border:none; border-radius:8px; cursor:pointer;"
                              onclick="reorderPastOrder('${ord.id}')"
                            >
                              🔄 สั่งซ้ำบิลนี้
                            </button>
                          ` : `
                            <button
                              type="button"
                              style="padding:6px 12px; font-size:12px; font-weight:800; color:#fff; background:#0284c7; border:none; border-radius:8px; cursor:pointer;"
                              onclick="refreshMyOrdersLiveStatus();"
                            >
                              🔄 รีเฟรชสถานะสด
                            </button>
                          `}
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            `;
          })()}
        </div>
      </div>
    </div>
  `;
}

// อัปเดตข้อความแถบแจ้งเตือนเมื่อเลื่อนดูสินค้าในตู้จนครบ
function handleShelfScroll(el) {
  if (!el) return;
  const hintEl = el.nextElementSibling;
  if (!hintEl || !hintEl.hasAttribute('data-shelf-hint')) return;
  const isBottom = (el.scrollTop + el.clientHeight) >= (el.scrollHeight - 6);
  const total = el.getAttribute('data-total-prods') || '';
  if (isBottom) {
    hintEl.innerHTML = `✅ ครบทุก ${total} รายการแล้ว • เลื่อนลงต่อเพื่อดูส่วนถัดไปของหน้าเว็บ ⬇️`;
    hintEl.style.color = '#4ade80';
  } else {
    hintEl.innerHTML = `⬇️ เลื่อนลงเพื่อดูสินค้าเพิ่มเติม (ทั้งหมด ${total} รายการ)`;
    hintEl.style.color = '#38bdf8';
  }
}

// ==========================================================================
// SMART TOUCH & SCROLL CHAINING FOR COOLER SHELVES (แนวทางที่ 1)
// ป้องกันการติดกับดักเลื่อนจอ (Scroll Trap) โดยเฉพาะสำหรับผู้สูงอายุ:
// เมื่อเลื่อนนิ้วในตู้จนสุดก้นตู้ หรือสุดบนตู้ จะส่งแรงเลื่อนต่อให้หน้าเว็บหลักทันที
// ==========================================================================
(function initShelfScrollChaining() {
  let touchY = 0;
  let touchX = 0;
  let activeShelf = null;

  document.addEventListener('touchstart', (e) => {
    if (!e.touches || e.touches.length !== 1) {
      activeShelf = null;
      return;
    }
    const shelf = e.target.closest('.co-cooler-shelf');
    if (shelf) {
      activeShelf = shelf;
      touchY = e.touches[0].clientY;
      touchX = e.touches[0].clientX;
    } else {
      activeShelf = null;
    }
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!activeShelf || !e.touches || e.touches.length !== 1) return;

    const curY = e.touches[0].clientY;
    const curX = e.touches[0].clientX;
    const dy = touchY - curY;
    const dx = touchX - curX;

    // ละเว้นการปัดในแนวนอน (Horizontal swipe)
    if (Math.abs(dx) > Math.abs(dy)) {
      touchY = curY;
      touchX = curX;
      return;
    }

    const shelf = activeShelf;
    const maxScroll = Math.max(0, shelf.scrollHeight - shelf.clientHeight);
    const atTop = shelf.scrollTop <= 1;
    const atBottom = shelf.scrollTop >= maxScroll - 1;

    if (maxScroll <= 1) {
      // ตู้มีสินค้าน้อย ไม่ต้องเลื่อนภายในตู้ ส่งแรงเลื่อนไปที่หน้าเว็บหลักทันที
      window.scrollBy({ top: dy, behavior: 'auto' });
    } else if (dy > 0 && atBottom) {
      // เลื่อนลงจนสุดก้นตู้แล้ว -> เลื่อนหน้าเว็บหลักลงต่อทันที
      window.scrollBy({ top: dy, behavior: 'auto' });
    } else if (dy < 0 && atTop) {
      // เลื่อนขึ้นจนสุดบนตู้แล้ว -> เลื่อนหน้าเว็บหลักขึ้นต่อทันที
      window.scrollBy({ top: dy, behavior: 'auto' });
    }

    touchY = curY;
    touchX = curX;
  }, { passive: true });

  document.addEventListener('touchend', () => {
    activeShelf = null;
  }, { passive: true });

  document.addEventListener('touchcancel', () => {
    activeShelf = null;
  }, { passive: true });
})();

// Start App
fetchBootstrap();

