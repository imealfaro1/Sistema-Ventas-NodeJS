# 🏪 Sistema de Ventas e Inventario - TechStore

Sistema web full-stack desarrollado para la gestión de inventario, ventas y usuarios. Cuenta con una arquitectura moderna separando el Frontend (Cliente) y el Backend (API REST), con un fuerte enfoque en la seguridad y la integridad de los datos.

## 🚀 Tecnologías Utilizadas

*   **Frontend:** HTML5, CSS3, JavaScript (Vanilla). Consumo de API mediante `Fetch` y gráficas con `Chart.js`.
*   **Backend:** Node.js con Express.js.
*   **Base de Datos:** Microsoft SQL Server.
*   **Seguridad:** JSON Web Tokens (JWT), encriptación de contraseñas con `bcrypt`, y protección contra inyección SQL mediante *Parameterized Queries*.

## ✨ Características Principales

*   **Gestión de Roles:** Control de acceso para Administradores (acceso total) y Vendedores (solo ventas y sus propios reportes).
*   **Inventario Inteligente:** Alertas de stock bajo y control de productos.
*   **Módulo de Ventas:** Carrito de compras, procesamiento de pagos y descuento automático de stock usando transacciones SQL (evita descuadres).
*   **Reportes Dinámicos:** Historial de ventas, top productos y exportación de datos a Excel (CSV).
*   **Dashboard:** Visualización de estadísticas y gráficas de ingresos en tiempo real.

---

## 🛠️ ¿Cómo ejecutar este proyecto localmente?

Sigue estos pasos para correr el sistema en tu propia computadora.

### 1. Requisitos Previos
*   Tener instalado [Node.js](https://nodejs.org/) (versión 18 o superior).
*   Tener instalado [SQL Server](https://www.microsoft.com/es-es/sql-server/sql-server-downloads) y **SQL Server Management Studio (SSMS)**.
*   Tener Git instalado.

### 2. Clonar el repositorio e instalar dependencias
Abre tu terminal y ejecuta:
```bash
git clone https://github.com/imealfaro1/Sistema-Ventas-NodeJS.git
cd Sistema-Ventas-NodeJS/backend
npm install




Abre tu navegador y ve a: http://localhost:3000

Credenciales de prueba:

    Email: admin@sistema.com

    Contraseña: password



    3. Configurar la Base de Datos

    Abre SSMS y conéctate a tu instancia local de SQL Server.

    Abre el archivo script.sql (que está en la raíz del proyecto) y ejecútalo. Esto creará la base de datos sistema_ventas y las tablas necesarias.

4. Configurar las Variables de Entorno

En la carpeta backend, crea un archivo llamado exactamente .env y agrega tus credenciales locales:
env

PORT=3000
JWT_SECRET=una_clave_secreta_muy_larga_y_segura
DB_USER=sa
DB_PASSWORD=tu_contraseña_de_sql_server
DB_SERVER=NOMBRE_DE_TU_PC\SQLEXPRESS
DB_NAME=sistema_ventas

(Nota: Reemplaza NOMBRE_DE_TU_PC con el nombre real de tu equipo, por ejemplo DESKTOP-XYZ\SQLEXPRESS).
5. Hashear las contraseñas (Solo la primera vez)

El sistema requiere contraseñas encriptadas. Ejecuta el script de migración para encriptar las contraseñas que vienen por defecto en el script SQL:
bash

node hash-passwords.js

6. Iniciar el servidor
bash

npm start

Abre tu navegador y ve a: http://localhost:3000

Credenciales de prueba:

    Email: admin@sistema.com

    Contraseña: password