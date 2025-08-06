// backend/server.js (Versión Final con Pivoteo de Datos)

import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import xlsx from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

// --- MIDDLEWARE Y CONFIGURACIÓN INICIAL ---
app.use(cors());
app.use(express.static(path.join(__dirname, '../frontend')));

const datosDir = path.join(__dirname, 'datos');
if (!fs.existsSync(datosDir)) {
    fs.mkdirSync(datosDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, datosDir),
    filename: (req, file, cb) => cb(null, file.originalname)
});

const upload = multer({ storage: storage }).fields([
    { name: 'balhist', maxCount: 1 },
    { name: 'cuentas', maxCount: 1 },
    { name: 'nomina', maxCount: 1 },
    { name: 'indices', maxCount: 1 }
]);


// --- FUNCIONES DE PROCESAMIENTO DE DATOS ---

function procesarBalhist(filePath, filtros) {
    const entidadFiltro = parseInt(filtros.entidad, 10);
    const fechaDesde = filtros.balhistDesde;
    const fechaHasta = filtros.balhistHasta;
    if (fechaDesde > fechaHasta) {
        console.warn("Advertencia en Balhist: La fecha 'Desde' es posterior a 'Hasta'.");
        return [];
    }
    const fileContent = fs.readFileSync(filePath, 'latin1');
    const lineas = fileContent.split('\n').filter(line => line.trim() !== '');
    const resultados = [];
    for (const linea of lineas) {
        const [numEntidad, fechaBce, numCuenta, saldo] = linea.split('\t');
        if (!numEntidad || !fechaBce || !numCuenta || saldo === undefined) continue;
        const entidadActual = parseInt(numEntidad.replace(/"/g, ''), 10);
        const anio = fechaBce.replace(/"/g, '').substring(0, 4);
        const mes = fechaBce.replace(/"/g, '').substring(4, 6);
        const fechaComparable = `${anio}-${mes}`;
        if (entidadActual === entidadFiltro && fechaComparable >= fechaDesde && fechaComparable <= fechaHasta) {
            resultados.push({
                num_entidad: entidadActual,
                fecha_bce: `${mes}-${anio}`,
                num_cuenta: parseInt(numCuenta.replace(/"/g, ''), 10),
                saldo: parseInt(saldo.trim(), 10)
            });
        }
    }
    return resultados;
}

function procesarIndices(filePath, filtros) {
    const mesDesde = filtros.indicesDesde;
    const mesHasta = filtros.indicesHasta;
    if (mesDesde > mesHasta) {
        console.warn("Advertencia en Índices: El mes 'Desde' es posterior a 'Hasta'.");
        return [];
    }
    try {
        const buffer = fs.readFileSync(filePath);
        const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
        const resultados = [];
        if (!jsonData || jsonData.length === 0) {
            console.warn("Advertencia: El archivo Indices.xlsx fue leído pero no se encontraron datos.");
            return [];
        }
        for (const row of jsonData) {
            if (!row || row.length < 2) continue;
            const fechaValue = row[0];
            const indiceValue = row[1];
            if (!indiceValue || !(fechaValue instanceof Date) || isNaN(fechaValue)) {
                continue;
            }
            const anio = fechaValue.getFullYear();
            const mes = ('0' + (fechaValue.getMonth() + 1)).slice(-2);
            const fechaComparable = `${anio}-${mes}`;
            if (fechaComparable >= mesDesde && fechaComparable <= mesHasta) {
                const indiceStr = String(indiceValue).replace(',', '.');
                resultados.push({
                    fecha: `${mes}-${anio}`,
                    indice_ipc: parseFloat(indiceStr)
                });
            }
        }
        return resultados;
    } catch (error) {
        console.error("Error crítico al leer o procesar el archivo Excel:", error);
        return [];
    }
}

function procesarCuentas(filePath) {
    const fileContent = fs.readFileSync(filePath, 'latin1');
    const lineas = fileContent.split('\n').filter(line => line.trim() !== '');
    return lineas.map(linea => {
        const [numCuenta, descripcion, fechaBaja] = linea.split('\t');
        if (!numCuenta || !descripcion) return null;
        let fechaBajaFinal = fechaBaja ? fechaBaja.trim() : null;
        if (fechaBajaFinal === '/  /') fechaBajaFinal = null;
        return {
            num_cuenta: parseInt(numCuenta.replace(/"/g, ''), 10),
            descripcion_cuenta: descripcion.replace(/"/g, '').trim(),
            fecha_baja_cuenta: fechaBajaFinal
        };
    }).filter(Boolean);
}

function procesarNomina(filePath) {
    const fileContent = fs.readFileSync(filePath, 'latin1');
    const lineas = fileContent.split('\n').filter(line => line.trim() !== '');
    return lineas.map(linea => {
        const [numEntidad, nombreEntidad, nombreCorto] = linea.split('\t');
        if (!numEntidad || !nombreEntidad || !nombreCorto) return null;
        return {
            num_entidad: parseInt(numEntidad.replace(/"/g, ''), 10),
            nombre_entidad: nombreEntidad.replace(/"/g, '').trim(),
            nombre_corto: nombreCorto.replace(/"/g, '').trim()
        };
    }).filter(Boolean);
}

// --- FUNCIÓN DE AYUDA PARA GENERAR EL RANGO DE MESES ---
function getMonthsInRange(start, end) {
    const startDate = new Date(`${start}-01T00:00:00`);
    const endDate = new Date(`${end}-01T00:00:00`);
    const months = [];
    let currentDate = startDate;

    while (currentDate <= endDate) {
        const month = ('0' + (currentDate.getMonth() + 1)).slice(-2);
        const year = currentDate.getFullYear();
        months.push(`${month}-${year}`);
        currentDate.setMonth(currentDate.getMonth() + 1);
    }
    return months;
}


// --- ENDPOINT PRINCIPAL CON LÓGICA DE PIVOTEO ---
app.post('/upload', (req, res) => {
    upload(req, res, function (err) {
        if (err) {
             console.error("--- ERROR DETALLADO DE MULTER ---", err);
             return res.status(500).send(`Error al guardar archivos: ${err.code || err.message}`);
        }
        try {
            const filtros = req.body;
            console.log('Filtros recibidos:', filtros);
            
            // PASO 1: Procesar, filtrar y combinar los datos.
            const datosBalhist = procesarBalhist(req.files.balhist[0].path, filtros);
            const datosCuentas = procesarCuentas(req.files.cuentas[0].path);
            const datosNomina = procesarNomina(req.files.nomina[0].path);
            
            if (datosBalhist.length === 0) {
                return res.status(404).send('No se encontraron registros de balance con los filtros seleccionados.');
            }

            const cuentasMap = new Map(datosCuentas.map(c => [c.num_cuenta, c]));
            const nominaMap = new Map(datosNomina.map(e => [e.num_entidad, e]));
            
            const datosCombinados = datosBalhist.map(balance => {
                const infoCuenta = cuentasMap.get(balance.num_cuenta) || {};
                const infoEntidad = nominaMap.get(balance.num_entidad) || {};
                return {
                    num_entidad: balance.num_entidad,
                    nombre_entidad: infoEntidad.nombre_entidad || 'No encontrada',
                    num_cuenta: balance.num_cuenta,
                    descripcion_cuenta: infoCuenta.descripcion_cuenta || 'No encontrada',
                    fecha_bce: balance.fecha_bce,
                    saldo: balance.saldo,
                };
            });

            // --- INICIO DE LA LÓGICA DE PIVOTEO ---

            // PASO 2: Crear estructura intermedia para pivotear { cuenta: { descripcion, saldos: { fecha: saldo } } }.
            const pivotedData = {};
            for (const record of datosCombinados) {
                if (!pivotedData[record.num_cuenta]) {
                    pivotedData[record.num_cuenta] = {
                        descripcion_cuenta: record.descripcion_cuenta,
                        saldos: {}
                    };
                }
                pivotedData[record.num_cuenta].saldos[record.fecha_bce] = record.saldo;
            }

            // PASO 3: Generar el array con todas las columnas de meses del rango.
            const allMonths = getMonthsInRange(filtros.balhistDesde, filtros.balhistHasta);
            
            // PASO 4: Construir el array final para el reporte Excel.
            const finalReportData = [];
            const infoEntidad = {
                num: datosCombinados[0].num_entidad,
                nombre: datosCombinados[0].nombre_entidad
            };

            let isFirstRow = true;
            // Ordenar por número de cuenta para un reporte consistente
            const sortedCuentas = Object.keys(pivotedData).sort((a, b) => a - b);

            for (const num_cuenta of sortedCuentas) {
                const cuentaData = pivotedData[num_cuenta];
                const row = {};

                // Añadir la información de la entidad solo a la primera fila.
                if (isFirstRow) {
                    row['Entidad'] = infoEntidad.num;
                    row['Nombre Entidad'] = infoEntidad.nombre;
                    isFirstRow = false;
                } else {
                    row['Entidad'] = '';
                    row['Nombre Entidad'] = '';
                }

                // Añadir la información de la cuenta.
                row['Cuenta'] = parseInt(num_cuenta);
                row['Descripción Cuenta'] = cuentaData.descripcion_cuenta;

                // Rellenar los saldos para cada mes.
                for (const month of allMonths) {
                    row[month] = cuentaData.saldos[month] || 0;
                }

                finalReportData.push(row);
            }

            // PASO 5: Generar y enviar el archivo Excel.
            const worksheet = xlsx.utils.json_to_sheet(finalReportData);
            const workbook = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(workbook, worksheet, "Balance Pivoteado");
            
            const excelBuffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
            
            const nombreArchivo = `Reporte_Pivoteado_Entidad_${filtros.entidad}.xlsx`;
            res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            
            res.status(200).send(excelBuffer);

        } catch (processingError) {
            console.error("Error crítico durante el procesamiento:", processingError);
            res.status(500).send('Falló el proceso de la aplicación.');
        }
    });
});

// --- INICIO DEL SERVIDOR ---
app.listen(port, () => {
    console.log(`Servidor (ESM) escuchando en http://localhost:${port}`);
});