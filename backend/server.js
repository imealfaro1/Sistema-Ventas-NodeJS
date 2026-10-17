const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
require('dotenv').config();

const { sql, pool, poolConnect } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

// ======================================================
// MIDDLEWARES GLOBALES
// ======================================================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// ======================================================
// MIDDLEWARES DE AUTENTICACIÓN
// ======================================================
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: "Token requerido" });

    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Token inválido" });

    try {
        const user = jwt.verify(token, JWT_SECRET);
        req.user = user;
        next();
    } catch (err) {
        return res.status(403).json({ error: "Token expirado o inválido" });
    }
};

const requireAdmin = (req, res, next) => {
    if (req.user.rol !== 'admin') {
        return res.status(403).json({ success: false, error: "Solo administradores" });
    }
    next();
};

// ======================================================
// 🔐 LOGIN
// ======================================================
app.post('/api/auth/login', async (req, res) => {
    await poolConnect;
    const { email, password } = req.body;

    try {
        const result = await pool.request()
            .input("email", sql.VarChar, email)
            .query("SELECT TOP 1 * FROM usuarios WHERE email = @email AND activo = 1");

        if (result.recordset.length === 0) {
            return res.json({ success: false, error: "Usuario no encontrado" });
        }

        const user = result.recordset[0];

        // Comparar con bcrypt
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.json({ success: false, error: "Contraseña incorrecta" });
        }

        const token = jwt.sign(
            { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol },
            JWT_SECRET,
            { expiresIn: '12h' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                nombre: user.nombre,
                email: user.email,
                rol: user.rol
            }
        });

    } catch (err) {
        console.error("💥 ERROR EN LOGIN:", err);
        res.json({ success: false, error: "Error en el servidor" });
    }
});

// ======================================================
// 📦 LISTAR PRODUCTOS
// ======================================================
app.get('/api/productos', authMiddleware, async (req, res) => {
    await poolConnect;
    try {
        const result = await pool.request().query("SELECT * FROM productos ORDER BY id DESC");
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.json([]);
    }
});

// ======================================================
// 📦 CREAR PRODUCTO (solo admin)
// ======================================================
app.post('/api/productos', authMiddleware, requireAdmin, async (req, res) => {
    await poolConnect;
    const { nombre, descripcion, precio, stock, categoria } = req.body;

    if (!nombre || precio == null || stock == null) {
        return res.json({ success: false, error: "Nombre, precio y stock son obligatorios" });
    }
    if (precio < 0 || stock < 0) {
        return res.json({ success: false, error: "Precio y stock deben ser positivos" });
    }

    try {
        await pool.request()
            .input("nombre", sql.VarChar, nombre)
            .input("descripcion", sql.VarChar, descripcion || '')
            .input("precio", sql.Decimal(10, 2), precio)
            .input("stock", sql.Int, stock)
            .input("categoria", sql.VarChar, categoria || '')
            .query(`
                INSERT INTO productos (nombre, descripcion, precio, stock, categoria)
                VALUES (@nombre, @descripcion, @precio, @stock, @categoria)
            `);

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: "Error al guardar producto" });
    }
});

// ======================================================
// 📦 ACTUALIZAR PRODUCTO (nuevo, solo admin)
// ======================================================
app.put('/api/productos/:id', authMiddleware, requireAdmin, async (req, res) => {
    await poolConnect;
    const { id } = req.params;
    const { nombre, descripcion, precio, stock, categoria } = req.body;

    try {
        await pool.request()
            .input("id", sql.Int, id)
            .input("nombre", sql.VarChar, nombre)
            .input("descripcion", sql.VarChar, descripcion || '')
            .input("precio", sql.Decimal(10, 2), precio)
            .input("stock", sql.Int, stock)
            .input("categoria", sql.VarChar, categoria || '')
            .query(`
                UPDATE productos 
                SET nombre = @nombre, descripcion = @descripcion, precio = @precio,
                    stock = @stock, categoria = @categoria
                WHERE id = @id
            `);

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: "Error al actualizar producto" });
    }
});

// ======================================================
// 📦 ELIMINAR PRODUCTO (nuevo, solo admin)
// ======================================================
app.delete('/api/productos/:id', authMiddleware, requireAdmin, async (req, res) => {
    await poolConnect;
    const { id } = req.params;

    try {
        // Verificar que no tenga ventas asociadas
        const check = await pool.request()
            .input("id", sql.Int, id)
            .query("SELECT COUNT(*) AS total FROM detalle_ventas WHERE producto_id = @id");

        if (check.recordset[0].total > 0) {
            return res.json({ success: false, error: "No se puede eliminar: producto con ventas registradas" });
        }

        await pool.request()
            .input("id", sql.Int, id)
            .query("DELETE FROM productos WHERE id = @id");

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: "Error al eliminar producto" });
    }
});

