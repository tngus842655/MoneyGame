// 앱인토스 인앱결제 — "광고 제거"(비소모품, 영구) 한 상품만 다룬다.
//
// 게임은 window.NoAds 하나만 본다:
//   NoAds.owned()      구매 여부 (동기 — localStorage 캐시 기준)
//   NoAds.sellable()   지금 구매 버튼을 띄워도 되는가 (토스 + 지원 버전 + 상품 조회 성공)
//   NoAds.product()    { sku, displayName, displayAmount, ... } 또는 null
//   NoAds.purchase()   결제 시작
//   NoAds.onChange(fn) 소유·상품 상태가 바뀌면 호출 (홈 버튼 갱신용)
//
// 토스 앱 밖(일반 브라우저·구글플레이 Capacitor 빌드)에서는 IAP.isSupported()가
// false라 sellable()이 항상 false다 — 구글플레이는 별도 결제 SDK가 필요하고 아직 없다.
//
// ⚠️ 로드 순서: js/toss-ads.js보다 먼저 와야 한다. 배너를 붙일지 말지를
//    toss-ads.js가 부팅 시 NoAds.owned()로 판단하기 때문.
(() => {
'use strict';

// 콘솔에 등록한 "광고 제거" 상품의 sku (2026-08-22 등록, 공급가 3,500원 → 판매가 3,850원).
// 비우면 상품 목록에서 비소모품 첫 상품을 쓰는 폴백으로 동작한다.
const SKU = 'ait.0000065259.795abd69.6e660bc08c.7373710053';
const KEY = 'money-merge-noads';

const sdk = window.AppsInToss;
const iap = sdk && sdk.IAP;

function supported(fn) {
  try { return !!(fn && fn.isSupported()); } catch (e) { return false; }
}
// 결제·목록조회는 5.219.0부터. 둘 중 하나라도 없으면 판매하지 않는다.
const iapSupported = () => !!iap && supported(iap.createOneTimePurchaseOrder) && supported(iap.getProductItemList);

let owned = false;
let product = null;
// 상품 조회 + 구매 복원이 모두 끝나야 true. 그전에는 구매 버튼을 띄우지 않는다 —
// 기기를 바꾼 이미 구매한 이용자에게 "구매하기"가 잠깐 보이면 이중 결제를 시도할 수 있다.
let booted = false;
const listeners = [];

function readCache() {
  try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
}
function writeCache(v) {
  try { v ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch (e) {}
}
function emit() {
  for (const fn of listeners) { try { fn(owned); } catch (e) {} }
}
function setOwned(v) {
  if (owned === v) return;
  owned = v;
  writeCache(v);
  emit();
}

// 캐시를 먼저 반영해야 배너 게이트(toss-ads.js)가 부팅 시점에 바로 판단할 수 있다.
// 서버 조회 결과로는 뒤에서 보정한다.
owned = readCache();

const matches = (sku) => !!sku && (SKU ? sku === SKU : !!product && sku === product.sku);

// ─── 상품 목록 ───
async function loadProduct() {
  if (!iapSupported()) return null;
  try {
    const res = await iap.getProductItemList();
    const list = (res && res.products) || [];
    product = (SKU ? list.find((p) => p.sku === SKU) : list.find((p) => p.type === 'NON_CONSUMABLE')) || null;
  } catch (e) {
    console.error('[toss-iap] 상품 목록 조회 실패:', e);
    product = null;
  }
  emit();
  return product;
}

// ─── 구매 복원 ───
// 완료/환불 주문 목록으로 소유 상태를 맞춘다. 환불된 주문은 회수한다.
// (SDK가 페이지네이션 인자를 안 받아 첫 페이지만 온다. 상품이 하나뿐이라 실무상 충분하지만,
//  목록에서 못 찾았다고 캐시를 지우지는 않는다 — 조회 실패로 구매가 날아가면 안 되니까.)
async function restore() {
  if (!supported(iap && iap.getCompletedOrRefundedOrders)) return;
  try {
    const res = await iap.getCompletedOrRefundedOrders();
    const orders = (res && res.orders) || [];
    const mine = orders.filter((o) => matches(o.sku));
    if (!mine.length) return;
    const refunded = new Set(mine.filter((o) => o.status === 'REFUNDED').map((o) => o.orderId));
    const live = mine.some((o) => o.status === 'COMPLETED' && !refunded.has(o.orderId));
    if (live) setOwned(true);
    else if (refunded.size) setOwned(false);   // 환불만 남았으면 회수
  } catch (e) {
    console.error('[toss-iap] 주문 내역 조회 실패:', e);
  }
}

// 결제는 됐는데 지급이 안 끝난 주문(앱이 죽었거나 네트워크가 끊긴 경우) 마무리.
async function drainPending() {
  if (!supported(iap && iap.getPendingOrders)) return;
  try {
    const res = await iap.getPendingOrders();
    for (const o of ((res && res.orders) || [])) {
      if (!matches(o.sku)) continue;
      setOwned(true);
      if (supported(iap.completeProductGrant)) {
        await iap.completeProductGrant({ params: { orderId: o.orderId } })
          .catch((e) => console.error('[toss-iap] 지급 완료 통보 실패:', e));
      }
    }
  } catch (e) {
    console.error('[toss-iap] 미완료 주문 조회 실패:', e);
  }
}

// ─── 구매 ───
// cbs: { onDone(ok, err?) } — 팝업 닫기·안내 문구용. 지급 자체는 processProductGrant에서 끝난다.
let buying = false;
let finishBuy = null;   // 진행 중인 결제를 밖에서 끝낼 수 있게 (abandonBuy)
function purchase(cbs) {
  cbs = cbs || {};
  const done = (ok, err) => {
    if (!buying) return;      // 이미 끝난 흐름의 늦은 콜백 무시
    buying = false;
    finishBuy = null;
    if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
    try { cbs.onDone && cbs.onDone(ok, err); } catch (e) {}
  };
  if (buying) return;
  if (owned) { cbs.onDone && cbs.onDone(true); return; }
  if (!iapSupported() || !product) { cbs.onDone && cbs.onDone(false, new Error('unavailable')); return; }

  buying = true;
  finishBuy = done;
  let cleanup = null;
  try {
    cleanup = iap.createOneTimePurchaseOrder({
      options: {
        sku: product.sku,
        // 결제가 끝나면 SDK가 여기서 상품을 지급하라고 부른다. 반환값(지급 성공 여부)은
        // SDK가 토스에 그대로 통보하므로 completeProductGrant를 따로 부를 필요가 없다.
        processProductGrant: () => {
          setOwned(true);
          return true;
        },
      },
      onEvent: (event) => {
        if (!event || event.type === 'success') done(true);
      },
      onError: (error) => {
        console.error('[toss-iap] 결제 실패:', error);
        done(false, error);
      },
    });
  } catch (e) {
    console.error('[toss-iap] 결제 시작 실패:', e);
    done(false, e);
  }
}

const sellable = () => booted && iapSupported() && !!product;

window.NoAds = {
  owned: () => owned,
  sellable,
  product: () => product,
  purchase,
  onChange: (fn) => { if (typeof fn === 'function') listeners.push(fn); },
};

// ---------------------------------------------------------------- 홈 화면 UI
// 이 기능의 버튼은 이 파일이 소유한다 (랭킹=ranking.js, 관리자=admin.js와 같은 방식).
const btn = document.getElementById('btnNoAds');
const ownedNote = document.getElementById('noAdsOn');
const toastEl = document.getElementById('shopToast');
const dlg = document.getElementById('buyDlg');
const btnBuyOk = document.getElementById('btnBuyOk');
const refundHomeLink = document.getElementById('linkRefundHome');
let toastTimer = 0;

function toast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

function closeDlg() {
  if (dlg) dlg.classList.add('hidden');
}

function syncUi() {
  // 광고 흔적(배너 자리·버튼 AD 배지)을 CSS로 걷어내는 스위치
  document.body.classList.toggle('no-ads', owned);
  // 환불 안내 링크는 유료 상품을 파는 환경에서만 (구글플레이·일반 브라우저엔 결제가 없다)
  if (refundHomeLink) refundHomeLink.classList.toggle('hidden', !sellable() && !owned);
  if (!btn) return;
  const show = !owned && sellable();
  btn.textContent = show ? `🚫 광고 제거 · ${product.displayAmount}` : '';
  btn.classList.toggle('hidden', !show);
  btn.disabled = false;
  if (ownedNote) ownedNote.classList.toggle('hidden', !owned);
}

// 구매 버튼 → 확인 팝업(무엇을 사는지 + 환불 고지) → 토스 주문서.
// 주문서로 바로 넘기지 않는 이유는 index.html #buyDlg 주석 참고.
if (btn && dlg && btnBuyOk) {
  btn.addEventListener('click', () => {
    if (btn.disabled || !product) return;
    btnBuyOk.disabled = false;
    btnBuyOk.textContent = `${product.displayAmount} 구매하기`;
    dlg.classList.remove('hidden');
  });

  btnBuyOk.addEventListener('click', () => {
    if (btnBuyOk.disabled) return;
    btnBuyOk.disabled = true;
    btnBuyOk.textContent = '결제 진행 중…';
    purchase({
      onDone: (ok, err) => {
        closeDlg();
        syncUi();
        if (ok) toast('광고를 제거했어요! 이제 광고 없이 바로 사용돼요');
        else if (err) toast('결제를 마치지 못했어요. 잠시 후 다시 시도해 주세요');
      },
    });
  });

  document.getElementById('btnBuyCancel').addEventListener('click', closeDlg);
}
listeners.push(syncUi);
syncUi();   // 버튼이 없어도 body.no-ads는 맞춰 둔다 (toss-ads.js가 이걸 보고 배너를 건너뛴다)

// 결제는 토스 주문서로 나갔다 돌아오는 흐름이라, 화면이 다시 보일 때 결과를 한 번 더 맞춘다.
// - 결제창을 그냥 닫고 돌아오면 onEvent/onError가 안 올 수 있어 버튼이 "결제 진행 중…"에 갇힌다
// - 성공했는데 콜백을 놓친 경우도 주문 내역 조회로 살아난다
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !iapSupported() || !product) return;
  (async () => {
    await restore();
    await drainPending();
    if (buying && finishBuy) finishBuy(owned, null);   // 결과가 없으면 조용히 원상복구
  })();
});

// 부팅: 상품을 먼저 받아야 sku 대조가 되므로 순서대로.
// 구매는 기기가 아니라 **토스 계정**에 남는다. 그래서 기기를 바꿔도 같은 토스 계정으로
// 열면 restore()가 주문 내역에서 찾아 소유를 되살린다 — 별도 회원가입·로그인이 필요 없다.
// localStorage는 그 결과를 담아 두는 캐시일 뿐이다(부팅 첫 프레임과 오프라인 대비).
if (iapSupported()) {
  (async () => {
    await loadProduct();
    if (!product) return;
    await restore();
    await drainPending();
    booted = true;   // 복원까지 끝난 뒤에야 구매 버튼을 연다 (이중 결제 방지)
    emit();
  })();
} else if (owned) {
  // 토스 밖에서도 이미 산 기기라면 광고 없는 상태를 유지한다 (기기 로컬 기준).
  emit();
}
})();
