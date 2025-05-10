const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 1. Tổng doanh thu trong năm theo seller
router.get('/yearly/:sellerId', async (req, res) => {
    const sellerId = req.params.sellerId;
    const { year } = req.query;

    console.log(`[${new Date().toLocaleString()}] Yêu cầu đã nhận được cho /yearly/${sellerId} with year: ${year}`);

    if (!year) {
        console.log(`[${new Date().toLocaleString()}] Error: Missing 'year' parameter for sellerId: ${sellerId}`);
        return res.status(400).json({ error: 'Missing year' });
    }

    try {
        console.log(`[${new Date().toLocaleString()}] Thực hiện truy vấn về doanh thu hàng năm của sellerId: ${sellerId}, year: ${year}`);
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

        const revenue = rows[0]?.total_revenue || 0;
        console.log(`[${new Date().toLocaleString()}] Yearly revenue for sellerId ${sellerId}, year ${year}: ${revenue}`);
        res.json({ sellerId, year, revenue });
    } catch (err) {
        console.error(`[${new Date().toLocaleString()}] Error getting yearly revenue for sellerId ${sellerId}, year ${year}:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 2. Số đơn hàng đã thanh toán trong tháng
router.get('/orders-count/:sellerId', async (req, res) => {
    const sellerId = req.params.sellerId;
    const { month, year } = req.query;

    console.log(`[${new Date().toLocaleString()}] Yêu cầu đã nhận được cho /orders-count/${sellerId} with month: ${month}, year: ${year}`);

    if (!month || !year) {
        console.log(`[${new Date().toLocaleString()}] Error: Missing 'month' or 'year' parameter for sellerId: ${sellerId}`);
        return res.status(400).json({ error: 'Missing month or year' });
    }

    try {
        console.log(`[${new Date().toLocaleString()}] Thực hiện truy vấn về số lượng đơn hàng hàng tháng của sellerId: ${sellerId}, month: ${month}, year: ${year}`);
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

        const total_orders = rows[0]?.total_orders || 0;
        console.log(`[${new Date().toLocaleString()}] Số lượng đơn hàng hàng tháng cho sellerId ${sellerId}, month ${month}, year ${year}: ${total_orders}`);
        res.json({
            sellerId,
            month,
            year,
            total_orders
        });
    } catch (err) {
        console.error(`[${new Date().toLocaleString()}] Error getting monthly orders count for sellerId ${sellerId}, month ${month}, year ${year}:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 3. Top sản phẩm bán chạy (top 5)
router.get('/top-products/:sellerId', async (req, res) => {
    const sellerId = req.params.sellerId;
    const { month, year } = req.query;

    console.log(`[${new Date().toLocaleString()}] Yêu cầu đã nhận được cho /top-products/${sellerId} with month: ${month || 'all'}, year: ${year || 'all'}`);

    try {
        const queryParams = [sellerId];
        let whereClause = `WHERE p.seller_id = ? AND o.payment_status = 'paid'`;

        if (month && year) {
            whereClause += ` AND MONTH(o.created_at) = ? AND YEAR(o.created_at) = ?`;
            queryParams.push(month, year);
        }

        console.log(`[${new Date().toLocaleString()}] Thực hiện truy vấn cho các sản phẩm hàng đầu của sellerId: ${sellerId}, month: ${month || 'all'}, year: ${year || 'all'}`);
        const [rows] = await db.execute(
            `SELECT
            p.id AS product_id,
            p.name,
            SUM(oi.quantity) AS total_sold
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            JOIN orders o ON oi.order_id = o.id
            ${whereClause}
            GROUP BY p.id, p.name
            ORDER BY total_sold DESC
            LIMIT 5`,
            queryParams
        );

        console.log(`[${new Date().toLocaleString()}] Sản phẩm hàng đầu cho sellerId ${sellerId}, tháng ${month || 'all'}, năm ${year || 'all'}:`, rows);
        res.json({
            sellerId,
            month: month || 'all',
            year: year || 'all',
            top_products: rows
        });
    } catch (err) {
        console.error(`[${new Date().toLocaleString()}] Lỗi khi lấy sản phẩm hàng đầu cho sellerId ${sellerId}, month ${month || 'all'}, year ${year || 'all'}:`, err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 4. Doanh thu theo tháng (cụ thể)
router.get('/revenue/:sellerId', async (req, res) => {
    const sellerId = req.params.sellerId;
    const { month, year } = req.query;

    console.log(`[${new Date().toLocaleString()}] Thực hiện truy vấn /revenue/${sellerId} with month: ${month}, year: ${year}`);

    if (!month || !year) {
        console.log(`[${new Date().toLocaleString()}] Lỗi: Thiếu tham số 'tháng' hoặc 'năm' cho sellerId: ${sellerId}`);
        return res.status(400).json({ error: 'Missing month or year' });
    }

    try {
        console.log(`[${new Date().toLocaleString()}] Thực hiện truy vấn về doanh thu hàng tháng của sellerId: ${sellerId}, month: ${month}, year: ${year}`);
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
        console.log(`[${new Date().toLocaleString()}] Doanh thu hàng tháng cho sellerId ${sellerId}, month ${month}, year ${year}: ${revenue}`);
        res.json({ sellerId, month, year, revenue });
    } catch (error) {
        console.error(`[${new Date().toLocaleString()}] Lỗi khi tính doanh thu hàng tháng cho sellerId ${sellerId}, month ${month}, year ${year}:`, error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;