// ======================================================
// 🛒 REGISTRAR VENTA (con transacción y descuento de stock)
// ======================================================
app.post('/api/ventas', authMiddleware, async (req, res) => {
    await poolConnect;
    const { cliente, items, total } = req.body;
    const usuario_id = req.user.id;

    if (!items || items.length === 0) {
        return res.json({ success: false, error: "El carrito está vacío" });
    }

    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        // 1. Validar stock de todos los items
        for (const item of items) {
            const stockCheck = await transaction.request()
                .input("id", sql.Int, item.id)
                .query("SELECT stock, nombre FROM productos WHERE id = @id");

            if (stockCheck.recordset.length === 0) {
                await transaction.rollback();
                return res.json({ success: false, error: `Producto ID ${item.id} no existe` });
            }

            const p = stockCheck.recordset[0];
            if (p.stock < item.cantidad) {
                await transaction.rollback();
                return res.json({
                    success: false,
                    error: `Stock insuficiente de "${p.nombre}". Disponible: ${p.stock}`
                });
            }
        }

        // 2. Insertar venta
        const venta = await transaction.request()
            .input("cliente", sql.VarChar, cliente || 'Cliente General')
            .input("total", sql.Decimal(10, 2), total)
            .input("usuario_id", sql.Int, usuario_id)
            .query(`
                INSERT INTO ventas (cliente, total, usuario_id)
                OUTPUT INSERTED.id
                VALUES (@cliente, @total, @usuario_id)
            `);

        const venta_id = venta.recordset[0].id;

        // 3. Insertar detalle + descontar stock
        for (const item of items) {
            await transaction.request()
                .input("venta_id", sql.Int, venta_id)
                .input("producto_id", sql.Int, item.id)
                .input("cantidad", sql.Int, item.cantidad)
                .input("precio", sql.Decimal(10, 2), item.precio)
                .input("subtotal", sql.Decimal(10, 2), item.precio * item.cantidad)
                .query(`
                    INSERT INTO detalle_ventas
                    (venta_id, producto_id, cantidad, precio_unitario, subtotal)
                    VALUES (@venta_id, @producto_id, @cantidad, @precio, @subtotal)
                `);

            await transaction.request()
                .input("producto_id", sql.Int, item.id)
                .input("cantidad", sql.Int, item.cantidad)
                .query(`
                    UPDATE productos 
                    SET stock = stock - @cantidad 
                    WHERE id = @producto_id
                `);
        }

        await transaction.commit();
        res.json({ success: true, venta_id });

    } catch (err) {
        console.error("Error venta, rollback:", err);
        try { await transaction.rollback(); } catch (e) {}
        res.json({ success: false, error: "Error al registrar venta" });
    }
});

// ======================================================
// 📊 ESTADÍSTICAS
// ======================================================
app.get('/api/reportes/estadisticas', authMiddleware, async (req, res) => {
    await poolConnect;
    try {
        const result = await pool.request().query(`
            SELECT
                (SELECT COUNT(*) FROM productos) AS total_productos,
                (SELECT COUNT(*) FROM ventas) AS total_ventas,
                (SELECT ISNULL(SUM(total),0) FROM ventas) AS ingresos_totales,
                (SELECT COUNT(*) FROM usuarios WHERE activo = 1) AS total_usuarios
        `);
        res.json(result.recordset[0]);
    } catch (err) {
        console.error(err);
        res.json({});
    }
});

