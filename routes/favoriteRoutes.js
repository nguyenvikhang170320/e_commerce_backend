const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Add to favorites
router.post('/', async (req, res) => {
  const { userId, productId } = req.body;
  console.log('Request body (Add to favorites):', req.body);

  try {
    await db.execute(
      'INSERT IGNORE INTO favorite_products (user_id, product_id) VALUES (?, ?)',
      [userId, productId]
    );
    res.json({ message: 'Added to favorites' });
    console.log('Product', productId, 'added to favorites for user', userId);
  } catch (err) {
    console.error('Add to favorites error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user favorites
router.get('/:userId', async (req, res) => {
  const userId = req.params.userId;
  console.log('User ID (Get favorites):', userId);

  try {
    const [rows] = await db.execute(
      `SELECT p.* FROM favorite_products f
        JOIN products p ON f.product_id = p.id
        WHERE f.user_id = ?`,
      [userId]
    );
    res.json(rows);
    console.log('Favorites retrieved for user', userId, ':', rows);
  } catch (err) {
    console.error('Get favorites error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove from favorites
router.delete('/', async (req, res) => {
  const { userId, productId } = req.body;
  console.log('Request body (Remove from favorites):', req.body);

  try {
    await db.execute(
      'DELETE FROM favorite_products WHERE user_id = ? AND product_id = ?',
      [userId, productId]
    );
    res.json({ message: 'Removed from favorites' });
    console.log('Product', productId, 'removed from favorites for user', userId);
  } catch (err) {
    console.error('Remove from favorites error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;