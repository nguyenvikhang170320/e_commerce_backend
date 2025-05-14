const express = require('express');
const router = express.Router();
const db = require('../config/db'); // kết nối MySQL

router.post('/', async (req, res) => {
  const { userId, address, latitude, longitude, isStore } = req.body;
  try {
    const [result] = await db.execute(
      'INSERT INTO addresses (user_id, address, latitude, longitude, is_store) VALUES (?, ?, ?, ?, ?)',
      [userId, address, latitude, longitude, isStore || false]
    );
    res.json({ success: true, addressId: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/', async (req, res) => {
  const { userId, isStore } = req.query;
  let sql = 'SELECT * FROM addresses WHERE 1=1';
  const params = [];

  if (userId) {
    sql += ' AND user_id = ?';
    params.push(userId);
  }

  if (isStore === 'true') {
    sql += ' AND is_store = true';
  }

  try {
    const [rows] = await db.execute(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


module.exports = router;
