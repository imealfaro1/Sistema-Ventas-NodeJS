const bcrypt = require("bcrypt");
const { sql, pool, poolConnect } = require("./database");

async function hashearTodo() {
    await poolConnect;
    console.log("🔄 Iniciando migración de contraseñas...");

    const result = await pool.request().query("SELECT id, password FROM usuarios");
    const usuarios = result.recordset;

    for (const u of usuarios) {
        // Si ya está hasheada (empieza con $2b$ o $2a$), saltar
        if (u.password.startsWith("$2b$") || u.password.startsWith("$2a$")) {
            console.log(`⏭️  Usuario ${u.id} ya tiene hash, saltando`);
            continue;
        }

        const hash = await bcrypt.hash(u.password, 10);
        await pool.request()
            .input("id", sql.Int, u.id)
            .input("hash", sql.VarChar, hash)
            .query("UPDATE usuarios SET password = @hash WHERE id = @id");

        console.log(`✅ Usuario ${u.id} hasheado`);
    }

    console.log("🎉 Migración completa");
    process.exit(0);
}

hashearTodo().catch(err => {
    console.error("❌ Error:", err);
    process.exit(1);
});