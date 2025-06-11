const express = require('express');
const router = express.Router();
const addressController = require('../controllers/addressController');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/', authMiddleware, addressController.createAddress);

router.get('/:id', authMiddleware, addressController.getAddressById);

router.get('/user/:id', authMiddleware, addressController.getAddressesByUser);

router.put('/:id', authMiddleware, addressController.updateAddress);

router.delete('/:id', authMiddleware, addressController.deleteAddress);

module.exports = router;
