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


    // ✅ CHỈ cập nhật stripe_session_id, KHÔNG update paid/completed ngay
    await db.query(
      'UPDATE orders SET stripe_session_id = ? WHERE id = ?',
      [session.id, orderId]
    );

    console.log(`✅ Đã cập nhật đơn hàng ${orderId}: payment_status = "paid", status = "completed", stripe_session_id = ${session.id}`);

    res.json({ id: session.id });
  } catch (err) {
    console.error('❌ Stripe error:', err);
    res.status(500).json({ error: 'Stripe session failed' });
  }
});

// routes/paymentRoutes.js (thêm webhook)

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('⚠️ Webhook signature verification failed.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Xử lý event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    const orderId = session.metadata.orderId;

    console.log(`✅ Thanh toán Stripe thành công cho order ID: ${orderId}`);

    // Cập nhật orders: paid + completed
    await db.query(
      'UPDATE orders SET payment_status = ?, status = ? WHERE id = ?',
      ['paid', 'completed', orderId]
    );

    // Lấy thông tin đơn để cập nhật doanh thu
    const [orderItems] = await db.query(
      'SELECT oi.*, p.seller_id FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?',
      [orderId]
    );

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    for (const item of orderItems) {
      const revenue = item.quantity * item.price;
      const [existingRevenue] = await db.query(
        'SELECT total_revenue FROM revenue_tracking WHERE seller_id = ? AND month = ? AND year = ?',
        [item.seller_id, month, year]
      );

      if (existingRevenue.length > 0) {
        await db.query(
          'UPDATE revenue_tracking SET total_revenue = total_revenue + ? WHERE seller_id = ? AND month = ? AND year = ?',
          [revenue, item.seller_id, month, year]
        );
      } else {
        await db.query(
          'INSERT INTO revenue_tracking (seller_id, month, year, total_revenue, created_at) VALUES (?, ?, ?, ?, NOW())',
          [item.seller_id, month, year, revenue]
        );
      }
    }
  }

  res.json({ received: true });
});



module.exports = router;
