class SalesSystem {
    constructor() {
        this.apiUrl = '/api';
        
        try {
            this.token = localStorage.getItem('authToken');
            const userData = localStorage.getItem('userData');
            this.user = userData ? JSON.parse(userData) : {};
        } catch (error) {
            console.error("❌ Error cargando datos:", error);
            this.token = null;
            this.user = {};
            localStorage.removeItem('authToken');
            localStorage.removeItem('userData');
        }
        
        this.cart = [];
        this.init();
    }

    init() {
        this.checkAuth();
        this.setupEventListeners();

        if (this.isAuthenticated()) {
            this.loadInitialData();
        }
    }

    isAuthenticated() {
        return !!this.token;
    }

    checkAuth() {
        if (this.isAuthenticated()) {
            this.showMainSystem();
        } else {
            this.showLogin();
        }
    }

    showLogin() {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('mainSystem').style.display = 'none';
    }

    showMainSystem() {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainSystem').style.display = 'block';
        this.updateUserInterface();
        this.applyRoleRestrictions();
        this.loadDashboard();
    }

    applyRoleRestrictions() {
        const isAdmin = this.user.rol === 'admin';
        console.log(`👤 Aplicando restricciones para rol: ${this.user.rol}`);

        document.querySelectorAll('[data-rol="admin"]').forEach(element => {
            element.style.display = isAdmin ? 'block' : 'none';
        });

        if (!isAdmin) {
            document.querySelector('.header-content h1').textContent = '🏪 Sistema de Ventas - Vendedor';
        }
    }

