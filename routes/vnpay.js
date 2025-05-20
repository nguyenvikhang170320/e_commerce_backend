// routes/vnpay.js
const express = require('express');
const crypto = require('crypto');
const moment = require('moment');
const querystring = require('qs');
const router = express.Router();

const vnp_TmnCode = 'Q0M7T1CP';
const vnp_HashSecret = 'RI8KHMFLSAE0CB49HIQ0YXEMYOKH8XB3';
const vnp_Url = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
const vnp_ReturnUrl = 'http://172.16.1.142:5000/api/vnpay/vnpay_return';

router.post('/create_payment_url', (req, res) => {
  let ipAddr = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  let tmnCode = vnp_TmnCode;
  let secretKey = vnp_HashSecret;
  let vnpUrl = vnp_Url.trim();  // Xóa dấu cách thừa
  let returnUrl = vnp_ReturnUrl;

  let date = new Date();
  let createDate = moment(date).format('YYYYMMDDHHmmss');

  // Lấy orderId từ client hoặc tạo mới
  let orderId = req.body.orderId || moment(date).format('HHmmss');
  let amount = Number(req.body.amount);
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Amount không hợp lệ' });
  }

  let bankCode = req.body.bankCode;

  let orderInfo = 'Thanh toan don hang';
  let locale = 'vn';
  let currCode = 'VND';
  let vnp_Params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: tmnCode,
    vnp_Locale: locale,
    vnp_CurrCode: currCode,
    vnp_TxnRef: orderId,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: 'other',
    vnp_Amount: amount * 100,
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddr,
    vnp_CreateDate: createDate,
  };

  if (bankCode) {
    vnp_Params['vnp_BankCode'] = bankCode;
  }

  vnp_Params = sortObject(vnp_Params);

  let signData = querystring.stringify(vnp_Params, { encode: false });
  let hmac = crypto.createHmac('sha512', secretKey);
  let signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
  vnp_Params['vnp_SecureHash'] = signed;

  vnpUrl += '?' + querystring.stringify(vnp_Params, { encode: false });

  res.json({ paymentUrl: vnpUrl });
});


function sortObject(obj) {
  let sorted = {};
  let keys = Object.keys(obj);
  keys.sort();
  for (let key of keys) {
    sorted[key] = obj[key];
  }
  return sorted;
}

module.exports = router;
