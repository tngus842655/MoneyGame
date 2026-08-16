// Supabase 연결 설정. ranking.js는 window.supabaseClient가 있으면 자동으로 실데이터 모드로 전환됩니다.
(() => {
  const SUPABASE_URL = 'https://wcclhivdpxrtnzblpjfr.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjY2xoaXZkcHhydG56YmxwamZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MzM3MTEsImV4cCI6MjEwMjQwOTcxMX0.HEm8gpjGqBgywxsVXpYUYzivj96CEixkKKRV2o9hJQI';

  if (window.supabase && window.supabase.createClient) {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
})();
