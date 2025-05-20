// routes/vnpay.js
const express = require('express');
const crypto = require('crypto');
const moment = require('moment');
const qs = require('qs');
const router = express.Router();

router.post('/create_payment_url', (req, res) => {
  const { amount, orderId, orderInfo } = req.body;

  const vnp_TmnCode = 'Q0M7T1CP';
  const vnp_HashSecret = 'RI8KHMFLSAE0CB49HIQ0YXEMYOKH8XB3';
  const vnp_Url = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
  const returnUrl = 'https://localhost:5000/api/vnpay/vnpay_return';

  let createDate = moment().format('YYYYMMDDHHmmss');
  let orderIdGen = moment().format('HHmmss');

  let ipAddr = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log("Client IP Address:", ipAddr); // Log the IP address

  let vnp_Params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: vnp_TmnCode,
    vnp_Locale: 'vn',
    vnp_CurrCode: 'VND',
    vnp_TxnRef: orderId || orderIdGen,
    vnp_OrderInfo: orderInfo || 'Thanh toan don hang',
    vnp_OrderType: 'other',
    vnp_Amount: amount * 100, // nhân 100 theo yêu cầu của VNPAY
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddr,
    vnp_CreateDate: createDate,
  };

  console.log("Initial vnp_Params:", vnp_Params); // Log initial parameters

  vnp_Params = sortObject(vnp_Params);
  let signData = qs.stringify(vnp_Params, { encode: true });
  console.log("Sorted, Stringified Data (before hash):", signData); // Log stringified data

  let hmac = crypto.createHmac('sha512', vnp_HashSecret);
  let signed = hmac.update(new Buffer.from(signData, 'utf-8')).digest('hex');
  console.log("Generated Signature:", signed); // Log the generated signature

  vnp_Params['vnp_SecureHash'] = signed;
  let paymentUrl = vnp_Url + '?' + qs.stringify(vnp_Params, { encode: true });

  console.log("Final vnp_Params (with signature):", vnp_Params);  // Log the final parameters
  console.log("Payment URL:", paymentUrl); // Log the complete payment URL

  res.json({ paymentUrl });
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