// ======================================================
// 📊 TOP PRODUCTOS (REAL, no aleatorio)
// ======================================================
app.get('/api/reportes/top-productos', authMiddleware, async (req, res) => {
    await poolConnect;
    try {
        const result = await pool.request().query(`
            SELECT TOP 5 
                p.nombre,
                SUM(dv.cantidad) AS vendidos,
                SUM(dv.subtotal) AS ingreso
            FROM detalle_ventas dv
            INNER JOIN productos p ON p.id = dv.producto_id
            GROUP BY p.nombre
            ORDER BY vendidos DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.json([]);
    }
});

// ======================================================
// 📊 LISTAR TODAS LAS VENTAS (admin)
// ======================================================
app.get('/api/ventas', authMiddleware, requireAdmin, async (req, res) => {
    await poolConnect;
    try {
        const result = await pool.request().query(`
            SELECT v.*, u.nombre AS vendedor
            FROM ventas v
            LEFT JOIN usuarios u ON v.usuario_id = u.id
            ORDER BY v.fecha_venta DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.json([]);
    }
});

// ======================================================
// 📊 VENTAS DE UN VENDEDOR (solo el propio o admin)
// ======================================================
app.get('/api/ventas/vendedor/:usuario_id', authMiddleware, async (req, res) => {
    await poolConnect;
    const usuario_id = parseInt(req.params.usuario_id);

    // Un vendedor solo puede ver sus propias ventas
    if (req.user.rol !== 'admin' && req.user.id !== usuario_id) {
        return res.status(403).json({ success: false, error: "No autorizado" });
    }

    try {
        const result = await pool.request()
            .input("usuario_id", sql.Int, usuario_id)
            .query(`
                SELECT v.*, u.nombre as vendedor 
                FROM ventas v 
                LEFT JOIN usuarios u ON v.usuario_id = u.id 
                WHERE v.usuario_id = @usuario_id 
                ORDER BY v.fecha_venta DESC
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.json([]);
    }
});

// ======================================================
// 👥 LISTAR USUARIOS (solo admin)
// ======================================================
app.get('/api/usuarios', authMiddleware, requireAdmin, async (req, res) => {
    await poolConnect;
    try {
        const result = await pool.request().query(
            "SELECT id, nombre, email, rol, activo FROM usuarios ORDER BY id DESC"
        );
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.json([]);
    }
});

// ======================================================
// 👥 CREAR USUARIO (con bcrypt)
// ======================================================
app.post('/api/usuarios', authMiddleware, requireAdmin, async (req, res) => {
    await poolConnect;
    const { nombre, email, password, rol, activo } = req.body;

    if (!nombre || !email) {
        return res.json({ success: false, error: "Nombre y email obligatorios" });
    }

    try {
        const usuarioExistente = await pool.request()
            .input("email", sql.VarChar, email)
            .query("SELECT id FROM usuarios WHERE email = @email");

        if (usuarioExistente.recordset.length > 0) {
            return res.json({ success: false, error: "El email ya está registrado" });
        }

        const passwordFinal = password || "password";
        const hash = await bcrypt.hash(passwordFinal, 10);

        const result = await pool.request()
            .input("nombre", sql.VarChar, nombre)
            .input("email", sql.VarChar, email)
            .input("password", sql.VarChar, hash)
            .input("rol", sql.VarChar, rol || 'vendedor')
            .input("activo", sql.Bit, activo ?? 1)
            .query(`
                INSERT INTO usuarios (nombre, email, password, rol, activo)
                OUTPUT INSERTED.id
                VALUES (@nombre, @email, @password, @rol, @activo)
            `);

        res.json({
            success: true,
            message: `Usuario creado exitosamente`,
            usuario_id: result.recordset[0].id
        });

    } catch (err) {
        console.error("Error creando usuario:", err);
        res.json({ success: false, error: "Error al crear usuario" });
    }
});

// ======================================================
// 👥 ACTUALIZAR USUARIO (con bcrypt)
// ======================================================
app.put('/api/usuarios/:id', authMiddleware, requireAdmin, async (req, res) => {
    await poolConnect;
    const userId = req.params.id;
    const { nombre, email, password, rol, activo } = req.body;

    try {
        const usuarioExistente = await pool.request()
            .input("email", sql.VarChar, email)
            .input("id", sql.Int, userId)
            .query("SELECT id FROM usuarios WHERE email = @email AND id != @id");

        if (usuarioExistente.recordset.length > 0) {
            return res.json({ success: false, error: "El email ya está registrado" });
        }

        if (password && password.trim() !== '') {
            const hash = await bcrypt.hash(password, 10);
            await pool.request()
                .input("id", sql.Int, userId)
                .input("nombre", sql.VarChar, nombre)
                .input("email", sql.VarChar, email)
                .input("password", sql.VarChar, hash)
                .input("rol", sql.VarChar, rol)
                .input("activo", sql.Bit, activo)
                .query(`
                    UPDATE usuarios 
                    SET nombre = @nombre, email = @email, password = @password, 
                        rol = @rol, activo = @activo 
                    WHERE id = @id
                `);
        } else {
            await pool.request()
                .input("id", sql.Int, userId)
                .input("nombre", sql.VarChar, nombre)
                .input("email", sql.VarChar, email)
                .input("rol", sql.VarChar, rol)
                .input("activo", sql.Bit, activo)
                .query(`
                    UPDATE usuarios 
                    SET nombre = @nombre, email = @email, rol = @rol, activo = @activo 
                    WHERE id = @id
                `);
        }

        res.json({ success: true, message: "Usuario actualizado exitosamente" });

    } catch (err) {
        console.error("Error actualizando usuario:", err);
        res.json({ success: false, error: "Error al actualizar usuario" });
    }
});

// ======================================================
// 👥 ELIMINAR USUARIO (solo admin)
// ======================================================
app.delete('/api/usuarios/:id', authMiddleware, requireAdmin, async (req, res) => {
    await poolConnect;
    const userId = req.params.id;

    if (parseInt(userId) === req.user.id) {
        return res.json({ success: false, error: "No puedes eliminar tu propio usuario" });
    }

    try {
        // Verificar si tiene ventas
        const check = await pool.request()
            .input("id", sql.Int, userId)
            .query("SELECT COUNT(*) AS total FROM ventas WHERE usuario_id = @id");

        if (check.recordset[0].total > 0) {
            return res.json({ success: false, error: "Usuario tiene ventas registradas. Desactívalo en lugar de eliminarlo." });
        }

        await pool.request()
            .input("id", sql.Int, userId)
            .query("DELETE FROM usuarios WHERE id = @id");

        res.json({ success: true, message: "Usuario eliminado exitosamente" });

    } catch (err) {
        console.error("Error eliminando usuario:", err);
        res.json({ success: false, error: "Error al eliminar usuario" });
    }
});

// ======================================================
// 🏠 RUTA PRINCIPAL
// ======================================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// ======================================================
// 🚀 INICIAR SERVIDOR
// ======================================================
app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log(`🚀 Servidor iniciado en http://localhost:${PORT}`);
    console.log('📁 Sirviendo archivos desde: frontend/');
    console.log('='.repeat(60));
});