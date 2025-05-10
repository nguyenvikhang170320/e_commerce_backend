// routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY;
const db = require('../config/db');
// Backend: Tạo đơn hàng và trả về orderId
router.post('/create-order', async (req, res) => {
  const { cartItems, userId } = req.body;

  try {
    // ✅ Tính tổng tiền
    const totalAmount = cartItems.reduce((sum, item) => {
      return sum + item.price * item.quantity;
    }, 0);

    // Tạo đơn hàng
    const [orderResult] = await db.query(
      'INSERT INTO orders (user_id, total_amount, status, created_at) VALUES (?, ?, ?, NOW())',
      [userId, totalAmount, 'pending']
    );

    const orderId = orderResult.insertId;

    // Thêm vào order_items
    for (const item of cartItems) {
      await db.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [orderId, item.product_id, item.quantity, item.price]
      );
    }

    res.status(201).json({ orderId });
  } catch (err) {
    console.error('Lỗi khi tạo đơn hàng:', err);
    res.status(500).json({ error: 'Lỗi khi tạo đơn hàng' });
  }
});


// ✅ Tạo Stripe Checkout Session
router.post('/create-checkout-session', async (req, res) => {
  const { cartItems, userId, orderId } = req.body;

  try {
    // 1️⃣ Tạo line items cho Stripe
    const lineItems = cartItems.map(item => ({
      price_data: {
        currency: 'vnd',
        product_data: { name: item.name },
        unit_amount: Math.round(item.price), // Đơn vị VNĐ (số nguyên)
      },
      quantity: item.quantity,
    }));

    // 2️⃣ Tạo session
 // routes/paymentRoutes.js
const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  line_items: lineItems,
  mode: 'payment',
  success_url: `yourapp://payment-success?session_id={CHECKOUT_SESSION_ID}&order_id=${orderId}`, // Deep link
  cancel_url: `yourapp://payment-cancel`, // Deep link
  metadata: {
    userId: userId,
    orderId: orderId,
  },
});


    console.log('✅ Stripe session created:', session.id);

    // 3️⃣ Cập nhật stripe_session_id vào đơn hàng
    await db.query(
      'UPDATE orders SET stripe_session_id = ? WHERE id = ?',
      [session.id, orderId]
    );

    console.log(`✅ Updated stripe_session_id for order ${orderId}`);

    res.json({ id: session.id });
  } catch (err) {
    console.error('❌ Stripe error:', err);
    res.status(500).json({ error: 'Stripe session creation failed' });
  }
});

// ✅ Webhook: Xử lý thanh toán Stripe
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('⚠️ Webhook signature verification failed.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderId = session.metadata.orderId;

    console.log(`✅ Stripe payment completed for order ID: ${orderId}`);

    try {
      // ✅ Cập nhật đơn hàng: payment_status = 'paid', status = 'completed'
      await db.query(
        'UPDATE orders SET payment_status = ?, status = ? WHERE id = ?',
        ['paid', 'completed', orderId]
      );

      // ✅ Update doanh thu cho seller
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

      console.log('✅ Cập nhật đơn hàng + doanh thu cho người bán.');
    } catch (error) {
      console.error('❌ Error updating order after payment:', error);
    }
  }

  res.json({ received: true });
});

module.exports = router;
