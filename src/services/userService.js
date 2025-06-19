// src/services/userService.js
const userModel = require('../models/userModel');
const addressModel = require('../models/addressModel');
const orderModel = require('../models/orderModel');
const argon2 = require('argon2');
const Joi = require('joi');
const jwt = require('jsonwebtoken'); // Untuk membuat JWT
const { ApiError, BadRequestError, NotFoundError, UnauthorizedError, ForbiddenError } = require('../utils/ApiError');

// Ambil secret key dari environment variables (pastikan ini ada di .env Anda)
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_fallback'; // Tambahkan fallback yang jelas

// Skema Validasi Joi
const registerSchema = Joi.object({
    username: Joi.string().trim().min(3).max(50).required().messages({
        'string.base': 'Username harus berupa string.',
        'string.empty': 'Username tidak boleh kosong.',
        'string.min': 'Username minimal {#limit} karakter.',
        'string.max': 'Username maksimal {#limit} karakter.',
        'any.required': 'Username wajib diisi.'
    }),
    email: Joi.string().trim().email().required().messages({
        'string.base': 'Email harus berupa string.',
        'string.empty': 'Email tidak boleh kosong.',
        'string.email': 'Format email tidak valid.',
        'any.required': 'Email wajib diisi.'
    }),
    password: Joi.string().min(8).max(30).required().messages({
        'string.base': 'Password harus berupa string.',
        'string.empty': 'Password tidak boleh kosong.',
        'string.min': 'Password minimal {#limit} karakter.',
        'string.max': 'Password maksimal {#limit} karakter.',
        'any.required': 'Password wajib diisi.'
    }),
    role: Joi.string().valid('user', 'admin').default('user').messages({
        'any.only': 'Role tidak valid.'
    })
});

const loginSchema = Joi.object({
    email: Joi.string().trim().email().required().messages({
        'string.base': 'Email harus berupa string.',
        'string.empty': 'Email tidak boleh kosong.',
        'string.email': 'Format email tidak valid.',
        'any.required': 'Email wajib diisi.'
    }),
    password: Joi.string().required().messages({
        'string.base': 'Password harus berupa string.',
        'string.empty': 'Password tidak boleh kosong.',
        'any.required': 'Password wajib diisi.'
    })
});

const updateProfileSchema = Joi.object({
    name: Joi.string().trim().min(3).max(100).required().messages({
        'string.base': 'Nama harus berupa string.',
        'string.empty': 'Nama tidak boleh kosong.',
        'string.min': 'Nama minimal {#limit} karakter.',
        'string.max': 'Nama maksimal {#limit} karakter.',
        'any.required': 'Nama wajib diisi.'
    }),
    email: Joi.string().trim().email().required().messages({
        'string.base': 'Email harus berupa string.',
        'string.empty': 'Email tidak boleh kosong.',
        'string.email': 'Format email tidak valid.',
        'any.required': 'Email wajib diisi.'
    })
});



const updatePasswordSchema = Joi.object({
    oldPassword: Joi.string().required().messages({
        'string.empty': 'Password lama tidak boleh kosong.',
        'any.required': 'Password lama wajib diisi.'
    }),
    newPassword: Joi.string().min(8).max(30).required().messages({
        'string.base': 'Password baru harus berupa string.',
        'string.empty': 'Password baru tidak boleh kosong.',
        'string.min': 'Password baru minimal {#limit} karakter.',
        'string.max': 'Password baru maksimal {#limit} karakter.',
        'any.required': 'Password baru wajib diisi.'
    })
});

const updateRoleSchema = Joi.object({
    role: Joi.string().valid('user', 'admin').required().messages({
        'any.only': 'Role tidak valid.',
        'any.required': 'Role wajib diisi.'
    })
});

class UserService {
    /**
     * Mendaftarkan pengguna baru.
     * @param {Object} userData - Data pengguna untuk registrasi.
     * @returns {Promise<Object>} Objek berisi status, pesan, dan ID pengguna.
     * @throws {BadRequestError} Jika data tidak valid atau email sudah terdaftar.
     * @throws {ApiError} Untuk error internal server.
     */
    async register(userData) {
        const { error, value } = registerSchema.validate(userData);
        if (error) {
            throw new BadRequestError(`Data registrasi tidak valid: ${error.details[0].message}`);
        }

        try {
            const existingUser = await userModel.findByEmail(value.email);
            if (existingUser) {
                throw new BadRequestError('Email sudah terdaftar.');
            }

            const hashedPassword = await argon2.hash(value.password);
            const newUserId = await userModel.create({
                username: value.username,
                email: value.email,
                hashedPassword: hashedPassword,
                role: value.role
            });

            return {
                status: 'success',
                message: 'Pendaftaran berhasil.',
                userId: newUserId
            };
        } catch (error) {
            console.error('Error in UserService.register:', error.message);
            if (error instanceof ApiError) throw error;
            throw new ApiError(500, 'Gagal mendaftar pengguna.');
        }
    }

