// 센터 설정 — Supabase 주소와 '공개용(anon/publishable) 키'만 넣습니다.
// 이 키는 웹사이트에 공개되어도 되는 키이고, 데이터 보호는 데이터베이스의 보안 규칙(RLS)이 합니다.
// 절대 'service_role'(secret) 키를 여기에 넣지 마세요.
window.APP_CONFIG = {
  SUPABASE_URL: 'https://nezhsattvovfoufzdoql.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_sOr4Usc4ED7RzShpKbLgbQ_JpKENWC1',
  CENTER_NAME: '로얄마린',
  BRANCH_NAME: '신곡점',
  CONTACT: '[센터 전화번호]',
  // 보호자 동의 화면 문구 (바꾸면 CONSENT_VERSION도 올려 주세요)
  CONSENT_VERSION: '2026-11-v1',
  RETENTION_TEXT: '탈회 후 [센터 보유 기간] 보관 뒤 파기 (법령상 보관 의무가 있는 기록은 해당 기간)'
};
