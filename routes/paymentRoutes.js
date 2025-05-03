// routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('../config/db');


// Create Stripe Checkout Session (Thanh toán điện tử)
router.post('/create-checkout-session', async (req, res) => {
  const { cartItems, userId, orderId } = req.body;

  try {
    const lineItems = cartItems.map(item => ({
      price_data: {
        currency: 'vnd',
        product_data: {
          name: item.name,
        },
        unit_amount: Math.round(item.price), // VND: số nguyên
      },
      quantity: item.quantity,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `http://localhost:3000/success?session_id={CHECKOUT_SESSION_ID}&order_id=${orderId}`,
      cancel_url: 'http://localhost:3000/cancel',
      metadata: {
        userId: userId,
        orderId: orderId,
      },
    });

    console.log('✅ Tạo session Stripe thành công:', session.id);

    // ✅ Cập nhật bảng orders sau khi tạo session
    await db.query(
      'UPDATE orders SET payment_status = ?, status = ?, stripe_session_id = ? WHERE id = ?',
      ['paid', 'completed', session.id, orderId]
    );

    console.log(`✅ Đã cập nhật đơn hàng ${orderId}: payment_status = "paid", status = "completed", stripe_session_id = ${session.id}`);

    res.json({ id: session.id });
  } catch (err) {
    console.error('❌ Stripe error:', err);
    res.status(500).json({ error: 'Stripe session failed' });
  }
});


module.exports = router;
