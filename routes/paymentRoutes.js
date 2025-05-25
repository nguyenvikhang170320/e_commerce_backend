const express = require('express');
const moment = require('moment');
const router = express.Router();
const querystring = require('qs');
const crypto = require("crypto");
const config = require('config'); // Đảm bảo dòng này CHỈ có 1 lần ở đầu file

// Hàm sắp xếp object theo thứ tự key tăng dần
function sortObject(obj) {
    let sorted = {};
    let keys = Object.keys(obj).sort(); // .sort() sorts alphabetically by default
    keys.forEach((key) => {
        sorted[key] = obj[key];
    });
    return sorted;
}

router.post('/create_payment_url', function (req, res, next) {
    process.env.TZ = 'Asia/Ho_Chi_Minh';

    let date = new Date();
    let createDate = moment(date).format('YYYYMMDDHHmmss');

    // Sửa IP về IPv4 và xử lý trường hợp localhost và IPv6 mapped IPv4
    let ipAddr = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Nếu IP là IPv6 mapped IPv4 (ví dụ: ::ffff:192.168.1.1)
    if (ipAddr && ipAddr.includes("::ffff:")) {
        ipAddr = ipAddr.split("::ffff:")[1];
    } else if (ipAddr === '::1') { // Xử lý trường hợp localhost IPv6
        ipAddr = '127.0.0.1';
    } else if (!ipAddr) { // Trường hợp không lấy được IP, gán mặc định
        ipAddr = '127.0.0.1';
    }

    //gán cứng ipAddr
    ipAddr = '127.0.0.1';
    // Cấu hình VNPAY

    const tmnCode = config.get('vnp_TmnCode');
    const secretKey = config.get('vnp_HashSecret');
    const vnpUrl = config.get('vnp_Url');
    const returnUrl = config.get('vnp_ReturnUrl');

    // --- LOGGING VNPAY CONFIGURATION ---
    console.log("\n--- VNPAY CONFIGURATION ---");
    console.log("vnp_TmnCode:", tmnCode);
    console.log("vnp_HashSecret:", secretKey);
    console.log("vnp_Url:", vnpUrl);
    console.log("vnp_ReturnUrl:", returnUrl);
    console.log("---------------------------\n");


    // Chuẩn bị thông tin
    const orderId = parseInt(moment(date).format('DDHHmmss')); // Trả về kiểu int
    const amount = req.body.amount;
    const bankCode = req.body.bankCode;
    const locale = 'vn'; // Đã gán cứng 'vn', nếu muốn lấy từ req.body.language thì đổi lại
    const currCode = 'VND';

    let vnp_Params = {
        'vnp_Version': '2.1.0',
        'vnp_Command': 'pay',
        'vnp_TmnCode': tmnCode,
        'vnp_Locale': locale,
        'vnp_CurrCode': currCode,
        'vnp_TxnRef': orderId,
        'vnp_OrderInfo': 'Thanhtoandonhang' +orderId,
        'vnp_OrderType': 'other',
        'vnp_Amount': amount * 100,
        'vnp_ReturnUrl': returnUrl,
        'vnp_IpAddr': ipAddr,
        'vnp_CreateDate': createDate,
    };

    if (bankCode) {
        vnp_Params['vnp_BankCode'] = bankCode;
    }

    // --- LOGGING VNPAY PARAMS BEFORE SORTING ---
    console.log("--- VNPAY PARAMS (Before Sort) ---");
    console.log(vnp_Params);
    console.log("----------------------------------\n");


    vnp_Params = sortObject(vnp_Params); // Sort alphabet

    // --- LOGGING VNPAY PARAMS AFTER SORTING ---
    console.log("--- VNPAY PARAMS (After Sort) ---");
    console.log(vnp_Params);
    console.log("---------------------------------\n");


    const signData = querystring.stringify(vnp_Params, { encode: false }); // crucial: encode: false for hashing string

    // --- LOGGING SIGN DATA ---
    console.log("--- SIGN DATA FOR HASHING ---");
    console.log(signData);
    console.log("-----------------------------\n");


    // Tạo HMAC
    const hmac = crypto.createHmac("sha512", secretKey); // Sử dụng biến secretKey đã được lấy giá trị
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex"); // Sử dụng signData
    vnp_Params['vnp_SecureHash'] = signed;

    // --- LOGGING GENERATED SECURE HASH ---
    console.log("Generated SecureHash:", signed);
    console.log("---------------------------------\n");


    // IMPORTANT: Khi xây dựng URL cuối cùng, các tham số PHẢI ĐƯỢC URL-encoded.
    const paymentUrl = vnpUrl + '?' + querystring.stringify(vnp_Params); // <-- ĐÃ BỎ { encode: false } Ở ĐÂY -->

    // --- LOGGING FINAL PAYMENT URL ---
    console.log("Final Payment URL:", paymentUrl);
    console.log("---------------------------------\n");


    return res.status(200).json({
        paymentUrl: paymentUrl,
        orderId: orderId
    });
});

router.get('/vnpay_return', (req, res) => {
  const secretKey = config.get('vnp_HashSecret');
  let vnp_Params = req.query;
  let secureHash = vnp_Params['vnp_SecureHash'];

  delete vnp_Params['vnp_SecureHash'];
  delete vnp_Params['vnp_SecureHashType'];

  vnp_Params = sortObject(vnp_Params);
  let signData = querystring.stringify(vnp_Params, { encode: false });
  let hmac = crypto.createHmac('sha512', secretKey);
  let signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

  if (secureHash === signed) {
    // ✅ Giao dịch hợp lệ, cập nhật đơn hàng
    const vnp_TxnRef = vnp_Params['vnp_TxnRef'];
    res.status(200).json({ message: 'Xác minh thành công', code: vnp_Params['vnp_ResponseCode'] });
  } else {
        // Log thêm thông tin để dễ debug khi sai checksum
        console.error("--- CHECKSUM MISMATCH ---");
        console.error("SecureHash from VNPAY:", secureHash);
        console.error("Calculated SecureHash:", signed);
        console.error("Sign Data used for calculation:", signData);
        console.error("VNPAY Return Params (after sort):", vnp_Params);
        console.error("-------------------------");
        res.status(400).json({ message: 'Sai checksum', code: '97' });  
  }
});


module.exports = router;