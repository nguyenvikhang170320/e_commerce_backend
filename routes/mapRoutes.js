const express = require('express');
const router = express.Router();
const axios = require('axios'); // Cần cài đặt: npm install axios
const config = require('config'); // Hoặc dùng process.env nếu bạn không dùng 'config'
const pool = require('../config/db'); // Import kết nối MySQL của bạn

// Helper function để lấy timestamp hiện tại cho logs
const getCurrentTimestamp = () => {
    return new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
};

// Endpoint 1: Geocoding và lưu tọa độ vào bảng map_locations
// Khi bạn tạo hoặc cập nhật đơn hàng với địa chỉ, bạn có thể gọi API này.
router.post('/save_location', async (req, res) => {
    console.log(`[${getCurrentTimestamp()}] POST /api/maps/save_location request received.`);
    const { orderId, addressText } = req.body;

    console.log(`[${getCurrentTimestamp()}] Request Body: orderId = ${orderId}, addressText = "${addressText}"`);

    if (!orderId || !addressText) {
        console.log(`[${getCurrentTimestamp()}] Validation Error: orderId or addressText is missing.`);
        return res.status(400).json({ message: 'orderId and addressText are required.' });
    }

    const googleMapsApiKey = config.get('googleMapsApiKey'); // Lấy API Key từ config

    if (!googleMapsApiKey) {
        console.error(`[${getCurrentTimestamp()}] Server Configuration Error: Google Maps API Key is not configured.`);
        return res.status(500).json({ message: 'Server configuration error: Google Maps API Key missing.' });
    }

    const geocodingUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addressText)}&key=${googleMapsApiKey}`;
    console.log(`[${getCurrentTimestamp()}] Geocoding URL: ${geocodingUrl}`);

    let conn;
    try {
        // 1. Thực hiện Geocoding
        console.log(`[${getCurrentTimestamp()}] Starting Geocoding for address: "${addressText}"`);
        const geoResponse = await axios.get(geocodingUrl);
        const geoData = geoResponse.data;
        console.log(`[${getCurrentTimestamp()}] Geocoding API Response Status: ${geoData.status}`);

        if (geoData.status === 'OK' && geoData.results.length > 0) {
            const location = geoData.results[0].geometry.location;
            const formattedAddress = geoData.results[0].formatted_address;
            const latitude = location.lat;
            const longitude = location.lng;

            console.log(`[${getCurrentTimestamp()}] Geocoded Location: Lat = ${latitude}, Lng = ${longitude}, Formatted Address = "${formattedAddress}"`);

            // 2. Lưu hoặc cập nhật tọa độ và địa chỉ chuẩn hóa vào bảng map_locations
            console.log(`[${getCurrentTimestamp()}] Getting database connection from pool.`);
            conn = await pool.getConnection(); // Lấy kết nối từ pool
            console.log(`[${getCurrentTimestamp()}] Checking for existing location for orderId: ${orderId}`);
            
            const [existing] = await conn.query(
                `SELECT id FROM map_locations WHERE order_id = ?`,
                [orderId]
            );
            console.log(`[${getCurrentTimestamp()}] Existing location check result: ${existing.length > 0 ? 'Found' : 'Not found'}`);

            if (existing.length > 0) {
                // Nếu đã tồn tại, cập nhật
                console.log(`[${getCurrentTimestamp()}] Updating existing location for orderId: ${orderId}`);
                const updateQuery = `
                    UPDATE map_locations
                    SET address_text = ?, latitude = ?, longitude = ?, formatted_address = ?
                    WHERE order_id = ?;
                `;
                await conn.query(updateQuery, [addressText, latitude, longitude, formattedAddress, orderId]);
                console.log(`[${getCurrentTimestamp()}] Location updated successfully for orderId: ${orderId}`);
            } else {
                // Nếu chưa tồn tại, thêm mới
                console.log(`[${getCurrentTimestamp()}] Inserting new location for orderId: ${orderId}`);
                const insertQuery = `
                    INSERT INTO map_locations (order_id, address_text, latitude, longitude, formatted_address)
                    VALUES (?, ?, ?, ?, ?);
                `;
                await conn.query(insertQuery, [orderId, addressText, latitude, longitude, formattedAddress]);
                console.log(`[${getCurrentTimestamp()}] New location inserted successfully for orderId: ${orderId}`);
            }

            conn.release(); // Giải phóng kết nối
            console.log(`[${getCurrentTimestamp()}] Database connection released.`);

            return res.json({
                message: 'Location saved/updated successfully.',
                orderId,
                addressText,
                latitude,
                longitude,
                formattedAddress
            });
        } else {
            // Nếu không tìm thấy địa chỉ hoặc lỗi geocoding
            console.error(`[${getCurrentTimestamp()}] Geocoding failed for address "${addressText}": Status = ${geoData.status}, Error Message = ${geoData.error_message || 'N/A'}`);
            return res.status(404).json({ message: 'Could not geocode the address.', details: geoData.status });
        }
    } catch (error) {
        console.error(`[${getCurrentTimestamp()}] Error in /save_location for orderId ${orderId}:`, error);
        if (conn) {
            conn.release(); // Đảm bảo giải phóng kết nối nếu có lỗi
            console.log(`[${getCurrentTimestamp()}] Database connection released due to error.`);
        }
        return res.status(500).json({ message: 'Internal server error.', error: error.message });
    }
});

// Endpoint 2: Lấy tọa độ của một đơn hàng từ bảng map_locations
router.get('/get_location/:orderId', async (req, res) => {
    console.log(`[${getCurrentTimestamp()}] GET /api/maps/get_location/:orderId request received.`);
    const orderId = req.params.orderId;
    console.log(`[${getCurrentTimestamp()}] Request Params: orderId = ${orderId}`);

    let conn;
    try {
        console.log(`[${getCurrentTimestamp()}] Getting database connection from pool.`);
        conn = await pool.getConnection();
        console.log(`[${getCurrentTimestamp()}] Querying map_locations for orderId: ${orderId}`);
        const [rows] = await conn.query(
            `SELECT address_text, latitude, longitude, formatted_address FROM map_locations WHERE order_id = ?`,
            [orderId]
        );
        conn.release();
        console.log(`[${getCurrentTimestamp()}] Database connection released.`);

        if (rows.length > 0) {
            const location = rows[0];
            console.log(`[${getCurrentTimestamp()}] Location found for orderId ${orderId}: Lat = ${location.latitude}, Lng = ${location.longitude}, Formatted Address = "${location.formatted_address}"`);
            return res.json({
                orderId,
                addressText: location.address_text,
                latitude: location.latitude,
                longitude: location.longitude,
                formattedAddress: location.formatted_address
            });
        } else {
            console.log(`[${getCurrentTimestamp()}] No location data found for orderId: ${orderId}`);
            return res.status(404).json({ message: 'Location data not found for this orderId.' });
        }
    } catch (error) {
        console.error(`[${getCurrentTimestamp()}] Error in /get_location for orderId ${orderId}:`, error);
        if (conn) {
            conn.release();
            console.log(`[${getCurrentTimestamp()}] Database connection released due to error.`);
        }
        return res.status(500).json({ message: 'Internal server error.', error: error.message });
    }
});

module.exports = router;