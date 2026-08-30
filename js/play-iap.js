// 구글플레이 인앱결제 — "광고 제거"(비소모품, 영구) 한 상품만 다룬다.
// js/toss-iap.js의 구글플레이 짝: 같은 window.NoAds 인터페이스를 구현하고, 같은 홈 UI
// (#btnNoAds, #buyDlg, #shopToast)를 이 파일이 대신 배선한다. 네이티브(Capacitor)가
// 아니면 통째로 no-op이 되고, 이 파일이 NoAds를 차지하면 뒤에 로드되는 toss-iap.js가
// 물러난다 — 광고 브리지(toss-ads/admob-ads)가 AdsBridge에 쓰는 규칙과 같다.
//
// 결제 플러그인: cordova-plugin-purchase (Google Play Billing).
// NewWorld(원정몬스터즈) src/platform/iap.ts에서 검증한 조합을 그대로 옮겼다.
// 플러그인 JS(window.CdvPurchase)는 Capacitor가 네이티브 웹뷰에 주입하는 cordova.js가
// 비동기로 올린다 — deviceready(+폴링 안전망)를 기다렸다가 초기화한다.
//
// 흐름: register → initialize(보유 영수증 복원 포함) → 가격 조회(버튼 표시) → order()
//   → approved(지급) → verify(로컬 — 검증 서버 없음) → finish(승인 acknowledge,
//   안 하면 3일 뒤 구글이 자동 환불). 지급은 소유 플래그 하나라 멱등 — 장부 불요.
// 환불 회수는 하지 않는다 — 스토어 조회 실패(오프라인 등)와 "영수증 없음"을 구분할 수
// 없어서, 없음을 회수로 다루면 정상 구매가 날아갈 수 있다 (NewWorld와 같은 결정).
//
// ⚠️ 플레이스토어 설치본 + 콘솔에 상품이 등록된 뒤에만 동작한다 — 사이드로드·상품
//    미등록이면 가격 조회가 안 돼 구매 버튼이 그냥 숨는다 (게임·광고 흐름은 그대로).
(() => {
'use strict';

const cap = window.Capacitor;
let native = false;
try { native = !!(cap && cap.isNativePlatform && cap.isNativePlatform()); } catch (e) {}
if (!native) return;

// 순서가 바뀌어도 두 결제 브리지가 겹치지 않게 — 먼저 차지한 쪽이 임자
if (window.NoAds) return;

// Play Console > 수익 창출 > 인앱 상품의 상품 ID와 일치해야 한다 (비소모성, ₩4,000)
const PRODUCT_ID = 'ad_free';
// toss-iap.js와 같은 키 — 한 설치본에서는 한 브리지만 돌므로 충돌이 없고,
// body.no-ads 판단 로직을 어느 빌드에서든 같은 캐시로 맞출 수 있다.
const KEY = 'money-merge-noads';

let owned = false;
let price = null;    // '₩4,000' 같은 표시 문자열 — 조회 성공이 곧 "팔 수 있다"는 신호
let booted = false;  // initialize(복원 포함)가 끝나야 true. 그전에는 구매 버튼을 열지
                     // 않는다 — 이미 산 이용자에게 "구매하기"가 잠깐 보이면 안 된다.
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

// 캐시를 먼저 반영해야 배너 게이트(js/admob-ads.js)가 부팅 시점에 바로 판단할 수 있다.
// 스토어 복원 결과로는 뒤에서 보정한다.
owned = readCache();

// ─── 스토어 ───
function getProduct() {
  const ns = window.CdvPurchase;
  return (ns && ns.store.get(PRODUCT_ID, ns.Platform.GOOGLE_PLAY)) || null;
}

// 가격·소유를 스토어 상태에서 다시 읽는다 — 초기화 직후와 productUpdated마다 (멱등)
function syncFromStore() {
  const p = getProduct();
  const newPrice = (p && p.pricing && p.pricing.price) || null;
  const priceChanged = newPrice !== price;
  price = newPrice;
  if (p && p.owned) setOwned(true);      // 구매·재설치·기기 변경 복원 (같은 구글 계정)
  else if (priceChanged) emit();         // 가격이 갓 도착했으면 버튼 갱신
}

async function initStore() {
  const ns = window.CdvPurchase;
  try {
    ns.store.register([{ id: PRODUCT_ID, type: ns.ProductType.NON_CONSUMABLE, platform: ns.Platform.GOOGLE_PLAY }]);
    ns.store.when()
      .approved((tx) => {
        setOwned(true);   // 지급 — 앱이 여기서 죽어도 미완료 거래가 다음 부팅에 재통지된다
        tx.verify().catch((e) => console.error('[play-iap] 영수증 검증 실패:', e));
      })
      .verified((receipt) => {
        receipt.finish().catch((e) => console.error('[play-iap] 거래 승인(finish) 실패:', e));
      })
      .productUpdated(syncFromStore);
    await ns.store.initialize([ns.Platform.GOOGLE_PLAY]);
    booted = true;
    syncFromStore();
    emit();   // booted 반영 — sellable()이 열려 구매 버튼이 뜰 수 있다
  } catch (e) {
    // 스토어 미설치·미등록 상품 등 — 구매 버튼만 숨긴다 (비크리티컬)
    console.error('[play-iap] 스토어 초기화 실패:', e);
  }
}

// ─── 구매 ───
// cbs: { onDone(ok, err?) } — toss-iap.js와 같은 계약. 결제 시트는 구글플레이가 띄우고,
// 지급은 approved 이벤트가 한다. order() 반환(시트 닫힘)과 approved 도착은 순서 경쟁이라
// 반환 후 잠깐 기다렸다가 owned로 최종 판정한다. 취소는 ok=false·err 없음으로 조용히.
let buying = false;
function purchase(cbs) {
  cbs = cbs || {};
  const done = (ok, err) => {
    if (!buying) return;   // 이미 끝난 흐름의 늦은 콜백 무시
    buying = false;
    try { cbs.onDone && cbs.onDone(ok, err); } catch (e) {}
  };
  if (buying) return;
  if (owned) { cbs.onDone && cbs.onDone(true); return; }
  if (!sellable()) { cbs.onDone && cbs.onDone(false, new Error('unavailable')); return; }
  buying = true;
  (async () => {
    const p = getProduct();
    const offer = p && p.getOffer && p.getOffer();
    if (!offer) { done(false, new Error('unavailable')); return; }
    let err = null;
    try {
      err = await offer.order();   // 성공이면 undefined, 실패·취소면 IError 객체
    } catch (e) {
      err = e;
    }
    if (owned) { done(true); return; }
    if (err) {
      const ns = window.CdvPurchase;
      const cancelled = !!(ns && ns.ErrorCode && err.code === ns.ErrorCode.PAYMENT_CANCELLED);
      if (!cancelled) console.error('[play-iap] 결제 실패:', err);
      done(false, cancelled ? null : (err instanceof Error ? err : new Error(err.message || 'purchase-failed')));
      return;
    }
    const t0 = Date.now();
    const wait = setInterval(() => {
      if (owned) { clearInterval(wait); done(true); return; }
      if (Date.now() - t0 > 3000) { clearInterval(wait); done(false, null); }   // 결과 불명 — 조용히 원상복구
    }, 100);
  })();
}

const sellable = () => booted && !!price;

window.NoAds = {
  owned: () => owned,
  sellable,
  product: () => (price ? { sku: PRODUCT_ID, displayAmount: price } : null),
  purchase,
  onChange: (fn) => { if (typeof fn === 'function') listeners.push(fn); },
};

// ─── 부팅 ───
// cordova.js는 플러그인 JS를 비동기로 올리고 다 되면 deviceready를 쏜다(cordova.js가
// 이벤트를 가로채 늦은 리스너에게도 전달한다). 혹시 신호를 놓쳐도 폴링이 받친다.
// 10초 안에 안 뜨면 이번 세션은 판매를 포기한다 — 버튼이 숨을 뿐 게임·광고는 그대로다.
let started = false;
function startStore() {
  if (started || !window.CdvPurchase) return;
  started = true;
  clearInterval(bootPoll);
  initStore();
}
document.addEventListener('deviceready', startStore);
let bootTries = 0;
const bootPoll = setInterval(() => {
  if (window.CdvPurchase) { startStore(); return; }
  if ((bootTries += 1) >= 40) {
    clearInterval(bootPoll);
    if (!started) console.error('[play-iap] CdvPurchase가 없습니다 — cordova-plugin-purchase 설치와 cap sync를 확인하세요');
  }
}, 250);

// ---------------------------------------------------------------- 홈 화면 UI
// js/toss-iap.js의 UI 배선과 같은 요소·같은 규칙 — NoAds를 차지한 브리지가 배선도 맡는다.
const btn = document.getElementById('btnNoAds');
const ownedNote = document.getElementById('noAdsOn');
const toastEl = document.getElementById('shopToast');
const dlg = document.getElementById('buyDlg');
const btnBuyOk = document.getElementById('btnBuyOk');
// 홈 하단 링크 — 유료 상품을 파는 환경에서만 보인다 (환불 안내·사업자 정보)
const shopLinks = [document.getElementById('linkRefundHome'), document.getElementById('linkSellerHome')];
let toastTimer = 0;

// 구매 팝업의 복원 안내는 판매 플랫폼마다 다르다 — 기본 문구(토스 계정)를 구글 계정으로
const acctNote = document.getElementById('buyAcct');
if (acctNote) acctNote.innerHTML = '한 번 사면 계속 적용돼요. 기기를 바꿔도 <b>같은 구글 계정</b>이면 그대로예요';

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
  // 광고 흔적(배너 자리·버튼 AD 배지)을 CSS로 걷어내는 스위치 (index.html body.no-ads)
  document.body.classList.toggle('no-ads', owned);
  const shopVisible = sellable() || owned;
  for (const a of shopLinks) { if (a) a.classList.toggle('hidden', !shopVisible); }
  if (!btn) return;
  const show = !owned && sellable();
  btn.textContent = show ? `🚫 광고 제거 · ${price}` : '';
  btn.classList.toggle('hidden', !show);
  btn.disabled = false;
  if (ownedNote) ownedNote.classList.toggle('hidden', !owned);
}

// 구매 버튼 → 확인 팝업(무엇을 사는지 + 환불 고지) → 구글플레이 결제 시트.
// 시트로 바로 넘기지 않는 이유는 index.html #buyDlg 주석 참고 (전자상거래법 사전 고지).
if (btn && dlg && btnBuyOk) {
  btn.addEventListener('click', () => {
    if (btn.disabled || !sellable()) return;
    btnBuyOk.disabled = false;
    btnBuyOk.textContent = `${price} 구매하기`;
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
syncUi();   // 버튼이 없어도 body.no-ads는 맞춰 둔다 (admob-ads.js가 이걸 보고 배너를 건너뛴다)
})();
