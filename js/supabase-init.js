// Supabase 연결 설정. ranking.js는 window.supabaseClient가 있으면 자동으로 실데이터 모드로 전환됩니다.
(() => {
  const SUPABASE_URL = 'https://wcclhivdpxrtnzblpjfr.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjY2xoaXZkcHhydG56YmxwamZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MzM3MTEsImV4cCI6MjEwMjQwOTcxMX0.HEm8gpjGqBgywxsVXpYUYzivj96CEixkKKRV2o9hJQI';

  if (window.supabase && window.supabase.createClient) {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  // 탭 종료 시 fetch(keepalive) 폴백용 — supabase-js 내부 클라이언트는 페이지 언로드 중
  // 요청이 끊길 수 있어, REST 엔드포인트를 직접 호출하는 경량 경로를 별도로 노출
  window.supabaseConfig = { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
})();
