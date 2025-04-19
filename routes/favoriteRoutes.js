const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Add to favorites
router.post('/', async (req, res) => {
  const { userId, productId } = req.body;

  try {
    await db.execute(
      'INSERT IGNORE INTO favorite_products (user_id, product_id) VALUES (?, ?)',
      [userId, productId]
    );
    res.json({ message: 'Added to favorites' });
  } catch (err) {
    console.error('Add to favorites error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user favorites
router.get('/:userId', async (req, res) => {
  const userId = req.params.userId;

  try {
    const [rows] = await db.execute(
      `SELECT p.* FROM favorite_products f
       JOIN products p ON f.product_id = p.id
       WHERE f.user_id = ?`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Get favorites error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove from favorites
router.delete('/', async (req, res) => {
  const { userId, productId } = req.body;

  try {
    await db.execute(
      'DELETE FROM favorite_products WHERE user_id = ? AND product_id = ?',
      [userId, productId]
    );
    res.json({ message: 'Removed from favorites' });
  } catch (err) {
    console.error('Remove from favorites error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