    /**
     * Melakukan login pengguna.
     * @param {Object} credentials - Kredensial login (email, password).
     * @returns {Promise<Object>} Objek berisi status, pesan, token, dan data pengguna.
     * @throws {UnauthorizedError} Jika email/password salah.
     * @throws {BadRequestError} Jika kredensial tidak valid.
     * @throws {ApiError} Untuk error internal server.
     */
    async login(credentials) {
        const { error, value } = loginSchema.validate(credentials);
        if (error) {
            throw new BadRequestError(`Kredensial login tidak valid: ${error.details[0].message}`);
        }

        try {
            const user = await userModel.findByEmail(value.email);
            if (!user || !user.password) {
                throw new UnauthorizedError('Email atau password salah.');
            }

            const isPasswordValid = await argon2.verify(user.password, value.password);
            if (!isPasswordValid) {
                throw new UnauthorizedError('Email atau password salah.');
            }

            // Buat token JWT
            const tokenPayload = { userId: user.user_id, email: user.email, role: user.role, username: user.name };
            // console.log('UserService Debug: JWT_SECRET being used for signing:', JWT_SECRET); // Log SECRET
            // console.log('UserService Debug: JWT Payload:', tokenPayload); // Log payload
            const token = jwt.sign(
                tokenPayload,
                JWT_SECRET,
                { expiresIn: '1h' } // Token berlaku 1 jam
            );

            const userData = {
                userId: user.user_id,
                username: user.name,
                email: user.email,
                role: user.role,
            };

            return {
                status: 'success',
                message: 'Login berhasil.',
                token: token,
                user: userData
            };
        } catch (error) {
            console.error('Error in UserService.login:', error.message);
            if (error instanceof ApiError) throw error;
            throw new ApiError(500, 'Gagal login.');
        }
    }

    /**
     * Mengambil semua pengguna (hanya untuk admin).
     * @returns {Promise<Object>} Objek berisi status, pesan, dan data array pengguna.
     * @throws {ApiError} Untuk error internal server.
     */
    async getAllUsers() {
        try {
            const users = await userModel.findAll();
            return {
                status: 'success',
                message: 'Daftar pengguna berhasil diambil.',
                data: users
            };
        } catch (error) {
            console.error('Error in UserService.getAllUsers:', error.message);
            throw new ApiError(500, 'Gagal mengambil daftar pengguna.');
        }
    }

    /**
     * Mengambil detail profil pengguna berdasarkan ID.
     * Menggabungkan data dari tabel `users` dan `addresses`.
     * @param {number} userId - ID pengguna.
     * @returns {Promise<Object>} Objek berisi status, pesan, dan data pengguna.
     * @throws {BadRequestError} Jika ID pengguna tidak valid.
     * @throws {NotFoundError} Jika pengguna tidak ditemukan.
     * @throws {ApiError} Untuk error internal server.
     */
    async getUserProfile(userId) {
        const { error: idError } = Joi.number().integer().positive().required().validate(userId);
        if (idError) {
            throw new BadRequestError(`ID pengguna tidak valid: ${idError.message}`);
        }

        try {
            const user = await userModel.findById(userId);
            if (!user) {
                throw new NotFoundError('Pengguna tidak ditemukan.');
            }
            const addresses = await addressModel.findByUserId(userId);
            const orders = await orderModel.findByUserId(userId);
            const userData = {
                ...user,
                phone_number: addresses && addresses.length > 0 ? addresses[0].phone : null,
                address: addresses && addresses.length > 0 ? addresses[0].address : null,
                city: addresses && addresses.length > 0 ? addresses[0].city : null,
                postal_code: addresses && addresses.length > 0 ? addresses[0].postal_code : null,
            };

            return {
                status: 'success',
                message: 'Profil pengguna berhasil diambil.',
                data: userData,
                addresses: addresses,
                orders: orders
            };
        } catch (error) {
            console.error('Error in UserService.getUserProfile:', error.message);
            if (error instanceof ApiError) throw error;
            throw new ApiError(500, 'Gagal mengambil profil pengguna.');
        }
    }

    /**
     * @param {number} userId - ID pengguna yang akan diperbarui.
     * @param {Object} updateData - Data profil yang akan diperbarui (username, email).
     * @returns {Promise<Object>} Objek berisi status dan pesan.
     * @throws {BadRequestError} Jika data update tidak valid atau email sudah terdaftar.
     * @throws {NotFoundError} Jika pengguna tidak ditemukan.
     * @throws {ApiError} Untuk error internal server.
     */
    async updateProfile(userId, profileData) {
        // Validasi menggunakan skema yang sudah diperbarui
        const { error, value } = updateProfileSchema.validate(profileData);
        if (error) {
            throw new BadRequestError(`Data update profil tidak valid: ${error.details[0].message}`);
        }

        try {
            // Pengecekan tambahan: pastikan email baru belum digunakan oleh orang lain
            const existingUser = await userModel.findByEmail(value.email);
            if (existingUser && parseInt(existingUser.user_id) !== parseInt(userId)) {
                throw new BadRequestError('Email ini sudah digunakan oleh akun lain.');
            }

            const updated = await userModel.update(userId, value);
            if (!updated) {
                throw new NotFoundError('Pengguna tidak ditemukan, gagal memperbarui profil.');
            }
            return {
                status: 'success',
                message: 'Profil berhasil diperbarui.'
            };
        } catch (error) {
            console.error('Error in UserService.updateProfile:', error.message);
            if (error instanceof ApiError) throw error;
            throw new ApiError(500, 'Gagal memperbarui profil.');
        }
    }