    async login(email, password) {
        try {
            const res = await fetch(`${this.apiUrl}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();

            if (data.success) {
                this.token = data.token;
                this.user = data.user;

                try {
                    localStorage.setItem('authToken', this.token);
                    localStorage.setItem('userData', JSON.stringify(this.user));
                } catch (error) {
                    console.error("❌ Error guardando en localStorage:", error);
                }

                this.showNotification(`✅ Bienvenido ${data.user.nombre} (${data.user.rol})`, 'success');
                this.showMainSystem();
            } else {
                this.showNotification(`❌ ${data.error}`, 'error');
            }
        } catch (err) {
            console.error("💥 Error de conexión:", err);
            this.showNotification('❌ Error de conexión con el servidor', 'error');
        }
    }

    logout() {
        this.token = null;
        this.user = {};
        try {
            localStorage.removeItem('authToken');
            localStorage.removeItem('userData');
        } catch (error) {
            console.error("Error limpiando localStorage:", error);
        }
        this.cart = [];
        this.showNotification('👋 Sesión cerrada', 'info');
        this.showLogin();
    }

    getAuthHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
        };
    }

    // ================== NAVEGACIÓN ==================
        switchTab(tabName) {
        if ((tabName === 'inventario' || tabName === 'usuarios') && this.user.rol !== 'admin') {
            this.showNotification('❌ No tienes permisos para acceder a esta sección', 'error');
            return;
        }

        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        document.getElementById(tabName).classList.add('active');
        
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // ⭐ NUEVO: Ocultar top productos si es vendedor
        if (tabName === 'reportes') {
            document.getElementById('topProductsCard').style.display = this.user.rol === 'admin' ? 'block' : 'none';
        }

        switch(tabName) {
            case 'dashboard': this.loadDashboard(); break;
            case 'inventario': this.loadProducts(); break;
            case 'ventas': this.loadAvailableProducts(); break;
            case 'reportes': this.loadReportes(); break;
            case 'usuarios': this.loadUsers(); break;
        }
    }
    // ================== DASHBOARD ==================
    async loadDashboard() {
        try {
            const res = await fetch(`${this.apiUrl}/reportes/estadisticas`, {
                headers: this.getAuthHeaders()
            });
            const stats = await res.json();

            document.getElementById('statProductos').textContent = stats.total_productos || 0;
            document.getElementById('statVentas').textContent = stats.total_ventas || 0;
            document.getElementById('statIngresos').textContent = `$${(stats.ingresos_totales || 0).toFixed(2)}`;
            document.getElementById('statUsuarios').textContent = stats.total_usuarios || 0;
        } catch (err) {
            console.error("Error cargando dashboard:", err);
            this.showNotification('❌ No se pudo cargar el dashboard', 'error');
        }
    }

    // ================== PRODUCTOS ==================
    async loadProducts() {
        try {
            const res = await fetch(`${this.apiUrl}/productos`, {
                headers: this.getAuthHeaders()
            });
            const productos = await res.json();
            this.displayProducts(productos);
        } catch (err) {
            console.error("Error cargando productos:", err);
            this.showNotification('❌ No se pudieron cargar los productos', 'error');
        }
    }

    displayProducts(productos) {
        const tbody = document.getElementById('productsList');
        tbody.innerHTML = '';

        productos.forEach(producto => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${producto.nombre}</td>
                <td>$${producto.precio}</td>
                <td class="${producto.stock < 10 ? 'low-stock' : ''}">${producto.stock}</td>
                <td>${producto.categoria || 'Sin categoría'}</td>
                <td>
                    ${this.user.rol === 'admin' ? `
                        <button onclick="system.editarProducto(${producto.id})" class="btn-secondary">✏️ Editar</button>
                        <button onclick="system.eliminarProducto(${producto.id})" class="btn-danger">🗑️ Eliminar</button>
                    ` : `
                        <span class="status-inactive">Solo lectura</span>
                    `}
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (this.user.rol === 'vendedor') {
            document.querySelector('.form-section').style.display = 'none';
            document.querySelector('.table-section h3').textContent = '📦 Productos Disponibles (Solo Lectura)';
        }
    }

    async saveProduct() {
        if (this.user.rol !== 'admin') {
            this.showNotification('❌ Solo los administradores pueden gestionar productos', 'error');
            return;
        }

        const productId = document.getElementById('productId').value;
        const formData = {
            nombre: document.getElementById('productNombre').value,
            descripcion: document.getElementById('productDescripcion').value,
            precio: parseFloat(document.getElementById('productPrecio').value),
            stock: parseInt(document.getElementById('productStock').value),
            categoria: document.getElementById('productCategoria').value
        };

        try {
            const url = productId 
                ? `${this.apiUrl}/productos/${productId}` 
                : `${this.apiUrl}/productos`;
            const method = productId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: this.getAuthHeaders(),
                body: JSON.stringify(formData)
            });
            const data = await res.json();

            if (data.success) {
                this.showNotification('✅ Producto guardado', 'success');
                this.limpiarFormularioProducto();
                this.loadProducts();
                this.loadDashboard();
            } else {
                this.showNotification(`❌ ${data.error}`, 'error');
            }
        } catch (err) {
            console.error(err);
            this.showNotification('❌ Error al guardar producto', 'error');
        }
    }

    limpiarFormularioProducto() {
        document.getElementById('productForm').reset();
        document.getElementById('productId').value = '';
    }

    async editarProducto(id) {
        if (this.user.rol !== 'admin') return;

        try {
            const res = await fetch(`${this.apiUrl}/productos`, {
                headers: this.getAuthHeaders()
            });
            const productos = await res.json();
            const p = productos.find(x => x.id === id);

            if (p) {
                document.getElementById('productId').value = p.id;
                document.getElementById('productNombre').value = p.nombre;
                document.getElementById('productDescripcion').value = p.descripcion || '';
                document.getElementById('productPrecio').value = p.precio;
                document.getElementById('productStock').value = p.stock;
                document.getElementById('productCategoria').value = p.categoria || '';
                
                this.showNotification(`✏️ Editando: ${p.nombre}`, 'info');
                document.querySelector('.inventory-container').scrollIntoView({ behavior: 'smooth' });
            }
        } catch (err) {
            console.error(err);
            this.showNotification('❌ Error al cargar producto', 'error');
        }
    }

    async eliminarProducto(id) {
        if (this.user.rol !== 'admin') return;

        if (!confirm('¿Eliminar este producto? Esta acción no se puede deshacer.')) return;

        try {
            const res = await fetch(`${this.apiUrl}/productos/${id}`, {
                method: 'DELETE',
                headers: this.getAuthHeaders()
            });
            const data = await res.json();

            if (data.success) {
                this.showNotification('✅ Producto eliminado', 'success');
                this.loadProducts();
                this.loadDashboard();
            } else {
                this.showNotification(`❌ ${data.error}`, 'error');
            }
        } catch (err) {
            console.error(err);
            this.showNotification('❌ Error al eliminar producto', 'error');
        }
    }

    // ================== VENTAS ==================
    async loadAvailableProducts() {
        try {
            const res = await fetch(`${this.apiUrl}/productos`, {
                headers: this.getAuthHeaders()
            });
            const productos = await res.json();
            this.displayAvailableProducts(productos);
        } catch (err) {
            console.error("Error cargando productos para ventas:", err);
        }
    }

    displayAvailableProducts(productos) {
    const container = document.getElementById('availableProducts');
    container.innerHTML = '';

    productos.forEach(producto => {
        if (producto.stock > 0) {
            const div = document.createElement('div');
            div.className = 'product-card';
            div.innerHTML = `
                <h4>${producto.nombre}</h4>
                <p class="price">$${producto.precio}</p>
                <p class="stock ${producto.stock < 5 ? 'low-stock' : ''}">Stock: ${producto.stock}</p>
                <button class="btn-primary">🛒 Agregar</button>
            `;
            
            div.addEventListener('click', () => {
                system.agregarAlCarrito(producto.id, producto.nombre, producto.precio);
            });
            
            container.appendChild(div);
        }
    });
}

    agregarAlCarrito(id, nombre, precio) {
        const itemExistente = this.cart.find(item => item.id === id);
        
        if (itemExistente) {
            itemExistente.cantidad += 1;
        } else {
            this.cart.push({ id, nombre, precio, cantidad: 1 });
        }
        
        this.updateCartDisplay();
        this.showNotification(`✅ ${nombre} agregado al carrito`, 'success');
    }

    updateCartDisplay() {
        const container = document.getElementById('cartItems');
        const totalElement = document.getElementById('totalAmount');
        const completeBtn = document.getElementById('completeSale');

        if (this.cart.length === 0) {
            container.innerHTML = '<div class="empty-cart"><p>🎯 Agrega productos al carrito</p></div>';
            totalElement.textContent = '0.00';
            completeBtn.disabled = true;
            return;
        }

        container.innerHTML = '';
        let total = 0;

        this.cart.forEach((item, index) => {
            const subtotal = item.precio * item.cantidad;
            total += subtotal;

            const div = document.createElement('div');
            div.className = 'cart-item';
            div.innerHTML = `
                <div>
                    <strong>${item.nombre}</strong>
                    <br>$${item.precio} x ${item.cantidad}
                </div>
                <div>
                    <strong>$${subtotal.toFixed(2)}</strong>
                    <br>
                    <button onclick="system.removerDelCarrito(${index})" class="btn-danger">❌</button>
                </div>
            `;
            container.appendChild(div);
        });

        totalElement.textContent = total.toFixed(2);
        completeBtn.disabled = false;
    }

    removerDelCarrito(index) {
        this.cart.splice(index, 1);
        this.updateCartDisplay();
    }

    async completeSale() {
        if (this.cart.length === 0) {
            this.showNotification('❌ El carrito está vacío', 'error');
            return;
        }

        const cliente = document.getElementById('clienteNombre').value || 'Cliente General';
        const total = this.cart.reduce((sum, i) => sum + i.precio * i.cantidad, 0);

        // Guardar copia del carrito para la factura ANTES de vaciarlo
        const carritoBackup = JSON.parse(JSON.stringify(this.cart));

        try {
            const res = await fetch(`${this.apiUrl}/ventas`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({ cliente, items: this.cart, total })
            });

            const data = await res.json();

            if (data.success) {
                this.generarFactura(data.venta_id, cliente, total, carritoBackup);
                this.showNotification(`✅ Venta completada - Total: $${total.toFixed(2)}`, 'success');
                this.cart = [];
                this.updateCartDisplay();
                document.getElementById('clienteNombre').value = '';
                this.loadDashboard();
                this.loadAvailableProducts();
            } else {
                this.showNotification(`❌ ${data.error}`, 'error');
            }
        } catch (err) {
            console.error(err);
            this.showNotification('❌ Error completando venta', 'error');
        }
    }

    generarFactura(venta_id, cliente, total, items) {
        const fecha = new Date().toLocaleDateString();
        const hora = new Date().toLocaleTimeString();
        
        let facturaHTML = `
            <div style="padding: 20px; border: 2px solid #333; max-width: 400px; margin: 20px auto; background: white;">
                <h2 style="text-align: center; color: #2c3e50;">🏪 FACTURA DE VENTA</h2>
                <hr>
                <p><strong>Factura #:</strong> ${venta_id}</p>
                <p><strong>Fecha:</strong> ${fecha}</p>
                <p><strong>Hora:</strong> ${hora}</p>
                <p><strong>Cliente:</strong> ${cliente}</p>
                <p><strong>Vendedor:</strong> ${this.user.nombre}</p>
                <hr>
                <h3>📋 Productos:</h3>
        `;

        items.forEach(item => {
            facturaHTML += `
                <p>${item.nombre} - $${item.precio} x ${item.cantidad} = $${(item.precio * item.cantidad).toFixed(2)}</p>
            `;
        });

        facturaHTML += `
                <hr>
                <h2 style="text-align: center;">TOTAL: $${total.toFixed(2)}</h2>
                <hr>
                <p style="text-align: center; font-size: 12px; color: #7f8c8d;">
                    ¡Gracias por su compra! 🎉
                </p>
            </div>
        `;

        const ventanaFactura = window.open('', '_blank');
        ventanaFactura.document.write(`
            <html>
                <head>
                    <title>Factura #${venta_id}</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
                        @media print {
                            body { margin: 0; }
                            button { display: none; }
                        }
                    </style>
                </head>
                <body>
                    ${facturaHTML}
                    <div style="text-align: center; margin-top: 20px;">
                        <button onclick="window.print()" style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer;">
                            🖨️ Imprimir
                        </button>
                        <button onclick="window.close()" style="padding: 10px 20px; background: #e74c3c; color: white; border: none; border-radius: 5px; cursor: pointer;">
                            ❌ Cerrar
                        </button>
                    </div>
                </body>
            </html>
        `);
        ventanaFactura.document.close();
    }

    buscarProductos() {
        const searchTerm = document.getElementById('searchProduct').value.toLowerCase();
        document.querySelectorAll('.product-card').forEach(card => {
            const productName = card.querySelector('h4').textContent.toLowerCase();
            card.style.display = productName.includes(searchTerm) ? 'block' : 'none';
        });
    }

    // ================== REPORTES ==================
    async loadReportes() {
        try {
            if (this.user.rol === 'vendedor') {
                await this.loadVendedorReportes();
            } else {
                await this.loadAdminReportes();
            }
        } catch (err) {
            console.error("Error cargando reportes:", err);
        }
    }

    async loadVendedorReportes() {
        try {
            const res = await fetch(`${this.apiUrl}/ventas/vendedor/${this.user.id}`, {
                headers: this.getAuthHeaders()
            });
            const ventas = await res.json();
            this.displayVendedorReportes(ventas);
        } catch (err) {
            console.error("Error cargando reportes de vendedor:", err);
        }
    }

    displayVendedorReportes(ventas) {
        const tbody = document.getElementById('salesReportList');
        tbody.innerHTML = '';

        if (!ventas || ventas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">No hay ventas registradas</td></tr>';
            return;
        }

        ventas.slice(0, 15).forEach(venta => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${venta.id}</td>
                <td>${new Date(venta.fecha_venta).toLocaleDateString()}</td>
                <td>${venta.cliente || 'Cliente General'}</td>
                <td>$${venta.total}</td>
            `;
            tbody.appendChild(tr);
        });

        document.querySelector('#reportes h3').textContent = '📋 Mis Ventas Recientes';
    }

