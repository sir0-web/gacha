// Supabase の接続先。両方入っていると、同じURLを開いた全員で中身と履歴を共有します。
// 空のままだと、この端末のブラウザ内だけに保存します。
// supabaseKey には「anon / publishable」キーを入れてください（service_role キーは絶対に入れない）。
window.GACHA_CONFIG = {
  supabaseUrl: '',
  supabaseKey: '',
};