    /**
     * Memperbarui password pengguna.
     * @param {number} userId - ID pengguna.
     * @param {Object} passwordData - Data password (oldPassword, newPassword).
     * @returns {Promise<Object>} Objek berisi status dan pesan.
     * @throws {BadRequestError} Jika password tidak valid atau password lama salah.
     * @throws {NotFoundError} Jika pengguna tidak ditemukan.
     * @throws {ApiError} Untuk error internal server.
     */
    async updatePassword(userId, passwordData) {
        const { error: idError } = Joi.number().integer().positive().required().validate(userId);
        if (idError) {
            throw new BadRequestError(`ID pengguna tidak valid: ${idError.message}`);
        }

        const { error, value } = updatePasswordSchema.validate(passwordData);
        if (error) {
            throw new BadRequestError(`Data password tidak valid: ${error.details[0].message}`);
        }

        try {
            const user = await userModel.findById(userId); 
            if (!user) {
                throw new NotFoundError('Pengguna tidak ditemukan.');
            }

            const userWithPassword = await userModel.findByEmail(user.email); 
            if (!userWithPassword || !userWithPassword.password) {
                throw new ApiError(500, 'Kesalahan internal: Password hash pengguna tidak dapat diambil.');
            }

            const isOldPasswordValid = await argon2.verify(userWithPassword.password, value.oldPassword);
            if (!isOldPasswordValid) {
                throw new BadRequestError('Password lama salah.');
            }
            if (value.oldPassword === value.newPassword) {
                throw new BadRequestError('Password baru tidak boleh sama dengan password lama.');
            }

            const newHashedPassword = await argon2.hash(value.newPassword);
            const updated = await userModel.updatePassword(userId, newHashedPassword);
            if (!updated) {
                throw new ApiError(500, 'Gagal memperbarui password pengguna.');
            }
            return {
                status: 'success',
                message: 'Password berhasil diperbarui.'
            };
        } catch (error) {
            console.error('Error in UserService.updatePassword:', error.message);
            if (error instanceof ApiError) throw error;
            throw new ApiError(500, 'Gagal memperbarui password.');
        }
    }

    /**
     * Menghapus pengguna berdasarkan ID.
     * @param {number} userId - ID pengguna.
     * @returns {Promise<Object>} Objek berisi status dan pesan.
     * @throws {BadRequestError} Jika ID pengguna tidak valid.
     * @throws {NotFoundError} Jika pengguna tidak ditemukan.
     * @throws {ApiError} Untuk error internal server.
     */
    async deleteUser(userId) {
        const { error: idError } = Joi.number().integer().positive().required().validate(userId);
        if (idError) {
            throw new BadRequestError(`ID pengguna tidak valid: ${idError.message}`);
        }

        try {
            const deleted = await userModel.delete(userId);
            if (!deleted) {
                throw new NotFoundError('Pengguna tidak ditemukan.');
            }
            return {
                status: 'success',
                message: 'Pengguna berhasil dihapus.'
            };
        } catch (error) {
            console.error('Error in UserService.deleteUser:', error.message);
            if (error instanceof ApiError) throw error;
            throw new ApiError(500, 'Gagal menghapus pengguna.');
        }
    }

    /**
     * Memperbarui peran pengguna (hanya admin).
     * @param {number} userId - ID pengguna yang akan diperbarui perannya.
     * @param {Object} roleData - Objek berisi role baru.
     * @returns {Promise<Object>} Objek berisi status dan pesan.
     * @throws {BadRequestError} Jika ID pengguna atau role tidak valid.
     * @throws {NotFoundError} Jika pengguna tidak ditemukan.
     * @throws {ApiError} Untuk error internal server.
     */
    async updateRole(userId, roleData) {
        const { error: idError } = Joi.number().integer().positive().required().validate(userId);
        if (idError) {
            throw new BadRequestError(`ID pengguna tidak valid: ${idError.message}`);
        }

        const { error, value } = updateRoleSchema.validate(roleData);
        if (error) {
            throw new BadRequestError(`Data role tidak valid: ${error.details[0].message}`);
        }

        try {
            const updated = await userModel.updateRole(userId, value.role);
            if (!updated) {
                throw new NotFoundError('Pengguna tidak ditemukan.');
            }
            return {
                status: 'success',
                message: `Peran pengguna berhasil diperbarui menjadi ${value.role}.`
            };
        } catch (error) {
            console.error('Error in UserService.updateRole:', error.message);
            if (error instanceof ApiError) throw error;
            throw new ApiError(500, 'Gagal memperbarui peran pengguna.');
        }
    }
}

module.exports = new UserService();