    async loadAdminReportes() {
        try {
            const resVentas = await fetch(`${this.apiUrl}/ventas`, {
                headers: this.getAuthHeaders()
            });
            const ventas = await resVentas.json();
            this.displaySalesReport(ventas);

            // ⭐ NUEVO: consultar top productos real
            const resTop = await fetch(`${this.apiUrl}/reportes/top-productos`, {
                headers: this.getAuthHeaders()
            });
            const top = await resTop.json();
            this.displayTopProducts(top);
        } catch (err) {
            console.error("Error cargando reportes admin:", err);
        }
    }

    displaySalesReport(ventas) {
        const tbody = document.getElementById('salesReportList');
        tbody.innerHTML = '';

        if (!ventas || ventas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">No hay ventas registradas</td></tr>';
            return;
        }

        ventas.slice(0, 15).forEach(venta => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${venta.id}</td>
                <td>${new Date(venta.fecha_venta).toLocaleDateString()}</td>
                <td>${venta.cliente || 'Cliente General'}</td>
                <td>$${venta.total}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    displayTopProducts(productos) {
        const tbody = document.getElementById('topProductsList');
        tbody.innerHTML = '';

        if (!productos || productos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px;">Sin datos aún</td></tr>';
            return;
        }

        productos.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${p.nombre}</td>
                <td>${p.vendidos}</td>
                <td>$${parseFloat(p.ingreso).toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });
    }

        async generarReporte() {
        const btn = document.querySelector('.report-filters .btn-primary');
        const textoOriginal = btn.innerHTML;
        
        // 1. Cambiar estado visual
        btn.innerHTML = '⏳ Generando...';
        btn.disabled = true;
        this.showNotification('📊 Generando y actualizando reporte...', 'info');

        try {
            // 2. Recargar las tablas en pantalla
            await this.loadReportes();
            
            // Pequeña pausa para que el usuario vea que la tabla se actualizó
            await new Promise(resolve => setTimeout(resolve, 600));

            // 3. Exportar los datos actuales de la tabla a CSV/Excel
            const tablaVentas = document.querySelectorAll('#salesReportList tr');
            
            if (tablaVentas.length === 0 || (tablaVentas.length === 1 && tablaVentas[0].innerText.includes('No hay ventas'))) {
                this.showNotification('⚠️ Tabla actualizada, pero no hay ventas para exportar.', 'info');
            } else {
                let csvContent = "ID;Fecha;Cliente;Total\n";
                
                tablaVentas.forEach(fila => {
                    const celdas = fila.querySelectorAll('td');
                    if (celdas.length === 4) {
                        const id = celdas[0].innerText;
                        const fecha = celdas[1].innerText;
                        const cliente = celdas[2].innerText.replace(/;/g, ''); // Evitar punto y coma en el nombre
                        const total = celdas[3].innerText;
                        csvContent += `${id};${fecha};${cliente};${total}\n`;
                    }
                });

                // Descargar archivo
                const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.setAttribute("href", url);
                link.setAttribute("download", `Reporte_Ventas_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                this.showNotification('✅ Tabla actualizada y Excel descargado', 'success');
            }

        } catch (err) {
            console.error(err);
            this.showNotification('❌ Error al generar reporte', 'error');
        } finally {
            // Restaurar el botón
            btn.innerHTML = textoOriginal;
            btn.disabled = false;
        }
    }
    limpiarFiltros() {
        document.getElementById('fechaInicio').value = '';
        document.getElementById('fechaFin').value = '';
        this.loadReportes();
    }

    // ================== USUARIOS ==================
    async loadUsers() {
        if (this.user.rol !== 'admin') {
            this.showNotification('❌ No tienes permisos para ver usuarios', 'error');
            return;
        }

        try {
            const res = await fetch(`${this.apiUrl}/usuarios`, {
                headers: this.getAuthHeaders()
            });
            const usuarios = await res.json();
            this.displayUsers(usuarios);
        } catch (err) {
            console.error("Error cargando usuarios:", err);
        }
    }

    displayUsers(usuarios) {
        const tbody = document.getElementById('usersList');
        tbody.innerHTML = '';

        usuarios.forEach(usuario => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${usuario.nombre}</td>
                <td>${usuario.email}</td>
                <td>${usuario.rol}</td>
                <td class="${usuario.activo ? 'status-active' : 'status-inactive'}">
                    ${usuario.activo ? 'Activo' : 'Inactivo'}
                </td>
                <td>
                    <button onclick="system.editarUsuario(${usuario.id})" class="btn-secondary">✏️ Editar</button>
                    <button onclick="system.eliminarUsuario(${usuario.id})" class="btn-danger">🗑️ Eliminar</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    async saveUser() {
        if (this.user.rol !== 'admin') {
            this.showNotification('❌ Solo administradores pueden gestionar usuarios', 'error');
            return;
        }

        const userId = document.getElementById('userId').value;
        const formData = {
            nombre: document.getElementById('userNombre').value,
            email: document.getElementById('userEmail').value,
            password: document.getElementById('userPassword').value,
            rol: document.getElementById('userRol').value,
            activo: parseInt(document.getElementById('userActivo').value)
        };

        try {
            let res;
            if (userId) {
                res = await fetch(`${this.apiUrl}/usuarios/${userId}`, {
                    method: 'PUT',
                    headers: this.getAuthHeaders(),
                    body: JSON.stringify(formData)
                });
            } else {
                res = await fetch(`${this.apiUrl}/usuarios`, {
                    method: 'POST',
                    headers: this.getAuthHeaders(),
                    body: JSON.stringify(formData)
                });
            }

            const data = await res.json();

            if (data.success) {
                this.showNotification(`✅ ${data.message}`, 'success');
                this.limpiarFormularioUsuario();
                this.loadUsers();
                this.loadDashboard();
            } else {
                this.showNotification(`❌ ${data.error}`, 'error');
            }
        } catch (err) {
            console.error(err);
            this.showNotification('❌ Error al guardar usuario', 'error');
        }
    }

    async editarUsuario(id) {
        if (this.user.rol !== 'admin') return;

        try {
            const res = await fetch(`${this.apiUrl}/usuarios`, {
                headers: this.getAuthHeaders()
            });
            const usuarios = await res.json();
            const usuario = usuarios.find(u => u.id === id);

            if (usuario) {
                document.getElementById('userId').value = usuario.id;
                document.getElementById('userNombre').value = usuario.nombre;
                document.getElementById('userEmail').value = usuario.email;
                document.getElementById('userRol').value = usuario.rol;
                document.getElementById('userActivo').value = usuario.activo ? '1' : '0';
                document.getElementById('userPassword').value = '';
                
                this.showNotification(`✏️ Editando usuario: ${usuario.nombre}`, 'info');
                document.querySelector('.users-container').scrollIntoView({ behavior: 'smooth' });
            }
        } catch (err) {
            console.error("Error cargando usuario para editar:", err);
            this.showNotification('❌ Error al cargar usuario', 'error');
        }
    }

    async eliminarUsuario(id) {
        if (this.user.rol !== 'admin') return;

        if (id === this.user.id) {
            this.showNotification('❌ No puedes eliminar tu propio usuario', 'error');
            return;
        }

        if (!confirm('¿Eliminar este usuario? Esta acción no se puede deshacer.')) return;

        try {
            const res = await fetch(`${this.apiUrl}/usuarios/${id}`, {
                method: 'DELETE',
                headers: this.getAuthHeaders()
            });
            const data = await res.json();

            if (data.success) {
                this.showNotification('✅ Usuario eliminado exitosamente', 'success');
                this.loadUsers();
                this.loadDashboard();
            } else {
                this.showNotification(`❌ ${data.error}`, 'error');
            }
        } catch (err) {
            console.error("Error eliminando usuario:", err);
            this.showNotification('❌ Error al eliminar usuario', 'error');
        }
    }

    limpiarFormularioUsuario() {
        document.getElementById('userForm').reset();
        document.getElementById('userId').value = '';
    }

    // ================== EVENT LISTENERS ==================
    setupEventListeners() {
        document.getElementById('loginForm').addEventListener('submit', e => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            this.login(email, password);
        });

        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());

        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.getAttribute('data-tab');
                this.switchTab(tab);
            });
        });

        document.getElementById('productForm').addEventListener('submit', e => {
            e.preventDefault();
            this.saveProduct();
        });

        document.getElementById('userForm').addEventListener('submit', e => {
            e.preventDefault();
            this.saveUser();
        });

        document.getElementById('completeSale').addEventListener('click', () => this.completeSale());
        document.getElementById('searchProduct').addEventListener('input', () => this.buscarProductos());
    }

    // ================== UTILIDADES ==================
    showNotification(message, type = 'info') {
        document.querySelectorAll('.notification').forEach(n => n.remove());

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed; top: 20px; right: 20px;
            background: ${type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#3498db'};
            color: white; padding: 15px 25px; border-radius: 5px; z-index: 1000;
            font-weight: bold; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 4000);
    }

    updateUserInterface() {
        document.getElementById('userName').textContent = this.user.nombre;
        document.getElementById('userRole').textContent = this.user.rol;
        document.getElementById('userRole').className = `role-badge ${this.user.rol === 'admin' ? 'admin-badge' : 'vendedor-badge'}`;
    }

    async loadInitialData() {
        await this.loadDashboard();
        if (this.user.rol === 'admin') {
            await this.loadProducts();
        }
    }
}

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    window.system = new SalesSystem();
});