const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const pool = require('./config/db'); // import kết nối mysql
const path = require('path');
// Test kết nối DB
pool.getConnection()
  .then(conn => {
    console.log('✅ Kết nối thành công với MySQL database!');
    conn.release(); // Nhớ release connection sau khi test
  })
  .catch(err => {
    console.error('❌ MySQL connection failed:', err);
  });
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
app.get('/', (req, res) => res.send('API is running...'));

// Import các route
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);
const verifyRoutes = require('./routes/verifyRoutes');
app.use('/api/verify', verifyRoutes);
const productRoutes = require('./routes/productRoutes');
app.use('/api/products', productRoutes);
const cartRoutes = require('./routes/cartRoutes');
app.use('/api/carts', cartRoutes);
const orderRoutes = require('./routes/orderRoutes');
app.use('/api/orders', orderRoutes);
const revenueRoutes = require('./routes/revenueRoutes');
app.use('/api/revenues', revenueRoutes);
const categoryRoutes = require('./routes/categoryRoutes');
app.use('/api/categories', categoryRoutes);
const favoriteRoutes = require('./routes/favoriteRoutes');
app.use('/api/favorites', favoriteRoutes);
const notificationRoutes = require('./routes/notificationRoutes');
app.use('/api/notifications', notificationRoutes);
const paymentRoutes = require('./routes/paymentRoutes');
app.use('/api/payments', paymentRoutes);
const chatRoutes = require('./routes/chatRoutes');
app.use('/api/messages', chatRoutes);
const mapRoutes = require('./routes/mapRoutes');
app.use('/api/maps', mapRoutes);
// const vnpayRouter = require('./routes/vnpay');
// app.use('/api/vnpay', vnpayRouter);
// const vnpayreturnRouter = require('./routes/vnpay_return');
// app.use('/api/vnpay', vnpayreturnRouter);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
