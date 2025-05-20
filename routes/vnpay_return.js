const express = require('express');
const crypto = require('crypto');
const qs = require('qs');
const db = require('../config/db');
const router = express.Router();

const vnp_HashSecret = 'RI8KHMFLSAE0CB49HIQ0YXEMYOKH8XB3';

router.get('/vnpay_return', (req, res) => {
  let vnp_Params = req.query;
  let secureHash = vnp_Params['vnp_SecureHash'];

  delete vnp_Params['vnp_SecureHash'];
  delete vnp_Params['vnp_SecureHashType'];

  vnp_Params = sortObject(vnp_Params);
  let signData = qs.stringify(vnp_Params, { encode: false });
  let hmac = crypto.createHmac('sha512', vnp_HashSecret);
  let signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

  if (secureHash === signed) {
    // ✅ Giao dịch hợp lệ, cập nhật đơn hàng
    const vnp_TxnRef = vnp_Params['vnp_TxnRef'];

    db.query(
      'UPDATE orders SET status = ?, payment_status = ? WHERE id = ?',
      ['completed', 'paid', vnp_TxnRef],
      (err, result) => {
        if (err || result.affectedRows === 0) {
          console.error('Lỗi cập nhật đơn hàng:', err);
          return res.redirect('http://192.168.1.7:5000/payment-result?status=failed');
        }

        return res.redirect('http://192.168.1.7:5000/payment-result?status=success');
      }
    );
  } else {
    // ❌ Giao dịch không hợp lệ
    return res.redirect('http://192.168.1.7:5000/payment-result?status=invalid-signature');
  }
});

function sortObject(obj) {
  let sorted = {};
  let keys = Object.keys(obj).sort();
  for (let key of keys) {
    sorted[key] = obj[key];
  }
  return sorted;
}

module.exports = router;
