const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 1. Tổng doanh thu trong năm theo seller
router.get('/yearly/:sellerId', async (req, res) => {
    const sellerId = req.params.sellerId;
    const { year } = req.query;

    if (!year) return res.status(400).json({ error: 'Missing year' });

    try {
        const [rows] = await db.execute(
            `SELECT 
         SUM(oi.quantity * oi.price) AS total_revenue
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       JOIN orders o ON oi.order_id = o.id
       WHERE p.seller_id = ?
         AND o.payment_status = 'paid'
         AND YEAR(o.created_at) = ?`,
            [sellerId, year]
        );

        res.json({ sellerId, year, revenue: rows[0]?.total_revenue || 0 });
    } catch (err) {
        console.error('Error getting yearly revenue:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 2. Số đơn hàng đã thanh toán trong tháng
router.get('/orders-count/:sellerId', async (req, res) => {
    const sellerId = req.params.sellerId;
    const { month, year } = req.query;

    if (!month || !year)
        return res.status(400).json({ error: 'Missing month or year' });

    try {
        const [rows] = await db.execute(
            `SELECT COUNT(DISTINCT o.id) AS total_orders
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN products p ON oi.product_id = p.id
       WHERE p.seller_id = ?
         AND o.payment_status = 'paid'
         AND MONTH(o.created_at) = ?
         AND YEAR(o.created_at) = ?`,
            [sellerId, month, year]
        );

        res.json({
            sellerId,
            month,
            year,
            total_orders: rows[0]?.total_orders || 0
        });
    } catch (err) {
        console.error('Error getting orders count:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 3. Top sản phẩm bán chạy (top 5)
router.get('/top-products/:sellerId', async (req, res) => {
    const sellerId = req.params.sellerId;
    const { month, year } = req.query;

    try {
        const [rows] = await db.execute(
            `SELECT 
         p.id AS product_id,
         p.name,
         SUM(oi.quantity) AS total_sold
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       JOIN orders o ON oi.order_id = o.id
       WHERE p.seller_id = ?
         AND o.payment_status = 'paid'
         ${month && year ? 'AND MONTH(o.created_at) = ? AND YEAR(o.created_at) = ?' : ''}
       GROUP BY p.id, p.name
       ORDER BY total_sold DESC
       LIMIT 5`,
            month && year ? [sellerId, month, year] : [sellerId]
        );

        res.json({
            sellerId,
            month: month || 'all',
            year: year || 'all',
            top_products: rows
        });
    } catch (err) {
        console.error('Error getting top products:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 4. Doanh thu theo tháng (cụ thể)
router.get('/revenue/:sellerId', async (req, res) => {
    const sellerId = req.params.sellerId;
    const { month, year } = req.query;

    if (!month || !year) {
        return res.status(400).json({ error: 'Missing month or year' });
    }

    try {
        const [rows] = await db.execute(
            `SELECT 
            p.seller_id,
            SUM(oi.quantity * oi.price) AS total_revenue
          FROM order_items oi
          JOIN products p ON oi.product_id = p.id
          JOIN orders o ON oi.order_id = o.id
          WHERE p.seller_id = ?
            AND o.payment_status = 'paid'
            AND MONTH(o.created_at) = ?
            AND YEAR(o.created_at) = ?
          GROUP BY p.seller_id`,
            [sellerId, month, year]
        );

        const revenue = rows[0]?.total_revenue || 0;
        res.json({ sellerId, month, year, revenue });
    } catch (error) {
        console.error('Error calculating revenue:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


module.exports = router;
