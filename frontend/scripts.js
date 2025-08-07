// frontend/scripts.js

document.getElementById('uploadForm').addEventListener('submit', async function (event) {
    event.preventDefault();

    const statusDiv = document.getElementById('status');
    const formData = new FormData();

    // 1. Recoger los archivos
    formData.append('balhist', document.getElementById('balhistFile').files[0]);
    formData.append('cuentas', document.getElementById('cuentasFile').files[0]);
    formData.append('nomina', document.getElementById('nominaFile').files[0]);
    formData.append('indices', document.getElementById('indicesFile').files[0]);

    // 2. Recoger los valores de los filtros
    formData.append('entidad', document.getElementById('entidadInput').value);
    formData.append('balhistDesde', document.getElementById('balhistDesdeInput').value);
    formData.append('balhistHasta', document.getElementById('balhistHastaInput').value);
    formData.append('indicesDesde', document.getElementById('indicesDesdeInput').value);
    formData.append('indicesHasta', document.getElementById('indicesHastaInput').value);

    statusDiv.textContent = 'Cargando y procesando...';
    statusDiv.style.color = 'orange';

   
    // para producción on render cambiado  'http://localhost:3000/upload'   por   'https://app-carga-balances.onrender.com/upload'
     try {
        const response = await fetch('https://app-carga-balances.onrender.com/upload'), {
            method: 'POST',
            body: formData,
        });

        if (response.ok) {
            statusDiv.textContent = 'Proceso completado. Iniciando descarga...';
            statusDiv.style.color = 'green';

            const blob = await response.blob();
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            
            // Construir un nombre de archivo dinámico
            const entidad = formData.get('entidad');
            const desde = formData.get('balhistDesde');
            const hasta = formData.get('balhistHasta');
            link.download = `Resultados_Entidad_${entidad}_${desde}_a_${hasta}.xlsx`;

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            URL.revokeObjectURL(link.href);

        } else {
            const errorText = await response.text();
            throw new Error(errorText || `Error del servidor: ${response.status}`);
        }

    } catch (error) {
        statusDiv.textContent = `Error: ${error.message}`;
        statusDiv.style.color = 'red';
        console.error('Detalle del error:', error);
    }

});
